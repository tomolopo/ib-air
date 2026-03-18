import cloudinary from "@/lib/cloudinary"

export async function uploadTicket(buffer: Buffer, pnr: string) {
  return new Promise<any>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "tickets",
        public_id: pnr,
        resource_type: "raw" // 🔥 REQUIRED FOR PDF
      },
      (error, result) => {
        if (error) return reject(error)
        resolve(result)
      }
    )

    stream.end(buffer)
  })
}