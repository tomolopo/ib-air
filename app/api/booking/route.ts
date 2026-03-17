import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import {
  bookings,
  bookingSegments,
  passengers,
  bookingPassengers
} from "@/db/schema"

// =======================
// 🧠 PNR GENERATOR
// =======================

function generatePNR() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  let pnr = ""
  for (let i = 0; i < 6; i++) {
    pnr += chars[Math.floor(Math.random() * chars.length)]
  }
  return pnr
}

// =======================
// 🎟️ CREATE BOOKING
// =======================

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const { flights: flightIds, passengers: pax } = body

    if (!flightIds || flightIds.length === 0) {
      return NextResponse.json(
        { error: "No flights selected" },
        { status: 400 }
      )
    }

    if (!pax || pax.length === 0) {
      return NextResponse.json(
        { error: "No passengers provided" },
        { status: 400 }
      )
    }

    const pnr = generatePNR()

    // =======================
    // CREATE BOOKING
    // =======================

    const totalAmount = flightIds.length * 500 // simple pricing

const [booking] = await db.insert(bookings).values({
  pnr,
  status: "PENDING",
  totalAmount: totalAmount
}).returning()

    // =======================
    // INSERT SEGMENTS
    // =======================

    const segments = flightIds.map((flightId: string, index: number) => ({
      bookingId: booking.id,
      flightId,
      segmentOrder: index + 1
    }))

    await db.insert(bookingSegments).values(segments)

    // =======================
    // INSERT PASSENGERS
    // =======================

    for (const p of pax) {
      const [passenger] = await db
        .insert(passengers)
        .values({
          firstName: p.firstName,
          lastName: p.lastName,
          email: p.email,
          phone: p.phone
        })
        .returning()

      await db.insert(bookingPassengers).values({
        bookingId: booking.id,
        passengerId: passenger.id
      })
    }

    return NextResponse.json({
      success: true,
      pnr,
      bookingId: booking.id
    })

  } catch (error: any) {
  console.error("BOOKING ERROR:", error)

  return NextResponse.json(
    { error: error.message || "Booking failed" },
    { status: 500 }
  )
}
}