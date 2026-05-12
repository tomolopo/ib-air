import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import {
  bookings,
  bookingSegments,
  flights,
  passengers,
  bookingPassengers
} from "@/db/schema"
import { eq } from "drizzle-orm"

import { logInfo, logError } from "@/lib/logger"
import { generateRequestId } from "@/lib/requestId"

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveFlightId(idOrNumber: string): Promise<string> {
  if (UUID_REGEX.test(idOrNumber)) return idOrNumber

  const flight = await db.query.flights.findFirst({
    where: (f, { eq }) => eq(f.flightNumber, idOrNumber)
  })

  if (!flight) throw new Error(`Flight not found: ${idOrNumber}`)
  return flight.id
}

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

    const { flights: flightIds, passengers: pax, sessionId } = body

    logInfo("BOOKING_REQUEST", {
      requestId,
      flightsCount: flightIds?.length,
      passengersCount: pax?.length,
      sessionIdPresent: Boolean(sessionId),
      // Log the actual sessionId so we can compare it later against the
      // sessionId loaded from the booking row in /api/seats/confirm.
      sessionId: sessionId || null
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
    // RESOLVE FLIGHT IDs (accept UUID or flight number)
    // =========================
    const resolvedFlightIds = await Promise.all(
      flightIds.map((id: string) => resolveFlightId(id))
    )

    // =========================
    // GENERATE PNR
    // =========================
    const pnr = await generateUniquePNR()

    // =========================
    // SIMPLE PRICING
    // =========================
    const totalAmount = resolvedFlightIds.length * 500

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
        passengerName: `${pax[0].firstName} ${pax[0].lastName}`,
        sessionId: sessionId || null
      })
      .returning()

    // =========================
    // INSERT SEGMENTS
    // =========================
    const segments = resolvedFlightIds.map((flightId: string, index: number) => ({
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
      flightsCount: resolvedFlightIds.length,
      passengersCount: pax.length,
      paymentUrl
    }

    logInfo("BOOKING_SUCCESS", {
      requestId,
      bookingId: booking.id,
      pnr,
      // Log the sessionId that got persisted on the row so we can later
      // cross-reference against the one used in the webhook callback.
      sessionId: booking.sessionId
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