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

// =========================
// GET → TICKET PDF
// =========================
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get("type")

  const bookingId = params.id

  // 🔥 GET BOOKING
  const booking = await db.query.bookings.findFirst({
    where: (b: any, { eq }: any) => eq(b.id, bookingId)
  })

  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 })
  }

  // 🔥 GET FIRST SEGMENT (for now)
  const segment = await db.query.bookingSegments.findFirst({
    where: (s: any, { eq }: any) => eq(s.bookingId, bookingId)
  })

  if (!segment) {
    return NextResponse.json(
      { error: "No flight segment found" },
      { status: 404 }
    )
  }

  // 🔥 GET FLIGHT
  const flight = await db
    .select()
    .from(flights)
    .where(eq(flights.id, segment.flightId))
    .then(res => res[0])

  // 🔥 GET ROUTE
  const route = await db
    .select()
    .from(routes)
    .where(eq(routes.id, flight.routeId))
    .then(res => res[0])

  // 🔥 GET AIRPORTS
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

  // 🔥 GET AIRLINE
  const airline = await db
    .select()
    .from(airlines)
    .where(eq(airlines.id, flight.airlineId))
    .then(res => res[0])

  // =========================
  // GENERATE PDF
  // =========================
  if (type === "ticket") {
    const doc = new PDFDocument({ size: "A4", margin: 50 })
    const chunks: Uint8Array[] = []

    doc.on("data", (chunk: Uint8Array) => chunks.push(chunk))

    // HEADER
    doc.fontSize(20).text(`✈️ ${airline.name} BOARDING PASS`, {
      align: "center"
    })

    doc.moveDown()

    // PASSENGER
    doc.fontSize(12)
    doc.text(`PNR: ${booking.pnr}`)

    doc.moveDown()

    // ROUTE
    doc.fontSize(14).text("Flight Details", { underline: true })

    doc.fontSize(12)
    doc.text(`From: ${origin.city} (${origin.iataCode})`)
    doc.text(`To: ${destination.city} (${destination.iataCode})`)
    doc.text(`Flight: ${flight.flightNumber}`)

    doc.text(`Departure: ${new Date(flight.departureTime).toLocaleString()}`)
    doc.text(`Arrival: ${new Date(flight.arrivalTime).toLocaleString()}`)

    doc.moveDown()

    // SEAT
    doc.text(`Seat: ${booking.seat || "Not assigned"}`)
    doc.text(`Status: ${booking.status}`)

    doc.moveDown()

    // QR
    const qrData = JSON.stringify({
      pnr: booking.pnr,
      flight: flight.flightNumber,
      from: origin.iataCode,
      to: destination.iataCode
    })

    const qrImage = await QRCode.toDataURL(qrData)
    const base64Data = qrImage.replace(/^data:image\/png;base64,/, "")
    const qrBuffer = Buffer.from(base64Data, "base64")

    doc.image(qrBuffer, { fit: [150, 150], align: "center" })

    doc.moveDown()

    doc.text("Thank you for flying ✈️", { align: "center" })

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
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get("type")

  const bookingId = params.id
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