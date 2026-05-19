import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getUserWithOrganization } from "@/lib/replit-auth"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserWithOrganization()
  if (!user || user.approvalStatus !== "APPROVED" || !user.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  try {
    const project = await prisma.project.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
      },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
      },
    })

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    const reservations = await prisma.assetReservation.findMany({
      where: {
        projectId: id,
      },
      include: {
        asset: {
          select: {
            id: true,
            name: true,
            category: true,
            condition: true,
            status: true,
            quantity: true,
            location: true,
            imageUrl: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
            startDate: true,
            endDate: true,
          },
        },
      },
      orderBy: {
        startDate: "asc",
      },
    })

    return NextResponse.json(reservations)
  } catch (error) {
    console.error("Error fetching project asset reservations:", error)
    return NextResponse.json({ error: "Failed to fetch asset reservations" }, { status: 500 })
  }
}
