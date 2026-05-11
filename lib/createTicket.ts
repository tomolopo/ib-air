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
// Brand
// ──────────────────────────────────────────────────────────
const GREEN_DARK = "#0d3b2e"
const GOLD = "#c9a14a"
const TEXT_DARK = "#0f172a"
const TEXT_MUTED = "#64748b"
const DIVIDER = "#e2e8f0"

const BUSINESS_ROWS = new Set([1, 2, 3, 4, 5])

// ──────────────────────────────────────────────────────────
// Logo (inline SVG → rasterised at runtime via sharp)
// Gold disc with IB monogram drawn as paths so no font is required.
// ──────────────────────────────────────────────────────────
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="160" height="160">
  <circle cx="32" cy="32" r="29" fill="${GOLD}"/>
  <rect x="18" y="20" width="5" height="24" rx="1" fill="${GREEN_DARK}"/>
  <rect x="29" y="20" width="5" height="24" rx="1" fill="${GREEN_DARK}"/>
  <path d="M 34 20 L 39 20 A 6 6 0 0 1 39 32 L 34 32 Z" fill="${GREEN_DARK}"/>
  <path d="M 34 32 L 40 32 A 6 6 0 0 1 40 44 L 34 44 Z" fill="${GREEN_DARK}"/>
</svg>`

let cachedLogo: Buffer | null = null
let logoAttempted = false

async function getLogoPng(): Promise<Buffer | null> {
  if (logoAttempted) return cachedLogo
  logoAttempted = true
  try {
    const sharpMod = await import("sharp")
    const sharp = (sharpMod as any).default ?? sharpMod
    cachedLogo = await sharp(Buffer.from(LOGO_SVG), { density: 600 })
      .resize(220, 220, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
    return cachedLogo
  } catch (e) {
    logError("LOGO_RASTERISE_FAILED", { error: (e as Error).message })
    return null
  }
}

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────
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

// ──────────────────────────────────────────────────────────
// Drawn icons (pdfkit primitives — no font characters used)
// ──────────────────────────────────────────────────────────
function drawPlane(doc: any, cx: number, cy: number, color: string, scale = 1) {
  const s = scale
  doc.save()
  doc.fillColor(color)
  doc.moveTo(cx - 14 * s, cy)
    .lineTo(cx - 8 * s, cy - 2.5 * s)
    .lineTo(cx + 8 * s, cy - 2.5 * s)
    .lineTo(cx + 14 * s, cy)
    .lineTo(cx + 8 * s, cy + 2.5 * s)
    .lineTo(cx - 8 * s, cy + 2.5 * s)
    .closePath().fill()
  doc.moveTo(cx - 3 * s, cy - 2.5 * s)
    .lineTo(cx - 9 * s, cy - 8 * s)
    .lineTo(cx + 1 * s, cy - 8 * s)
    .lineTo(cx + 6 * s, cy - 2.5 * s)
    .closePath().fill()
  doc.moveTo(cx - 3 * s, cy + 2.5 * s)
    .lineTo(cx - 9 * s, cy + 8 * s)
    .lineTo(cx + 1 * s, cy + 8 * s)
    .lineTo(cx + 6 * s, cy + 2.5 * s)
    .closePath().fill()
  doc.moveTo(cx - 12 * s, cy)
    .lineTo(cx - 14 * s, cy - 5 * s)
    .lineTo(cx - 10 * s, cy - 5 * s)
    .lineTo(cx - 9 * s, cy)
    .closePath().fill()
  doc.restore()
}

function drawBaggageIcon(doc: any, x: number, y: number, size: number, color: string) {
  doc.save()
  doc.strokeColor(color).lineWidth(1.5)
  doc.roundedRect(x, y + size * 0.25, size, size * 0.7, 2).stroke()
  doc.moveTo(x + size * 0.3, y + size * 0.25)
    .lineTo(x + size * 0.3, y + size * 0.05)
    .lineTo(x + size * 0.7, y + size * 0.05)
    .lineTo(x + size * 0.7, y + size * 0.25)
    .stroke()
  doc.moveTo(x + size * 0.5, y + size * 0.3)
    .lineTo(x + size * 0.5, y + size * 0.85)
    .stroke()
  doc.restore()
}

function drawClockIcon(doc: any, cx: number, cy: number, r: number, color: string) {
  doc.save()
  doc.strokeColor(color).lineWidth(1.5)
  doc.circle(cx, cy, r).stroke()
  doc.moveTo(cx, cy).lineTo(cx, cy - r * 0.55).stroke()
  doc.moveTo(cx, cy).lineTo(cx + r * 0.45, cy).stroke()
  doc.restore()
}

function drawNoSmokingIcon(doc: any, cx: number, cy: number, r: number, color: string) {
  doc.save()
  doc.strokeColor(color).lineWidth(1.5)
  doc.circle(cx, cy, r).stroke()
  // cigarette body
  doc.rect(cx - r * 0.6, cy - 2, r * 1.2, 4).stroke()
  // diagonal slash
  doc.lineWidth(2)
  doc.moveTo(cx - r * 0.72, cy - r * 0.72)
    .lineTo(cx + r * 0.72, cy + r * 0.72)
    .stroke()
  doc.restore()
}

function drawBarcode(doc: any, x: number, y: number, w: number, h: number, color: string, seed: string) {
  let s = 0
  for (let j = 0; j < seed.length; j++) s = (s * 31 + seed.charCodeAt(j)) & 0x7fffffff
  doc.save()
  doc.fillColor(color)
  let cursor = x
  let i = 0
  while (cursor < x + w - 1) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    const stripeW = (s % 3) + 1
    if (i % 2 === 0 && cursor + stripeW <= x + w) {
      doc.rect(cursor, y, stripeW, h).fill()
    }
    cursor += stripeW
    i++
  }
  doc.restore()
}

// ──────────────────────────────────────────────────────────
// Render one boarding pass page
// ──────────────────────────────────────────────────────────
async function renderBoardingPass(doc: any, ctx: {
  passenger: any
  index: number
  total: number
  booking: any
  flight: any
  airline: any
  origin: any
  destination: any
  logoPng: Buffer | null
}) {
  const { passenger, index, booking, flight, airline, origin, destination, logoPng } = ctx

  // Landscape A4: 842 × 595
  const W = doc.page.width
  const H = doc.page.height
  const STUB_W = 230
  const MAIN_W = W - STUB_W
  const HEADER_H = 80
  const FOOTER_H = 50

  // White page background
  doc.save(); doc.fillColor("#ffffff").rect(0, 0, W, H).fill(); doc.restore()

  // ─────────────────────────────────────
  // MAIN PANEL — HEADER (dark green)
  // ─────────────────────────────────────
  doc.save(); doc.fillColor(GREEN_DARK).rect(0, 0, MAIN_W, HEADER_H).fill(); doc.restore()

  if (logoPng) {
    doc.image(logoPng, 22, 17, { width: 46, height: 46 })
  } else {
    doc.save(); doc.fillColor(GOLD).circle(45, 40, 23).fill(); doc.restore()
  }

  doc.fillColor("#ffffff").fontSize(24).font("Helvetica-Bold")
    .text("IB AIR", 85, 22, { lineBreak: false, characterSpacing: 1.5 })
  doc.fillColor(GOLD).fontSize(10).font("Helvetica-Bold")
    .text("AIRWAYS", 86, 51, { lineBreak: false, characterSpacing: 3 })

  doc.fillColor("#ffffff").fontSize(13).font("Helvetica-Bold")
    .text("BOARDING PASS", MAIN_W - 200, 34, { lineBreak: false, characterSpacing: 1.5 })
  drawPlane(doc, MAIN_W - 35, 40, "#ffffff", 1)

  // ─────────────────────────────────────
  // PASSENGER + PNR
  // ─────────────────────────────────────
  const bodyY = HEADER_H + 22
  doc.fillColor(TEXT_MUTED).fontSize(8).font("Helvetica")
    .text("PASSENGER", 25, bodyY, { lineBreak: false, characterSpacing: 0.5 })
  doc.fillColor(TEXT_DARK).fontSize(18).font("Helvetica-Bold")
    .text(`${(passenger.firstName || "").toUpperCase()} ${(passenger.lastName || "").toUpperCase()}`.trim(),
      25, bodyY + 12, { lineBreak: false, width: MAIN_W * 0.5 - 30, ellipsis: true })

  const pnrX = MAIN_W * 0.55
  doc.fillColor(TEXT_MUTED).fontSize(8).font("Helvetica")
    .text("PNR", pnrX, bodyY, { lineBreak: false, characterSpacing: 0.5 })
  doc.fillColor(TEXT_DARK).fontSize(18).font("Helvetica-Bold")
    .text(booking.pnr, pnrX, bodyY + 12, { lineBreak: false })

  doc.save()
  doc.strokeColor(DIVIDER).lineWidth(1)
    .moveTo(25, bodyY + 42).lineTo(MAIN_W - 25, bodyY + 42).stroke()
  doc.restore()

  // ─────────────────────────────────────
  // ROUTE — big IATA codes + plane + right column
  // ─────────────────────────────────────
  const routeY = bodyY + 60
  const depTime = new Date(flight.departureTime)
  const arrTime = new Date(flight.arrivalTime)

  doc.fillColor(GREEN_DARK).fontSize(8).font("Helvetica")
    .text("FROM", 25, routeY, { lineBreak: false, characterSpacing: 0.5 })
  doc.fillColor(TEXT_DARK).fontSize(40).font("Helvetica-Bold")
    .text(origin.iataCode, 25, routeY + 10, { lineBreak: false })
  doc.fillColor(TEXT_DARK).fontSize(11).font("Helvetica-Bold")
    .text((origin.city || "").toUpperCase(), 25, routeY + 56, { lineBreak: false })
  if (origin.name) {
    doc.fillColor(TEXT_MUTED).fontSize(7).font("Helvetica")
      .text(origin.name.toUpperCase(), 25, routeY + 72,
        { lineBreak: false, width: 180, ellipsis: true })
  }

  drawPlane(doc, 195, routeY + 30, GOLD, 1.2)

  const toX = 245
  doc.fillColor(GREEN_DARK).fontSize(8).font("Helvetica")
    .text("TO", toX, routeY, { lineBreak: false, characterSpacing: 0.5 })
  doc.fillColor(TEXT_DARK).fontSize(40).font("Helvetica-Bold")
    .text(destination.iataCode, toX, routeY + 10, { lineBreak: false })
  doc.fillColor(TEXT_DARK).fontSize(11).font("Helvetica-Bold")
    .text((destination.city || "").toUpperCase(), toX, routeY + 56, { lineBreak: false })
  if (destination.name) {
    doc.fillColor(TEXT_MUTED).fontSize(7).font("Helvetica")
      .text(destination.name.toUpperCase(), toX, routeY + 72,
        { lineBreak: false, width: 180, ellipsis: true })
  }

  // Right column: FLIGHT / DATE / CLASS
  const rcX = pnrX
  const seatClass = getSeatClass(passenger.seat)

  doc.fillColor(GREEN_DARK).fontSize(8).font("Helvetica")
    .text("FLIGHT", rcX, routeY, { lineBreak: false, characterSpacing: 0.5 })
  doc.fillColor(TEXT_DARK).fontSize(20).font("Helvetica-Bold")
    .text(flight.flightNumber, rcX, routeY + 11, { lineBreak: false })

  doc.fillColor(GREEN_DARK).fontSize(8).font("Helvetica")
    .text("DATE", rcX, routeY + 42, { lineBreak: false, characterSpacing: 0.5 })
  doc.fillColor(TEXT_DARK).fontSize(15).font("Helvetica-Bold")
    .text(formatDateLong(depTime), rcX, routeY + 53, { lineBreak: false })

  doc.fillColor(GREEN_DARK).fontSize(8).font("Helvetica")
    .text("CLASS", rcX, routeY + 78, { lineBreak: false, characterSpacing: 0.5 })
  doc.fillColor(TEXT_DARK).fontSize(15).font("Helvetica-Bold")
    .text(seatClass, rcX, routeY + 89, { lineBreak: false })

  // ─────────────────────────────────────
  // 5-CELL STAT ROW
  // ─────────────────────────────────────
  const seatNumber = passenger.seat || "TBA"
  const gate = deterministicGate(flight.id)
  const seq = String(20 + index).padStart(5, "0")
  const boardingTime = new Date(depTime.getTime() - 30 * 60_000)

  const cellY = routeY + 120
  const cells = [
    { label: "DEPARTURE", value: formatTime(depTime) },
    { label: "ARRIVAL", value: formatTime(arrTime) },
    { label: "GATE", value: gate },
    { label: "BOARDING", value: formatTime(boardingTime) },
    { label: "SEAT", value: seatNumber },
  ]
  const cellWidth = (MAIN_W - 50) / 5
  cells.forEach((c, i) => {
    const cellX = 25 + i * cellWidth
    doc.fillColor(GREEN_DARK).fontSize(8).font("Helvetica")
      .text(c.label, cellX, cellY, { lineBreak: false, characterSpacing: 0.5 })
    doc.fillColor(TEXT_DARK).fontSize(20).font("Helvetica-Bold")
      .text(c.value, cellX, cellY + 12, { lineBreak: false })
  })

  const lineY2 = cellY + 52
  doc.save()
  doc.strokeColor(DIVIDER).lineWidth(1)
    .moveTo(25, lineY2).lineTo(MAIN_W - 25, lineY2).stroke()
  doc.restore()

  // ─────────────────────────────────────
  // INFO ROW (baggage, gate-closes, smoking)
  // ─────────────────────────────────────
  const infoY = lineY2 + 18
  const infoColW = (MAIN_W - 50) / 3

  drawBaggageIcon(doc, 30, infoY - 2, 28, GREEN_DARK)
  doc.fillColor(GREEN_DARK).fontSize(8).font("Helvetica-Bold")
    .text("BAGGAGE ALLOWANCE", 70, infoY + 2, { lineBreak: false, characterSpacing: 0.3 })
  doc.fillColor(TEXT_DARK).fontSize(9).font("Helvetica")
    .text("1PC CABIN (7KG)", 70, infoY + 14, { lineBreak: false })
  doc.text("1PC CHECK-IN (23KG)", 70, infoY + 26, { lineBreak: false })

  const gcX = 30 + infoColW
  drawClockIcon(doc, gcX + 14, infoY + 14, 13, GREEN_DARK)
  doc.fillColor(GREEN_DARK).fontSize(8).font("Helvetica-Bold")
    .text("GATE CLOSES", gcX + 40, infoY + 2, { lineBreak: false, characterSpacing: 0.3 })
  doc.fillColor(TEXT_DARK).fontSize(9).font("Helvetica")
    .text("15 MINUTES", gcX + 40, infoY + 14, { lineBreak: false })
  doc.text("BEFORE DEPARTURE", gcX + 40, infoY + 26, { lineBreak: false })

  const nsX = 30 + 2 * infoColW
  drawNoSmokingIcon(doc, nsX + 14, infoY + 14, 13, GREEN_DARK)
  doc.fillColor(GREEN_DARK).fontSize(8).font("Helvetica-Bold")
    .text("SMOKING", nsX + 40, infoY + 2, { lineBreak: false, characterSpacing: 0.3 })
  doc.fillColor(TEXT_DARK).fontSize(9).font("Helvetica")
    .text("NOT PERMITTED", nsX + 40, infoY + 14, { lineBreak: false })
  doc.text("ON BOARD", nsX + 40, infoY + 26, { lineBreak: false })

  // ─────────────────────────────────────
  // MAIN PANEL — FOOTER (dark green band)
  // ─────────────────────────────────────
  doc.save(); doc.fillColor(GREEN_DARK).rect(0, H - FOOTER_H, MAIN_W, FOOTER_H).fill(); doc.restore()
  doc.fillColor(GOLD).fontSize(10).font("Helvetica-Bold")
    .text(`THANK YOU FOR FLYING ${airline.name.toUpperCase()}`,
      25, H - FOOTER_H + 20,
      { lineBreak: false, characterSpacing: 1.5 })
  if (logoPng) {
    doc.image(logoPng, MAIN_W - 50, H - FOOTER_H + 12, { width: 28, height: 28 })
  }

  // ─────────────────────────────────────
  // PERFORATION between main and stub
  // ─────────────────────────────────────
  doc.save()
  doc.strokeColor(DIVIDER).lineWidth(1.5).dash(4, { space: 4 })
    .moveTo(MAIN_W, 0).lineTo(MAIN_W, H).stroke()
  doc.restore()

  // ─────────────────────────────────────
  // STUB — HEADER (dark green)
  // ─────────────────────────────────────
  doc.save(); doc.fillColor(GREEN_DARK).rect(MAIN_W, 0, STUB_W, HEADER_H).fill(); doc.restore()
  doc.fillColor("#ffffff").fontSize(13).font("Helvetica-Bold")
    .text("BOARDING PASS", MAIN_W + 22, 34, { lineBreak: false, characterSpacing: 1.5 })

  // ─────────────────────────────────────
  // STUB — BODY
  // ─────────────────────────────────────
  const stubX = MAIN_W + 22
  let stubY = HEADER_H + 16

  doc.fillColor(TEXT_MUTED).fontSize(7).font("Helvetica")
    .text("PASSENGER", stubX, stubY, { lineBreak: false, characterSpacing: 0.5 })
  doc.fillColor(TEXT_DARK).fontSize(12).font("Helvetica-Bold")
    .text(`${(passenger.firstName || "").toUpperCase()} ${(passenger.lastName || "").toUpperCase()}`.trim(),
      stubX, stubY + 9, { lineBreak: false, width: STUB_W - 44, ellipsis: true })

  stubY += 30
  doc.fillColor(TEXT_MUTED).fontSize(7).text("PNR", stubX, stubY, { lineBreak: false, characterSpacing: 0.5 })
  doc.fillColor(TEXT_DARK).fontSize(12).font("Helvetica-Bold")
    .text(booking.pnr, stubX, stubY + 9, { lineBreak: false })

  stubY += 28
  doc.fillColor(TEXT_MUTED).fontSize(7).font("Helvetica")
    .text("FLIGHT", stubX, stubY, { lineBreak: false, characterSpacing: 0.5 })
  doc.fillColor(TEXT_DARK).fontSize(12).font("Helvetica-Bold")
    .text(flight.flightNumber, stubX, stubY + 9, { lineBreak: false })

  stubY += 28
  // FROM / TO mini
  doc.fillColor(TEXT_MUTED).fontSize(7).font("Helvetica")
    .text("FROM", stubX, stubY, { lineBreak: false, characterSpacing: 0.5 })
  doc.text("TO", stubX + 110, stubY, { lineBreak: false, characterSpacing: 0.5 })
  doc.fillColor(TEXT_DARK).fontSize(13).font("Helvetica-Bold")
    .text(origin.iataCode, stubX, stubY + 9, { lineBreak: false })
  drawPlane(doc, stubX + 85, stubY + 16, GOLD, 0.7)
  doc.fillColor(TEXT_DARK).fontSize(13).font("Helvetica-Bold")
    .text(destination.iataCode, stubX + 110, stubY + 9, { lineBreak: false })

  stubY += 30
  // Date + Seat
  doc.fillColor(TEXT_MUTED).fontSize(7).font("Helvetica")
    .text("DATE", stubX, stubY, { lineBreak: false, characterSpacing: 0.5 })
  doc.text("SEAT", stubX + 110, stubY, { lineBreak: false, characterSpacing: 0.5 })
  doc.fillColor(TEXT_DARK).fontSize(11).font("Helvetica-Bold")
    .text(formatDateLong(depTime), stubX, stubY + 9, { lineBreak: false })
  doc.text(seatNumber, stubX + 110, stubY + 9, { lineBreak: false })

  stubY += 28
  // Boarding + Gate
  doc.fillColor(TEXT_MUTED).fontSize(7).font("Helvetica")
    .text("BOARDING", stubX, stubY, { lineBreak: false, characterSpacing: 0.5 })
  doc.text("GATE", stubX + 110, stubY, { lineBreak: false, characterSpacing: 0.5 })
  doc.fillColor(TEXT_DARK).fontSize(11).font("Helvetica-Bold")
    .text(formatTime(boardingTime), stubX, stubY + 9, { lineBreak: false })
  doc.text(gate, stubX + 110, stubY + 9, { lineBreak: false })

  // QR + barcode
  stubY += 26
  try {
    const qrData = JSON.stringify({
      pnr: booking.pnr,
      flight: flight.flightNumber,
      seat: seatNumber,
      passenger: `${passenger.firstName} ${passenger.lastName}`
    })
    const qrImage = await QRCode.toDataURL(qrData, { errorCorrectionLevel: "M", margin: 1 })
    const qrBuffer = Buffer.from(qrImage.replace(/^data:image\/png;base64,/, ""), "base64")
    doc.image(qrBuffer, stubX, stubY, { width: 88, height: 88 })
  } catch (e) {
    logError("QR_GENERATION_FAILED", { bookingId: booking.id, error: (e as Error).message })
  }

  drawBarcode(doc, stubX + 96, stubY + 4, STUB_W - 96 - 22, 80, TEXT_DARK, booking.pnr + String(index))

  // ─────────────────────────────────────
  // STUB — FOOTER (gold band with SEQ)
  // ─────────────────────────────────────
  doc.save(); doc.fillColor(GOLD).rect(MAIN_W, H - FOOTER_H, STUB_W, FOOTER_H).fill(); doc.restore()
  doc.fillColor(GREEN_DARK).fontSize(11).font("Helvetica-Bold")
    .text(`SEQ ${seq}`, MAIN_W + 22, H - FOOTER_H + 20,
      { lineBreak: false, characterSpacing: 2 })

  if (ctx.total > 1) {
    doc.fillColor(GREEN_DARK).fontSize(8).font("Helvetica")
      .text(`${index + 1} / ${ctx.total}`,
        MAIN_W + STUB_W - 60, H - FOOTER_H + 22,
        { lineBreak: false, width: 40, align: "right" })
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

  // Rasterise the logo once before opening the document.
  const logoPng = await getLogoPng()

  // autoFirstPage:false — one page per passenger.
  // Listeners attached BEFORE writing or end to avoid hang.
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: 0,
    autoFirstPage: false
  })
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
        destination,
        logoPng
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
