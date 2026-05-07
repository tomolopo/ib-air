import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      "/api/**": ["./node_modules/pdfkit/js/data/**"]
    }
  }
}

export default nextConfig
