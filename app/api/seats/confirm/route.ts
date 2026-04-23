import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { passengers, seats } from "@/db/schema"
import { eq } from "drizzle-orm"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const { passengerId, seatId } = body

    if (!passengerId || !seatId) {
      return NextResponse.json(
        { error: "Missing passengerId or seatId" },
        { status: 400 }
      )
    }

    // =========================
    // GET SEAT (SAFE)
    // =========================
    const seat = (
      await db
        .select()
        .from(seats)
        .where(eq(seats.id, seatId))
    )[0]

    if (!seat) {
      return NextResponse.json(
        { error: "Seat not found" },
        { status: 404 }
      )
    }

    // =========================
    // ASSIGN SEAT TO PASSENGER
    // =========================
    await db
      .update(passengers)
      .set({
        seat: seat.seatNumber // ✅ correct source
      })
      .where(eq(passengers.id, passengerId))

    // =========================
    // MARK SEAT UNAVAILABLE
    // =========================
    await db
      .update(seats)
      .set({ isAvailable: false })
      .where(eq(seats.id, seatId)) // ✅ FIXED (no more seatNumber issue)

    return NextResponse.json({
      success: true,
      seatAssigned: seat.seatNumber
    })

  } catch (error: any) {
    console.error("SEAT CONFIRM ERROR:", error)

    return NextResponse.json(
      { error: error.message || "Seat confirmation failed" },
      { status: 500 }
    )
  }
}