"use server"

import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/session"
import { revalidatePath } from "next/cache"

async function verifyProjectAccess(projectId: string) {
  const user = await requireAuth()
  if (!user.organizationId) throw new Error("Not authorized")
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: user.organizationId },
    select: { id: true },
  })
  if (!project) throw new Error("Project not found")
  return user
}

export interface CanvasBlock {
  id: string
  type: "link" | "text" | "divider" | "checklist"
  title?: string
  url?: string
  description?: string
  content?: string
  items?: Array<{ id: string; text: string; checked: boolean }>
}

export async function getCanvas(projectId: string, canvasType: string = "internal"): Promise<CanvasBlock[]> {
  const user = await requireAuth()
  if (!user.organizationId) return []

  const canvas = await prisma.projectCanvas.findUnique({
    where: { projectId_canvasType: { projectId, canvasType } },
  })

  if (!canvas) return []
  return (canvas.content as unknown) as CanvasBlock[]
}

export async function saveCanvas(projectId: string, blocks: CanvasBlock[], canvasType: string = "internal") {
  const user = await verifyProjectAccess(projectId)

  await prisma.projectCanvas.upsert({
    where: { projectId_canvasType: { projectId, canvasType } },
    create: {
      projectId,
      canvasType,
      content: blocks as unknown as any,
      lastEditedBy: user.name || user.email || "Unknown",
      lastEditedAt: new Date(),
    },
    update: {
      content: blocks as unknown as any,
      lastEditedBy: user.name || user.email || "Unknown",
      lastEditedAt: new Date(),
    },
  })

  revalidatePath(`/projects/${projectId}`)
}

export async function getCanvasMeta(projectId: string, canvasType: string = "internal"): Promise<{ lastEditedBy: string | null; lastEditedAt: string | null; blockCount: number }> {
  const user = await requireAuth()
  if (!user.organizationId) return { lastEditedBy: null, lastEditedAt: null, blockCount: 0 }

  const canvas = await prisma.projectCanvas.findUnique({
    where: { projectId_canvasType: { projectId, canvasType } },
    select: { lastEditedBy: true, lastEditedAt: true, content: true },
  })

  if (!canvas) return { lastEditedBy: null, lastEditedAt: null, blockCount: 0 }
  const blocks = Array.isArray(canvas.content) ? canvas.content : []
  return {
    lastEditedBy: canvas.lastEditedBy,
    lastEditedAt: canvas.lastEditedAt?.toISOString() || null,
    blockCount: blocks.length,
  }
}
