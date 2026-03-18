import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { bookings, bookingSegments, passengers } from "@/db/schema"

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
  try {
    const body = await req.json()

    const { flights: flightIds, passengers: pax } = body

    // =========================
    // VALIDATION
    // =========================
    if (!flightIds || flightIds.length === 0) {
      return NextResponse.json(
        { error: "No flights selected" },
        { status: 400 }
      )
    }

    if (!pax || pax.length === 0) {
      return NextResponse.json(
        { error: "Passenger details required" },
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
        totalAmount,
        passengerName: `${pax[0].firstName} ${pax[0].lastName}` // ✅ FIX
      })
      .returning()

    // =========================
    // INSERT SEGMENTS (FIXED)
    // =========================
    const segments = flightIds.map((flightId: string, index: number) => ({
      bookingId: booking.id,
      flightId,
      segmentOrder: index + 1 // ✅ CRITICAL FIX
    }))

    await db.insert(bookingSegments).values(segments)

    // =========================
    // INSERT PASSENGERS
    // =========================
    const passengerRows = pax.map((p: any) => ({
      bookingId: booking.id,
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.email,
      phone: p.phone
    }))

    await db.insert(passengers).values(passengerRows)

    // =========================
    // RESPONSE
    // =========================
    return NextResponse.json({
      success: true,
      pnr,
      bookingId: booking.id,
      totalAmount,
      flightsCount: flightIds.length,
      passengersCount: pax.length
    })

  } catch (error: any) {
    console.error("BOOKING ERROR:", error)

    return NextResponse.json(
      { error: error.message || "Booking failed" },
      { status: 500 }
    )
  }
}