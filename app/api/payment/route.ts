import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { bookings } from "@/db/schema"
import { eq } from "drizzle-orm"

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action } = body

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL

  // =========================
  // CREATE PAYMENT LINK
  // =========================
  if (action === "create_link") {
    const { bookingId } = body

    return NextResponse.json({
      success: true,
      paymentUrl: `${baseUrl}/pay/${bookingId}`
    })
  }

  // =========================
  // PROCESS PAYMENT
  // =========================
  if (action === "pay") {
    const { bookingId, cardNumber, cvv, pin } = body

    const isValid =
      cardNumber === "4242424242424242" &&
      cvv === "123" &&
      pin === "0000"

    if (!isValid) {
      return NextResponse.json({ success: false })
    }

    await db
      .update(bookings)
      .set({
        paymentStatus: "PAID",
        status: "CONFIRMED"
      })
      .where(eq(bookings.id, bookingId))

    return NextResponse.json({
      success: true,
      ticketUrl: `${baseUrl}/api/booking/${bookingId}?type=ticket`,
      seatUrl: `${baseUrl}/seat/${bookingId}`
    })
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 })
}