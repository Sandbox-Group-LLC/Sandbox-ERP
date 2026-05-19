import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import ExcelJS from "exceljs"

const LABOR_TYPE_CONFIG: Record<string, { label: string; rate: number }> = {
  BILLABLE: { label: "Billable Hours", rate: 100 },
  BUSINESS_DEV: { label: "Business Development", rate: 60 },
  OPS_ADMIN: { label: "Ops & Admin", rate: 40 },
  SYSTEMS_IP: { label: "Systems / IP", rate: 65 },
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user || !user.organizationId || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const personId = searchParams.get("personId")

  if (!personId) {
    return NextResponse.json({ error: "personId is required" }, { status: 400 })
  }

  const person = await prisma.person.findFirst({
    where: { id: personId, organizationId: user.organizationId },
  })

  if (!person) {
    return NextResponse.json({ error: "Person not found" }, { status: 404 })
  }

  const entries = await prisma.timeEntry.findMany({
    where: { 
      personId,
      submittedAt: { not: null },
    },
    orderBy: [
      { weekStart: "desc" },
      { laborType: "asc" },
    ],
  })

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Time Entries")

  sheet.columns = [
    { header: "Week Starting", key: "weekStart", width: 15 },
    { header: "Labor Type", key: "laborType", width: 22 },
    { header: "Rate", key: "rate", width: 10 },
    { header: "Monday", key: "monday", width: 10 },
    { header: "Tuesday", key: "tuesday", width: 10 },
    { header: "Wednesday", key: "wednesday", width: 10 },
    { header: "Thursday", key: "thursday", width: 10 },
    { header: "Friday", key: "friday", width: 10 },
    { header: "Hours", key: "total", width: 10 },
    { header: "Earnings", key: "earnings", width: 12 },
    { header: "Submitted At", key: "submittedAt", width: 20 },
  ]

  sheet.getRow(1).font = { bold: true }
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE0E0E0" },
  }

  entries.forEach((entry) => {
    const config = LABOR_TYPE_CONFIG[entry.laborType] || { label: entry.laborType, rate: 0 }
    const total = entry.monday + entry.tuesday + entry.wednesday + entry.thursday + entry.friday
    const earnings = total * config.rate
    sheet.addRow({
      weekStart: entry.weekStart.toISOString().split("T")[0],
      laborType: config.label,
      rate: `$${config.rate}`,
      monday: entry.monday,
      tuesday: entry.tuesday,
      wednesday: entry.wednesday,
      thursday: entry.thursday,
      friday: entry.friday,
      total,
      earnings: `$${earnings.toFixed(2)}`,
      submittedAt: entry.submittedAt?.toISOString().replace("T", " ").slice(0, 19) || "",
    })
  })

  const buffer = await workbook.xlsx.writeBuffer()

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${person.name.replace(/[^a-zA-Z0-9]/g, "_")}_time_entries.xlsx"`,
    },
  })
}
