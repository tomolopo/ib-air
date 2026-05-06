import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { bookings } from "@/db/schema"
import { eq } from "drizzle-orm"
import { logInfo, logError } from "@/lib/logger"
import { generateRequestId } from "@/lib/requestId"

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = generateRequestId()
  const { id } = params

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

    if (booking.status === "CANCELLED") {
      return NextResponse.json(
        { error: "Booking is already cancelled", requestId },
        { status: 409 }
      )
    }

    await db
      .update(bookings)
      .set({ status: "CANCELLED" })
      .where(eq(bookings.id, id))

    logInfo("BOOKING_CANCELLED", { requestId, bookingId: id, pnr: booking.pnr })

    return NextResponse.json({
      success: true,
      bookingId: id,
      pnr: booking.pnr,
      status: "CANCELLED",
      message: "Booking has been successfully cancelled."
    })
  } catch (error: any) {
    logError("BOOKING_CANCEL_FAILED", { requestId, error: error.message })
    return NextResponse.json(
      { error: error.message || "Failed to cancel booking", requestId },
      { status: 500 }
    )
  }
}
