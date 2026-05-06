import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import {
  bookings,
  bookingSegments,
  passengers,
  bookingPassengers
} from "@/db/schema"

import { logInfo, logError } from "@/lib/logger"
import { generateRequestId } from "@/lib/requestId"

// =========================
// GENERATE PNR
// =========================
async function generateUniquePNR(): Promise<string> {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

  while (true) {
    let pnr = ""

    for (let i = 0; i < 6; i++) {
      pnr += chars.charAt(Math.floor(Math.random() * chars.length))
    }

    const existing = await db.query.bookings.findFirst({
      where: (b: any, { eq }: any) => eq(b.pnr, pnr)
    })

    if (!existing) return pnr
  }
}

// =========================
// CREATE BOOKING
// =========================
export async function POST(req: NextRequest) {
  const requestId = generateRequestId()

  try {
    const body = await req.json()

    const { flights: flightIds, passengers: pax } = body

    logInfo("BOOKING_REQUEST", {
      requestId,
      flightsCount: flightIds?.length,
      passengersCount: pax?.length
    })

    // =========================
    // VALIDATION
    // =========================
    if (!flightIds || flightIds.length === 0) {
      return NextResponse.json(
        { error: "No flights selected", requestId },
        { status: 400 }
      )
    }

    if (!pax || pax.length === 0) {
      return NextResponse.json(
        { error: "Passenger details required", requestId },
        { status: 400 }
      )
    }

    // =========================
    // GENERATE PNR
    // =========================
    const pnr = await generateUniquePNR()

    // =========================
    // SIMPLE PRICING
    // =========================
    const totalAmount = flightIds.length * 500

    // =========================
    // CREATE BOOKING
    // =========================
    const [booking] = await db
      .insert(bookings)
      .values({
        pnr,
        status: "PENDING",
        paymentStatus: "PENDING",
        totalAmount,
        passengerName: `${pax[0].firstName} ${pax[0].lastName}`
      })
      .returning()

    // =========================
    // INSERT SEGMENTS
    // =========================
    const segments = flightIds.map((flightId: string, index: number) => ({
      bookingId: booking.id,
      flightId,
      segmentOrder: index + 1
    }))

    await db.insert(bookingSegments).values(segments)

    // =========================
    // INSERT PASSENGERS (FIXED)
    // =========================
    const insertedPassengers = await db
      .insert(passengers)
      .values(
        pax.map((p: any) => ({
          firstName: p.firstName,
          lastName: p.lastName,
          email: p.email,
          phone: p.phone,
          type: p.type || "adult",
          passportNumber: p.passportNumber || null,
          nationality: p.nationality || null
        }))
      )
      .returning()

    // =========================
    // LINK PASSENGERS TO BOOKING (NEW FIX)
    // =========================
    await db.insert(bookingPassengers).values(
      insertedPassengers.map((p) => ({
        bookingId: booking.id,
        passengerId: p.id
      }))
    )

    // =========================
    // GENERATE PAYMENT URL
    // =========================
    const paymentUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/pay?bookingId=${booking.id}`

    const response = {
      success: true,
      pnr,
      bookingId: booking.id,
      totalAmount,
      flightsCount: flightIds.length,
      passengersCount: pax.length,
      paymentUrl
    }

    logInfo("BOOKING_SUCCESS", {
      requestId,
      bookingId: booking.id,
      pnr
    })

    return NextResponse.json(response)

  } catch (error: any) {
    logError("BOOKING_FAILED", {
      requestId,
      error: error.message
    })

    return NextResponse.json(
      {
        error: error.message || "Booking failed",
        requestId
      },
      { status: 500 }
    )
  }
}