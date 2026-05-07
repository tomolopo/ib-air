import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import {
  bookingSegments,
  flights,
  routes,
  airports,
  airlines,
  passengers,
  bookingPassengers
} from "@/db/schema"
import { eq, inArray } from "drizzle-orm"

import { createTicket } from "@/lib/createTicket"
import { logInfo, logError } from "@/lib/logger"
import { generateRequestId } from "@/lib/requestId"

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = generateRequestId()

  try {
    const { id: bookingId } = await context.params
    const type = req.nextUrl.searchParams.get("type")

    if (!bookingId) {
      return NextResponse.json({ error: "Missing booking ID", requestId }, { status: 400 })
    }

    // =========================
    // GET BOOKING
    // =========================
    const booking = await db.query.bookings.findFirst({
      where: (b, { eq }) => eq(b.id, bookingId)
    })

    if (!booking) {
      return NextResponse.json({ error: "Booking not found", requestId }, { status: 404 })
    }

    if (type === "ticket" && booking.ticketUrl) {
      return NextResponse.json({ success: true, ticketUrl: booking.ticketUrl })
    }

    if (type === "ticket" && booking.status !== "PAID") {
      return NextResponse.json({ error: "Booking not paid yet", requestId }, { status: 400 })
    }

    // =========================
    // PARALLEL: segment + passengers
    // =========================
    const [segment, passengerLinks] = await Promise.all([
      db.query.bookingSegments.findFirst({
        where: (s, { eq }) => eq(s.bookingId, bookingId)
      }),
      db.select().from(bookingPassengers).where(eq(bookingPassengers.bookingId, bookingId))
    ])

    if (!segment) {
      return NextResponse.json({ error: "No segment found", requestId }, { status: 404 })
    }

    // =========================
    // FLIGHT
    // =========================
    const flight = await db.query.flights.findFirst({
      where: (f, { eq }) => eq(f.id, segment.flightId)
    })

    if (!flight) {
      return NextResponse.json({ error: "Flight not found", requestId }, { status: 404 })
    }

    // =========================
    // PARALLEL: route + airline + passengers
    // =========================
    const passengerIds = passengerLinks.map(l => l.passengerId)

    const [route, airline, pax] = await Promise.all([
      db.query.routes.findFirst({ where: (r, { eq }) => eq(r.id, flight.routeId) }),
      db.query.airlines.findFirst({ where: (a, { eq }) => eq(a.id, flight.airlineId) }),
      passengerIds.length > 0
        ? db.select().from(passengers).where(inArray(passengers.id, passengerIds))
        : Promise.resolve([])
    ])

    if (!route) {
      return NextResponse.json({ error: "Route not found", requestId }, { status: 404 })
    }

    if (!airline) {
      return NextResponse.json({ error: "Airline not found", requestId }, { status: 404 })
    }

    // =========================
    // PARALLEL: airports
    // =========================
    const [origin, destination] = await Promise.all([
      db.query.airports.findFirst({ where: (a, { eq }) => eq(a.id, route.originId) }),
      db.query.airports.findFirst({ where: (a, { eq }) => eq(a.id, route.destinationId) })
    ])

    if (!origin || !destination) {
      return NextResponse.json({ error: "Airport data missing", requestId }, { status: 404 })
    }

    // =========================
    // PLAIN BOOKING LOOKUP
    // =========================
    if (!type) {
      return NextResponse.json({
        success: true,
        booking,
        flight: {
          flightNumber: flight.flightNumber,
          departureTime: flight.departureTime,
          arrivalTime: flight.arrivalTime
        },
        from: `${origin.city} (${origin.iataCode})`,
        to: `${destination.city} (${destination.iataCode})`,
        airline: airline.name,
        passengers: pax
      })
    }

    // =========================
    // GENERATE TICKET
    // =========================
    if (type === "ticket") {
      logInfo("TICKET_GENERATION_START", { requestId, bookingId })
      const ticketUrl = await createTicket(bookingId)
      return NextResponse.json({ success: true, ticketUrl })
    }

    return NextResponse.json({ error: "Invalid type", requestId }, { status: 400 })

  } catch (error: any) {
    logError("BOOKING_GET_FAILED", { requestId, error: error.message })

    return NextResponse.json(
      { error: error.message || "Internal Server Error", requestId },
      { status: 500 }
    )
  }
}