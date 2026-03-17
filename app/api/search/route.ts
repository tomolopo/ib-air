import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { flights, airports, airlines } from "@/db/schema"
import { eq, and, or, ilike, gt } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)

    const from = searchParams.get("from")
    const to = searchParams.get("to")
    const date = searchParams.get("date")

    if (!from || !to || !date) {
      return NextResponse.json(
        { error: "Missing params" },
        { status: 400 }
      )
    }

    // =========================
    // 🔍 FIND AIRPORTS
    // =========================

    const originAirports = await db
      .select()
      .from(airports)
      .where(
        or(
          ilike(airports.city, `%${from}%`),
          eq(airports.iataCode, from.toUpperCase())
        )
      )

    const destinationAirports = await db
      .select()
      .from(airports)
      .where(
        or(
          ilike(airports.city, `%${to}%`),
          eq(airports.iataCode, to.toUpperCase())
        )
      )

    const originIds = originAirports.map(a => a.id)
    const destinationIds = destinationAirports.map(a => a.id)

    if (originIds.length === 0 || destinationIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: { direct: [], connecting: [] }
      })
    }

    // =========================
    // ✈️ DIRECT FLIGHTS
    // =========================

    const departureAirport = alias(airports, "departure_airport")
    const arrivalAirport = alias(airports, "arrival_airport")

    const directFlights = await db
      .select({
        type: sql<string>`'direct'`,
        flightNumber: flights.flightNumber,
        departureTime: flights.departureTime,
        arrivalTime: flights.arrivalTime,
        airline: airlines.name,
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

    // =========================
    // 🔥 MULTI-LEG (1 STOP)
    // =========================

    const f1 = alias(flights, "f1")
    const f2 = alias(flights, "f2")

    const multiLegFlights = await db
      .select({
        type: sql<string>`'connecting'`,

        leg1FlightNumber: f1.flightNumber,
        leg1Departure: f1.departureTime,
        leg1Arrival: f1.arrivalTime,

        leg2FlightNumber: f2.flightNumber,
        leg2Departure: f2.departureTime,
        leg2Arrival: f2.arrivalTime
      })
      .from(f1)
      .innerJoin(
        f2,
        eq(f1.arrivalAirportId, f2.departureAirportId)
      )
      .where(
        and(
          eq(f1.flightDate, new Date(date)),
          eq(f2.flightDate, new Date(date)),

          or(...originIds.map(id => eq(f1.departureAirportId, id))),
          or(...destinationIds.map(id => eq(f2.arrivalAirportId, id))),

          // ✅ Layover logic (FIXED)
          gt(f2.departureTime, f1.arrivalTime),
          sql`${f2.departureTime} <= ${f1.arrivalTime} + interval '6 hours'`
        )
      )

    // =========================
    // 🎯 RESPONSE
    // =========================

    return NextResponse.json({
      success: true,
      directCount: directFlights.length,
      connectingCount: multiLegFlights.length,
      data: {
        direct: directFlights,
        connecting: multiLegFlights
      }
    })

  } catch (error) {
    console.error(error)

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}