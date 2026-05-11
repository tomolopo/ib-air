import "dotenv/config"
import { db } from "@/db"
import { createTicket } from "@/lib/createTicket"

async function main() {
  const pnr = process.argv[2]?.toUpperCase()

  if (!pnr) {
    console.error("Usage: npx tsx scripts/regenerateTicket.ts <PNR>")
    process.exit(1)
  }

  const booking = await db.query.bookings.findFirst({
    where: (b, { eq }) => eq(b.pnr, pnr)
  })

  if (!booking) {
    console.error(`No booking found for PNR ${pnr}`)
    process.exit(1)
  }

  console.log(`Found booking ${booking.id} (status=${booking.status}, paymentStatus=${booking.paymentStatus}, ticketUrl=${booking.ticketUrl ?? "<none>"})`)

  if (booking.status !== "PAID" && booking.status !== "TICKETED") {
    console.error(`Cannot generate ticket — booking status is ${booking.status}. Must be PAID or TICKETED.`)
    process.exit(1)
  }

  const ticketUrl = await createTicket(booking.id)
  console.log(`\n✅ Ticket regenerated: ${ticketUrl}`)
  process.exit(0)
}

main().catch(err => {
  console.error("Failed:", err.message)
  process.exit(1)
})
