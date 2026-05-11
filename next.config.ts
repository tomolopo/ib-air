import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Leave pdfkit as a runtime require instead of bundling it, so that its
  // internal lookups for sibling assets (font metric .afm files in
  // node_modules/pdfkit/js/data) resolve correctly on Vercel.
  serverExternalPackages: ["pdfkit"],

  // Belt-and-braces: also explicitly include the font data files in the
  // serverless function's file trace so they're present in the deployment.
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/pdfkit/js/data/**/*"]
  }
}

export default nextConfig
