import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { bookings } from "@/db/schema"
import { eq } from "drizzle-orm"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, bookingId } = body

    // =========================
    // CREATE PAYMENT LINK
    // =========================
    if (action === "create_link") {
      if (!bookingId) {
        return NextResponse.json({ error: "Missing bookingId" }, { status: 400 })
      }

      const paymentUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/pay?bookingId=${bookingId}`

      return NextResponse.json({
        success: true,
        paymentUrl
      })
    }

    // =========================
    // CONFIRM PAYMENT
    // =========================
    if (action === "confirm_payment") {
      if (!bookingId) {
        return NextResponse.json({ error: "Missing bookingId" }, { status: 400 })
      }

      console.log("🔥 PAYMENT START:", bookingId)

      // =========================
      // UPDATE STATUS ONLY (FAST)
      // =========================
      await db
        .update(bookings)
        .set({
          status: "PAID",            // ✅ lifecycle update
          paymentStatus: "COMPLETED"
        })
        .where(eq(bookings.id, bookingId))

      console.log("✅ PAYMENT CONFIRMED")

      // =========================
      // TRIGGER TICKET GENERATION (NON-BLOCKING)
      // =========================
      const ticketUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/api/booking/${bookingId}?type=ticket`

      // Fire and forget (don’t await)
      fetch(ticketUrl).catch(err => {
        console.error("⚠️ Ticket generation failed:", err)
      })

      return NextResponse.json({
        success: true,
        message: "Payment successful. Ticket is being generated.",
        ticketEndpoint: ticketUrl
      })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })

  } catch (error: any) {
    console.error("🔥 PAYMENT ERROR:", error)

    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    )
  }
}