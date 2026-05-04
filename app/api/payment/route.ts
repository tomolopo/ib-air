import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { bookings } from "@/db/schema"
import { eq } from "drizzle-orm"

import { logInfo, logError } from "@/lib/logger"
import { generateRequestId } from "@/lib/requestId"

export async function POST(req: NextRequest) {
  const requestId = generateRequestId()

  try {
    const body = await req.json()
    const { action, bookingId } = body

    // =========================
    // LOG REQUEST
    // =========================
    logInfo("PAYMENT_REQUEST", {
      requestId,
      action,
      bookingId
    })

    // =========================
    // CREATE PAYMENT LINK
    // =========================
    if (action === "create_link") {
      if (!bookingId) {
        return NextResponse.json(
          { error: "Missing bookingId", requestId },
          { status: 400 }
        )
      }

      const paymentUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/pay?bookingId=${bookingId}`

      logInfo("PAYMENT_LINK_CREATED", {
        requestId,
        bookingId
      })

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
        return NextResponse.json(
          { error: "Missing bookingId", requestId },
          { status: 400 }
        )
      }

      logInfo("PAYMENT_CONFIRM_START", {
        requestId,
        bookingId
      })

      // =========================
      // UPDATE STATUS (FAST)
      // =========================
      await db
        .update(bookings)
        .set({
          status: "PAID", // ✅ unchanged
          paymentStatus: "COMPLETED"
        })
        .where(eq(bookings.id, bookingId))

      logInfo("PAYMENT_CONFIRMED", {
        requestId,
        bookingId
      })

      // =========================
      // TRIGGER TICKET GENERATION (NON-BLOCKING)
      // =========================
      const ticketUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/api/booking/${bookingId}?type=ticket`

      fetch(ticketUrl).catch(err => {
        logError("TICKET_GENERATION_FAILED", {
          requestId,
          bookingId,
          error: err.message
        })
      })

      logInfo("TICKET_TRIGGERED", {
        requestId,
        bookingId,
        ticketUrl
      })

      return NextResponse.json({
        success: true,
        message: "Payment successful. Ticket is being generated.",
        ticketEndpoint: ticketUrl
      })
    }

    return NextResponse.json(
      { error: "Invalid action", requestId },
      { status: 400 }
    )

  } catch (error: any) {
    logError("PAYMENT_FAILED", {
      requestId,
      error: error.message
    })

    return NextResponse.json(
      {
        error: error.message || "Internal Server Error",
        requestId
      },
      { status: 500 }
    )
  }
}