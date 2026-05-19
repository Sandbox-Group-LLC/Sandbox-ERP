import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuthWithOrg } from "@/lib/session"
import { getGoogleSheetsClient } from "@/lib/google-drive"

export const dynamic = "force-dynamic"

function extractSpreadsheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  return match ? match[1] : null
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z]/g, "")
}

const HEADER_MAP: Record<string, string> = {
  firstname: "firstName",
  first: "firstName",
  lastname: "lastName",
  last: "lastName",
  email: "email",
  emailaddress: "email",
  company: "company",
  organization: "company",
  org: "company",
  role: "role",
  title: "role",
  wwid: "wwid",
  hotel: "hotel",
  hotelname: "hotel",
  property: "hotel",
  roomtype: "roomType",
  room: "roomType",
  ratetype: "roomType",
  rate: "roomType",
  checkin: "checkIn",
  checkindate: "checkIn",
  arrival: "checkIn",
  arrivaldate: "checkIn",
  checkout: "checkOut",
  checkoutdate: "checkOut",
  departure: "checkOut",
  departuredate: "checkOut",
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthWithOrg()
    const { id: projectId } = await params

    const project = await prisma.project.findFirst({
      where: { id: projectId, organizationId: user.organizationId },
      select: { id: true },
    })
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    const body = await req.json()
    const { sheetUrl } = body
    if (!sheetUrl || typeof sheetUrl !== "string") {
      return NextResponse.json({ error: "sheetUrl is required" }, { status: 400 })
    }

    const spreadsheetId = extractSpreadsheetId(sheetUrl)
    if (!spreadsheetId) {
      return NextResponse.json({ error: "Could not extract spreadsheet ID from URL. Make sure you paste a valid Google Sheets link." }, { status: 400 })
    }

    const sheets = await getGoogleSheetsClient(user.organizationId)

    const meta = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets.properties.title",
    })
    const firstSheetTitle = meta.data.sheets?.[0]?.properties?.title || "Sheet1"

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: firstSheetTitle,
    })

    const values = response.data.values
    if (!values || values.length < 2) {
      return NextResponse.json({ error: "Sheet is empty or has no data rows" }, { status: 400 })
    }

    const headerRow = values[0]
    const columnMap: Record<string, number> = {}
    for (let i = 0; i < headerRow.length; i++) {
      const normalized = normalizeHeader(headerRow[i] || "")
      const mapped = HEADER_MAP[normalized]
      if (mapped && !(mapped in columnMap)) {
        columnMap[mapped] = i
      }
    }

    const missingColumns = []
    if (!("firstName" in columnMap)) missingColumns.push("First Name")
    if (!("lastName" in columnMap)) missingColumns.push("Last Name")
    if (missingColumns.length > 0) {
      return NextResponse.json(
        { error: `Missing required columns: ${missingColumns.join(", ")}. Found headers: ${headerRow.join(", ")}` },
        { status: 400 }
      )
    }

    const rows = values.slice(1)
    const guests: { firstName: string; lastName: string; email: string; company: string; role: string; wwid: string; hotel: string; roomType: string; checkIn: string; checkOut: string }[] = []

    for (const row of rows) {
      const firstName = ("firstName" in columnMap ? (row[columnMap.firstName] || "") : "").trim()
      const lastName = ("lastName" in columnMap ? (row[columnMap.lastName] || "") : "").trim()
      const email = ("email" in columnMap ? (row[columnMap.email] || "") : "").trim()
      const company = ("company" in columnMap ? (row[columnMap.company] || "") : "").trim()
      const role = ("role" in columnMap ? (row[columnMap.role] || "") : "").trim()
      const wwid = ("wwid" in columnMap ? (row[columnMap.wwid] || "") : "").trim()
      const hotel = ("hotel" in columnMap ? (row[columnMap.hotel] || "") : "").trim()
      const roomType = ("roomType" in columnMap ? (row[columnMap.roomType] || "") : "").trim()
      const checkIn = ("checkIn" in columnMap ? (row[columnMap.checkIn] || "") : "").trim()
      const checkOut = ("checkOut" in columnMap ? (row[columnMap.checkOut] || "") : "").trim()

      if (!firstName && !lastName && !email && !company && !role && !wwid) continue

      guests.push({ firstName, lastName, email, company, role, wwid, hotel, roomType, checkIn, checkOut })
    }

    return NextResponse.json(guests)
  } catch (error: any) {
    console.error("Import sheet error:", error)
    const msg = error?.message || "Failed to read Google Sheet"
    if (msg.includes("not found") || msg.includes("403") || msg.includes("404")) {
      return NextResponse.json(
        { error: "Could not access this Google Sheet. Make sure the sheet is shared publicly or with anyone who has the link." },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
