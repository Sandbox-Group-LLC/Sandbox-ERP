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

export async function getCateringSettings(projectId: string) {
  await verifyProjectAccess(projectId)
  return prisma.cateringSettings.findUnique({
    where: { projectId },
  })
}

export async function upsertCateringSettings(
  projectId: string,
  data: {
    vendorName?: string
    menuLink?: string
    minimumSpend?: number
    serviceChargePct?: number
    taxPct?: number
    dietaryNotes?: string
  }
) {
  await verifyProjectAccess(projectId)
  const settings = await prisma.cateringSettings.upsert({
    where: { projectId },
    create: { projectId, ...data },
    update: data,
  })
  revalidatePath(`/projects/${projectId}`)
  return settings
}

export async function getCateringCategories(projectId: string) {
  await verifyProjectAccess(projectId)
  return prisma.cateringCategory.findMany({
    where: { projectId },
    orderBy: { sortOrder: "asc" },
  })
}

export async function getCateringCategoryWithItems(projectId: string, categoryId: string) {
  await verifyProjectAccess(projectId)
  const category = await prisma.cateringCategory.findFirst({
    where: { id: categoryId, projectId },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
    },
  })
  if (!category) throw new Error("Catering category not found")
  return category
}

export async function createCateringCategory(projectId: string, name: string) {
  await verifyProjectAccess(projectId)
  const maxOrder = await prisma.cateringCategory.aggregate({
    where: { projectId },
    _max: { sortOrder: true },
  })
  const category = await prisma.cateringCategory.create({
    data: {
      projectId,
      name: name.trim() || "Untitled Category",
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
    },
  })
  revalidatePath(`/projects/${projectId}`)
  return category
}

export async function renameCateringCategory(projectId: string, categoryId: string, name: string) {
  await verifyProjectAccess(projectId)
  const existing = await prisma.cateringCategory.findFirst({ where: { id: categoryId, projectId } })
  if (!existing) throw new Error("Catering category not found")
  const category = await prisma.cateringCategory.update({
    where: { id: categoryId },
    data: { name: name.trim() || "Untitled Category" },
  })
  revalidatePath(`/projects/${projectId}`)
  return category
}

export async function deleteCateringCategory(projectId: string, categoryId: string) {
  await verifyProjectAccess(projectId)
  const category = await prisma.cateringCategory.findFirst({ where: { id: categoryId, projectId } })
  if (!category) throw new Error("Catering category not found")
  await prisma.cateringCategory.delete({ where: { id: categoryId } })
  revalidatePath(`/projects/${projectId}`)
}

export async function addCateringItem(projectId: string, categoryId: string) {
  await verifyProjectAccess(projectId)
  const category = await prisma.cateringCategory.findFirst({ where: { id: categoryId, projectId } })
  if (!category) throw new Error("Catering category not found")
  const maxOrder = await prisma.cateringItem.aggregate({
    where: { categoryId },
    _max: { sortOrder: true },
  })
  const item = await prisma.cateringItem.create({
    data: {
      categoryId,
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
    },
  })
  revalidatePath(`/projects/${projectId}`)
  return item
}

export async function updateCateringItem(
  projectId: string,
  categoryId: string,
  itemId: string,
  data: {
    beoNumber?: string
    date?: string
    functionName?: string
    startTime?: string
    endTime?: string
    room?: string
    menuDescription?: string
    pax?: number
    retailPrice?: number
    discountedPrice?: number | null
    banquetCheck?: number | null
    notes?: string
  }
) {
  await verifyProjectAccess(projectId)
  const category = await prisma.cateringCategory.findFirst({ where: { id: categoryId, projectId } })
  if (!category) throw new Error("Catering category not found")
  const item = await prisma.cateringItem.findFirst({
    where: { id: itemId, categoryId },
  })
  if (!item) throw new Error("Catering item not found")
  const updated = await prisma.cateringItem.update({
    where: { id: itemId },
    data,
  })
  revalidatePath(`/projects/${projectId}`)
  return updated
}

export async function deleteCateringItem(projectId: string, categoryId: string, itemId: string) {
  await verifyProjectAccess(projectId)
  const category = await prisma.cateringCategory.findFirst({ where: { id: categoryId, projectId } })
  if (!category) throw new Error("Catering category not found")
  const item = await prisma.cateringItem.findFirst({
    where: { id: itemId, categoryId },
  })
  if (!item) throw new Error("Catering item not found")
  await prisma.cateringItem.delete({ where: { id: itemId } })
  revalidatePath(`/projects/${projectId}`)
}

export async function importMenuItemsToCategory(
  projectId: string,
  categoryId: string,
  items: {
    menuDescription: string
    retailPrice: number
    notes: string
  }[]
) {
  await verifyProjectAccess(projectId)
  const category = await prisma.cateringCategory.findFirst({ where: { id: categoryId, projectId } })
  if (!category) throw new Error("Catering category not found")

  const maxOrder = await prisma.cateringItem.aggregate({
    where: { categoryId },
    _max: { sortOrder: true },
  })
  let nextOrder = (maxOrder._max.sortOrder ?? -1) + 1

  const created = await prisma.$transaction(
    items.map((item, idx) =>
      prisma.cateringItem.create({
        data: {
          categoryId,
          menuDescription: item.menuDescription,
          retailPrice: item.retailPrice,
          notes: item.notes,
          sortOrder: nextOrder + idx,
        },
      })
    )
  )

  revalidatePath(`/projects/${projectId}`)
  return created
}

export async function getCateringOverview(projectId: string) {
  await verifyProjectAccess(projectId)

  const settings = await prisma.cateringSettings.findUnique({
    where: { projectId },
  })

  const serviceChargePct = settings?.serviceChargePct ?? 0
  const taxPct = settings?.taxPct ?? 0

  const categories = await prisma.cateringCategory.findMany({
    where: { projectId },
    include: { items: { orderBy: { sortOrder: "asc" } } },
    orderBy: { sortOrder: "asc" },
  })

  let grandExclusiveTotal = 0
  let grandServiceChargeTotal = 0
  let grandTaxTotal = 0
  let grandInclusiveTotal = 0
  let grandBanquetCheckTotal = 0
  let grandItemCount = 0

  const categorySummaries = categories.map((cat) => {
    const exclusiveTotal = cat.items.reduce((sum, item) => {
      const price = item.discountedPrice ?? item.retailPrice ?? 0
      const pax = item.pax ?? 0
      return sum + price * pax
    }, 0)
    const serviceChargeTotal = exclusiveTotal * (serviceChargePct / 100)
    const taxTotal = (exclusiveTotal + serviceChargeTotal) * (taxPct / 100)
    const inclusiveTotal = exclusiveTotal + serviceChargeTotal + taxTotal
    const banquetCheckTotal = cat.items.reduce((sum, item) => {
      return sum + (item.banquetCheck ?? 0)
    }, 0)
    const itemCount = cat.items.length

    grandExclusiveTotal += exclusiveTotal
    grandServiceChargeTotal += serviceChargeTotal
    grandTaxTotal += taxTotal
    grandInclusiveTotal += inclusiveTotal
    grandBanquetCheckTotal += banquetCheckTotal
    grandItemCount += itemCount

    return {
      id: cat.id,
      name: cat.name,
      exclusiveTotal,
      serviceChargeTotal,
      taxTotal,
      inclusiveTotal,
      banquetCheckTotal,
      itemCount,
    }
  })

  return {
    categories: categorySummaries,
    grandTotals: {
      exclusiveTotal: grandExclusiveTotal,
      serviceChargeTotal: grandServiceChargeTotal,
      taxTotal: grandTaxTotal,
      inclusiveTotal: grandInclusiveTotal,
      banquetCheckTotal: grandBanquetCheckTotal,
      itemCount: grandItemCount,
    },
    settings: {
      serviceChargePct,
      taxPct,
    },
  }
}
