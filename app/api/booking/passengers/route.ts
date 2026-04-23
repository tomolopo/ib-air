import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { passengers, bookingPassengers } from "@/db/schema"
import { eq } from "drizzle-orm"

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

  const pax = await db.select().from(passengers)

  const result = pax.filter(p => paxIds.includes(p.id))

  return NextResponse.json({ passengers: result })
}