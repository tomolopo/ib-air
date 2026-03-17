"use client"

import { useState } from "react"

const rows = [1, 2, 3, 4, 5, 6]
const colsLeft = ["A", "B", "C"]
const colsRight = ["D", "E", "F"]

// Fake occupied seats
const occupiedSeats = ["1A", "2B", "3C"]

export default function SeatPage({ params }: any) {
  const { bookingId } = params

  const [selectedSeat, setSelectedSeat] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSelect = async () => {
    if (!selectedSeat) {
      alert("Please select a seat")
      return
    }

    setLoading(true)

    await fetch(`/api/booking/${bookingId}?type=seat`, {
      method: "POST",
      body: JSON.stringify({
        seat: selectedSeat
      })
    })

    alert(`Seat ${selectedSeat} confirmed 🎉`)
    setLoading(false)
  }

  const renderSeat = (seat: string) => {
    const isOccupied = occupiedSeats.includes(seat)
    const isSelected = selectedSeat === seat

    let bg = "#22c55e" // green

    if (isOccupied) bg = "#ef4444" // red
    if (isSelected) bg = "#3b82f6" // blue

    return (
      <button
        key={seat}
        disabled={isOccupied}
        onClick={() => setSelectedSeat(seat)}
        style={{
          width: 50,
          height: 50,
          margin: 5,
          backgroundColor: bg,
          color: "white",
          border: "none",
          borderRadius: 8,
          cursor: isOccupied ? "not-allowed" : "pointer"
        }}
      >
        {seat}
      </button>
    )
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>💺 Select Your Seat</h2>

      <div>
        {rows.map(row => (
          <div key={row} style={{ display: "flex", alignItems: "center" }}>
            
            {/* LEFT SIDE */}
            {colsLeft.map(col => renderSeat(`${row}${col}`))}

            {/* AISLE */}
            <div style={{ width: 40 }} />

            {/* RIGHT SIDE */}
            {colsRight.map(col => renderSeat(`${row}${col}`))}
          </div>
        ))}
      </div>

      <br />

        <div style={{ marginTop: 20 }}>
        <p>🟩 Available</p>
        <p>🟥 Occupied</p>
        <p>🟦 Selected</p>
        </div>

        <br />

      <button onClick={handleSelect} disabled={loading}>
        {loading ? "Saving..." : "Confirm Seat"}
      </button>
    </div>
  )
}