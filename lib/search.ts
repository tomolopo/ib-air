import { db } from "@/db"
import { flights, airports } from "@/db/schema"
import { eq, and } from "drizzle-orm"

export async function searchFlights(originIata: string, destinationIata: string) {
  
  // Get airport IDs
  const originAirport = await db
    .select()
    .from(airports)
    .where(eq(airports.iataCode, originIata))
    .limit(1)

  const destinationAirport = await db
    .select()
    .from(airports)
    .where(eq(airports.iataCode, destinationIata))
    .limit(1)

  if (!originAirport.length || !destinationAirport.length) {
    return { error: "Invalid airport code" }
  }

  const originId = originAirport[0].id
  const destinationId = destinationAirport[0].id

  // ======================
  // DIRECT FLIGHTS
  // ======================

  const directFlights = await db
    .select()
    .from(flights)
    .where(
      and(
        eq(flights.departureAirportId, originId),
        eq(flights.arrivalAirportId, destinationId)
      )
    )

  // ======================
  // CONNECTING FLIGHTS
  // ======================

  const firstLeg = await db
    .select()
    .from(flights)
    .where(eq(flights.departureAirportId, originId))

  const secondLeg = await db
    .select()
    .from(flights)
    .where(eq(flights.arrivalAirportId, destinationId))

  const connections = []

  for (const leg1 of firstLeg) {
    for (const leg2 of secondLeg) {
      if (
        leg1.arrivalAirportId === leg2.departureAirportId &&
        leg2.departureTime > leg1.arrivalTime
      ) {
        connections.push({
          type: "connection",
          flights: [leg1, leg2]
        })
      }
    }
  }

  return {
    direct: directFlights,
    connections
  }
}