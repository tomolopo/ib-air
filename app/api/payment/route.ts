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

    if (!action) {
      return NextResponse.json(
        { error: "Missing action" },
        { status: 400 }
      )
    }

    // =========================
    // CREATE PAYMENT LINK
    // =========================
    if (action === "create_link") {
      if (!bookingId) {
        return NextResponse.json(
          { error: "Missing bookingId" },
          { status: 400 }
        )
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
      try {
        if (!bookingId) {
          return NextResponse.json(
            { error: "Missing bookingId" },
            { status: 400 }
          )
        }

        console.log("🔥 CONFIRM PAYMENT START:", bookingId)

        // 1. UPDATE BOOKING STATUS
        await db
          .update(bookings)
          .set({
            status: "CONFIRMED",
            paymentStatus: "COMPLETED"
          })
          .where(eq(bookings.id, bookingId))

        // 2. FETCH BOOKING
        const booking = (
          await db
            .select()
            .from(bookings)
            .where(eq(bookings.id, bookingId))
        )[0]

        console.log("📦 BOOKING:", booking)

        if (!booking || !booking.pnr) {
          throw new Error("Booking or PNR missing")
        }

        // 3. FETCH SEGMENT
        const segment = (
          await db
            .select()
            .from(bookingSegments)
            .where(eq(bookingSegments.bookingId, bookingId))
        )[0]

        console.log("🧩 SEGMENT:", segment)

        if (!segment) {
          throw new Error("No segment found")
        }

        // 4. FETCH FLIGHT + RELATED DATA
        const flight = (
          await db
            .select()
            .from(flights)
            .where(eq(flights.id, segment.flightId))
        )[0]

        if (!flight) throw new Error("Flight not found")

        const route = (
          await db
            .select()
            .from(routes)
            .where(eq(routes.id, flight.routeId))
        )[0]

        if (!route) throw new Error("Route not found")

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

        if (!origin || !destination) {
          throw new Error("Airport data missing")
        }

        const airline = (
          await db
            .select()
            .from(airlines)
            .where(eq(airlines.id, flight.airlineId))
        )[0]

        if (!airline) throw new Error("Airline not found")

        // 5. GENERATE PDF
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

        // 6. UPLOAD TO CLOUDINARY
        const upload: any = await uploadTicket(pdfBuffer, booking.pnr)

        console.log("☁️ CLOUDINARY RESPONSE:", upload)

        if (!upload || !upload.secure_url) {
          throw new Error("Cloudinary upload failed")
        }

        // 7. SAVE TICKET URL
        await db
          .update(bookings)
          .set({
            ticketUrl: upload.secure_url
          })
          .where(eq(bookings.id, bookingId))

        console.log("✅ TICKET SAVED TO DB")

        return NextResponse.json({
          success: true,
          ticketUrl: upload.secure_url
        })

      } catch (err: any) {
        console.error("🔥 PAYMENT PROCESS ERROR:", err)

        return NextResponse.json(
          { error: err.message || "Payment failed" },
          { status: 500 }
        )
      }
    }

    return NextResponse.json(
      { error: "Invalid action" },
      { status: 400 }
    )

  } catch (error: any) {
    console.error("🔥 GLOBAL PAYMENT ERROR:", error)

    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    )
  }
}