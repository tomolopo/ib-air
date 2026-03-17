import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { flights, airports, airlines } from "@/db/schema"
import { and, eq, or, ilike } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)

    const from = searchParams.get("from")
    const to = searchParams.get("to")
    const date = searchParams.get("date")

    if (!from || !to || !date) {
      return NextResponse.json(
        { error: "Missing required params: from, to, date" },
        { status: 400 }
      )
    }

    // 🔎 Find origin airports
    const originAirports = await db
      .select()
      .from(airports)
      .where(
        or(
          ilike(airports.city, `%${from}%`),
          eq(airports.iataCode, from.toUpperCase())
        )
      )

    // 🔎 Find destination airports
    const destinationAirports = await db
      .select()
      .from(airports)
      .where(
        or(
          ilike(airports.city, `%${to}%`),
          eq(airports.iataCode, to.toUpperCase())
        )
      )

    if (originAirports.length === 0 || destinationAirports.length === 0) {
      return NextResponse.json(
        { error: "Invalid origin or destination" },
        { status: 404 }
      )
    }

    const originIds = originAirports.map(a => a.id)
    const destinationIds = destinationAirports.map(a => a.id)

    // ✅ Aliases
    const departureAirport = alias(airports, "departure_airport")
    const arrivalAirport = alias(airports, "arrival_airport")

    // 🔎 Search flights
    const results = await db
      .select({
        flightNumber: flights.flightNumber,
        departureTime: flights.departureTime,
        arrivalTime: flights.arrivalTime,
        airline: airlines.name,
        price: flights.basePrice,
        from: departureAirport.city,
        to: arrivalAirport.city
      })
      .from(flights)
      .innerJoin(airlines, eq(flights.airlineId, airlines.id))
      .innerJoin(
        departureAirport,
        eq(flights.departureAirportId, departureAirport.id)
      )
      .innerJoin(
        arrivalAirport,
        eq(flights.arrivalAirportId, arrivalAirport.id)
      )
      .where(
        and(
          eq(flights.flightDate, new Date(date)),
          or(...originIds.map(id => eq(flights.departureAirportId, id))),
          or(...destinationIds.map(id => eq(flights.arrivalAirportId, id)))
        )
      )

    return NextResponse.json({
      success: true,
      count: results.length,
      data: results
    })

  } catch (error) {
    console.error(error)

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}