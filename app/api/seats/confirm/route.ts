import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { passengers, seats, seatLocks } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { logInfo, logError, logWarn } from "@/lib/logger"
import { generateRequestId } from "@/lib/requestId"
import { createTicket } from "@/lib/createTicket"

const ANSWERS_WEBHOOK_BASE =
  process.env.ANSWERS_WEBHOOK_BASE || "https://api2.infobip.com/bots/webhook"

// Fire-and-forget ping to the Infobip Answers path-parameter webhook so the
// paused chat flow resumes and renders the boarding pass via document_url.
// Non-fatal: if Answers is unreachable, the seat is still confirmed and the
// ticket is still generated — the traveler can retrieve it manually later.
async function notifyAnswersBoardingPassReady(opts: {
  requestId: string
  sessionId: string
  pnr: string | null
  ticketUrl: string
  passengerName: string | null
}) {
  const { requestId, sessionId, pnr, ticketUrl, passengerName } = opts

  const payload = {
    pnr: pnr || "",
    ticketUrl,
    passengerName: passengerName || ""
  }

  const url = `${ANSWERS_WEBHOOK_BASE}/${encodeURIComponent(sessionId)}`

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })

    if (!res.ok) {
      logWarn("ANSWERS_WEBHOOK_NON_OK", {
        requestId,
        sessionId,
        pnr,
        status: res.status
      })
      return
    }

    logInfo("ANSWERS_WEBHOOK_SENT", { requestId, sessionId, pnr })
  } catch (err: any) {
    logError("ANSWERS_WEBHOOK_FAILED", {
      requestId,
      sessionId,
      pnr,
      error: err.message
    })
  }
}

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
    // ENFORCE CABIN CLASS
    // The seat's class must match the booking's paid cabin class.
    // Look up the seat + lock + booking together so we can reject early
    // (before atomic-claiming the seat) if classes mismatch.
    // =========================
    const seatRow = await db.query.seats.findFirst({
      where: (s, { eq }) => eq(s.id, seatId)
    })

    if (!seatRow) {
      return NextResponse.json(
        { error: "Seat not found", requestId },
        { status: 404 }
      )
    }

    const seatClass = (seatRow.class || "economy").toLowerCase()

    const preLock = await db
      .select()
      .from(seatLocks)
      .where(eq(seatLocks.seatId, seatId))
      .then(res => res[0])

    if (preLock?.bookingId) {
      const preBooking = await db.query.bookings.findFirst({
        where: (b, { eq }) => eq(b.id, preLock.bookingId)
      })
      const paidClass = (preBooking?.cabinClass || "ECONOMY").toLowerCase()

      if (paidClass !== seatClass) {
        logWarn("SEAT_CLASS_MISMATCH", {
          requestId,
          seatId,
          seatNumber: seatRow.seatNumber,
          seatClass,
          paidClass
        })
        return NextResponse.json(
          {
            error: `That seat is ${seatClass}, but your booking is ${paidClass}. Please pick a seat in the ${paidClass} cabin.`,
            requestId
          },
          { status: 409 }
        )
      }
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

      // =========================
      // PUSH BOARDING PASS BACK TO ANSWERS (proactive completion)
      // Fire only when ticket generation succeeded AND the booking carries
      // an Answers chat sessionId. Non-fatal — the helper has its own
      // try/catch and won't throw — but we MUST await it on Vercel
      // serverless: any pending promise after the response is returned
      // gets killed before completing the fetch (and before its logs flush).
      // =========================
      if (ticketUrl) {
        const bookingRow = await db.query.bookings.findFirst({
          where: (b, { eq }) => eq(b.id, lock.bookingId)
        })

        // Log what we loaded from the booking row before firing the webhook
        // so we can correlate the sessionId used in the callback with the
        // sessionId originally captured at booking creation time.
        logInfo("ANSWERS_WEBHOOK_LOOKUP", {
          requestId,
          bookingId: lock.bookingId,
          pnr: bookingRow?.pnr ?? null,
          sessionIdOnBooking: bookingRow?.sessionId ?? null,
          createdAt: bookingRow?.createdAt ?? null
        })

        if (bookingRow?.sessionId) {
          await notifyAnswersBoardingPassReady({
            requestId,
            sessionId: bookingRow.sessionId,
            pnr: bookingRow.pnr,
            ticketUrl,
            passengerName: bookingRow.passengerName
          })
        } else {
          logWarn("ANSWERS_WEBHOOK_SKIPPED_NO_SESSION", {
            requestId,
            bookingId: lock.bookingId
          })
        }
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