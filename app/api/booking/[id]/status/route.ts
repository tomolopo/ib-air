import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { bookings } from "@/db/schema"
import { eq } from "drizzle-orm"
import { logInfo, logError } from "@/lib/logger"
import { generateRequestId } from "@/lib/requestId"

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = generateRequestId()
  const { id } = await context.params

  try {
    const booking = await db.query.bookings.findFirst({
      where: (b, { eq }) => eq(b.id, id)
    })

    if (!booking) {
      return NextResponse.json(
        { error: "Booking not found", requestId },
        { status: 404 }
      )
    }

    logInfo("BOOKING_STATUS_FETCHED", { requestId, bookingId: id })

    return NextResponse.json({
      success: true,
      bookingId: booking.id,
      pnr: booking.pnr,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      totalAmount: booking.totalAmount,
      passengerName: booking.passengerName,
      createdAt: booking.createdAt
    })
  } catch (error: any) {
    logError("BOOKING_STATUS_FAILED", { requestId, error: error.message })
    return NextResponse.json(
      { error: error.message || "Failed to fetch booking status", requestId },
      { status: 500 }
    )
  }
}
