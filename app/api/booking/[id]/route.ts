import { NextResponse } from "next/server"
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
  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get("type")

    const bookingId = params.id

    // 🔍 DEBUG (VERY IMPORTANT)
    console.log("PARAMS:", params)
    console.log("BOOKING ID:", bookingId)

    if (!bookingId) {
      return NextResponse.json(
        { error: "Missing booking ID" },
        { status: 400 }
      )
    }

    // =========================
    // GET BOOKING
    // =========================
    const bookingRes = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId))

    const booking = bookingRes[0]

    console.log("BOOKING RESULT:", booking)

    if (!booking) {
      return NextResponse.json(
        { error: "Booking not found" },
        { status: 404 }
      )
    }

    // =========================
    // GET SEGMENT
    // =========================
    const segmentRes = await db
      .select()
      .from(bookingSegments)
      .where(eq(bookingSegments.bookingId, bookingId))

    const segment = segmentRes[0]

    if (!segment) {
      return NextResponse.json(
        { error: "No segment found for booking" },
        { status: 404 }
      )
    }

    // =========================
    // GET FLIGHT
    // =========================
    const flightRes = await db
      .select()
      .from(flights)
      .where(eq(flights.id, segment.flightId))

    const flight = flightRes[0]

    if (!flight) {
      return NextResponse.json(
        { error: "Flight not found" },
        { status: 404 }
      )
    }

    // =========================
    // GET ROUTE
    // =========================
    const routeRes = await db
      .select()
      .from(routes)
      .where(eq(routes.id, flight.routeId))

    const route = routeRes[0]

    if (!route) {
      return NextResponse.json(
        { error: "Route not found" },
        { status: 404 }
      )
    }

    // =========================
    // GET AIRPORTS
    // =========================
    const originRes = await db
      .select()
      .from(airports)
      .where(eq(airports.id, route.originId))

    const destinationRes = await db
      .select()
      .from(airports)
      .where(eq(airports.id, route.destinationId))

    const origin = originRes[0]
    const destination = destinationRes[0]

    if (!origin || !destination) {
      return NextResponse.json(
        { error: "Airport data missing" },
        { status: 404 }
      )
    }

    // =========================
    // GET AIRLINE
    // =========================
    const airlineRes = await db
      .select()
      .from(airlines)
      .where(eq(airlines.id, flight.airlineId))

    const airline = airlineRes[0]

    if (!airline) {
      return NextResponse.json(
        { error: "Airline not found" },
        { status: 404 }
      )
    }

    // =========================
    // GENERATE PDF
    // =========================
    if (type === "ticket") {
      const doc = new PDFDocument({ size: "A4", margin: 50 })
      const chunks: Uint8Array[] = []

      doc.on("data", (chunk) => chunks.push(chunk))

      // HEADER
      doc.fontSize(20).text(`✈️ ${airline.name} BOARDING PASS`, {
        align: "center"
      })

      doc.moveDown()

      // BOOKING
      doc.fontSize(12)
      doc.text(`PNR: ${booking.pnr}`)

      doc.moveDown()

      // FLIGHT DETAILS
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

      // QR CODE
      let qrBuffer: Buffer | null = null

      try {
        const qrData = JSON.stringify({
          pnr: booking.pnr,
          flight: flight.flightNumber
        })

        const qrImage = await QRCode.toDataURL(qrData)
        const base64Data = qrImage.replace(/^data:image\/png;base64,/, "")
        qrBuffer = Buffer.from(base64Data, "base64")
      } catch (err) {
        console.log("QR generation failed:", err)
      }

      if (qrBuffer) {
        doc.image(qrBuffer, {
          fit: [150, 150],
          align: "center"
        })
      }

      doc.moveDown()
      doc.text("Thank you for flying ✈️", { align: "center" })

      doc.end()

      const pdfBuffer = await new Promise<Buffer>((resolve) => {
        doc.on("end", () => resolve(Buffer.concat(chunks)))
      })

      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename=ticket-${booking.pnr}.pdf`
        }
      })
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 })

  } catch (error: any) {
    console.error("TICKET ERROR:", error)

    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    )
  }
}