import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Leave pdfkit and sharp as runtime requires instead of bundling them.
  // - pdfkit reads font metric .afm files from its own node_modules dir at
  //   runtime, so it must not be bundled or those lookups break on Vercel.
  // - sharp is a native module shipped with Next for image optimisation;
  //   externalising it lets us use it to rasterise the SVG logo for the
  //   boarding pass without webpack trying to bundle its native binary.
  serverExternalPackages: ["pdfkit", "sharp"],

  // Belt-and-braces: also explicitly include the font data files in the
  // serverless function's file trace so they're present in the deployment.
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/pdfkit/js/data/**/*"]
  }
}

export default nextConfig
