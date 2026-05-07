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

export async function createTicket(bookingId: string): Promise<string> {
  const booking = await db.query.bookings.findFirst({
    where: (b, { eq }) => eq(b.id, bookingId)
  })

  if (!booking) throw new Error("Booking not found")
  if (!booking.pnr) throw new Error("PNR is missing")
  if (booking.ticketUrl) return booking.ticketUrl

  if (booking.status !== "PAID" && booking.status !== "TICKETED") {
    throw new Error("Booking not paid yet")
  }

  const [segment, passengerLinks] = await Promise.all([
    db.query.bookingSegments.findFirst({
      where: (s, { eq }) => eq(s.bookingId, bookingId)
    }),
    db.select().from(bookingPassengers).where(eq(bookingPassengers.bookingId, bookingId))
  ])

  if (!segment) throw new Error("No segment found")

  const flight = await db.query.flights.findFirst({
    where: (f, { eq }) => eq(f.id, segment.flightId)
  })

  if (!flight) throw new Error("Flight not found")

  const passengerIds = passengerLinks.map(l => l.passengerId)

  const [route, airline, pax] = await Promise.all([
    db.query.routes.findFirst({ where: (r, { eq }) => eq(r.id, flight.routeId) }),
    db.query.airlines.findFirst({ where: (a, { eq }) => eq(a.id, flight.airlineId) }),
    passengerIds.length > 0
      ? db.select().from(passengers).where(inArray(passengers.id, passengerIds))
      : Promise.resolve([])
  ])

  if (!route) throw new Error("Route not found")
  if (!airline) throw new Error("Airline not found")

  const [origin, destination] = await Promise.all([
    db.query.airports.findFirst({ where: (a, { eq }) => eq(a.id, route.originId) }),
    db.query.airports.findFirst({ where: (a, { eq }) => eq(a.id, route.destinationId) })
  ])

  if (!origin || !destination) throw new Error("Airport data missing")

  logInfo("TICKET_GENERATION_START", { bookingId, pnr: booking.pnr })

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
    logError("QR_GENERATION_FAILED", { bookingId, error: (e as Error).message })
  }

  doc.end()

  const pdfBuffer = await new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)))
  })

  const upload: any = await uploadTicket(pdfBuffer, booking.pnr)

  if (!upload?.secure_url) throw new Error("Upload failed")

  await db
    .update(bookings)
    .set({ ticketUrl: upload.secure_url, status: "TICKETED" })
    .where(eq(bookings.id, bookingId))

  logInfo("TICKET_GENERATION_SUCCESS", { bookingId, pnr: booking.pnr, ticketUrl: upload.secure_url })

  return upload.secure_url
}
