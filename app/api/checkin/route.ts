import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { bookings, passengers, bookingPassengers } from "@/db/schema"
import { eq, inArray } from "drizzle-orm"
import { logInfo, logError } from "@/lib/logger"
import { generateRequestId } from "@/lib/requestId"

export async function POST(req: NextRequest) {
  const requestId = generateRequestId()

  try {
    const body = await req.json()
    const { bookingId, passengerIds } = body

    if (!bookingId) {
      return NextResponse.json({ error: "Missing bookingId", requestId }, { status: 400 })
    }

    const booking = await db.query.bookings.findFirst({
      where: (b, { eq }) => eq(b.id, bookingId)
    })

    if (!booking) {
      return NextResponse.json({ error: "Booking not found", requestId }, { status: 404 })
    }

    if (booking.status === "CANCELLED") {
      return NextResponse.json({ error: "Cannot check in for a cancelled booking", requestId }, { status: 409 })
    }

    if (booking.paymentStatus !== "COMPLETED") {
      return NextResponse.json({ error: "Payment not completed. Check-in is not available.", requestId }, { status: 409 })
    }

    // If specific passengerIds provided, validate they belong to this booking
    let targetIds: string[]

    if (passengerIds && Array.isArray(passengerIds) && passengerIds.length > 0) {
      const links = await db
        .select()
        .from(bookingPassengers)
        .where(eq(bookingPassengers.bookingId, bookingId))

      const linked = new Set(links.map(l => l.passengerId))
      targetIds = passengerIds.filter((id: string) => linked.has(id))

      if (targetIds.length === 0) {
        return NextResponse.json({ error: "No valid passengers found for this booking", requestId }, { status: 404 })
      }
    } else {
      // Check in all passengers for this booking
      const links = await db
        .select()
        .from(bookingPassengers)
        .where(eq(bookingPassengers.bookingId, bookingId))

      targetIds = links.map(l => l.passengerId)
    }

    if (targetIds.length === 0) {
      return NextResponse.json({ error: "No passengers found for this booking", requestId }, { status: 404 })
    }

    const now = new Date()

    await db
      .update(passengers)
      .set({ checkedIn: true, checkedInAt: now })
      .where(inArray(passengers.id, targetIds))

    logInfo("CHECKIN_COMPLETED", { requestId, bookingId, count: targetIds.length })

    return NextResponse.json({
      success: true,
      bookingId,
      pnr: booking.pnr,
      checkedInPassengers: targetIds.length,
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
