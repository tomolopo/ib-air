"use client"

import { useSearchParams } from "next/navigation"
import { useState } from "react"

export default function PayComponent() {
  const params = useSearchParams()
  const bookingId = params.get("bookingId")

  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [message, setMessage] = useState("")

  const handlePayment = async () => {
    if (!bookingId) return

    setLoading(true)
    setMessage("Processing payment...")

    try {
      const res = await fetch("/api/payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "confirm_payment",
          bookingId
        })
      })

      const data = await res.json()

      console.log("PAYMENT RESPONSE:", data)

      if (!data.success) {
        throw new Error(data.error || "Payment failed")
      }

      // 🔥 Better UX steps
      setMessage("Generating your ticket...")
      setSuccess(true)

      // ✅ Redirect to ticket after short delay
      setTimeout(() => {
        window.location.href = data.ticketUrl
      }, 1500)

    } catch (err: any) {
      console.error(err)
      alert(err.message || "Payment failed")
    } finally {
      setLoading(false)
    }
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

          {loading && <p>⏳ {message}</p>}
        </>
      ) : (
        <>
          <h2>✅ Payment Successful!</h2>
          <p>{message}</p>
        </>
      )}
    </div>
  )
}