import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/pdfkit/js/data/**"]
  }
}

export default nextConfig
