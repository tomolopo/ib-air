import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import {
  bookings,
  bookingSegments,
  flights,
  routes,
  airports,
  airlines
} from "@/db/schema"
import { eq } from "drizzle-orm"

import { generateTicketPDF } from "@/lib/generateTicket"
import { uploadTicket } from "@/lib/uploadTicket"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, bookingId } = body

    // =========================
    // CREATE PAYMENT LINK
    // =========================
    if (action === "create_link") {
      if (!bookingId) {
        return NextResponse.json({ error: "Missing bookingId" }, { status: 400 })
      }

      const paymentUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/pay?bookingId=${bookingId}`

      return NextResponse.json({
        success: true,
        paymentUrl
      })
    }

    // =========================
    // CONFIRM PAYMENT
    // =========================
    if (action === "confirm_payment") {
      if (!bookingId) {
        return NextResponse.json({ error: "Missing bookingId" }, { status: 400 })
      }

      console.log("🔥 PAYMENT START:", bookingId)

      // UPDATE STATUS
      await db
        .update(bookings)
        .set({
          status: "CONFIRMED",
          paymentStatus: "COMPLETED"
        })
        .where(eq(bookings.id, bookingId))

      // FETCH BOOKING
      const booking = (
        await db.select().from(bookings).where(eq(bookings.id, bookingId))
      )[0]

      if (!booking || !booking.pnr) {
        throw new Error("Booking or PNR missing")
      }

      // SEGMENT
      const segment = (
        await db
          .select()
          .from(bookingSegments)
          .where(eq(bookingSegments.bookingId, bookingId))
      )[0]

      if (!segment) throw new Error("No segment")

      const flight = (
        await db
          .select()
          .from(flights)
          .where(eq(flights.id, segment.flightId))
      )[0]

      const route = (
        await db
          .select()
          .from(routes)
          .where(eq(routes.id, flight.routeId))
      )[0]

      const origin = (
        await db
          .select()
          .from(airports)
          .where(eq(airports.id, route.originId))
      )[0]

      const destination = (
        await db
          .select()
          .from(airports)
          .where(eq(airports.id, route.destinationId))
      )[0]

      const airline = (
        await db
          .select()
          .from(airlines)
          .where(eq(airlines.id, flight.airlineId))
      )[0]

      // GENERATE PDF
      const pdfBuffer = await generateTicketPDF({
        pnr: booking.pnr,
        airline: airline.name,
        from: `${origin.city} (${origin.iataCode})`,
        to: `${destination.city} (${destination.iataCode})`,
        flightNumber: flight.flightNumber,
        departure: flight.departureTime,
        arrival: flight.arrivalTime,
        seat: booking.seat
      })

      console.log("📄 PDF GENERATED")

      // UPLOAD
      const upload: any = await uploadTicket(pdfBuffer, booking.pnr)

      if (!upload?.secure_url) {
        throw new Error("Upload failed")
      }

      console.log("☁️ UPLOADED:", upload.secure_url)

      // SAVE URL
      await db
        .update(bookings)
        .set({
          ticketUrl: upload.secure_url
        })
        .where(eq(bookings.id, bookingId))

      console.log("✅ TICKET SAVED")

      return NextResponse.json({
        success: true,
        ticketUrl: upload.secure_url
      })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })

  } catch (error: any) {
    console.error("🔥 PAYMENT ERROR:", error)

    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    )
  }
}