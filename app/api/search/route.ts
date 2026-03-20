import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { flights, routes, airports, airlines } from "@/db/schema"
import { eq, and, gte, lt, or, ilike } from "drizzle-orm"
import { formatDateTime } from "@/lib/formatDate"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const { tripType, from, to, departureDate, returnDate } = body

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
        { error: "returnDate is required for round-trip" },
        { status: 400 }
      )
    }

    // =========================
    // DATE RANGE HELPER
    // =========================
    const getDateRange = (dateStr: string) => {
      const start = new Date(dateStr)
      const end = new Date(dateStr)
      end.setDate(end.getDate() + 1)
      return { start, end }
    }

    // =========================
    // FIND AIRPORTS (CITY OR IATA)
    // =========================
    const originAirport = await db.query.airports.findFirst({
      where: (a: any, { or, ilike, eq }: any) =>
        or(
          eq(a.iataCode, from.toUpperCase()),
          ilike(a.city, `%${from}%`)
        )
    })

    const destinationAirport = await db.query.airports.findFirst({
      where: (a: any, { or, ilike, eq }: any) =>
        or(
          eq(a.iataCode, to.toUpperCase()),
          ilike(a.city, `%${to}%`)
        )
    })

    if (!originAirport || !destinationAirport) {
      return NextResponse.json(
        { error: "Invalid route (city or IATA not found)" },
        { status: 400 }
      )
    }

    // =========================
    // FETCH ROUTES
    // =========================
    const outboundRoutes = await db
      .select()
      .from(routes)
      .where(
        and(
          eq(routes.originId, originAirport.id),
          eq(routes.destinationId, destinationAirport.id)
        )
      )

    const inboundRoutes = await db
      .select()
      .from(routes)
      .where(
        and(
          eq(routes.originId, destinationAirport.id),
          eq(routes.destinationId, originAirport.id)
        )
      )

    const outboundRouteIds = outboundRoutes.map(r => r.id)
    const inboundRouteIds = inboundRoutes.map(r => r.id)

    // =========================
    // FETCH FLIGHTS FUNCTION
    // =========================
    const getFlights = async (
      routeIds: string[],
      date: string,
      fromCity: string,
      toCity: string
    ) => {
      const { start, end } = getDateRange(date)

      const flightList = await db
        .select({
          id: flights.id,
          flightNumber: flights.flightNumber,
          departureTime: flights.departureTime,
          arrivalTime: flights.arrivalTime,
          airlineId: flights.airlineId,
          routeId: flights.routeId
        })
        .from(flights)
        .where(
          and(
            gte(flights.departureTime, start),
            lt(flights.departureTime, end)
          )
        )

      // FILTER BY ROUTE IDS
      const filtered = flightList.filter(f =>
        routeIds.includes(f.routeId)
      )

      // ENRICH RESULTS
      return Promise.all(
        filtered.map(async f => {
          const airline = await db
            .select()
            .from(airlines)
            .where(eq(airlines.id, f.airlineId))
            .then(res => res[0])

          return {
            id: f.id,
            flightNumber: f.flightNumber,

            // ✅ FIX APPLIED HERE
            departureTime: formatDateTime(f.departureTime),
            arrivalTime: formatDateTime(f.arrivalTime),

            airline: airline?.name,
            from: fromCity,
            to: toCity
          }
        })
      )
    }

    // =========================
    // OUTBOUND FLIGHTS
    // =========================
    const outbound = await getFlights(
      outboundRouteIds,
      departureDate,
      originAirport.city,
      destinationAirport.city
    )

    // =========================
    // INBOUND (ROUND TRIP)
    // =========================
    let inbound: any[] = []

    if (tripType === "round-trip") {
      inbound = await getFlights(
        inboundRouteIds,
        returnDate,
        destinationAirport.city,
        originAirport.city
      )
    }

    // =========================
    // RESPONSE
    // =========================
    return NextResponse.json({
      success: true,
      tripType,
      data: {
        outbound,
        inbound
      }
    })

  } catch (error: any) {
    console.error("SEARCH ERROR:", error)

    return NextResponse.json(
      { error: error.message || "Search failed" },
      { status: 500 }
    )
  }
}