import { db } from "@/db"
import { seats } from "@/db/schema"

export async function generateSeats(flightId: string) {
  const seatRows = []

  const rows = 30
  const cols = ["A", "B", "C", "D", "E", "F"]

  for (let r = 1; r <= rows; r++) {
    for (let c of cols) {
      seatRows.push({
        flightId,
        seatNumber: `${r}${c}`,
        class: r <= 5 ? "business" : "economy"
      })
    }
  }

  await db.insert(seats).values(seatRows)
}