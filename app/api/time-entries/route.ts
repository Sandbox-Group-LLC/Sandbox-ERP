import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/session"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user || !user.organizationId || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const personId = searchParams.get("personId")
  const weekStart = searchParams.get("weekStart")
  const submittedOnly = searchParams.get("submittedOnly") === "true"

  if (!personId) {
    return NextResponse.json({ error: "personId is required" }, { status: 400 })
  }

  const person = await prisma.person.findFirst({
    where: { id: personId, organizationId: user.organizationId },
  })

  if (!person) {
    return NextResponse.json({ error: "Person not found" }, { status: 404 })
  }

  const whereClause: any = { personId }
  
  if (weekStart) {
    whereClause.weekStart = new Date(weekStart)
  }
  
  if (submittedOnly) {
    whereClause.submittedAt = { not: null }
  }

  const entries = await prisma.timeEntry.findMany({
    where: whereClause,
    orderBy: [
      { weekStart: "desc" },
      { laborType: "asc" },
    ],
  })

  return NextResponse.json(entries)
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user || !user.organizationId || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { personId, weekStart, entries, submit, unsubmit } = body

  if (!personId || !weekStart || !entries) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  const person = await prisma.person.findFirst({
    where: { id: personId, organizationId: user.organizationId },
  })

  if (!person) {
    return NextResponse.json({ error: "Person not found" }, { status: 404 })
  }

  const weekStartDate = new Date(weekStart)
  let submittedAt: Date | null = null
  if (submit) {
    submittedAt = new Date()
  } else if (unsubmit) {
    submittedAt = null
  }

  const upsertedEntries = await Promise.all(
    entries.map((entry: any) =>
      prisma.timeEntry.upsert({
        where: {
          personId_weekStart_laborType: {
            personId,
            weekStart: weekStartDate,
            laborType: entry.laborType,
          },
        },
        update: {
          monday: entry.monday || 0,
          tuesday: entry.tuesday || 0,
          wednesday: entry.wednesday || 0,
          thursday: entry.thursday || 0,
          friday: entry.friday || 0,
          submittedAt,
        },
        create: {
          personId,
          weekStart: weekStartDate,
          laborType: entry.laborType,
          monday: entry.monday || 0,
          tuesday: entry.tuesday || 0,
          wednesday: entry.wednesday || 0,
          thursday: entry.thursday || 0,
          friday: entry.friday || 0,
          submittedAt,
        },
      })
    )
  )

  return NextResponse.json(upsertedEntries)
}
