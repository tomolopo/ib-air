"use client"

import { useSearchParams } from "next/navigation"
import { useState, useEffect } from "react"

type BookingDetails = {
  pnr?: string
  passengerName?: string
  totalAmount?: number
  origin?: string
  destination?: string
  flightNumber?: string
  departureTime?: string
}

function formatCardNumber(val: string) {
  return val.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim()
}

function formatExpiry(val: string) {
  const digits = val.replace(/\D/g, "").slice(0, 4)
  if (digits.length >= 3) return digits.slice(0, 2) + "/" + digits.slice(2)
  return digits
}

function detectCardBrand(num: string): string {
  const n = num.replace(/\s/g, "")
  if (/^4/.test(n)) return "VISA"
  if (/^5[1-5]/.test(n)) return "MC"
  if (/^3[47]/.test(n)) return "AMEX"
  return ""
}

const BRAND_COLORS: Record<string, string> = {
  VISA: "#1a1f71",
  MC: "#eb001b",
  AMEX: "#2e77bc",
}

export default function PayComponent() {
  const params = useSearchParams()
  const bookingId = params.get("bookingId")

  const [booking, setBooking] = useState<BookingDetails>({})
  const [loadingBooking, setLoadingBooking] = useState(true)

  const [cardNumber, setCardNumber] = useState("")
  const [expiry, setExpiry] = useState("")
  const [cvv, setCvv] = useState("")
  const [cardHolder, setCardHolder] = useState("")

  const [processing, setProcessing] = useState(false)
  const [success, setSuccess] = useState(false)
  const [seatUrl, setSeatUrl] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [focusedField, setFocusedField] = useState<string | null>(null)

  const cardBrand = detectCardBrand(cardNumber)

  useEffect(() => {
    if (!bookingId) { setLoadingBooking(false); return }
    fetch(`/api/booking/${bookingId}`)
      .then(r => r.json())
      .then(data => {
        setBooking({
          pnr: data.booking?.pnr,
          passengerName: data.booking?.passengerName,
          totalAmount: data.booking?.totalAmount,
          origin: data.from,
          destination: data.to,
          flightNumber: data.flight?.flightNumber,
          departureTime: data.flight?.departureTime,
        })
      })
      .catch(() => {})
      .finally(() => setLoadingBooking(false))
  }, [bookingId])

  const handlePay = async () => {
    if (!bookingId) return
    setErrorMsg(null)
    setProcessing(true)

    try {
      const res = await fetch("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm_payment", bookingId }),
      })

      let data: any
      try { data = await res.json() } catch { throw new Error("Invalid server response") }

      if (!data.success) throw new Error(data.error || "Payment failed")

      setSuccess(true)
      setSeatUrl(data.seatSelectionUrl || null)
    } catch (err: any) {
      setErrorMsg(err.message || "Payment failed. Please try again.")
    } finally {
      setProcessing(false)
    }
  }

  const inputStyle = (field: string): React.CSSProperties => ({
    width: "100%",
    padding: "12px 14px",
    fontSize: 15,
    border: `1.5px solid ${focusedField === field ? "#6366f1" : "#e2e8f0"}`,
    borderRadius: 10,
    outline: "none",
    background: "#fff",
    color: "#1e293b",
    transition: "border-color 0.15s",
    boxSizing: "border-box",
  })

  const amount = booking.totalAmount ?? 0
  const formattedAmount = `$${amount.toLocaleString()}`

  if (!bookingId) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f1f5f9" }}>
        <div style={{ padding: "32px 40px", background: "#fff", borderRadius: 16, textAlign: "center", color: "#ef4444", fontFamily: "system-ui, sans-serif" }}>
          Missing booking ID.
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 16px",
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      <div style={{ width: "100%", maxWidth: 420 }}>

        {/* IB Air branding */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            background: "rgba(255,255,255,0.15)",
            backdropFilter: "blur(8px)",
            borderRadius: 50,
            padding: "8px 20px",
            color: "#fff",
          }}>
            <span style={{ fontSize: 20 }}>✈</span>
            <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>IB Air</span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.8)", marginTop: 8, fontSize: 14 }}>Secure Payment Checkout</p>
        </div>

        {/* Main card */}
        <div style={{
          background: "#fff",
          borderRadius: 20,
          overflow: "hidden",
          boxShadow: "0 25px 60px rgba(0,0,0,0.25)",
        }}>

          {/* Booking summary strip */}
          {!success && (
            <div style={{
              background: "linear-gradient(135deg, #1e293b 0%, #334155 100%)",
              padding: "20px 24px",
              color: "#fff",
            }}>
              {loadingBooking ? (
                <div style={{ textAlign: "center", opacity: 0.6, fontSize: 13 }}>Loading booking details...</div>
              ) : (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      {booking.origin && booking.destination && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 16, fontWeight: 700 }}>{booking.origin}</span>
                          <span style={{ fontSize: 12, opacity: 0.6 }}>✈</span>
                          <span style={{ fontSize: 16, fontWeight: 700 }}>{booking.destination}</span>
                        </div>
                      )}
                      {booking.flightNumber && (
                        <div style={{ fontSize: 12, opacity: 0.65 }}>{booking.flightNumber}</div>
                      )}
                      {booking.passengerName && (
                        <div style={{ fontSize: 13, marginTop: 4, opacity: 0.85 }}>{booking.passengerName}</div>
                      )}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 24, fontWeight: 800 }}>{formattedAmount}</div>
                      <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>USD</div>
                    </div>
                  </div>
                  {booking.pnr && (
                    <div style={{
                      marginTop: 14,
                      paddingTop: 14,
                      borderTop: "1px solid rgba(255,255,255,0.12)",
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 12,
                      opacity: 0.7,
                    }}>
                      <span>Booking Ref</span>
                      <span style={{ fontWeight: 700, letterSpacing: 1 }}>{booking.pnr}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Form body */}
          <div style={{ padding: "28px 24px 24px" }}>

            {success ? (
              /* ── Success State ── */
              <div style={{ textAlign: "center", padding: "16px 0 24px" }}>
                <div style={{
                  width: 72,
                  height: 72,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #10b981, #059669)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 20px",
                  boxShadow: "0 8px 24px rgba(16,185,129,0.35)",
                }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 700, color: "#1e293b" }}>Payment Confirmed</h2>
                <p style={{ margin: "0 0 6px", color: "#64748b", fontSize: 14 }}>Your booking is confirmed.</p>
                <p style={{ margin: "0 0 28px", color: "#64748b", fontSize: 14 }}>Now select your seat to complete check-in.</p>
                {seatUrl && (
                  <a
                    href={seatUrl}
                    style={{
                      display: "inline-block",
                      padding: "13px 36px",
                      background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                      color: "#fff",
                      borderRadius: 12,
                      fontWeight: 700,
                      fontSize: 15,
                      textDecoration: "none",
                      boxShadow: "0 4px 14px rgba(99,102,241,0.4)",
                    }}
                  >
                    Select Your Seat →
                  </a>
                )}
              </div>
            ) : (
              /* ── Payment Form ── */
              <>
                <h3 style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 700, color: "#1e293b" }}>Card Details</h3>

                {/* Card holder */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Cardholder Name
                  </label>
                  <input
                    placeholder="John Doe"
                    value={cardHolder}
                    onChange={e => setCardHolder(e.target.value)}
                    onFocus={() => setFocusedField("holder")}
                    onBlur={() => setFocusedField(null)}
                    style={inputStyle("holder")}
                  />
                </div>

                {/* Card number */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Card Number
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      placeholder="0000 0000 0000 0000"
                      value={cardNumber}
                      onChange={e => setCardNumber(formatCardNumber(e.target.value))}
                      onFocus={() => setFocusedField("card")}
                      onBlur={() => setFocusedField(null)}
                      maxLength={19}
                      inputMode="numeric"
                      style={{ ...inputStyle("card"), paddingRight: 72 }}
                    />
                    {cardBrand && (
                      <span style={{
                        position: "absolute",
                        right: 12,
                        top: "50%",
                        transform: "translateY(-50%)",
                        fontSize: 11,
                        fontWeight: 800,
                        color: BRAND_COLORS[cardBrand] ?? "#64748b",
                        letterSpacing: 0.5,
                      }}>
                        {cardBrand}
                      </span>
                    )}
                  </div>
                </div>

                {/* Expiry + CVV */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Expiry
                    </label>
                    <input
                      placeholder="MM/YY"
                      value={expiry}
                      onChange={e => setExpiry(formatExpiry(e.target.value))}
                      onFocus={() => setFocusedField("expiry")}
                      onBlur={() => setFocusedField(null)}
                      maxLength={5}
                      inputMode="numeric"
                      style={inputStyle("expiry")}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      CVV
                    </label>
                    <input
                      placeholder="•••"
                      value={cvv}
                      onChange={e => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      onFocus={() => setFocusedField("cvv")}
                      onBlur={() => setFocusedField(null)}
                      maxLength={4}
                      inputMode="numeric"
                      type="password"
                      style={inputStyle("cvv")}
                    />
                  </div>
                </div>

                {/* Error */}
                {errorMsg && (
                  <div style={{
                    marginBottom: 16,
                    padding: "12px 14px",
                    background: "#fef2f2",
                    border: "1px solid #fca5a5",
                    borderRadius: 10,
                    color: "#991b1b",
                    fontSize: 13,
                    fontWeight: 500,
                  }}>
                    {errorMsg}
                  </div>
                )}

                {/* Pay button */}
                <button
                  onClick={handlePay}
                  disabled={processing}
                  style={{
                    width: "100%",
                    padding: "14px",
                    background: processing
                      ? "linear-gradient(135deg, #a5b4fc, #c4b5fd)"
                      : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 12,
                    fontSize: 16,
                    fontWeight: 700,
                    cursor: processing ? "not-allowed" : "pointer",
                    boxShadow: processing ? "none" : "0 4px 14px rgba(99,102,241,0.45)",
                    transition: "all 0.2s",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  {processing ? (
                    <>
                      <span style={{
                        width: 16, height: 16, border: "2px solid rgba(255,255,255,0.4)",
                        borderTopColor: "#fff", borderRadius: "50%",
                        display: "inline-block",
                        animation: "spin 0.7s linear infinite",
                      }} />
                      Processing...
                    </>
                  ) : (
                    `Pay ${formattedAmount}`
                  )}
                </button>

                {/* Security note */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 16, color: "#94a3b8", fontSize: 12 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <span>256-bit SSL encrypted · Secure checkout</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <p style={{ textAlign: "center", color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 20 }}>
          Powered by IB Air · © {new Date().getFullYear()}
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
