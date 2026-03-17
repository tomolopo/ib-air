"use client"

import { useState } from "react"

export default function SeatPage({ params }: any) {
  const { bookingId } = params
  const [selectedSeat, setSelectedSeat] = useState("")

  const seats = ["1A", "1B", "1C", "2A", "2B", "2C"]

  const handleSelect = async () => {
    await fetch("/api/seat", {
      method: "POST",
      body: JSON.stringify({
        bookingId,
        seat: selectedSeat
      })
    })

    alert("Seat selected 🎉")
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Select Your Seat</h2>

      <div style={{ display: "flex", gap: 10 }}>
        {seats.map(seat => (
          <button key={seat} onClick={() => setSelectedSeat(seat)}>
            {seat}
          </button>
        ))}
      </div>

      <button onClick={handleSelect}>Confirm Seat</button>
    </div>
  )
}