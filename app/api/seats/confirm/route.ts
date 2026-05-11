import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { passengers, seats, seatLocks } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { logInfo, logError, logWarn } from "@/lib/logger"
import { generateRequestId } from "@/lib/requestId"
import { createTicket } from "@/lib/createTicket"

export async function POST(req: NextRequest) {
  const requestId = generateRequestId()
  const startTime = Date.now()

  try {
    const body = await req.json()
    const { passengerId, seatId } = body

    logInfo("SEAT_CONFIRM_REQUEST", {
      requestId,
      passengerId,
      seatId
    })

    if (!passengerId || !seatId) {
      return NextResponse.json(
        { error: "Missing passengerId or seatId", requestId },
        { status: 400 }
      )
    }

    // =========================
    // ATOMIC UPDATE (CORE FIX)
    // =========================
    const updatedSeats = await db
      .update(seats)
      .set({ isAvailable: false })
      .where(
        and(
          eq(seats.id, seatId),
          eq(seats.isAvailable, true) // 🔥 guarantees no race
        )
      )
      .returning()

    // If no row updated → seat already taken
    if (updatedSeats.length === 0) {
      return NextResponse.json(
        { error: "Seat already taken", requestId },
        { status: 409 }
      )
    }

    const seat = updatedSeats[0]

    // =========================
    // ASSIGN TO PASSENGER
    // =========================
    await db
      .update(passengers)
      .set({
        seat: seat.seatNumber
      })
      .where(eq(passengers.id, passengerId))

    // =========================
    // READ LOCK (get bookingId before deleting)
    // =========================
    const lock = await db
      .select()
      .from(seatLocks)
      .where(eq(seatLocks.seatId, seatId))
      .then(res => res[0])

    // =========================
    // REMOVE LOCK
    // =========================
    await db
      .delete(seatLocks)
      .where(eq(seatLocks.seatId, seatId))

    const duration = Date.now() - startTime

    logInfo("SEAT_CONFIRM_SUCCESS", {
      requestId,
      passengerId,
      seatNumber: seat.seatNumber,
      duration
    })

    // =========================
    // SLOW API DETECTION
    // =========================
    if (duration > 1000) {
      logWarn("SLOW_API", {
        requestId,
        endpoint: "SEAT_CONFIRM",
        duration
      })
    }

    // =========================
    // GENERATE TICKET
    // The seat is already confirmed in the DB at this point — we do not
    // roll that back if ticket generation fails. Instead we surface the
    // error in the response so the caller can react (retry, show a clear
    // message, etc.) rather than leaving the failure silent.
    // =========================
    let ticketUrl: string | null = null
    let ticketError: string | null = null

    if (lock?.bookingId) {
      try {
        ticketUrl = await createTicket(lock.bookingId)
        logInfo("TICKET_GENERATED", { requestId, bookingId: lock.bookingId, ticketUrl })
      } catch (err: any) {
        ticketError = err.message || "Ticket generation failed"
        logError("TICKET_GENERATION_FAILED", {
          requestId,
          bookingId: lock.bookingId,
          error: ticketError
        })
      }
    } else {
      ticketError = "No booking associated with this seat — ticket not generated"
      logWarn("TICKET_GENERATION_SKIPPED_NO_BOOKING", { requestId, seatId })
    }

    return NextResponse.json({
      success: true,
      seatAssigned: seat.seatNumber,
      ticketUrl,
      ticketGenerationFailed: ticketError !== null,
      ticketError
    })

  } catch (error: any) {
    const duration = Date.now() - startTime

    logError("SEAT_CONFIRM_FAILED", {
      requestId,
      error: error.message,
      duration
    })

    return NextResponse.json(
      {
        error: error.message || "Seat confirmation failed",
        requestId
      },
      { status: 500 }
    )
  }
}