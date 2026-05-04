import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { seats, seatLocks } from "@/db/schema"
import { eq, lte, inArray } from "drizzle-orm"

import { logInfo, logError } from "@/lib/logger"
import { generateRequestId } from "@/lib/requestId"

export async function GET(req: NextRequest) {
  const requestId = generateRequestId()

  try {
    const flightId = req.nextUrl.searchParams.get("flightId")

    // =========================
    // LOG REQUEST
    // =========================
    logInfo("GET_SEATS_REQUEST", {
      requestId,
      flightId
    })

    if (!flightId) {
      return NextResponse.json(
        { error: "Missing flightId", requestId },
        { status: 400 }
      )
    }

    // =========================
    // CLEAN EXPIRED LOCKS
    // =========================
    await db
      .delete(seatLocks)
      .where(lte(seatLocks.expiresAt, new Date()))

    // =========================
    // GET SEATS FOR FLIGHT
    // =========================
    const allSeats = await db
      .select()
      .from(seats)
      .where(eq(seats.flightId, flightId))

    const seatIds = allSeats.map(s => s.id)

    // =========================
    // GET ACTIVE LOCKS
    // =========================
    const activeLocks = seatIds.length
      ? await db
          .select()
          .from(seatLocks)
          .where(inArray(seatLocks.seatId, seatIds))
      : []

    const lockedSeatIds = activeLocks.map(l => l.seatId)

    // =========================
    // MAP STATUS
    // =========================
    const result = allSeats.map(seat => ({
      id: seat.id,
      seatNumber: seat.seatNumber,
      status: lockedSeatIds.includes(seat.id)
        ? "locked"
        : seat.isAvailable
        ? "available"
        : "booked"
    }))

    // =========================
    // LOG SUCCESS
    // =========================
    logInfo("GET_SEATS_SUCCESS", {
      requestId,
      flightId,
      totalSeats: result.length,
      lockedSeats: lockedSeatIds.length
    })

    return NextResponse.json({ seats: result })

  } catch (error: any) {
    logError("GET_SEATS_FAILED", {
      requestId,
      error: error.message
    })

    return NextResponse.json(
      {
        error: error.message || "Failed to fetch seats",
        requestId
      },
      { status: 500 }
    )
  }
}