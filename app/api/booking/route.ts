import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import {
  bookings,
  bookingSegments,
  passengers,
  bookingPassengers
} from "@/db/schema"
import { eq } from "drizzle-orm"

// ==============================
// 🔐 UNIQUE PNR GENERATOR
// ==============================
async function generateUniquePNR(): Promise<string> {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

  while (true) {
    let pnr = ""

    for (let i = 0; i < 6; i++) {
      pnr += chars.charAt(Math.floor(Math.random() * chars.length))
    }

    const existing = await db.query.bookings.findFirst({
      where: (b, { eq }) => eq(b.pnr, pnr)
    })

    if (!existing) return pnr
  }
}

// ==============================
// 🧪 TEST ENDPOINT (OPTIONAL)
// ==============================
export async function GET() {
  return NextResponse.json({ message: "Booking API working" })
}

// ==============================
// ✈️ CREATE BOOKING
// ==============================
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const { flights: flightIds, passengers: pax } = body

    // ==============================
    // VALIDATION
    // ==============================
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

    // ==============================
    // GENERATE PNR
    // ==============================
    const pnr = await generateUniquePNR()

    // ==============================
    // CALCULATE PRICE
    // ==============================
    const totalAmount = flightIds.length * 500

    // ==============================
    // CREATE BOOKING
    // ==============================
    const [booking] = await db
      .insert(bookings)
      .values({
        pnr,
        status: "PENDING",
        totalAmount
      })
      .returning()

    // ==============================
    // INSERT SEGMENTS
    // ==============================
    const segments = flightIds.map((flightId: string, index: number) => ({
      bookingId: booking.id,
      flightId,
      segmentOrder: index + 1
    }))

    await db.insert(bookingSegments).values(segments)

    // ==============================
    // INSERT PASSENGERS
    // ==============================
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

    // ==============================
    // RESPONSE
    // ==============================
    return NextResponse.json({
      success: true,
      pnr,
      bookingId: booking.id,
      totalAmount
    })

  } catch (error: any) {
    console.error("BOOKING ERROR:", error)

    return NextResponse.json(
      { error: error.message || "Booking failed" },
      { status: 500 }
    )
  }
}