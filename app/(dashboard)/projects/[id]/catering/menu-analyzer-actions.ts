"use server"

import { prisma } from "@/lib/prisma"
import { requireAuthWithOrg } from "@/lib/session"
import { revalidatePath } from "next/cache"

async function verifyProjectAccess(projectId: string) {
  const user = await requireAuthWithOrg()
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: user.organizationId },
    select: { id: true },
  })
  if (!project) throw new Error("Project not found")
  return user
}

export async function getMenuTemplates(projectId: string) {
  await verifyProjectAccess(projectId)
  return prisma.menuTemplate.findMany({
    where: { projectId },
    include: {
      categories: {
        orderBy: { sortOrder: "asc" },
        include: {
          items: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })
}

export async function getMenuTemplate(projectId: string, templateId: string) {
  await verifyProjectAccess(projectId)
  const template = await prisma.menuTemplate.findFirst({
    where: { id: templateId, projectId },
    include: {
      categories: {
        orderBy: { sortOrder: "asc" },
        include: {
          items: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
  })
  if (!template) throw new Error("Menu template not found")
  return template
}

export type ParsedMenuData = {
  name: string
  serviceChargePct: number
  taxPct: number
  minimumGuests: number | null
  notes: string | null
  categories: {
    name: string
    items: {
      name: string
      description: string | null
      pricePerPerson: number | null
      additionalFee: number | null
      additionalFeeNote: string | null
      notes: string | null
    }[]
  }[]
}

export async function saveMenuTemplate(
  projectId: string,
  data: ParsedMenuData,
  sourceFileName?: string
) {
  await verifyProjectAccess(projectId)

  const template = await prisma.menuTemplate.create({
    data: {
      projectId,
      name: data.name,
      sourceFileName: sourceFileName || null,
      serviceChargePct: data.serviceChargePct,
      taxPct: data.taxPct,
      minimumGuests: data.minimumGuests,
      notes: data.notes,
      categories: {
        create: data.categories.map((cat, catIdx) => ({
          name: cat.name,
          sortOrder: catIdx,
          items: {
            create: cat.items.map((item, itemIdx) => ({
              name: item.name,
              description: item.description,
              pricePerPerson: item.pricePerPerson,
              additionalFee: item.additionalFee,
              additionalFeeNote: item.additionalFeeNote,
              notes: item.notes,
              sortOrder: itemIdx,
            })),
          },
        })),
      },
    },
    include: {
      categories: {
        include: { items: true },
      },
    },
  })

  revalidatePath(`/projects/${projectId}`)
  return template
}

export async function deleteMenuTemplate(projectId: string, templateId: string) {
  await verifyProjectAccess(projectId)
  const template = await prisma.menuTemplate.findFirst({
    where: { id: templateId, projectId },
  })
  if (!template) throw new Error("Menu template not found")
  await prisma.menuTemplate.delete({ where: { id: templateId } })
  revalidatePath(`/projects/${projectId}`)
}
