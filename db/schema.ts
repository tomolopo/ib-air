import {
  pgTable,
  text,
  uuid,
  varchar,
  integer,
  timestamp,
  boolean,
  pgEnum,
  index,
  numeric
} from "drizzle-orm/pg-core"

// =======================
// ENUMS
// =======================

export const flightStatusEnum = pgEnum("flight_status", [
  "SCHEDULED",
  "BOARDING",
  "DEPARTED",
  "ARRIVED",
  "CANCELLED",
  "DELAYED"
])

// =======================
// AIRLINES
// =======================

export const airlines = pgTable("airlines", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  iataCode: varchar("iata_code", { length: 3 }).unique().notNull(),
  icaoCode: varchar("icao_code", { length: 4 }).unique(),
  country: varchar("country", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow()
})

// =======================
// AIRPORTS
// =======================

export const airports = pgTable("airports", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 150 }).notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  country: varchar("country", { length: 100 }).notNull(),
  iataCode: varchar("iata_code", { length: 3 }).unique().notNull(),
  icaoCode: varchar("icao_code", { length: 4 }).unique(),
  latitude: varchar("latitude", { length: 20 }),
  longitude: varchar("longitude", { length: 20 })
})

// =======================
// ROUTES
// =======================

export const routes = pgTable("routes", {
  id: uuid("id").defaultRandom().primaryKey(),
  airlineId: uuid("airline_id").notNull(),
  originId: uuid("origin_id").notNull(),
  destinationId: uuid("destination_id").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow()
})

// =======================
// FLIGHTS
// =======================

export const flights = pgTable(
  "flights",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    flightNumber: varchar("flight_number", { length: 10 }).notNull(),
    airlineId: uuid("airline_id").notNull(),
    aircraftId: uuid("aircraft_id"),
    routeId: uuid("route_id").notNull(),

    departureAirportId: uuid("departure_airport_id").notNull(),
    arrivalAirportId: uuid("arrival_airport_id").notNull(),

    departureTime: timestamp("departure_time").notNull(),
    arrivalTime: timestamp("arrival_time").notNull(),
    flightDate: timestamp("flight_date").notNull(),

    status: flightStatusEnum("status").default("SCHEDULED"),
    availableSeats: integer("available_seats").notNull(),
    reservedSeats: integer("reserved_seats").default(0)
  },
  (table) => ({
    departureIdx: index("departure_idx").on(table.departureAirportId),
    arrivalIdx: index("arrival_idx").on(table.arrivalAirportId)
  })
)

// =======================
// PASSENGERS
// =======================

export const passengers = pgTable("passengers", {
  id: uuid("id").defaultRandom().primaryKey(),

  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  email: varchar("email", { length: 100 }),
  phone: varchar("phone", { length: 20 }),

  // ✅ ADD ALL EXISTING DB FIELDS (CRITICAL)
  dateOfBirth: timestamp("date_of_birth"),
  nationality: varchar("nationality", { length: 100 }),
  gender: varchar("gender", { length: 20 }),
  type: varchar("type", { length: 20 }).default("ADULT"),
  passportNumber: varchar("passport_number", { length: 50 }),

  // ✅ THIS FIXES YOUR ERROR
  seat: varchar("seat", { length: 10 }),

  checkedIn: boolean("checked_in").default(false),
  checkedInAt: timestamp("checked_in_at"),

  createdAt: timestamp("created_at").defaultNow()
})

// =======================
// BOOKINGS
// =======================

export const bookings = pgTable("bookings", {
  id: uuid("id").defaultRandom().primaryKey(),
  pnr: varchar("pnr", { length: 10 }),
  status: varchar("status", { length: 20 }).default("PENDING"),
  paymentStatus: varchar("payment_status", { length: 20 }).default("PENDING"),
  totalAmount: integer("total_amount"),
  seat: varchar("seat", { length: 10 }),
  passengerName: varchar("passenger_name", { length: 100 }),
   // ✅ NEW FIELD
  ticketUrl: text("ticket_url"),
  // Answers chat session id — set on booking creation; used to ping the
  // path-parameter webhook in Answers when the boarding pass is ready.
  // TEXT (unbounded) because session IDs vary wildly in length across tenants.
  sessionId: text("sessionid"),
  createdAt: timestamp("created_at").defaultNow()
})

// =======================
// BOOKING SEGMENTS
// =======================

export const bookingSegments = pgTable("booking_segments", {
  id: uuid("id").defaultRandom().primaryKey(),
  bookingId: uuid("booking_id").notNull(),
  flightId: uuid("flight_id").notNull(),
  segmentOrder: integer("segment_order").notNull()
})

// =======================
// BOOKING PASSENGERS
// =======================

export const bookingPassengers = pgTable("booking_passengers", {
  id: uuid("id").defaultRandom().primaryKey(),
  bookingId: uuid("booking_id").notNull(),
  passengerId: uuid("passenger_id").notNull()
})

 export const seats = pgTable("seats", {
  id: uuid("id").defaultRandom().primaryKey(),
  flightId: uuid("flight_id").notNull(),
  seatNumber: text("seat_number").notNull(),
  class: text("class").default("economy"),
  isAvailable: boolean("is_available").default(true)
})


export const seatLocks = pgTable("seat_locks", {
  id: uuid("id").defaultRandom().primaryKey(),
  seatId: uuid("seat_id").notNull(),
  bookingId: uuid("booking_id").notNull(),
  expiresAt: timestamp("expires_at").notNull()
})