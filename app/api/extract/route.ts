import { NextRequest, NextResponse } from "next/server"

// Nigerian airport city → IATA code lookup
const AIRPORT_CODES: Record<string, string> = {
  lagos: "LOS",
  abuja: "ABV",
  "port harcourt": "PHC",
  kano: "KAN",
  enugu: "ENU",
  owerri: "QOW",
  ibadan: "IBA",
  warri: "QRW",
  "benin city": "BNI",
  calabar: "CBQ",
  ilorin: "ILR",
  jos: "JOS",
  kaduna: "KAD",
  maiduguri: "MIU",
  sokoto: "SKO",
  yola: "YOL",
  akure: "AKR",
  asaba: "ABB",
  ife: "IFE",
}

function extractRoute(text: string) {
  const fromTo = text.match(
    /from\s+([a-z][a-z\s]*?)\s+to\s+([a-z][a-z\s]*?)(?:\s+for|\s+on|\s+a\s|\s+flight|\s*$|[,.])/i
  )
  if (fromTo) {
    return { origin: fromTo[1].trim().toLowerCase(), destination: fromTo[2].trim().toLowerCase() }
  }
  return { origin: null, destination: null }
}

function extractName(text: string) {
  // "for [First Last]" — most common booking pattern
  const forMatch = text.match(/\bfor\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/)
  if (forMatch) {
    const parts = forMatch[1].trim().split(/\s+/)
    if (parts.length >= 2) {
      return { firstName: parts[0], lastName: parts.slice(1).join(" ") }
    }
  }
  // "I am / I'm / my name is [First Last]"
  const nameMatch = text.match(
    /(?:i\s+am|i'm|my\s+name\s+is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i
  )
  if (nameMatch) {
    const parts = nameMatch[1].trim().split(/\s+/)
    if (parts.length >= 2) {
      return { firstName: parts[0], lastName: parts.slice(1).join(" ") }
    }
  }
  return { firstName: null, lastName: null }
}

function extractEmail(text: string) {
  const match = text.match(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/)
  return match ? match[0] : null
}

function extractPhone(text: string) {
  // Nigerian mobile: 0703..., 0803..., +234803..., 234803...
  const match = text.match(/(?:\+?234|0)([789][01]\d{8})\b/)
  return match ? `0${match[1]}` : null
}

function extractPassport(text: string) {
  // Nigerian passport: 1 letter + 8 digits (A12345678) or similar formats
  const match = text.match(/\b([A-Z][0-9]{7,8})\b/)
  return match ? match[1] : null
}

function extractNationality(text: string) {
  const nationalities = [
    "nigerian", "ghanaian", "kenyan", "south african", "british", "american",
    "canadian", "french", "german", "italian", "spanish", "chinese", "indian",
    "cameroonian", "senegalese", "ivorian", "beninese", "togolese", "rwandan",
    "ugandan", "tanzanian", "ethiopian", "congolese", "angolan",
  ]
  const lower = text.toLowerCase()
  for (const nat of nationalities) {
    if (lower.includes(nat)) return nat.charAt(0).toUpperCase() + nat.slice(1)
  }
  return null
}

function extractTripType(text: string): "one_way" | "return" | null {
  const lower = text.toLowerCase()
  if (/one[\s-]?way/i.test(lower)) return "one_way"
  if (/return|round[\s-]?trip/i.test(lower)) return "return"
  return null
}

function extractPassengerCount(text: string): number | null {
  const patterns = [
    /(\d+)\s*passenger/i,
    /(\d+)\s*person/i,
    /(\d+)\s*people/i,
    /(\d+)\s*travell?er/i,
    /travelling\s+with\s+(\d+)/i,
    /traveling\s+with\s+(\d+)/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      const n = parseInt(match[1], 10)
      if (n > 0 && n <= 9) return n
    }
  }
  // "for X" only when no other contextual tokens conflict
  const forCount = text.match(/\bfor\s+(\d+)\b/)
  if (forCount) {
    const n = parseInt(forCount[1], 10)
    if (n > 0 && n <= 9) return n
  }
  return null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { message } = body

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "message is required" }, { status: 400 })
    }

    const { origin, destination } = extractRoute(message)
    const { firstName, lastName } = extractName(message)

    const extracted = {
      origin,
      destination,
      originCode: origin ? (AIRPORT_CODES[origin] ?? null) : null,
      destinationCode: destination ? (AIRPORT_CODES[destination] ?? null) : null,
      firstName,
      lastName,
      email: extractEmail(message),
      phone: extractPhone(message),
      passport: extractPassport(message),
      nationality: extractNationality(message),
      tripType: extractTripType(message),
      passengerCount: extractPassengerCount(message),
    }

    return NextResponse.json({ success: true, extracted })

  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Extraction failed" },
      { status: 500 }
    )
  }
}
