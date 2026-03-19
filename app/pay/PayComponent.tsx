"use client"

import { useSearchParams } from "next/navigation"
import { useState } from "react"

export default function PayComponent() {
  const params = useSearchParams()
  const bookingId = params.get("bookingId")

  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handlePayment = async () => {
    if (!bookingId) return

    setLoading(true)

    await fetch("/api/payment", {
      method: "POST",
      body: JSON.stringify({
        action: "confirm_payment",
        bookingId
      })
    })

    setLoading(false)
    setSuccess(true)
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>💳 Complete Payment</h1>

      <p>Booking ID: {bookingId}</p>

      {!success ? (
        <>
          <input placeholder="Card Number" /><br /><br />
          <input placeholder="Expiry (MM/YY)" /><br /><br />
          <input placeholder="CVV" /><br /><br />

          <button onClick={handlePayment} disabled={loading}>
            {loading ? "Processing..." : "Pay Now"}
          </button>
        </>
      ) : (
        <h2>✅ Payment Successful!</h2>
      )}
    </div>
  )
}