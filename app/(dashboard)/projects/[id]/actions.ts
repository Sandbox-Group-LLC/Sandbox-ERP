"use server"

import { prisma } from "@/lib/prisma"
import { requireAuthWithOrg } from "@/lib/session"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { addDays } from "date-fns"
import { evaluateAlertsForProject } from "@/lib/domain/alerts/engine"

async function verifyProjectAccess(projectId: string, organizationId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId },
  })
  if (!project) throw new Error("Project not found")
  return project
}

export async function updateProject(id: string, formData: FormData) {
  const user = await requireAuthWithOrg()

  const budgetThresholdStr = formData.get("budgetThreshold") as string
  const parsedThreshold = budgetThresholdStr && budgetThresholdStr.trim() !== ""
    ? parseFloat(budgetThresholdStr)
    : null
  const budgetThreshold = parsedThreshold !== null && Number.isFinite(parsedThreshold) ? parsedThreshold : null

  const data = {
    name: formData.get("name") as string,
    eventType: (formData.get("eventType") as string) || null,
    city: (formData.get("city") as string) || null,
    venue: (formData.get("venue") as string) || null,
    startDate: formData.get("startDate")
      ? new Date(formData.get("startDate") as string)
      : null,
    endDate: formData.get("endDate")
      ? new Date(formData.get("endDate") as string)
      : null,
    status: formData.get("status") as "Draft" | "Active" | "Onsite" | "Closed",
    ownerUserId: (formData.get("ownerUserId") as string) || null,
    budgetThreshold: budgetThreshold,
    masterProductionDocUrl: (formData.get("masterProductionDocUrl") as string) || null,
    proofSheetFolderId: (formData.get("proofSheetFolderId") as string) || null,
    assetSheetFolderId: (formData.get("assetSheetFolderId") as string) || null,
    budgetSheetFolderId: (formData.get("budgetSheetFolderId") as string) || null,
  }

  await prisma.project.update({
    where: { id, organizationId: user.organizationId },
    data,
  })

  revalidatePath(`/projects/${id}`)
}

export async function updateClientTeamMembers(projectId: string, members: { name: string; email: string }[]) {
  const user = await requireAuthWithOrg()
  await verifyProjectAccess(projectId, user.organizationId)

  const validated = members.map(m => ({
    name: (m.name || "").trim(),
    email: (m.email || "").trim(),
  })).filter(m => m.name || m.email)

  await prisma.project.update({
    where: { id: projectId, organizationId: user.organizationId },
    data: { clientTeamMembers: validated },
  })

  revalidatePath(`/projects/${projectId}`)
}

export async function createEstimateVersion(projectId: string) {
  const user = await requireAuthWithOrg()
  await verifyProjectAccess(projectId, user.organizationId)

  const lastVersion = await prisma.estimateVersion.findFirst({
    where: { projectId },
    orderBy: { versionNumber: "desc" },
  })

  const newVersion = await prisma.estimateVersion.create({
    data: {
      projectId,
      versionNumber: (lastVersion?.versionNumber || 0) + 1,
      status: "Draft",
    },
  })

  revalidatePath(`/projects/${projectId}`)
  return newVersion
}

export async function duplicateEstimateVersion(versionId: string, projectId: string) {
  const user = await requireAuthWithOrg()
  await verifyProjectAccess(projectId, user.organizationId)

  const sourceVersion = await prisma.estimateVersion.findFirst({
    where: { id: versionId, projectId },
    include: { lineItems: true },
  })

  if (!sourceVersion) throw new Error("Version not found")

  const lastVersion = await prisma.estimateVersion.findFirst({
    where: { projectId },
    orderBy: { versionNumber: "desc" },
  })

  const newVersion = await prisma.$transaction(async (tx) => {
    const version = await tx.estimateVersion.create({
      data: {
        projectId,
        versionNumber: (lastVersion?.versionNumber || 0) + 1,
        status: "Draft",
      },
    })

    if (sourceVersion.lineItems.length > 0) {
      await tx.estimateLineItem.createMany({
        data: sourceVersion.lineItems.map((item) => ({
          estimateVersionId: version.id,
          category: item.category,
          description: item.description,
          qty: item.qty,
          unitCost: item.unitCost,
          pricingMode: item.pricingMode,
          markupPercent: item.markupPercent,
          revenue: item.revenue,
          vendorId: item.vendorId,
        })),
      })
    }

    return version
  })

  revalidatePath(`/projects/${projectId}`)
  return newVersion
}

export async function approveEstimateVersion(versionId: string, projectId: string) {
  const user = await requireAuthWithOrg()
  await verifyProjectAccess(projectId, user.organizationId)

  const version = await prisma.estimateVersion.findFirst({
    where: { id: versionId, projectId },
  })
  if (!version) throw new Error("Version not found")

  await prisma.estimateVersion.update({
    where: { id: versionId },
    data: { status: "Approved" },
  })

  revalidatePath(`/projects/${projectId}`)
}

export async function createEstimateLineItem(formData: FormData) {
  const user = await requireAuthWithOrg()

  const versionId = formData.get("versionId") as string
  const projectId = formData.get("projectId") as string

  await verifyProjectAccess(projectId, user.organizationId)

  const version = await prisma.estimateVersion.findFirst({
    where: { id: versionId, projectId },
  })
  if (!version) throw new Error("Version not found")
  if (version.status !== "Draft") throw new Error("Cannot modify approved estimate")

  const qty = parseFloat(formData.get("qty") as string) || 1
  const unitCost = parseFloat(formData.get("unitCost") as string) || 0
  const pricingMode = formData.get("pricingMode") as string
  const markupPercent = formData.get("markupPercent")
    ? parseFloat(formData.get("markupPercent") as string)
    : null

  let revenue = 0
  if (pricingMode === "PassThrough") {
    revenue = qty * unitCost
  } else if (pricingMode === "Markup" && markupPercent) {
    revenue = qty * unitCost * (1 + markupPercent / 100)
  } else if (pricingMode === "Fixed") {
    revenue = parseFloat(formData.get("revenue") as string) || 0
  }

  const vendorId = (formData.get("vendorId") as string) || null
  if (vendorId) {
    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, organizationId: user.organizationId },
    })
    if (!vendor) throw new Error("Vendor not found")
  }

  await prisma.estimateLineItem.create({
    data: {
      estimateVersionId: versionId,
      category: formData.get("category") as string,
      description: formData.get("description") as string,
      qty,
      unitCost,
      pricingMode: pricingMode as any,
      markupPercent,
      revenue,
      vendorId,
    },
  })

  revalidatePath(`/projects/${projectId}`)
}

export async function updateEstimateLineItem(id: string, formData: FormData) {
  const user = await requireAuthWithOrg()

  const projectId = formData.get("projectId") as string
  await verifyProjectAccess(projectId, user.organizationId)

  const qty = parseFloat(formData.get("qty") as string) || 1
  const unitCost = parseFloat(formData.get("unitCost") as string) || 0
  const pricingMode = formData.get("pricingMode") as string
  const markupPercent = formData.get("markupPercent")
    ? parseFloat(formData.get("markupPercent") as string)
    : null

  let revenue = 0
  if (pricingMode === "PassThrough") {
    revenue = qty * unitCost
  } else if (pricingMode === "Markup" && markupPercent) {
    revenue = qty * unitCost * (1 + markupPercent / 100)
  } else if (pricingMode === "Fixed") {
    revenue = parseFloat(formData.get("revenue") as string) || 0
  }

  const vendorId = (formData.get("vendorId") as string) || null
  if (vendorId) {
    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, organizationId: user.organizationId },
    })
    if (!vendor) throw new Error("Vendor not found")
  }

  await prisma.estimateLineItem.update({
    where: { id },
    data: {
      category: formData.get("category") as string,
      description: formData.get("description") as string,
      qty,
      unitCost,
      pricingMode: pricingMode as any,
      markupPercent,
      revenue,
      vendorId,
    },
  })

  revalidatePath(`/projects/${projectId}`)
}

export async function deleteEstimateLineItem(id: string, projectId: string) {
  const user = await requireAuthWithOrg()
  await verifyProjectAccess(projectId, user.organizationId)

  const item = await prisma.estimateLineItem.findFirst({
    where: { id },
    include: { estimateVersion: true },
  })
  if (!item || item.estimateVersion.projectId !== projectId) {
    throw new Error("Item not found")
  }

  await prisma.estimateLineItem.delete({ where: { id } })
  revalidatePath(`/projects/${projectId}`)
}

export async function applyTemplate(projectId: string, templateId: string) {
  const user = await requireAuthWithOrg()

  const [project, template] = await Promise.all([
    prisma.project.findFirst({
      where: { id: projectId, organizationId: user.organizationId },
    }),
    prisma.template.findFirst({
      where: { id: templateId, organizationId: user.organizationId },
      include: { tasks: true },
    }),
  ])

  if (!project || !template) throw new Error("Not found")

  const startDate = project.startDate || new Date()

  const milestoneNames = Array.from(new Set(template.tasks.map((t) => t.milestone).filter(Boolean)))

  await prisma.$transaction(async (tx) => {
    const milestones: Record<string, string> = {}

    for (let i = 0; i < milestoneNames.length; i++) {
      const name = milestoneNames[i]!
      const milestone = await tx.milestone.create({
        data: {
          projectId,
          title: name,
          sortOrder: i,
        },
      })
      milestones[name] = milestone.id
    }

    for (const templateTask of template.tasks) {
      const dueDate = addDays(startDate, templateTask.offsetDaysFromStart)
      await tx.task.create({
        data: {
          projectId,
          title: templateTask.title,
          milestoneId: templateTask.milestone ? milestones[templateTask.milestone] : null,
          dueDate,
          status: "Todo",
        },
      })
    }
  })

  revalidatePath(`/projects/${projectId}`)
}

export async function createMilestone(projectId: string, formData: FormData) {
  const user = await requireAuthWithOrg()
  await verifyProjectAccess(projectId, user.organizationId)

  const lastMilestone = await prisma.milestone.findFirst({
    where: { projectId },
    orderBy: { sortOrder: "desc" },
  })

  await prisma.milestone.create({
    data: {
      projectId,
      title: formData.get("title") as string,
      sortOrder: (lastMilestone?.sortOrder || 0) + 1,
    },
  })

  revalidatePath(`/projects/${projectId}`)
}

export async function createTask(projectId: string, formData: FormData) {
  const user = await requireAuthWithOrg()
  await verifyProjectAccess(projectId, user.organizationId)

  const ownerUserId = (formData.get("ownerUserId") as string) || null
  if (ownerUserId) {
    const owner = await prisma.user.findFirst({
      where: { id: ownerUserId, organizationId: user.organizationId },
    })
    if (!owner) throw new Error("Owner not found")
  }

  await prisma.task.create({
    data: {
      projectId,
      title: formData.get("title") as string,
      milestoneId: (formData.get("milestoneId") as string) || null,
      ownerUserId,
      dueDate: formData.get("dueDate")
        ? new Date(formData.get("dueDate") as string)
        : null,
      status: "Todo",
    },
  })

  revalidatePath(`/projects/${projectId}`)
}

export async function updateTask(id: string, projectId: string, formData: FormData) {
  const user = await requireAuthWithOrg()
  await verifyProjectAccess(projectId, user.organizationId)

  const task = await prisma.task.findFirst({
    where: { id, projectId },
  })
  if (!task) throw new Error("Task not found")

  await prisma.task.update({
    where: { id },
    data: {
      title: formData.get("title") as string,
      milestoneId: (formData.get("milestoneId") as string) || null,
      ownerUserId: (formData.get("ownerUserId") as string) || null,
      dueDate: formData.get("dueDate")
        ? new Date(formData.get("dueDate") as string)
        : null,
      status: formData.get("status") as any,
    },
  })

  revalidatePath(`/projects/${projectId}`)
}

export async function deleteTask(id: string, projectId: string) {
  const user = await requireAuthWithOrg()
  await verifyProjectAccess(projectId, user.organizationId)

  const task = await prisma.task.findFirst({
    where: { id, projectId },
  })
  if (!task) throw new Error("Task not found")

  await prisma.task.delete({ where: { id } })
  revalidatePath(`/projects/${projectId}`)
}

export async function createVendorQuote(projectId: string, formData: FormData) {
  const user = await requireAuthWithOrg()
  await verifyProjectAccess(projectId, user.organizationId)

  const vendorId = formData.get("vendorId") as string
  const vendor = await prisma.vendor.findFirst({
    where: { id: vendorId, organizationId: user.organizationId },
  })
  if (!vendor) throw new Error("Vendor not found")

  await prisma.vendorQuote.create({
    data: {
      projectId,
      vendorId,
      amount: parseFloat(formData.get("amount") as string) || 0,
      notes: (formData.get("notes") as string) || null,
      status: "Draft",
    },
  })

  revalidatePath(`/projects/${projectId}`)
}

export async function updateVendorQuote(id: string, projectId: string, formData: FormData) {
  const user = await requireAuthWithOrg()
  await verifyProjectAccess(projectId, user.organizationId)

  const quote = await prisma.vendorQuote.findFirst({
    where: { id, projectId },
  })
  if (!quote) throw new Error("Quote not found")

  const vendorId = formData.get("vendorId") as string
  const vendor = await prisma.vendor.findFirst({
    where: { id: vendorId, organizationId: user.organizationId },
  })
  if (!vendor) throw new Error("Vendor not found")

  await prisma.vendorQuote.update({
    where: { id },
    data: {
      vendorId,
      amount: parseFloat(formData.get("amount") as string) || 0,
      notes: (formData.get("notes") as string) || null,
      status: formData.get("status") as any,
    },
  })

  revalidatePath(`/projects/${projectId}`)
}

export async function deleteVendorQuote(id: string, projectId: string) {
  const user = await requireAuthWithOrg()
  await verifyProjectAccess(projectId, user.organizationId)

  const quote = await prisma.vendorQuote.findFirst({
    where: { id, projectId },
  })
  if (!quote) throw new Error("Quote not found")

  await prisma.vendorQuote.delete({ where: { id } })
  revalidatePath(`/projects/${projectId}`)
}

export async function createPurchase(projectId: string, formData: FormData) {
  const user = await requireAuthWithOrg()
  await verifyProjectAccess(projectId, user.organizationId)

  const vendorId = formData.get("vendorId") as string
  const vendor = await prisma.vendor.findFirst({
    where: { id: vendorId, organizationId: user.organizationId },
  })
  if (!vendor) throw new Error("Vendor not found")

  const budgetLineId = formData.get("budgetLineId") as string | null
  const purchaserId = formData.get("purchaserId") as string | null
  const transactionType = formData.get("transactionType") as string | null

  await prisma.purchase.create({
    data: {
      projectId,
      vendorId,
      budgetLineId: budgetLineId || null,
      purchaserId: purchaserId || null,
      transactionType: transactionType ? transactionType as any : null,
      description: formData.get("description") as string,
      amount: parseFloat(formData.get("amount") as string) || 0,
      status: "Requested",
    },
  })

  revalidatePath(`/projects/${projectId}`)

  // Fire-and-forget alert evaluation
  evaluateAlertsForProject(projectId, user.id).catch(err => console.error('Alert evaluation failed:', err))
}

export async function updatePurchase(id: string, projectId: string, formData: FormData) {
  const user = await requireAuthWithOrg()
  await verifyProjectAccess(projectId, user.organizationId)

  const purchase = await prisma.purchase.findFirst({
    where: { id, projectId },
  })
  if (!purchase) throw new Error("Purchase not found")

  const vendorId = formData.get("vendorId") as string
  const vendor = await prisma.vendor.findFirst({
    where: { id: vendorId, organizationId: user.organizationId },
  })
  if (!vendor) throw new Error("Vendor not found")

  const budgetLineId = formData.get("budgetLineId") as string | null
  const purchaserId = formData.get("purchaserId") as string | null
  const transactionType = formData.get("transactionType") as string | null

  await prisma.purchase.update({
    where: { id },
    data: {
      vendorId,
      budgetLineId: budgetLineId || null,
      purchaserId: purchaserId || null,
      transactionType: transactionType ? transactionType as any : null,
      description: formData.get("description") as string,
      amount: parseFloat(formData.get("amount") as string) || 0,
      status: formData.get("status") as any,
    },
  })

  revalidatePath(`/projects/${projectId}`)

  // Fire-and-forget alert evaluation
  evaluateAlertsForProject(projectId, user.id).catch(err => console.error('Alert evaluation failed:', err))
}

export async function deletePurchase(id: string, projectId: string) {
  const user = await requireAuthWithOrg()
  await verifyProjectAccess(projectId, user.organizationId)

  const purchase = await prisma.purchase.findFirst({
    where: { id, projectId },
  })
  if (!purchase) throw new Error("Purchase not found")

  await prisma.purchase.delete({ where: { id } })
  revalidatePath(`/projects/${projectId}`)
  
  // Fire-and-forget alert evaluation
  evaluateAlertsForProject(projectId, user.id).catch(err => console.error('Alert evaluation failed:', err))
}

export async function createManualAdjustment(projectId: string, formData: FormData) {
  const user = await requireAuthWithOrg()
  await verifyProjectAccess(projectId, user.organizationId)

  await prisma.manualAdjustment.create({
    data: {
      projectId,
      description: formData.get("description") as string,
      amount: parseFloat(formData.get("amount") as string) || 0,
      type: formData.get("type") as any,
    },
  })

  revalidatePath(`/projects/${projectId}`)
  
  // Fire-and-forget alert evaluation
  evaluateAlertsForProject(projectId, user.id).catch(err => console.error('Alert evaluation failed:', err))
}

export async function deleteManualAdjustment(id: string, projectId: string) {
  const user = await requireAuthWithOrg()
  await verifyProjectAccess(projectId, user.organizationId)

  const adjustment = await prisma.manualAdjustment.findFirst({
    where: { id, projectId },
  })
  if (!adjustment) throw new Error("Adjustment not found")

  await prisma.manualAdjustment.delete({ where: { id } })
  revalidatePath(`/projects/${projectId}`)
  
  // Fire-and-forget alert evaluation
  evaluateAlertsForProject(projectId, user.id).catch(err => console.error('Alert evaluation failed:', err))
}
