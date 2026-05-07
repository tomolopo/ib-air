import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { bookings, bookingSegments, passengers, bookingPassengers } from "@/db/schema"
import { eq, inArray } from "drizzle-orm"
import { logInfo, logError } from "@/lib/logger"
import { generateRequestId } from "@/lib/requestId"

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = generateRequestId()
  const { id: bookingId } = await context.params

  try {
    const body = await req.json()
    const { type } = body

    const booking = await db.query.bookings.findFirst({
      where: (b, { eq }) => eq(b.id, bookingId)
    })

    if (!booking) {
      return NextResponse.json({ error: "Booking not found", requestId }, { status: 404 })
    }

    if (booking.status === "CANCELLED") {
      return NextResponse.json({ error: "Cannot modify a cancelled booking", requestId }, { status: 409 })
    }

    // =========================
    // UPDATE PASSENGER DETAILS
    // =========================
    if (type === "passenger") {
      const { passengerId, firstName, lastName, email, phone, passportNumber, nationality } = body

      if (!passengerId) {
        return NextResponse.json({ error: "Missing passengerId", requestId }, { status: 400 })
      }

      const updates: Record<string, string> = {}
      if (firstName) updates.firstName = firstName
      if (lastName) updates.lastName = lastName
      if (email) updates.email = email
      if (phone) updates.phone = phone
      if (passportNumber) updates.passportNumber = passportNumber
      if (nationality) updates.nationality = nationality

      if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "No fields to update", requestId }, { status: 400 })
      }

      await db
        .update(passengers)
        .set(updates)
        .where(eq(passengers.id, passengerId))

      if (firstName || lastName) {
        const links = await db
          .select()
          .from(bookingPassengers)
          .where(eq(bookingPassengers.bookingId, bookingId))

        if (links[0]?.passengerId === passengerId) {
          const updatedFirst = firstName || booking.passengerName?.split(" ")[0] || ""
          const updatedLast = lastName || booking.passengerName?.split(" ").slice(1).join(" ") || ""
          await db
            .update(bookings)
            .set({ passengerName: `${updatedFirst} ${updatedLast}`.trim() })
            .where(eq(bookings.id, bookingId))
        }
      }

      logInfo("BOOKING_PASSENGER_MODIFIED", { requestId, bookingId, passengerId })

      return NextResponse.json({
        success: true,
        message: "Passenger details updated successfully.",
        bookingId,
        pnr: booking.pnr,
        updatedFields: Object.keys(updates)
      })
    }

    // =========================
    // CHANGE FLIGHT
    // =========================
    if (type === "flight") {
      const { flightId, segmentOrder = 1 } = body

      if (!flightId) {
        return NextResponse.json({ error: "Missing flightId", requestId }, { status: 400 })
      }

      const segment = await db.query.bookingSegments.findFirst({
        where: (s, { and, eq }) =>
          and(eq(s.bookingId, bookingId), eq(s.segmentOrder, segmentOrder))
      })

      if (!segment) {
        return NextResponse.json({ error: "Segment not found", requestId }, { status: 404 })
      }

      await db
        .update(bookingSegments)
        .set({ flightId })
        .where(eq(bookingSegments.id, segment.id))

      logInfo("BOOKING_FLIGHT_MODIFIED", { requestId, bookingId, flightId, segmentOrder })

      return NextResponse.json({
        success: true,
        message: "Flight updated successfully.",
        bookingId,
        pnr: booking.pnr,
        segmentOrder,
        newFlightId: flightId
      })
    }

    return NextResponse.json(
      { error: "Invalid type. Use 'passenger' or 'flight'.", requestId },
      { status: 400 }
    )
  } catch (error: any) {
    logError("BOOKING_MODIFY_FAILED", { requestId, error: error.message })
    return NextResponse.json(
      { error: error.message || "Failed to modify booking", requestId },
      { status: 500 }
    )
  }
}
