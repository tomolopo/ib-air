import PDFDocument from "pdfkit"
import QRCode from "qrcode"
import { db } from "@/db"
import {
  bookings,
  bookingPassengers,
  passengers
} from "@/db/schema"
import { eq, inArray } from "drizzle-orm"
import { uploadTicket } from "@/lib/uploadTicket"
import { logInfo, logError } from "@/lib/logger"

// ──────────────────────────────────────────────────────────
// Boarding pass design system
// ──────────────────────────────────────────────────────────
const BRAND_PRIMARY = "#6366f1"
const TEXT_DARK = "#0f172a"
const TEXT_MUTED = "#64748b"
const TEXT_LABEL = "#94a3b8"
const SOFT_BG = "#f8fafc"
const DIVIDER = "#cbd5e1"

const BUSINESS_ROWS = new Set([1, 2, 3, 4, 5])

function getSeatClass(seat: string | null | undefined): string {
  if (!seat) return "ECONOMY"
  const rowNum = parseInt(seat.replace(/[^0-9]/g, ""))
  if (isNaN(rowNum)) return "ECONOMY"
  return BUSINESS_ROWS.has(rowNum) ? "BUSINESS" : "ECONOMY"
}

function deterministicGate(seedStr: string): string {
  let h = 0
  for (let i = 0; i < seedStr.length; i++) h = ((h * 31) + seedStr.charCodeAt(i)) & 0x7fffffff
  const letter = "ABCD"[h % 4]
  const num = (h % 25) + 1
  return `${letter}${num}`
}

function formatTime(d: Date): string {
  const hh = d.getUTCHours().toString().padStart(2, "0")
  const mm = d.getUTCMinutes().toString().padStart(2, "0")
  return `${hh}:${mm}`
}

function formatDateLong(d: Date): string {
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
  return `${d.getUTCDate().toString().padStart(2, "0")} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

// Small horizontal airplane shape (fits inside a ~30pt-wide box, centered at cx,cy)
function drawSmallPlane(doc: any, cx: number, cy: number, color: string) {
  doc.save()
  doc.fillColor(color)
  // fuselage
  doc.moveTo(cx - 14, cy)
    .lineTo(cx - 8, cy - 2.5)
    .lineTo(cx + 8, cy - 2.5)
    .lineTo(cx + 14, cy)
    .lineTo(cx + 8, cy + 2.5)
    .lineTo(cx - 8, cy + 2.5)
    .closePath()
    .fill()
  // upper wing
  doc.moveTo(cx - 3, cy - 2.5)
    .lineTo(cx - 9, cy - 8)
    .lineTo(cx + 1, cy - 8)
    .lineTo(cx + 6, cy - 2.5)
    .closePath()
    .fill()
  // lower wing
  doc.moveTo(cx - 3, cy + 2.5)
    .lineTo(cx - 9, cy + 8)
    .lineTo(cx + 1, cy + 8)
    .lineTo(cx + 6, cy + 2.5)
    .closePath()
    .fill()
  // tail
  doc.moveTo(cx - 12, cy)
    .lineTo(cx - 14, cy - 5)
    .lineTo(cx - 10, cy - 5)
    .lineTo(cx - 9, cy)
    .closePath()
    .fill()
  doc.restore()
}

function drawInfoCell(
  doc: any,
  x: number, y: number, w: number, h: number,
  label: string, value: string,
  opts?: { highlight?: boolean; valueSize?: number }
) {
  if (opts?.highlight) {
    doc.save()
    doc.roundedRect(x, y, w, h, 6).fillColor(SOFT_BG).fill()
    doc.restore()
  }
  doc.fillColor(TEXT_LABEL).fontSize(7).font("Helvetica")
    .text(label, x + 8, y + 8, { width: w - 16, lineBreak: false })
  doc.fillColor(TEXT_DARK).fontSize(opts?.valueSize ?? 16).font("Helvetica-Bold")
    .text(value, x + 8, y + 20, { width: w - 16, lineBreak: false })
}

async function renderBoardingPass(doc: any, ctx: {
  passenger: any
  index: number
  total: number
  booking: any
  flight: any
  airline: any
  origin: any
  destination: any
}) {
  const { passenger, index, total, booking, flight, airline, origin, destination } = ctx

  const W = doc.page.width
  const H = doc.page.height
  const M = 30
  const cardW = W - 2 * M

  // ===== HEADER BAR =====
  doc.save()
  doc.roundedRect(M, M, cardW, 60, 8).fillColor(BRAND_PRIMARY).fill()
  doc.restore()

  doc.fillColor("#ffffff").fontSize(20).font("Helvetica-Bold")
    .text(airline.name.toUpperCase(), M + 20, M + 16, { lineBreak: false })
  doc.fillColor("#ffffff").fontSize(11).font("Helvetica")
    .text("BOARDING PASS", M + 20, M + 40, { lineBreak: false })

  drawSmallPlane(doc, M + cardW - 28, M + 30, "#ffffff")

  // ===== PASSENGER + FLIGHT ROW =====
  let y = M + 90

  doc.fillColor(TEXT_LABEL).fontSize(8).font("Helvetica")
    .text("PASSENGER", M, y, { lineBreak: false })
  doc.fillColor(TEXT_DARK).fontSize(20).font("Helvetica-Bold")
    .text(
      `${(passenger.firstName || "").toUpperCase()} ${(passenger.lastName || "").toUpperCase()}`.trim(),
      M, y + 10,
      { lineBreak: false }
    )

  const flightLabelX = M + cardW - 130
  doc.fillColor(TEXT_LABEL).fontSize(8).font("Helvetica")
    .text("FLIGHT", flightLabelX, y, { lineBreak: false })
  doc.fillColor(TEXT_DARK).fontSize(20).font("Helvetica-Bold")
    .text(flight.flightNumber, flightLabelX, y + 10, { lineBreak: false })

  // ===== ROUTE BLOCK =====
  y += 60
  const depTime = new Date(flight.departureTime)
  const arrTime = new Date(flight.arrivalTime)

  // Origin
  doc.fillColor(TEXT_LABEL).fontSize(8).font("Helvetica")
    .text("FROM", M, y, { lineBreak: false })
  doc.fillColor(TEXT_DARK).fontSize(46).font("Helvetica-Bold")
    .text(origin.iataCode, M, y + 10, { lineBreak: false })
  doc.fillColor(TEXT_MUTED).fontSize(11).font("Helvetica")
    .text(origin.city, M, y + 62, { lineBreak: false })
  doc.fillColor(TEXT_DARK).fontSize(14).font("Helvetica-Bold")
    .text(formatTime(depTime), M, y + 80, { lineBreak: false })

  // Destination
  const destX = M + cardW - 140
  doc.fillColor(TEXT_LABEL).fontSize(8).font("Helvetica")
    .text("TO", destX, y, { lineBreak: false })
  doc.fillColor(TEXT_DARK).fontSize(46).font("Helvetica-Bold")
    .text(destination.iataCode, destX, y + 10, { lineBreak: false })
  doc.fillColor(TEXT_MUTED).fontSize(11).font("Helvetica")
    .text(destination.city, destX, y + 62, { lineBreak: false })
  doc.fillColor(TEXT_DARK).fontSize(14).font("Helvetica-Bold")
    .text(formatTime(arrTime), destX, y + 80, { lineBreak: false })

  // Dashed line + plane between IATAs
  const lineY = y + 40
  const lineStart = M + 140
  const lineEnd = destX - 10
  doc.save()
  doc.strokeColor(DIVIDER).lineWidth(1).dash(4, { space: 3 })
    .moveTo(lineStart, lineY).lineTo(lineEnd, lineY).stroke()
  doc.restore()
  drawSmallPlane(doc, (lineStart + lineEnd) / 2, lineY, BRAND_PRIMARY)

  // ===== DETAIL ROW 1 — date / departure / arrival / boarding =====
  y += 115
  const cellH = 50
  const gutter = 10
  const cellW = (cardW - 3 * gutter) / 4

  drawInfoCell(doc, M + 0 * (cellW + gutter), y, cellW, cellH, "DATE", formatDateLong(depTime), { valueSize: 13 })
  drawInfoCell(doc, M + 1 * (cellW + gutter), y, cellW, cellH, "DEPARTURE", formatTime(depTime), { valueSize: 16 })
  drawInfoCell(doc, M + 2 * (cellW + gutter), y, cellW, cellH, "ARRIVAL", formatTime(arrTime), { valueSize: 16 })
  drawInfoCell(doc, M + 3 * (cellW + gutter), y, cellW, cellH, "BOARDING",
    formatTime(new Date(depTime.getTime() - 30 * 60_000)), { valueSize: 16 })

  // ===== DETAIL ROW 2 — seat / gate / class / seq (highlighted) =====
  y += cellH + 12
  const seatNumber = passenger.seat || "TBA"
  const seatClass = getSeatClass(passenger.seat)
  const gate = deterministicGate(flight.id)
  const seq = String(100 + index).padStart(3, "0")

  drawInfoCell(doc, M + 0 * (cellW + gutter), y, cellW, cellH, "SEAT", seatNumber, { highlight: true, valueSize: 22 })
  drawInfoCell(doc, M + 1 * (cellW + gutter), y, cellW, cellH, "GATE", gate, { highlight: true, valueSize: 22 })
  drawInfoCell(doc, M + 2 * (cellW + gutter), y, cellW, cellH, "CLASS", seatClass, { highlight: true, valueSize: 13 })
  drawInfoCell(doc, M + 3 * (cellW + gutter), y, cellW, cellH, "SEQ", seq, { highlight: true, valueSize: 22 })

  // ===== DETACH PERFORATION =====
  y += cellH + 30
  doc.save()
  doc.strokeColor(DIVIDER).lineWidth(1).dash(5, { space: 4 })
    .moveTo(M, y).lineTo(M + cardW, y).stroke()
  doc.restore()
  // small white plate to overlay text on top of the dashed line
  doc.save()
  doc.fillColor("#ffffff").rect(M + cardW / 2 - 45, y - 6, 90, 12).fill()
  doc.restore()
  doc.fillColor(TEXT_LABEL).fontSize(8).font("Helvetica")
    .text("DETACH HERE", M + cardW / 2 - 45, y - 4, { width: 90, align: "center", lineBreak: false })

  // ===== STUB =====
  y += 22
  const stubH = 180
  doc.save()
  doc.roundedRect(M, y, cardW, stubH, 8).fillColor(SOFT_BG).fill()
  doc.restore()

  const stubX = M + 20
  let stubY = y + 18

  doc.fillColor(TEXT_LABEL).fontSize(8).font("Helvetica")
    .text(`${airline.name.toUpperCase()}   ·   BOARDING PASS STUB`, stubX, stubY, { lineBreak: false })

  stubY += 18
  doc.fillColor(TEXT_LABEL).fontSize(7).font("Helvetica")
    .text("PASSENGER", stubX, stubY, { lineBreak: false })
  doc.fillColor(TEXT_DARK).fontSize(13).font("Helvetica-Bold")
    .text(
      `${(passenger.firstName || "").toUpperCase()} ${(passenger.lastName || "").toUpperCase()}`.trim(),
      stubX, stubY + 9,
      { lineBreak: false, width: cardW - 200 }
    )

  stubY += 38
  doc.fillColor(TEXT_LABEL).fontSize(7).font("Helvetica")
    .text("FROM / TO", stubX, stubY, { lineBreak: false })
  doc.fillColor(TEXT_DARK).fontSize(16).font("Helvetica-Bold")
    .text(`${origin.iataCode}  TO  ${destination.iataCode}`, stubX, stubY + 9, { lineBreak: false })

  stubY += 38
  const stubCellW = 75
  const stubCells = [
    { label: "PNR", value: booking.pnr },
    { label: "FLIGHT", value: flight.flightNumber },
    { label: "SEAT", value: seatNumber },
    { label: "GATE", value: gate },
  ]
  stubCells.forEach((c, idx) => {
    const cellX = stubX + idx * stubCellW
    doc.fillColor(TEXT_LABEL).fontSize(7).font("Helvetica")
      .text(c.label, cellX, stubY, { lineBreak: false })
    doc.fillColor(TEXT_DARK).fontSize(11).font("Helvetica-Bold")
      .text(c.value, cellX, stubY + 9, { lineBreak: false })
  })

  // QR code on the right side of the stub
  try {
    const qrData = JSON.stringify({
      pnr: booking.pnr,
      flight: flight.flightNumber,
      seat: seatNumber,
      passenger: `${passenger.firstName} ${passenger.lastName}`
    })
    const qrImage = await QRCode.toDataURL(qrData, { errorCorrectionLevel: "M", margin: 1 })
    const qrBuffer = Buffer.from(qrImage.replace(/^data:image\/png;base64,/, ""), "base64")
    const qrSize = 130
    doc.image(qrBuffer, M + cardW - qrSize - 20, y + (stubH - qrSize) / 2, { width: qrSize, height: qrSize })
  } catch (e) {
    logError("QR_GENERATION_FAILED", { bookingId: booking.id, error: (e as Error).message })
  }

  // ===== FOOTER =====
  doc.fillColor(TEXT_LABEL).fontSize(8).font("Helvetica")
    .text(
      `This is an official ${airline.name} boarding pass. Please present this document and a valid ID at the gate. Boarding closes 15 minutes before departure. PNR ${booking.pnr}.`,
      M, H - 60,
      { width: cardW, align: "center" }
    )

  if (total > 1) {
    doc.fillColor(TEXT_LABEL).fontSize(8).font("Helvetica")
      .text(`Passenger ${index + 1} of ${total}`, M, H - 42, { width: cardW, align: "center" })
  }
}

// ──────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────
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

  // autoFirstPage:false — we create one page per passenger explicitly.
  // Listeners attached BEFORE writing/end to avoid races.
  const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: false })
  doc.font("Helvetica")

  const chunks: Uint8Array[] = []
  const pdfBufferPromise = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Uint8Array) => chunks.push(chunk))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", (err: Error) => reject(err))
  })

  if (pax.length === 0) {
    doc.addPage()
    doc.fillColor(TEXT_DARK).fontSize(14).font("Helvetica")
      .text("No passengers found on this booking.", 50, 50)
  } else {
    for (let i = 0; i < pax.length; i++) {
      doc.addPage()
      await renderBoardingPass(doc, {
        passenger: pax[i],
        index: i,
        total: pax.length,
        booking,
        flight,
        airline,
        origin,
        destination
      })
    }
  }

  doc.end()
  const pdfBuffer = await pdfBufferPromise

  const upload: any = await uploadTicket(pdfBuffer, booking.pnr)

  if (!upload?.secure_url) throw new Error("Upload failed")

  await db
    .update(bookings)
    .set({ ticketUrl: upload.secure_url, status: "TICKETED" })
    .where(eq(bookings.id, bookingId))

  logInfo("TICKET_GENERATION_SUCCESS", { bookingId, pnr: booking.pnr, ticketUrl: upload.secure_url })

  return upload.secure_url
}
