import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({
    message: "Booking endpoint coming soon"
  })
}