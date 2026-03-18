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
  airlines
} from "@/db/schema"
import { eq } from "drizzle-orm"

type Context = {
  params: {
    id: string
  }
}

// =========================
// GET → DOWNLOAD TICKET PDF
// =========================
export async function GET(req: NextRequest, context: Context) {
  const bookingId = context.params.id

  const { searchParams } = new URL(req.url)
  const type = searchParams.get("type")

  // =========================
  // FETCH DATA
  // =========================
  const booking = await db.query.bookings.findFirst({
    where: (b: any, { eq }: any) => eq(b.id, bookingId)
  })

  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 })
  }

  const segment = await db.query.bookingSegments.findFirst({
    where: (s: any, { eq }: any) => eq(s.bookingId, bookingId)
  })

  if (!segment) {
    return NextResponse.json(
      { error: "No flight segment found" },
      { status: 404 }
    )
  }

  const flight = await db
    .select()
    .from(flights)
    .where(eq(flights.id, segment.flightId))
    .then(res => res[0])

  if (!flight) {
    return NextResponse.json({ error: "Flight not found" }, { status: 404 })
  }

  const route = await db
    .select()
    .from(routes)
    .where(eq(routes.id, flight.routeId))
    .then(res => res[0])

  const origin = await db
    .select()
    .from(airports)
    .where(eq(airports.id, route.originId))
    .then(res => res[0])

  const destination = await db
    .select()
    .from(airports)
    .where(eq(airports.id, route.destinationId))
    .then(res => res[0])

  const airline = await db
    .select()
    .from(airlines)
    .where(eq(airlines.id, flight.airlineId))
    .then(res => res[0])

  // =========================
  // GENERATE PDF
  // =========================
  if (type === "ticket") {
    const doc = new PDFDocument({ size: "A4", margin: 40 })
    const chunks: Uint8Array[] = []

    doc.on("data", (chunk: Uint8Array) => chunks.push(chunk))

    // HEADER
    doc
      .fontSize(22)
      .fillColor("#1a73e8")
      .text(`✈️ ${airline.name}`, { align: "center" })

    doc.moveDown()

    doc
      .fontSize(16)
      .fillColor("#000")
      .text("BOARDING PASS", { align: "center" })

    doc.moveDown(2)

    // PASSENGER + PNR
    doc.fontSize(12)
    doc.text(`PNR: ${booking.pnr}`)
    doc.text(`Passenger: ${booking.passengerName || "Guest"}`)

    doc.moveDown()

    // ROUTE BOX
    doc
      .rect(40, doc.y, 500, 80)
      .stroke()

    doc.moveDown()

    doc.fontSize(14).text(
      `${origin.city} (${origin.iataCode}) → ${destination.city} (${destination.iataCode})`
    )

    doc.moveDown(0.5)

    doc.fontSize(12)
    doc.text(`Flight: ${flight.flightNumber}`)
    doc.text(
      `Departure: ${new Date(flight.departureTime).toLocaleString()}`
    )
    doc.text(`Arrival: ${new Date(flight.arrivalTime).toLocaleString()}`)

    doc.moveDown()

    // SEAT + STATUS
    doc.fontSize(12)
    doc.text(`Seat: ${booking.seat || "Not assigned"}`)
    doc.text(`Status: ${booking.status}`)

    doc.moveDown(2)

    // QR CODE
    const qrData = JSON.stringify({
      pnr: booking.pnr,
      flight: flight.flightNumber,
      from: origin.iataCode,
      to: destination.iataCode
    })

    const qrImage = await QRCode.toDataURL(qrData)
    const base64Data = qrImage.replace(/^data:image\/png;base64,/, "")
    const qrBuffer = Buffer.from(base64Data, "base64")

    doc.image(qrBuffer, {
      fit: [120, 120],
      align: "center"
    })

    doc.moveDown()

    doc
      .fontSize(10)
      .fillColor("gray")
      .text("Scan at boarding gate", { align: "center" })

    doc.end()

    const pdfBuffer = Buffer.concat(chunks)

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=ticket-${booking.pnr}.pdf`
      }
    })
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 })
}

// =========================
// POST → SAVE SEAT
// =========================
export async function POST(req: NextRequest, context: Context) {
  const bookingId = context.params.id

  const { searchParams } = new URL(req.url)
  const type = searchParams.get("type")

  const body = await req.json()

  if (type === "seat") {
    const { seat } = body

    await db
      .update(bookings)
      .set({ seat })
      .where(eq(bookings.id, bookingId))

    return NextResponse.json({
      success: true,
      seat
    })
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 })
}