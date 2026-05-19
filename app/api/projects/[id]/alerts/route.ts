import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/auth"
import type { AlertSeverity } from "@prisma/client"

export const dynamic = "force-dynamic"

const severityOrder: Record<AlertSeverity, number> = {
  CRITICAL: 3,
  WARN: 2,
  INFO: 1,
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: projectId } = await params

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      organizationId: user.organizationId,
    },
    select: {
      id: true,
      name: true,
    },
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  const alertRecipients = await prisma.alertRecipient.findMany({
    where: {
      userId: user.id,
      alertEvent: {
        organizationId: user.organizationId,
        projectId,
        resolvedAt: null,
      },
    },
    include: {
      alertEvent: true,
    },
    orderBy: {
      alertEvent: {
        createdAt: "desc",
      },
    },
  })

  const sortedAlerts = alertRecipients.sort((a, b) => {
    const severityDiff =
      severityOrder[b.alertEvent.severity] - severityOrder[a.alertEvent.severity]
    if (severityDiff !== 0) return severityDiff
    return b.alertEvent.createdAt.getTime() - a.alertEvent.createdAt.getTime()
  })

  const alerts = sortedAlerts.map((recipient) => ({
    id: recipient.alertEvent.id,
    ruleType: recipient.alertEvent.ruleType,
    severity: recipient.alertEvent.severity,
    title: recipient.alertEvent.title,
    body: recipient.alertEvent.body,
    data: recipient.alertEvent.data,
    createdAt: recipient.alertEvent.createdAt,
    lastFiredAt: recipient.alertEvent.lastFiredAt,
    projectId: recipient.alertEvent.projectId,
    projectName: project.name,
    readAt: recipient.readAt,
    isRead: recipient.readAt !== null,
  }))

  return NextResponse.json({ alerts })
}
