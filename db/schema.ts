import {
  pgTable,
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

export const airports = pgTable(
  "airports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 150 }).notNull(),
    city: varchar("city", { length: 100 }).notNull(),
    country: varchar("country", { length: 100 }).notNull(),
    iataCode: varchar("iata_code", { length: 3 }).unique().notNull(),
    icaoCode: varchar("icao_code", { length: 4 }).unique(),
    latitude: numeric("latitude"),
    longitude: numeric("longitude")
  },
  (table) => ({
    iataIdx: index("airport_iata_idx").on(table.iataCode),
    cityIdx: index("airport_city_idx").on(table.city)
  })
)

// =======================
// ROUTES
// =======================

export const routes = pgTable("routes", {
  id: uuid("id").defaultRandom().primaryKey(),

  airlineId: uuid("airline_id")
    .notNull()
    .references(() => airlines.id),

  originId: uuid("origin_id")
    .notNull()
    .references(() => airports.id),

  destinationId: uuid("destination_id")
    .notNull()
    .references(() => airports.id),

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

    airlineId: uuid("airline_id")
      .notNull()
      .references(() => airlines.id),

    aircraftId: uuid("aircraft_id"),

    routeId: uuid("route_id")
      .notNull()
      .references(() => routes.id),

    departureAirportId: uuid("departure_airport_id")
      .notNull()
      .references(() => airports.id),

    arrivalAirportId: uuid("arrival_airport_id")
      .notNull()
      .references(() => airports.id),

    departureTime: timestamp("departure_time").notNull(),
    arrivalTime: timestamp("arrival_time").notNull(),

    flightDate: timestamp("flight_date").notNull(),

    status: flightStatusEnum("status").default("SCHEDULED"),

    // 🔥 IMPORTANT FOR SEARCH + PRICING
    basePrice: integer("base_price").default(500),

    availableSeats: integer("available_seats").notNull(),
    reservedSeats: integer("reserved_seats").default(0)
  },
  (table) => ({
    departureIdx: index("departure_idx").on(table.departureAirportId),
    arrivalIdx: index("arrival_idx").on(table.arrivalAirportId),
    dateIdx: index("flight_date_idx").on(table.flightDate)
  })
)