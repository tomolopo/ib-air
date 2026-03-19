import cloudinary from "@/lib/cloudinary"

export async function uploadTicket(buffer: Buffer, pnr: string) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "tickets",

        // ✅ THIS IS KEY
        public_id: `${pnr}.pdf`,

        resource_type: "raw",

        // ✅ FORCE FORMAT
        format: "pdf"
      },
      (error, result) => {
        if (error) return reject(error)
        resolve(result)
      }
    )

    stream.end(buffer)
  })
}