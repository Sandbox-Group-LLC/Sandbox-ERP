"use server"

import { prisma } from "@/lib/prisma"
import { requireAuthWithOrg } from "@/lib/session"
import { revalidatePath } from "next/cache"

async function verifyTemplateAccess(templateId: string, organizationId: string) {
  const template = await prisma.template.findFirst({
    where: { id: templateId, organizationId },
  })
  if (!template) throw new Error("Template not found")
  return template
}

export async function createTemplate(formData: FormData) {
  const user = await requireAuthWithOrg()

  await prisma.template.create({
    data: {
      name: formData.get("name") as string,
      eventType: (formData.get("eventType") as string) || null,
      organizationId: user.organizationId,
    },
  })

  revalidatePath("/templates")
}

export async function updateTemplate(id: string, formData: FormData) {
  const user = await requireAuthWithOrg()

  await prisma.template.update({
    where: { id, organizationId: user.organizationId },
    data: {
      name: formData.get("name") as string,
      eventType: (formData.get("eventType") as string) || null,
    },
  })

  revalidatePath("/templates")
  revalidatePath(`/templates/${id}`)
}

export async function deleteTemplate(id: string) {
  const user = await requireAuthWithOrg()

  await prisma.template.delete({
    where: { id, organizationId: user.organizationId },
  })

  revalidatePath("/templates")
}

export async function createTemplateTask(formData: FormData) {
  const user = await requireAuthWithOrg()

  const templateId = formData.get("templateId") as string
  await verifyTemplateAccess(templateId, user.organizationId)

  await prisma.templateTask.create({
    data: {
      templateId,
      title: formData.get("title") as string,
      milestone: (formData.get("milestone") as string) || null,
      offsetDaysFromStart: parseInt(formData.get("offsetDaysFromStart") as string) || 0,
      defaultOwnerRole: (formData.get("defaultOwnerRole") as string) || null,
    },
  })

  revalidatePath(`/templates/${templateId}`)
}

export async function updateTemplateTask(id: string, formData: FormData) {
  const user = await requireAuthWithOrg()

  const templateId = formData.get("templateId") as string
  await verifyTemplateAccess(templateId, user.organizationId)

  const task = await prisma.templateTask.findFirst({
    where: { id, templateId },
  })
  if (!task) throw new Error("Task not found")

  await prisma.templateTask.update({
    where: { id },
    data: {
      title: formData.get("title") as string,
      milestone: (formData.get("milestone") as string) || null,
      offsetDaysFromStart: parseInt(formData.get("offsetDaysFromStart") as string) || 0,
      defaultOwnerRole: (formData.get("defaultOwnerRole") as string) || null,
    },
  })

  revalidatePath(`/templates/${templateId}`)
}

export async function deleteTemplateTask(id: string, templateId: string) {
  const user = await requireAuthWithOrg()
  await verifyTemplateAccess(templateId, user.organizationId)

  const task = await prisma.templateTask.findFirst({
    where: { id, templateId },
  })
  if (!task) throw new Error("Task not found")

  await prisma.templateTask.delete({
    where: { id },
  })

  revalidatePath(`/templates/${templateId}`)
}

export async function getDocumentTemplates() {
  const user = await requireAuthWithOrg()

  return prisma.documentTemplate.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { name: "asc" },
  })
}

export async function createDocumentTemplate(formData: FormData) {
  const user = await requireAuthWithOrg()

  await prisma.documentTemplate.create({
    data: {
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || null,
      templateType: formData.get("templateType") as string,
      googleDocUrl: formData.get("googleDocUrl") as string,
      organizationId: user.organizationId,
    },
  })

  revalidatePath("/templates")
}

export async function updateDocumentTemplate(id: string, formData: FormData) {
  const user = await requireAuthWithOrg()

  await prisma.documentTemplate.update({
    where: { id, organizationId: user.organizationId },
    data: {
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || null,
      templateType: formData.get("templateType") as string,
      googleDocUrl: formData.get("googleDocUrl") as string,
    },
  })

  revalidatePath("/templates")
}

export async function deleteDocumentTemplate(id: string) {
  const user = await requireAuthWithOrg()

  await prisma.documentTemplate.delete({
    where: { id, organizationId: user.organizationId },
  })

  revalidatePath("/templates")
}
