import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { passengers, bookingPassengers } from "@/db/schema"
import { eq, inArray } from "drizzle-orm"
import { logInfo, logError } from "@/lib/logger"
import { generateRequestId } from "@/lib/requestId"

export async function GET(req: NextRequest) {
  const requestId = generateRequestId()
  const bookingId = req.nextUrl.searchParams.get("bookingId")

  if (!bookingId) {
    return NextResponse.json({ error: "Missing bookingId", requestId }, { status: 400 })
  }

  try {
    const links = await db
      .select()
      .from(bookingPassengers)
      .where(eq(bookingPassengers.bookingId, bookingId))

    if (links.length === 0) {
      return NextResponse.json({ error: "No passengers found for this booking", requestId }, { status: 404 })
    }

    const passengerIds = links.map(l => l.passengerId)
    const pax = await db
      .select()
      .from(passengers)
      .where(inArray(passengers.id, passengerIds))

    const result = pax.map(p => ({
      passengerId: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      seat: p.seat ?? null,
      checkedIn: p.checkedIn ?? false,
      checkedInAt: p.checkedInAt ?? null
    }))

    const allCheckedIn = result.every(p => p.checkedIn)

    logInfo("CHECKIN_STATUS_FETCHED", { requestId, bookingId })

    return NextResponse.json({
      success: true,
      bookingId,
      allCheckedIn,
      passengers: result
    })
  } catch (error: any) {
    logError("CHECKIN_STATUS_FAILED", { requestId, error: error.message })
    return NextResponse.json(
      { error: error.message || "Failed to fetch check-in status", requestId },
      { status: 500 }
    )
  }
}
