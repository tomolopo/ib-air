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
import { logInfo, logError } from "@/lib/logger"
import { generateRequestId } from "@/lib/requestId"

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = generateRequestId()

  try {
    const { id: bookingId } = await context.params
    const type = req.nextUrl.searchParams.get("type")

    if (!bookingId) {
      return NextResponse.json({ error: "Missing booking ID", requestId }, { status: 400 })
    }

    // =========================
    // GET BOOKING
    // =========================
    const booking = await db.query.bookings.findFirst({
      where: (b, { eq }) => eq(b.id, bookingId)
    })

    if (!booking) {
      return NextResponse.json({ error: "Booking not found", requestId }, { status: 404 })
    }

    if (type === "ticket" && booking.ticketUrl) {
      return NextResponse.json({ success: true, ticketUrl: booking.ticketUrl })
    }

    if (type === "ticket" && booking.status !== "PAID") {
      return NextResponse.json({ error: "Booking not paid yet", requestId }, { status: 400 })
    }

    // =========================
    // PARALLEL: segment + passengers
    // =========================
    const [segment, passengerLinks] = await Promise.all([
      db.query.bookingSegments.findFirst({
        where: (s, { eq }) => eq(s.bookingId, bookingId)
      }),
      db.select().from(bookingPassengers).where(eq(bookingPassengers.bookingId, bookingId))
    ])

    if (!segment) {
      return NextResponse.json({ error: "No segment found", requestId }, { status: 404 })
    }

    // =========================
    // FLIGHT
    // =========================
    const flight = await db.query.flights.findFirst({
      where: (f, { eq }) => eq(f.id, segment.flightId)
    })

    if (!flight) {
      return NextResponse.json({ error: "Flight not found", requestId }, { status: 404 })
    }

    // =========================
    // PARALLEL: route + airline + passengers
    // =========================
    const passengerIds = passengerLinks.map(l => l.passengerId)

    const [route, airline, pax] = await Promise.all([
      db.query.routes.findFirst({ where: (r, { eq }) => eq(r.id, flight.routeId) }),
      db.query.airlines.findFirst({ where: (a, { eq }) => eq(a.id, flight.airlineId) }),
      passengerIds.length > 0
        ? db.select().from(passengers).where(inArray(passengers.id, passengerIds))
        : Promise.resolve([])
    ])

    if (!route) {
      return NextResponse.json({ error: "Route not found", requestId }, { status: 404 })
    }

    if (!airline) {
      return NextResponse.json({ error: "Airline not found", requestId }, { status: 404 })
    }

    // =========================
    // PARALLEL: airports
    // =========================
    const [origin, destination] = await Promise.all([
      db.query.airports.findFirst({ where: (a, { eq }) => eq(a.id, route.originId) }),
      db.query.airports.findFirst({ where: (a, { eq }) => eq(a.id, route.destinationId) })
    ])

    if (!origin || !destination) {
      return NextResponse.json({ error: "Airport data missing", requestId }, { status: 404 })
    }

    // =========================
    // PLAIN BOOKING LOOKUP
    // =========================
    if (!type) {
      return NextResponse.json({
        success: true,
        booking,
        flight: {
          flightNumber: flight.flightNumber,
          departureTime: flight.departureTime,
          arrivalTime: flight.arrivalTime
        },
        from: `${origin.city} (${origin.iataCode})`,
        to: `${destination.city} (${destination.iataCode})`,
        airline: airline.name,
        passengers: pax
      })
    }

    // =========================
    // GENERATE TICKET
    // =========================
    if (type === "ticket") {
      if (!booking.pnr) {
        throw new Error("PNR is missing")
      }

      logInfo("TICKET_GENERATION_START", { requestId, bookingId, pnr: booking.pnr })

      const doc = new PDFDocument({ size: "A4", margin: 50 })
      doc.font("Helvetica")

      const chunks: Uint8Array[] = []
      doc.on("data", chunk => chunks.push(chunk))

      doc.fontSize(20).text(`${airline.name} BOARDING PASS`, { align: "center" })
      doc.moveDown()
      doc.fontSize(12).text(`PNR: ${booking.pnr}`)
      doc.moveDown()
      doc.fontSize(14).text("Flight Details", { underline: true })
      doc.fontSize(12)
      doc.text(`From: ${origin.city} (${origin.iataCode})`)
      doc.text(`To: ${destination.city} (${destination.iataCode})`)
      doc.text(`Flight: ${flight.flightNumber}`)
      doc.text(`Departure: ${new Date(flight.departureTime).toLocaleString()}`)
      doc.text(`Arrival: ${new Date(flight.arrivalTime).toLocaleString()}`)

      doc.moveDown()
      doc.fontSize(14).text("Passenger Details", { underline: true })

      if (pax.length === 0) {
        doc.text("No passengers found")
      } else {
        pax.forEach((p, i) => {
          doc.moveDown(0.5)
          doc.fontSize(12).text(`${i + 1}. ${p.firstName} ${p.lastName}`)
          doc.text(`Seat: ${p.seat || "Not assigned"}`)
        })
      }

      doc.moveDown()
      doc.text(`Status: ${booking.status}`)
      doc.moveDown()

      try {
        const qrData = JSON.stringify({ pnr: booking.pnr, flight: flight.flightNumber })
        const qrImage = await QRCode.toDataURL(qrData)
        const qrBuffer = Buffer.from(qrImage.replace(/^data:image\/png;base64,/, ""), "base64")
        doc.image(qrBuffer, { fit: [150, 150], align: "center" })
      } catch (e) {
        logError("QR_GENERATION_FAILED", { requestId, error: (e as Error).message })
      }

      doc.end()

      const pdfBuffer = await new Promise<Buffer>((resolve) => {
        doc.on("end", () => resolve(Buffer.concat(chunks)))
      })

      const upload: any = await uploadTicket(pdfBuffer, booking.pnr)

      if (!upload?.secure_url) {
        throw new Error("Upload failed")
      }

      await db
        .update(bookings)
        .set({ ticketUrl: upload.secure_url, status: "TICKETED" })
        .where(eq(bookings.id, bookingId))

      logInfo("TICKET_GENERATION_SUCCESS", { requestId, bookingId, pnr: booking.pnr })

      return NextResponse.json({ success: true, ticketUrl: upload.secure_url })
    }

    return NextResponse.json({ error: "Invalid type", requestId }, { status: 400 })

  } catch (error: any) {
    logError("BOOKING_GET_FAILED", { requestId, error: error.message })

    return NextResponse.json(
      { error: error.message || "Internal Server Error", requestId },
      { status: 500 }
    )
  }
}