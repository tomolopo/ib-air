import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { seats, seatLocks } from "@/db/schema"
import { eq, and, gt } from "drizzle-orm"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const { seatId, bookingId } = body

    if (!seatId || !bookingId) {
      return NextResponse.json(
        { error: "Missing seatId or bookingId" },
        { status: 400 }
      )
    }

    // =========================
    // CHECK SEAT EXISTS + AVAILABLE
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

    if (!seat.isAvailable) {
      return NextResponse.json(
        { error: "Seat already booked" },
        { status: 400 }
      )
    }

    // =========================
    // CHECK ACTIVE LOCK
    // =========================
    const existingLock = await db
      .select()
      .from(seatLocks)
      .where(
        and(
          eq(seatLocks.seatId, seatId),
          gt(seatLocks.expiresAt, new Date())
        )
      )

    if (existingLock.length > 0) {
      return NextResponse.json(
        { error: "Seat already locked" },
        { status: 400 }
      )
    }

    // =========================
    // CREATE LOCK (5 MIN)
    // =========================
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000)

    await db.insert(seatLocks).values({
      seatId,
      bookingId,
      expiresAt
    })

    return NextResponse.json({
      success: true,
      expiresAt
    })

  } catch (error: any) {
    console.error("SEAT LOCK ERROR:", error)

    return NextResponse.json(
      { error: error.message || "Seat lock failed" },
      { status: 500 }
    )
  }
}