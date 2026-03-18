import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { flights, routes, airports, airlines } from "@/db/schema"
import { eq, and } from "drizzle-orm"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const {
      tripType = "one-way",
      from,
      to,
      departureDate,
      returnDate
    } = body

    // =========================
    // VALIDATION
    // =========================
    if (!from || !to || !departureDate) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    if (tripType === "round-trip" && !returnDate) {
      return NextResponse.json(
        { error: "Return date required for round-trip" },
        { status: 400 }
      )
    }

    // =========================
    // HELPER FUNCTION
    // =========================
    const getFlights = async (
      originCode: string,
      destinationCode: string,
      date: string
    ) => {
      const origin = await db.query.airports.findFirst({
        where: (a: any, { eq }: any) => eq(a.iataCode, originCode)
      })

      const destination = await db.query.airports.findFirst({
        where: (a: any, { eq }: any) => eq(a.iataCode, destinationCode)
      })

      if (!origin || !destination) return []

      const route = await db.query.routes.findFirst({
        where: (r: any, { eq, and }: any) =>
          and(eq(r.originId, origin.id), eq(r.destinationId, destination.id))
      })

      if (!route) return []

      const results = await db
        .select()
        .from(flights)
        .where(eq(flights.routeId, route.id))

      return Promise.all(
        results.map(async (f: any) => {
          const airline = await db
            .select()
            .from(airlines)
            .where(eq(airlines.id, f.airlineId))
            .then(res => res[0])

          return {
            id: f.id,
            flightNumber: f.flightNumber,
            departureTime: f.departureTime,
            arrivalTime: f.arrivalTime,
            airline: airline?.name,
            from: origin.city,
            to: destination.city
          }
        })
      )
    }

    // =========================
    // ONE WAY
    // =========================
    if (tripType === "one-way") {
      const outbound = await getFlights(from, to, departureDate)

      return NextResponse.json({
        success: true,
        tripType,
        data: { outbound }
      })
    }

    // =========================
    // ROUND TRIP
    // =========================
    const outbound = await getFlights(from, to, departureDate)
    const inbound = await getFlights(to, from, returnDate)

    return NextResponse.json({
      success: true,
      tripType,
      data: {
        outbound,
        inbound
      }
    })
  } catch (error: any) {
    console.error(error)

    return NextResponse.json(
      { error: error.message || "Search failed" },
      { status: 500 }
    )
  }
}