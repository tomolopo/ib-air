"use client"

import { useState } from "react"

export default function PaymentPage({ params }: any) {
  const { bookingId } = params

  const [cardNumber, setCardNumber] = useState("")
  const [expiry, setExpiry] = useState("")
  const [cvv, setCvv] = useState("")
  const [pin, setPin] = useState("")
  const [loading, setLoading] = useState(false)

  const handlePay = async () => {
    setLoading(true)

    const res = await fetch("/api/payment", {
      method: "POST",
      body: JSON.stringify({
        action: "pay",
        bookingId,
        cardNumber,
        expiry,
        cvv,
        pin
      })
    })

    const data = await res.json()

    if (data.success) {
      alert("Payment successful 🎉")

      window.location.href = data.seatUrl
    } else {
      alert("Invalid card details ❌")
    }

    setLoading(false)
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Pay for Booking</h2>

      <input placeholder="Card Number" onChange={e => setCardNumber(e.target.value)} />
      <input placeholder="Expiry (MM/YY)" onChange={e => setExpiry(e.target.value)} />
      <input placeholder="CVV" onChange={e => setCvv(e.target.value)} />
      <input placeholder="PIN" onChange={e => setPin(e.target.value)} />

      <button onClick={handlePay} disabled={loading}>
        {loading ? "Processing..." : "Pay"}
      </button>
    </div>
  )
}