import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { bookings, passengers, bookingPassengers } from "@/db/schema"
import { eq, inArray } from "drizzle-orm"
import { logInfo, logError } from "@/lib/logger"
import { generateRequestId } from "@/lib/requestId"

export async function GET(req: NextRequest) {
  const requestId = generateRequestId()
  const pnr = req.nextUrl.searchParams.get("pnr")
  const lastName = req.nextUrl.searchParams.get("lastName")

  if (!pnr || !lastName) {
    return NextResponse.json(
      { error: "Missing pnr or lastName", requestId },
      { status: 400 }
    )
  }

  try {
    // =========================
    // LOOK UP BOOKING BY PNR
    // =========================
    const booking = await db.query.bookings.findFirst({
      where: (b, { eq }) => eq(b.pnr, pnr.toUpperCase())
    })

    if (!booking) {
      return NextResponse.json(
        { error: "Booking not found. Please check your PNR.", requestId },
        { status: 404 }
      )
    }

    // =========================
    // FETCH PASSENGERS
    // =========================
    const links = await db
      .select()
      .from(bookingPassengers)
      .where(eq(bookingPassengers.bookingId, booking.id))

    const passengerIds = links.map(l => l.passengerId)

    if (passengerIds.length === 0) {
      return NextResponse.json(
        { error: "No passengers found for this booking.", requestId },
        { status: 404 }
      )
    }

    const pax = await db
      .select()
      .from(passengers)
      .where(inArray(passengers.id, passengerIds))

    // =========================
    // VERIFY LAST NAME
    // =========================
    const matched = pax.filter(
      p => p.lastName?.toLowerCase() === lastName.trim().toLowerCase()
    )

    if (matched.length === 0) {
      return NextResponse.json(
        { error: "Last name does not match any passenger on this booking.", requestId },
        { status: 403 }
      )
    }

    const result = pax.map(p => ({
      passengerId: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      seat: p.seat ?? null,
      checkedIn: p.checkedIn ?? false,
      checkedInAt: p.checkedInAt ?? null
    }))

    const allCheckedIn = result.every(p => p.checkedIn)

    logInfo("CHECKIN_STATUS_FETCHED", { requestId, bookingId: booking.id, pnr })

    return NextResponse.json({
      success: true,
      bookingId: booking.id,
      pnr: booking.pnr,
      allCheckedIn,
      passengers: result
    })
  } catch (error: any) {
    logError("CHECKIN_STATUS_FAILED", { requestId, error: error.message })
    return NextResponse.json(
      { error: error.message || "Failed to fetch check-in status", requestId },
      { status: 500 }
    )
  }
}
