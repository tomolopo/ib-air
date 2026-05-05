import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { pnr } = body

    if (!pnr) {
      return NextResponse.json(
        { error: "PNR is required" },
        { status: 400 }
      )
    }

    // ✅ SAFE QUERY (FIXED)
    const booking = await db.query.bookings.findFirst({
      where: (b, { eq }) => eq(b.pnr, pnr)
    })

    if (!booking) {
      return NextResponse.json(
        { error: "Booking not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      booking
    })

  } catch (error: any) {
    console.error("REFERENCE ERROR:", error)

    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    )
  }
}