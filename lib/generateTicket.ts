import { Buffer } from "buffer"

export async function generateTicketPDF(data: {
  pnr: string
  airline: string
  from: string
  to: string
  flightNumber: string
  departure: string | Date
  arrival: string | Date
  seat?: string | null
}) {

    const departure = new Date(data.departure).toLocaleString()
    const arrival = new Date(data.arrival).toLocaleString()
    
  const content = `
IB AIR BOARDING PASS

PNR: ${data.pnr}

Airline: ${data.airline}

FROM: ${data.from}
TO: ${data.to}

Flight: ${data.flightNumber}

Departure: ${new Date(data.departure).toLocaleString()}
Arrival: ${new Date(data.arrival).toLocaleString()}

Seat: ${data.seat || "Not Assigned"}

Thank you for flying with IB AIR ✈️
`

  // 🔥 Simple PDF (no pdfkit)
  const pdf = `
%PDF-1.1
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${content.length + 100} >>
stream
BT
/F1 12 Tf
50 700 Td
(${content.replace(/\n/g, ") Tj T* (")}) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000060 00000 n 
0000000117 00000 n 
0000000270 00000 n 
0000000400 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
500
%%EOF
`

  return Buffer.from(pdf)
}