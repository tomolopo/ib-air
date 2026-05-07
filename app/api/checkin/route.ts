import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { bookings, passengers, bookingPassengers } from "@/db/schema"
import { eq, inArray, ilike } from "drizzle-orm"
import { logInfo, logError } from "@/lib/logger"
import { generateRequestId } from "@/lib/requestId"

export async function POST(req: NextRequest) {
  const requestId = generateRequestId()

  try {
    const body = await req.json()
    const { pnr, lastName } = body

    if (!pnr || !lastName) {
      return NextResponse.json(
        { error: "Missing pnr or lastName", requestId },
        { status: 400 }
      )
    }

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

    if (booking.status === "CANCELLED") {
      return NextResponse.json(
        { error: "Cannot check in for a cancelled booking.", requestId },
        { status: 409 }
      )
    }

    if (booking.paymentStatus !== "COMPLETED") {
      return NextResponse.json(
        { error: "Payment not completed. Check-in is not available.", requestId },
        { status: 409 }
      )
    }

    // =========================
    // VERIFY LAST NAME AGAINST PASSENGERS
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

    const matched = pax.filter(
      p => p.lastName?.toLowerCase() === lastName.trim().toLowerCase()
    )

    if (matched.length === 0) {
      return NextResponse.json(
        { error: "Last name does not match any passenger on this booking.", requestId },
        { status: 403 }
      )
    }

    // =========================
    // CHECK IN MATCHED PASSENGERS
    // =========================
    const now = new Date()
    const matchedIds = matched.map(p => p.id)

    await db
      .update(passengers)
      .set({ checkedIn: true, checkedInAt: now })
      .where(inArray(passengers.id, matchedIds))

    logInfo("CHECKIN_COMPLETED", { requestId, bookingId: booking.id, pnr, count: matchedIds.length })

    return NextResponse.json({
      success: true,
      bookingId: booking.id,
      pnr: booking.pnr,
      checkedInPassengers: matchedIds.length,
      checkedInAt: now.toISOString(),
      message: "Check-in successful. Retrieve your boarding pass using the boarding pass endpoint."
    })
  } catch (error: any) {
    logError("CHECKIN_FAILED", { requestId, error: error.message })
    return NextResponse.json(
      { error: error.message || "Check-in failed", requestId },
      { status: 500 }
    )
  }
}
