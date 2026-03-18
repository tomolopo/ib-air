import PDFDocument from "pdfkit"
import QRCode from "qrcode"

export async function generateTicketPDF(data: any): Promise<Buffer> {
  return new Promise(async (resolve) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 })

    // 🔥 Prevent Vercel font crash
    doc.font("Helvetica")

    const chunks: Uint8Array[] = []
    doc.on("data", (chunk) => chunks.push(chunk))

    // HEADER
    doc.fontSize(20).text(`✈️ ${data.airline} BOARDING PASS`, {
      align: "center"
    })

    doc.moveDown()
    doc.fontSize(12).text(`PNR: ${data.pnr}`)

    doc.moveDown()

    // FLIGHT DETAILS
    doc.fontSize(14).text("Flight Details", { underline: true })

    doc.fontSize(12)
    doc.text(`From: ${data.from}`)
    doc.text(`To: ${data.to}`)
    doc.text(`Flight: ${data.flightNumber}`)
    doc.text(`Departure: ${new Date(data.departure).toLocaleString()}`)
    doc.text(`Arrival: ${new Date(data.arrival).toLocaleString()}`)

    doc.moveDown()
    doc.text(`Seat: ${data.seat || "Not assigned"}`)

    doc.moveDown()

    // QR
    try {
      const qr = await QRCode.toDataURL(JSON.stringify(data))
      const base64 = qr.replace(/^data:image\/png;base64,/, "")
      const buffer = Buffer.from(base64, "base64")

      doc.image(buffer, { fit: [150, 150], align: "center" })
    } catch {}

    doc.end()

    doc.on("end", () => {
      resolve(Buffer.concat(chunks))
    })
  })
}