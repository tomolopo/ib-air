"use client"

import { useEffect, useState } from "react"

const LEFT_COLS = ["A", "B", "C"]
const RIGHT_COLS = ["D", "E", "F"]
const BUSINESS_ROWS = [1, 2, 3, 4, 5]

type SeatStatus = "available" | "locked" | "booked"

type Seat = {
  id: string
  seatNumber: string
  status: SeatStatus
}

type Passenger = {
  id: string
  firstName: string
  lastName: string
  seat: string | null
}

const STATUS_COLORS: Record<string, string> = {
  available: "#22c55e",
  locked: "#f97316",
  booked: "#ef4444",
  selected: "#3b82f6",
}

export default function SeatsPage() {
  const [seats, setSeats] = useState<Seat[]>([])
  const [passengers, setPassengers] = useState<Passenger[]>([])
  const [selectedPassenger, setSelectedPassenger] = useState<string>("")
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState<{ text: string; success: boolean } | null>(null)

  const params = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search)
    : null

  const flightId = params?.get("flightId")
  const bookingId = params?.get("bookingId")

  useEffect(() => {
    if (!flightId || !bookingId) return
    loadSeats()
    fetch(`/api/booking/passengers?bookingId=${bookingId}`)
      .then(res => res.json())
      .then(data => {
        const pax = data.passengers || []
        setPassengers(pax)
        setSelectedPassenger(pax[0]?.id || "")
      })
  }, [flightId, bookingId])

  function loadSeats() {
    fetch(`/api/seats?flightId=${flightId}`)
      .then(res => res.json())
      .then(data => setSeats(data.seats || []))
  }

  // Build a map: row → col → Seat
  const seatMap = new Map<number, Map<string, Seat>>()
  for (const seat of seats) {
    const col = seat.seatNumber.slice(-1)
    const row = parseInt(seat.seatNumber.slice(0, -1))
    if (!seatMap.has(row)) seatMap.set(row, new Map())
    seatMap.get(row)!.set(col, seat)
  }
  const rows = [...seatMap.keys()].sort((a, b) => a - b)

  const selectedSeat = seats.find(s => s.id === selectedSeatId)

  function handleSeatClick(seat: Seat) {
    if (seat.status !== "available") return
    setMessage(null)
    setSelectedSeatId(prev => prev === seat.id ? null : seat.id)
  }

  async function handleConfirm() {
    if (!selectedSeatId || !selectedPassenger) return
    setConfirming(true)
    setMessage(null)

    try {
      const lockRes = await fetch("/api/seats/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seatId: selectedSeatId, bookingId })
      })
      const lockData = await lockRes.json()
      if (!lockData.success) {
        setMessage({ text: lockData.error || "Could not lock seat. Try another.", success: false })
        setConfirming(false)
        return
      }

      const confirmRes = await fetch("/api/seats/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passengerId: selectedPassenger, seatId: selectedSeatId })
      })
      const confirmData = await confirmRes.json()
      if (!confirmData.success) {
        setMessage({ text: confirmData.error || "Could not confirm seat.", success: false })
        setConfirming(false)
        return
      }

      setSelectedSeatId(null)
      loadSeats()

      if (confirmData.ticketUrl) {
        setMessage({
          text: `Seat ${confirmData.seatAssigned} confirmed! Opening your boarding pass...`,
          success: true
        })
        setTimeout(() => {
          window.location.href = confirmData.ticketUrl
        }, 1500)
      } else {
        setMessage({
          text: `Seat ${confirmData.seatAssigned} confirmed! Your boarding pass is being generated — please refresh in a moment.`,
          success: true
        })
        setConfirming(false)
      }
    } catch {
      setMessage({ text: "Something went wrong. Please try again.", success: false })
      setConfirming(false)
    }
  }

  function getSeatColor(seat: Seat) {
    if (seat.id === selectedSeatId) return STATUS_COLORS.selected
    return STATUS_COLORS[seat.status] ?? "#6b7280"
  }

  function renderSeat(row: number, col: string) {
    const seat = seatMap.get(row)?.get(col)
    if (!seat) return <div key={col} style={{ width: 42, height: 38 }} />

    const isSelected = seat.id === selectedSeatId
    const isBusiness = BUSINESS_ROWS.includes(row)

    return (
      <button
        key={col}
        onClick={() => handleSeatClick(seat)}
        disabled={seat.status !== "available"}
        title={`${seat.seatNumber} — ${seat.status}`}
        style={{
          width: isBusiness ? 48 : 42,
          height: isBusiness ? 44 : 38,
          borderRadius: "6px 6px 4px 4px",
          background: getSeatColor(seat),
          border: isSelected ? "2px solid #1d4ed8" : "1px solid rgba(0,0,0,0.12)",
          color: "white",
          fontSize: 10,
          fontWeight: 700,
          cursor: seat.status === "available" ? "pointer" : "not-allowed",
          opacity: seat.status === "booked" ? 0.7 : 1,
          transition: "transform 0.1s, box-shadow 0.1s",
          boxShadow: isSelected ? "0 0 0 3px rgba(59,130,246,0.3)" : "0 1px 3px rgba(0,0,0,0.15)",
        }}
      >
        {seat.seatNumber}
      </button>
    )
  }

  return (
    <div style={{ padding: 24, maxWidth: 500, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b" }}>Select Your Seat</h2>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>Tap an available seat, then confirm</p>
      </div>

      {/* Passenger selector */}
      {passengers.length > 1 && (
        <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>Passenger:</label>
          <select
            value={selectedPassenger}
            onChange={e => { setSelectedPassenger(e.target.value); setSelectedSeatId(null) }}
            style={{ flex: 1, padding: "6px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13 }}
          >
            {passengers.map(p => (
              <option key={p.id} value={p.id}>
                {p.firstName} {p.lastName}{p.seat ? ` — Seat ${p.seat}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Aircraft body */}
      <div style={{
        background: "#f8fafc",
        border: "2px solid #cbd5e1",
        borderRadius: "80px 80px 24px 24px",
        padding: "20px 12px 16px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
        position: "relative",
      }}>

        {/* Front label */}
        <div style={{ textAlign: "center", marginBottom: 10, fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: 3 }}>
          ✈ FRONT
        </div>

        {/* Column headers */}
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", marginBottom: 6 }}>
          <div style={{ width: 28 }} /> {/* row number spacer */}
          <div style={{ display: "flex", gap: 6 }}>
            {LEFT_COLS.map(col => (
              <div key={col} style={{ width: 42, textAlign: "center", fontSize: 11, fontWeight: 700, color: "#64748b" }}>{col}</div>
            ))}
          </div>
          <div style={{ width: 32 }} /> {/* aisle */}
          <div style={{ display: "flex", gap: 6 }}>
            {RIGHT_COLS.map(col => (
              <div key={col} style={{ width: 42, textAlign: "center", fontSize: 11, fontWeight: 700, color: "#64748b" }}>{col}</div>
            ))}
          </div>
          <div style={{ width: 28 }} /> {/* row number spacer */}
        </div>

        {/* Seat rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 480, overflowY: "auto" }}>
          {rows.map((row, i) => {
            const isBusiness = BUSINESS_ROWS.includes(row)
            const prevIsBusiness = i > 0 ? BUSINESS_ROWS.includes(rows[i - 1]) : false
            const showDivider = i > 0 && isBusiness !== prevIsBusiness

            return (
              <div key={row}>
                {/* Class divider */}
                {showDivider && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0" }}>
                    <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", letterSpacing: 1 }}>ECONOMY</span>
                    <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
                  </div>
                )}
                {i === 0 && isBusiness && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", letterSpacing: 1 }}>BUSINESS</span>
                    <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {/* Left row number */}
                  <div style={{ width: 28, textAlign: "right", fontSize: 10, color: "#94a3b8", paddingRight: 4 }}>{row}</div>

                  {/* Left seats */}
                  <div style={{ display: "flex", gap: 6 }}>
                    {LEFT_COLS.map(col => renderSeat(row, col))}
                  </div>

                  {/* Aisle */}
                  <div style={{ width: 32, textAlign: "center", fontSize: 9, color: "#cbd5e1" }}>|</div>

                  {/* Right seats */}
                  <div style={{ display: "flex", gap: 6 }}>
                    {RIGHT_COLS.map(col => renderSeat(row, col))}
                  </div>

                  {/* Right row number */}
                  <div style={{ width: 28, textAlign: "left", fontSize: 10, color: "#94a3b8", paddingLeft: 4 }}>{row}</div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Rear label */}
        <div style={{ textAlign: "center", marginTop: 12, fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: 3 }}>
          REAR
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 14, flexWrap: "wrap" }}>
        {[
          { color: STATUS_COLORS.available, label: "Available" },
          { color: STATUS_COLORS.locked, label: "Locked" },
          { color: STATUS_COLORS.booked, label: "Taken" },
          { color: STATUS_COLORS.selected, label: "Selected" },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 13, height: 13, borderRadius: 3, background: color }} />
            <span style={{ fontSize: 12, color: "#475569" }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Confirm panel */}
      {selectedSeat && (
        <div style={{
          marginTop: 20,
          padding: "16px 20px",
          background: "#eff6ff",
          borderRadius: 12,
          border: "1px solid #bfdbfe",
          textAlign: "center"
        }}>
          <p style={{ margin: "0 0 12px", fontWeight: 600, color: "#1e40af", fontSize: 15 }}>
            Seat {selectedSeat.seatNumber} selected
          </p>
          <button
            onClick={handleConfirm}
            disabled={confirming}
            style={{
              padding: "10px 36px",
              background: confirming ? "#93c5fd" : "#2563eb",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: confirming ? "not-allowed" : "pointer",
            }}
          >
            {confirming ? "Confirming..." : "Confirm Seat"}
          </button>
        </div>
      )}

      {/* Status message */}
      {message && (
        <div style={{
          marginTop: 16,
          padding: "12px 16px",
          background: message.success ? "#f0fdf4" : "#fef2f2",
          border: `1px solid ${message.success ? "#86efac" : "#fca5a5"}`,
          borderRadius: 8,
          textAlign: "center",
          color: message.success ? "#166534" : "#991b1b",
          fontSize: 13,
          fontWeight: 500
        }}>
          {message.text}
        </div>
      )}
    </div>
  )
}
