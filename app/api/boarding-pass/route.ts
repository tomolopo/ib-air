import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { bookings, passengers, bookingPassengers } from "@/db/schema"
import { eq, inArray } from "drizzle-orm"
import { logInfo, logError } from "@/lib/logger"
import { generateRequestId } from "@/lib/requestId"

export async function GET(req: NextRequest) {
  const requestId = generateRequestId()
  const bookingId = req.nextUrl.searchParams.get("bookingId")

  if (!bookingId) {
    return NextResponse.json({ error: "Missing bookingId", requestId }, { status: 400 })
  }

  try {
    const booking = await db.query.bookings.findFirst({
      where: (b, { eq }) => eq(b.id, bookingId)
    })

    if (!booking) {
      return NextResponse.json({ error: "Booking not found", requestId }, { status: 404 })
    }

    if (!booking.ticketUrl) {
      return NextResponse.json(
        { error: "Boarding pass not available yet. Complete seat selection to generate your ticket.", requestId },
        { status: 404 }
      )
    }

    const links = await db
      .select()
      .from(bookingPassengers)
      .where(eq(bookingPassengers.bookingId, bookingId))

    const passengerIds = links.map(l => l.passengerId)
    const pax = passengerIds.length > 0
      ? await db.select().from(passengers).where(inArray(passengers.id, passengerIds))
      : []

    logInfo("BOARDING_PASS_FETCHED", { requestId, bookingId })

    return NextResponse.json({
      success: true,
      bookingId,
      pnr: booking.pnr,
      status: booking.status,
      ticketUrl: booking.ticketUrl,
      passengers: pax.map(p => ({
        passengerId: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        seat: p.seat ?? null,
        checkedIn: p.checkedIn ?? false
      }))
    })
  } catch (error: any) {
    logError("BOARDING_PASS_FETCH_FAILED", { requestId, error: error.message })
    return NextResponse.json(
      { error: error.message || "Failed to retrieve boarding pass", requestId },
      { status: 500 }
    )
  }
}
