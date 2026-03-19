"use client"

import { Suspense } from "react"
import PayComponent from "./PayComponent"

export default function Page() {
  return (
    <Suspense fallback={<div>Loading payment...</div>}>
      <PayComponent />
    </Suspense>
  )
}