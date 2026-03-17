import { db } from "@/db"
import { flights, routes } from "@/db/schema"
import { addDays } from "date-fns"

async function generateFlights() {
  const allRoutes = await db.select().from(routes)

  const flightsToInsert: typeof flights.$inferInsert[] = []

  for (const route of allRoutes) {
    for (let i = 0; i < 30; i++) {
      const baseDate = addDays(new Date(), i)

      const departureTime = new Date(baseDate)
      departureTime.setHours(8, 0, 0)

      const arrivalTime = new Date(
        departureTime.getTime() + route.durationMinutes * 60000
      )

      flightsToInsert.push({
        flightNumber: `FL-${Math.floor(Math.random() * 900 + 100)}`,

        airlineId: route.airlineId,
        aircraftId: null,

        routeId: route.id,

        departureAirportId: route.originId,
        arrivalAirportId: route.destinationId,

        departureTime,
        arrivalTime,
        flightDate: departureTime,

        status: "SCHEDULED" as const, // ✅ FIXED

        availableSeats: 180,
        reservedSeats: 0
      })
    }
  }

  if (flightsToInsert.length === 0) {
    console.log("⚠️ No routes found. Seed routes first.")
    return
  }

  await db.insert(flights).values(flightsToInsert)

  console.log("✅ Flights generated successfully")
}

generateFlights()