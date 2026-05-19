"use server"

import { prisma } from "@/lib/prisma"
import { requireAuthWithOrg } from "@/lib/session"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

const opportunitySchema = z.object({
  clientId: z.string().min(1, "Client is required"),
  stage: z.enum(["Lead", "Qualified", "Proposal", "Won", "Lost"]),
  budgetRange: z.string().optional(),
  eventType: z.string().optional(),
  activationState: z.string().optional(),
  targetStartDate: z.string().optional(),
  eventStartDate: z.string().optional(),
  eventEndDate: z.string().optional(),
  notes: z.string().optional(),
})

export async function createOpportunity(formData: FormData) {
  const user = await requireAuthWithOrg()

  const data = opportunitySchema.parse({
    clientId: formData.get("clientId"),
    stage: formData.get("stage") || "Lead",
    budgetRange: formData.get("budgetRange") || undefined,
    eventType: formData.get("eventType") || undefined,
    activationState: formData.get("activationState") || undefined,
    targetStartDate: formData.get("targetStartDate") || undefined,
    eventStartDate: formData.get("eventStartDate") || undefined,
    eventEndDate: formData.get("eventEndDate") || undefined,
    notes: formData.get("notes") || undefined,
  })

  await prisma.opportunity.create({
    data: {
      clientId: data.clientId,
      organizationId: user.organizationId,
      stage: data.stage,
      budgetRange: data.budgetRange,
      eventType: data.eventType,
      activationState: data.activationState,
      targetStartDate: data.targetStartDate ? new Date(data.targetStartDate) : null,
      eventStartDate: data.eventStartDate ? new Date(data.eventStartDate) : null,
      eventEndDate: data.eventEndDate ? new Date(data.eventEndDate) : null,
      notes: data.notes,
    },
  })

  revalidatePath("/opportunities")
}

export async function updateOpportunity(id: string, formData: FormData) {
  const user = await requireAuthWithOrg()

  const data = opportunitySchema.parse({
    clientId: formData.get("clientId"),
    stage: formData.get("stage") || "Lead",
    budgetRange: formData.get("budgetRange") || undefined,
    eventType: formData.get("eventType") || undefined,
    activationState: formData.get("activationState") || undefined,
    targetStartDate: formData.get("targetStartDate") || undefined,
    eventStartDate: formData.get("eventStartDate") || undefined,
    eventEndDate: formData.get("eventEndDate") || undefined,
    notes: formData.get("notes") || undefined,
  })

  await prisma.opportunity.update({
    where: { id, organizationId: user.organizationId },
    data: {
      clientId: data.clientId,
      stage: data.stage,
      budgetRange: data.budgetRange,
      eventType: data.eventType,
      activationState: data.activationState,
      targetStartDate: data.targetStartDate ? new Date(data.targetStartDate) : null,
      eventStartDate: data.eventStartDate ? new Date(data.eventStartDate) : null,
      eventEndDate: data.eventEndDate ? new Date(data.eventEndDate) : null,
      notes: data.notes,
    },
  })

  revalidatePath("/opportunities")
  revalidatePath(`/opportunities/${id}`)
}

export async function deleteOpportunity(id: string) {
  const user = await requireAuthWithOrg()

  await prisma.opportunity.delete({
    where: { id, organizationId: user.organizationId },
  })

  revalidatePath("/opportunities")
}

export async function convertToProject(opportunityId: string, formData: FormData) {
  const user = await requireAuthWithOrg()

  const projectName = formData.get("projectName") as string

  const opportunity = await prisma.opportunity.findFirst({
    where: { id: opportunityId, organizationId: user.organizationId },
    include: { client: true, project: true, budget: true },
  })

  if (!opportunity) {
    throw new Error("Opportunity not found")
  }

  if (opportunity.project) {
    throw new Error("Opportunity already converted")
  }

  const project = await prisma.$transaction(async (tx) => {
    const proj = await tx.project.create({
      data: {
        name: projectName || `${opportunity.client.name} - ${opportunity.eventType || "Project"}`,
        clientId: opportunity.clientId,
        organizationId: user.organizationId,
        opportunityId: opportunity.id,
        eventType: opportunity.eventType,
        startDate: opportunity.eventStartDate || opportunity.targetStartDate,
        endDate: opportunity.eventEndDate,
        ownerUserId: user.id,
        status: "Draft",
      },
    })

    await tx.opportunity.update({
      where: { id: opportunityId },
      data: { stage: "Won" },
    })

    // Carry over budget from opportunity to project
    if (opportunity.budget) {
      await tx.budget.update({
        where: { id: opportunity.budget.id },
        data: {
          opportunityId: null,
          projectId: proj.id,
          // Use activationState as jurisdiction if set
          ...(opportunity.activationState && { jurisdiction: opportunity.activationState }),
        },
      })
    }

    return proj
  })

  revalidatePath("/opportunities")
  revalidatePath("/projects")
  redirect(`/projects/${project.id}`)
}
