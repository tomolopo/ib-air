import PDFDocument from "pdfkit"

export function generateTicket(data: any) {
  const doc = new PDFDocument()

  doc.text("✈️ IB AIR TICKET")
  doc.text(`PNR: ${data.pnr}`)
  doc.text(`Passenger: ${data.name}`)
  doc.text(`Route: ${data.from} → ${data.to}`)

  doc.end()

  return doc
}