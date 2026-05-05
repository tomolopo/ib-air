import { NextRequest, NextResponse } from "next/server"
import PDFDocument from "pdfkit"
import QRCode from "qrcode"
import { db } from "@/db"
import {
  bookings,
  bookingSegments,
  flights,
  routes,
  airports,
  airlines,
  passengers,
  bookingPassengers
} from "@/db/schema"
import { eq, inArray } from "drizzle-orm"

import { uploadTicket } from "@/lib/uploadTicket"

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: bookingId } = await context.params

    const { searchParams } = new URL(req.url)
    const type = searchParams.get("type")

    if (!bookingId) {
      return NextResponse.json(
        { error: "Missing booking ID" },
        { status: 400 }
      )
    }

    // =========================
    // GET BOOKING
    // =========================
    const booking = await db.query.bookings.findFirst({
      where: (b, { eq }) => eq(b.id, bookingId)
    })

    if (!booking) {
      return NextResponse.json(
        { error: "Booking not found" },
        { status: 404 }
      )
    }

    // =========================
    // PREVENT DUPLICATE
    // =========================
    if (type === "ticket" && booking.ticketUrl) {
      return NextResponse.json({
        success: true,
        ticketUrl: booking.ticketUrl
      })
    }

    // =========================
    // ENSURE PAYMENT
    // =========================
    if (type === "ticket" && booking.status !== "PAID") {
      return NextResponse.json(
        { error: "Booking not paid yet" },
        { status: 400 }
      )
    }

    // =========================
    // SEGMENT
    // =========================
    const segment = await db.query.bookingSegments.findFirst({
      where: (s, { eq }) => eq(s.bookingId, bookingId)
    })

    if (!segment) {
      return NextResponse.json(
        { error: "No segment found" },
        { status: 404 }
      )
    }

    // =========================
    // FLIGHT
    // =========================
    const flight = await db.query.flights.findFirst({
      where: (f, { eq }) => eq(f.id, segment.flightId)
    })

    if (!flight) {
      return NextResponse.json(
        { error: "Flight not found" },
        { status: 404 }
      )
    }

    // =========================
    // ROUTE
    // =========================
    const route = await db.query.routes.findFirst({
      where: (r, { eq }) => eq(r.id, flight.routeId)
    })

    if (!route) {
      return NextResponse.json(
        { error: "Route not found" },
        { status: 404 }
      )
    }

    // =========================
    // AIRPORTS
    // =========================
    const origin = await db.query.airports.findFirst({
      where: (a, { eq }) => eq(a.id, route.originId)
    })

    const destination = await db.query.airports.findFirst({
      where: (a, { eq }) => eq(a.id, route.destinationId)
    })

    if (!origin || !destination) {
      return NextResponse.json(
        { error: "Airport data missing" },
        { status: 404 }
      )
    }

    // =========================
    // AIRLINE
    // =========================
    const airline = await db.query.airlines.findFirst({
      where: (a, { eq }) => eq(a.id, flight.airlineId)
    })

    if (!airline) {
      return NextResponse.json(
        { error: "Airline not found" },
        { status: 404 }
      )
    }

    // =========================
    // 🔥 MULTI-PASSENGER FETCH
    // =========================
    const links = await db
      .select()
      .from(bookingPassengers)
      .where(eq(bookingPassengers.bookingId, bookingId))

    const passengerIds = links.map(l => l.passengerId)

    let pax: any[] = []

    if (passengerIds.length > 0) {
      pax = await db
        .select()
        .from(passengers)
        .where(inArray(passengers.id, passengerIds))
    }

    // =========================
    // GENERATE TICKET
    // =========================
    if (type === "ticket") {
      if (!booking.pnr) {
        throw new Error("PNR is missing")
      }

      const doc = new PDFDocument({
        size: "A4",
        margin: 50
      })

      doc.font("Helvetica")

      const chunks: Uint8Array[] = []
      doc.on("data", chunk => chunks.push(chunk))

      // HEADER
      doc.fontSize(20).text(`✈️ ${airline.name} BOARDING PASS`, {
        align: "center"
      })

      doc.moveDown()
      doc.fontSize(12).text(`PNR: ${booking.pnr}`)

      doc.moveDown()
      doc.fontSize(14).text("Flight Details", { underline: true })

      doc.fontSize(12)
      doc.text(`From: ${origin.city} (${origin.iataCode})`)
      doc.text(`To: ${destination.city} (${destination.iataCode})`)
      doc.text(`Flight: ${flight.flightNumber}`)
      doc.text(
        `Departure: ${new Date(flight.departureTime).toLocaleString()}`
      )
      doc.text(
        `Arrival: ${new Date(flight.arrivalTime).toLocaleString()}`
      )

      // =========================
      // 🔥 PASSENGER SECTION
      // =========================
      doc.moveDown()
      doc.fontSize(14).text("Passenger Details", { underline: true })

      if (pax.length === 0) {
        doc.text("No passengers found")
      } else {
        pax.forEach((p, i) => {
          doc.moveDown(0.5)

          doc.fontSize(12).text(
            `${i + 1}. ${p.firstName} ${p.lastName}`
          )

          doc.text(`Seat: ${p.seat || "Not assigned"}`)
        })
      }

      doc.moveDown()
      doc.text(`Status: ${booking.status}`)

      doc.moveDown()

      // QR
      try {
        const qrData = JSON.stringify({
          pnr: booking.pnr,
          flight: flight.flightNumber
        })

        const qrImage = await QRCode.toDataURL(qrData)
        const base64 = qrImage.replace(/^data:image\/png;base64,/, "")
        const qrBuffer = Buffer.from(base64, "base64")

        doc.image(qrBuffer, {
          fit: [150, 150],
          align: "center"
        })
      } catch (e) {
        console.log("QR error:", e)
      }

      doc.end()

      const pdfBuffer = await new Promise<Buffer>((resolve) => {
        doc.on("end", () => resolve(Buffer.concat(chunks)))
      })

      // =========================
      // UPLOAD
      // =========================
      const upload: any = await uploadTicket(pdfBuffer, booking.pnr)

      if (!upload?.secure_url) {
        throw new Error("Upload failed")
      }

      // =========================
      // SAVE
      // =========================
      await db
        .update(bookings)
        .set({
          ticketUrl: upload.secure_url,
          status: "TICKETED"
        })
        .where(eq(bookings.id, bookingId))

      return NextResponse.json({
        success: true,
        ticketUrl: upload.secure_url
      })
    }

    return NextResponse.json(
      { error: "Invalid type" },
      { status: 400 }
    )

  } catch (error: any) {
    console.error("TICKET ERROR:", error)

    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    )
  }
}