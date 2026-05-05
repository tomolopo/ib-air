import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { passengers, bookingPassengers } from "@/db/schema"
import { eq, inArray } from "drizzle-orm"

export async function GET(req: NextRequest) {
  const bookingId = req.nextUrl.searchParams.get("bookingId")

  if (!bookingId) {
    return NextResponse.json({ error: "Missing bookingId" }, { status: 400 })
  }

  const links = await db
    .select()
    .from(bookingPassengers)
    .where(eq(bookingPassengers.bookingId, bookingId))

  const paxIds = links.map(p => p.passengerId)

  if (paxIds.length === 0) {
    return NextResponse.json({ passengers: [] })
  }

  const pax = await db
    .select()
    .from(passengers)
    .where(inArray(passengers.id, paxIds))

  return NextResponse.json({ passengers: pax })
}