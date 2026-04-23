"use client"

import { useEffect, useState } from "react"

export default function SeatsPage() {
  const [seats, setSeats] = useState<any[]>([])
  const [passengers, setPassengers] = useState<any[]>([])
  const [selectedPassenger, setSelectedPassenger] = useState<string>("")

  // ✅ GET PARAMS FROM URL
  const params =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : null

  const flightId = params?.get("flightId")
  const bookingId = params?.get("bookingId")

  // =========================
  // LOAD DATA
  // =========================
  useEffect(() => {
    if (!flightId || !bookingId) return

    // LOAD SEATS
    fetch(`/api/seats?flightId=${flightId}`)
      .then(res => res.json())
      .then(data => setSeats(data.seats))

    // LOAD PASSENGERS
    fetch(`/api/booking/passengers?bookingId=${bookingId}`)
      .then(res => res.json())
      .then(data => {
        setPassengers(data.passengers || [])
        setSelectedPassenger(data.passengers?.[0]?.id || "")
      })
  }, [flightId, bookingId])

  // =========================
  // HANDLE SEAT CLICK
  // =========================
  async function handleSeatClick(seat: any) {
    if (seat.status !== "available") return

    if (!selectedPassenger) {
      alert("Select a passenger first")
      return
    }

    try {
      // 🔒 LOCK SEAT
      const lockRes = await fetch("/api/seats/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seatId: seat.id,
          bookingId
        })
      })

      const lockData = await lockRes.json()

      if (!lockData.success) {
        alert(lockData.error)
        return
      }

      // ✅ CONFIRM SEAT
      const confirmRes = await fetch("/api/seats/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passengerId: selectedPassenger,
          seatId: seat.id
        })
      })

      const confirmData = await confirmRes.json()

      if (!confirmData.success) {
        alert(confirmData.error)
        return
      }

      alert("Seat assigned successfully!")

      // 🔄 REFRESH SEATS
      fetch(`/api/seats?flightId=${flightId}`)
        .then(res => res.json())
        .then(data => setSeats(data.seats))

    } catch (err) {
      alert("Something went wrong")
    }
  }

  return (
    <div>
      <h1>Select Seat</h1>

      {/* ========================= */}
      {/* PASSENGER SELECTOR */}
      {/* ========================= */}
      <div style={{ marginBottom: 20 }}>
        <label>Select Passenger: </label>
        <select
          value={selectedPassenger}
          onChange={(e) => setSelectedPassenger(e.target.value)}
        >
          {passengers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.firstName} {p.lastName}
            </option>
          ))}
        </select>
      </div>

      {/* ========================= */}
      {/* SEAT GRID */}
      {/* ========================= */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 60px)", gap: 10 }}>
        {seats.map((seat: any) => (
          <button
            key={seat.id}
            onClick={() => handleSeatClick(seat)}
            style={{
              height: 50,
              cursor: seat.status === "available" ? "pointer" : "not-allowed",
              background:
                seat.status === "available"
                  ? "green"
                  : seat.status === "locked"
                  ? "orange"
                  : "red",
              color: "white",
              border: "none"
            }}
          >
            {seat.seatNumber}
          </button>
        ))}
      </div>
    </div>
  )
}