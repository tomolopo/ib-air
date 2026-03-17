import { NextRequest, NextResponse } from "next/server"
import PDFDocument from "pdfkit"
import { db } from "@/db"
import { bookings } from "@/db/schema"

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get("type")

  const bookingId = params.id

  const booking = await db.query.bookings.findFirst({
    where: (b: any, { eq }: any) => eq(b.id, bookingId)
  })

  if (!booking) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // =========================
  // RETURN PDF TICKET
  // =========================
  if (type === "ticket") {
    const doc = new PDFDocument()
    const chunks: Uint8Array[] = []

    doc.on("data", (chunk: Uint8Array) => chunks.push(chunk))

    doc.text("✈️ IB AIR TICKET")
    doc.text(`PNR: ${booking.pnr}`)
    doc.text(`Status: ${booking.status}`)

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

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get("type")

  const bookingId = params.id
  const body = await req.json()

  // =========================
  // SAVE SEAT
  // =========================
  if (type === "seat") {
    const { seat } = body

    return NextResponse.json({
      success: true,
      seat
    })
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 })
}