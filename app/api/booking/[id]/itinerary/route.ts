import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import {
  bookings,
  bookingSegments,
  flights,
  routes,
  airports,
  airlines,
  passengers,
  bookingPassengers
} from "@/db/schema"
import { eq, inArray } from "drizzle-orm"
import { logInfo, logError } from "@/lib/logger"
import { generateRequestId } from "@/lib/requestId"

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = generateRequestId()
  const { id: bookingId } = params

  try {
    const booking = await db.query.bookings.findFirst({
      where: (b, { eq }) => eq(b.id, bookingId)
    })

    if (!booking) {
      return NextResponse.json({ error: "Booking not found", requestId }, { status: 404 })
    }

    const [segments, passengerLinks] = await Promise.all([
      db.select().from(bookingSegments).where(eq(bookingSegments.bookingId, bookingId)),
      db.select().from(bookingPassengers).where(eq(bookingPassengers.bookingId, bookingId))
    ])

    const flightIds = segments.map(s => s.flightId)
    const passengerIds = passengerLinks.map(l => l.passengerId)

    const [flightRows, pax] = await Promise.all([
      flightIds.length > 0
        ? db.select().from(flights).where(inArray(flights.id, flightIds))
        : Promise.resolve([]),
      passengerIds.length > 0
        ? db.select().from(passengers).where(inArray(passengers.id, passengerIds))
        : Promise.resolve([])
    ])

    // Resolve route/airline/airport data for each flight
    const routeIds = [...new Set(flightRows.map(f => f.routeId))]
    const airlineIds = [...new Set(flightRows.map(f => f.airlineId))]

    const [routeRows, airlineRows] = await Promise.all([
      routeIds.length > 0
        ? db.select().from(routes).where(inArray(routes.id, routeIds))
        : Promise.resolve([]),
      airlineIds.length > 0
        ? db.select().from(airlines).where(inArray(airlines.id, airlineIds))
        : Promise.resolve([])
    ])

    const airportIds = [...new Set([
      ...routeRows.map(r => r.originId),
      ...routeRows.map(r => r.destinationId)
    ])]

    const airportRows = airportIds.length > 0
      ? await db.select().from(airports).where(inArray(airports.id, airportIds))
      : []

    // Build lookup maps
    const flightMap = new Map(flightRows.map(f => [f.id, f]))
    const routeMap = new Map(routeRows.map(r => [r.id, r]))
    const airlineMap = new Map(airlineRows.map(a => [a.id, a]))
    const airportMap = new Map(airportRows.map(a => [a.id, a]))

    const itinerarySegments = segments
      .sort((a, b) => a.segmentOrder - b.segmentOrder)
      .map(seg => {
        const flight = flightMap.get(seg.flightId)
        if (!flight) return null
        const route = routeMap.get(flight.routeId)
        const airline = airlineMap.get(flight.airlineId)
        const origin = route ? airportMap.get(route.originId) : null
        const dest = route ? airportMap.get(route.destinationId) : null

        return {
          segmentOrder: seg.segmentOrder,
          flightNumber: flight.flightNumber,
          airline: airline?.name ?? null,
          from: origin ? `${origin.city} (${origin.iataCode})` : null,
          to: dest ? `${dest.city} (${dest.iataCode})` : null,
          departureTime: flight.departureTime,
          arrivalTime: flight.arrivalTime,
          status: flight.status
        }
      })
      .filter(Boolean)

    logInfo("ITINERARY_FETCHED", { requestId, bookingId })

    return NextResponse.json({
      success: true,
      bookingId: booking.id,
      pnr: booking.pnr,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      totalAmount: booking.totalAmount,
      ticketUrl: booking.ticketUrl ?? null,
      passengers: pax.map(p => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        seat: p.seat ?? null,
        checkedIn: p.checkedIn ?? false
      })),
      segments: itinerarySegments
    })
  } catch (error: any) {
    logError("ITINERARY_FETCH_FAILED", { requestId, error: error.message })
    return NextResponse.json(
      { error: error.message || "Failed to fetch itinerary", requestId },
      { status: 500 }
    )
  }
}
