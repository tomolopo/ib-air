import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { seats, seatLocks } from "@/db/schema"
import { eq, and, gt, lte } from "drizzle-orm"

import { logInfo, logError } from "@/lib/logger"
import { generateRequestId } from "@/lib/requestId"

export async function POST(req: NextRequest) {
  const requestId = generateRequestId()

  try {
    const body = await req.json()
    const { seatId, bookingId } = body

    // =========================
    // LOG REQUEST
    // =========================
    logInfo("SEAT_LOCK_REQUEST", {
      requestId,
      seatId,
      bookingId
    })

    if (!seatId || !bookingId) {
      return NextResponse.json(
        { error: "Missing seatId or bookingId", requestId },
        { status: 400 }
      )
    }

    // =========================
    // CLEAN EXPIRED LOCKS (NEW)
    // =========================
    await db
      .delete(seatLocks)
      .where(lte(seatLocks.expiresAt, new Date()))

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
        { error: "Seat not found", requestId },
        { status: 404 }
      )
    }

    if (!seat.isAvailable) {
      return NextResponse.json(
        { error: "Seat already booked", requestId },
        { status: 400 }
      )
    }

    // =========================
    // CHECK ACTIVE LOCK (your logic preserved)
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
        { error: "Seat already locked", requestId },
        { status: 400 }
      )
    }

    // =========================
    // CREATE LOCK
    // =========================
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000)

    await db.insert(seatLocks).values({
      seatId,
      bookingId,
      expiresAt
    })

    // =========================
    // LOG SUCCESS
    // =========================
    logInfo("SEAT_LOCK_SUCCESS", {
      requestId,
      seatId,
      bookingId,
      expiresAt
    })

    return NextResponse.json({
      success: true,
      expiresAt
    })

  } catch (error: any) {
    // =========================
    // HANDLE CONCURRENCY (NEW)
    // =========================
    if (error?.code === "23505") {
      logInfo("SEAT_LOCK_CONFLICT", {
        requestId,
        seatId: error?.detail
      })

      return NextResponse.json(
        { error: "Seat already locked", requestId },
        { status: 409 }
      )
    }

    logError("SEAT_LOCK_FAILED", {
      requestId,
      error: error.message
    })

    return NextResponse.json(
      {
        error: error.message || "Seat lock failed",
        requestId
      },
      { status: 500 }
    )
  }
}