import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { seats, seatLocks } from "@/db/schema"
import { eq, gt, lte, inArray } from "drizzle-orm"

export async function GET(req: NextRequest) {
  try {
    const flightId = req.nextUrl.searchParams.get("flightId")

    if (!flightId) {
      return NextResponse.json(
        { error: "Missing flightId" },
        { status: 400 }
      )
    }

    // =========================
    // CLEAN EXPIRED LOCKS
    // =========================
    await db
      .delete(seatLocks)
      .where(lte(seatLocks.expiresAt, new Date()))

    // =========================
    // GET SEATS FOR FLIGHT
    // =========================
    const allSeats = await db
      .select()
      .from(seats)
      .where(eq(seats.flightId, flightId))

    const seatIds = allSeats.map(s => s.id)

    // =========================
    // GET ACTIVE LOCKS FOR THIS FLIGHT ONLY
    // =========================
    const activeLocks = await db
      .select()
      .from(seatLocks)
      .where(
        inArray(seatLocks.seatId, seatIds) // ✅ critical fix
      )

    const lockedSeatIds = activeLocks.map(l => l.seatId)

    // =========================
    // MAP STATUS
    // =========================
    const result = allSeats.map(seat => ({
      id: seat.id,
      seatNumber: seat.seatNumber,
      status: lockedSeatIds.includes(seat.id)
        ? "locked"
        : seat.isAvailable
        ? "available"
        : "booked"
    }))

    return NextResponse.json({ seats: result })

  } catch (error: any) {
    console.error("GET SEATS ERROR:", error)

    return NextResponse.json(
      { error: error.message || "Failed to fetch seats" },
      { status: 500 }
    )
  }
}