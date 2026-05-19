import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getUserWithOrganization } from "@/lib/replit-auth"

export async function GET(request: NextRequest) {
  const user = await getUserWithOrganization()
  if (!user || user.approvalStatus !== "APPROVED" || !user.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const organizationId = user.organizationId

  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get("q") || ""

  if (!query.trim()) {
    return NextResponse.json([])
  }

  const searchTerm = `%${query}%`

  try {
    const [clients, projects, opportunities, vendors, people, contracts] = await Promise.all([
      prisma.client.findMany({
        where: {
          organizationId,
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { industry: { contains: query, mode: "insensitive" } },
          ],
        },
        take: 5,
        select: { id: true, name: true, industry: true },
      }),
      prisma.project.findMany({
        where: {
          organizationId,
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { client: { name: { contains: query, mode: "insensitive" } } },
          ],
        },
        take: 5,
        select: { id: true, name: true, client: { select: { name: true } } },
      }),
      prisma.opportunity.findMany({
        where: {
          organizationId,
          OR: [
            { eventType: { contains: query, mode: "insensitive" } },
            { client: { name: { contains: query, mode: "insensitive" } } },
          ],
        },
        take: 5,
        select: { id: true, eventType: true, client: { select: { name: true } } },
      }),
      prisma.vendor.findMany({
        where: {
          organizationId,
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { categories: { contains: query, mode: "insensitive" } },
          ],
        },
        take: 5,
        select: { id: true, name: true, categories: true },
      }),
      prisma.person.findMany({
        where: {
          organizationId,
          OR: [
            { firstName: { contains: query, mode: "insensitive" } },
            { lastName: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
          ],
        },
        take: 5,
        select: { id: true, firstName: true, lastName: true, type: true },
      }),
      prisma.contract.findMany({
        where: {
          project: { organizationId },
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { vendor: { name: { contains: query, mode: "insensitive" } } },
          ],
        },
        take: 5,
        select: { id: true, name: true, vendor: { select: { name: true } }, projectId: true },
      }),
    ])

    const results = [
      ...clients.map((c) => ({
        id: c.id,
        type: "client" as const,
        name: c.name,
        subtitle: c.industry || undefined,
      })),
      ...projects.map((p) => ({
        id: p.id,
        type: "project" as const,
        name: p.name,
        subtitle: p.client?.name || undefined,
      })),
      ...opportunities.map((o) => ({
        id: o.id,
        type: "opportunity" as const,
        name: o.client?.name || "Unknown Client",
        subtitle: o.eventType || undefined,
      })),
      ...vendors.map((v) => ({
        id: v.id,
        type: "vendor" as const,
        name: v.name,
        subtitle: v.categories || undefined,
      })),
      ...people.map((p) => ({
        id: p.id,
        type: "person" as const,
        name: `${p.firstName} ${p.lastName}`,
        subtitle: p.type || undefined,
      })),
      ...contracts.map((c) => ({
        id: c.projectId,
        type: "contract" as const,
        name: c.name,
        subtitle: c.vendor?.name || undefined,
      })),
    ]

    return NextResponse.json(results.slice(0, 20))
  } catch (error) {
    console.error("Search error:", error)
    return NextResponse.json({ error: "Search failed" }, { status: 500 })
  }
}
