"use server"

import { prisma } from "@/lib/prisma"
import { requireAuthWithOrg } from "@/lib/session"
import { revalidatePath } from "next/cache"
import { TaskStatus, TaskWorkstream, TaskPhase, TaskPriority } from "@prisma/client"

async function verifyProjectAccess(projectId: string, organizationId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId },
  })
  if (!project) throw new Error("Project not found")
  return project
}

export async function getTasks(projectId: string) {
  const user = await requireAuthWithOrg()
  await verifyProjectAccess(projectId, user.organizationId)

  return prisma.task.findMany({
    where: { projectId },
    include: {
      owner: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  })
}

export async function createTask(projectId: string, formData: FormData) {
  const user = await requireAuthWithOrg()
  await verifyProjectAccess(projectId, user.organizationId)

  const rawAssigneePersonId = formData.get("assigneePersonId") as string
  const assigneePersonId = rawAssigneePersonId && rawAssigneePersonId !== "__unassigned__" ? rawAssigneePersonId : null
  if (assigneePersonId) {
    const person = await prisma.person.findFirst({
      where: { id: assigneePersonId, organizationId: user.organizationId },
    })
    if (!person) throw new Error("Assignee not found")
  }

  const phase = (formData.get("phase") as TaskPhase) || "PRE_PROGRAM"
  const executionTimeStr = formData.get("executionTime") as string

  await prisma.task.create({
    data: {
      projectId,
      title: formData.get("title") as string,
      description: (formData.get("description") as string) || null,
      assigneePersonId,
      dueDate: formData.get("dueDate")
        ? new Date(formData.get("dueDate") as string)
        : null,
      executionTime: phase === "LIVE" && executionTimeStr
        ? new Date(executionTimeStr)
        : null,
      status: (formData.get("status") as TaskStatus) || "Todo",
      workstream: (formData.get("workstream") as TaskWorkstream) || "OTHER",
      phase,
      priority: (formData.get("priority") as TaskPriority) || "MEDIUM",
      isMilestone: formData.get("isMilestone") === "true",
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

  const rawAssigneePersonId = formData.get("assigneePersonId") as string
  const assigneePersonId = rawAssigneePersonId && rawAssigneePersonId !== "__unassigned__" ? rawAssigneePersonId : null
  if (assigneePersonId) {
    const person = await prisma.person.findFirst({
      where: { id: assigneePersonId, organizationId: user.organizationId },
    })
    if (!person) throw new Error("Assignee not found")
  }

  const phase = (formData.get("phase") as TaskPhase) || "PRE_PROGRAM"
  const executionTimeStr = formData.get("executionTime") as string

  await prisma.task.update({
    where: { id },
    data: {
      title: formData.get("title") as string,
      description: (formData.get("description") as string) || null,
      assigneePersonId,
      dueDate: formData.get("dueDate")
        ? new Date(formData.get("dueDate") as string)
        : null,
      executionTime: phase === "LIVE" && executionTimeStr
        ? new Date(executionTimeStr)
        : null,
      status: (formData.get("status") as TaskStatus) || "Todo",
      workstream: (formData.get("workstream") as TaskWorkstream) || "OTHER",
      phase,
      priority: (formData.get("priority") as TaskPriority) || "MEDIUM",
      isMilestone: formData.get("isMilestone") === "true",
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

export async function updateTaskStatus(id: string, projectId: string, status: TaskStatus) {
  const user = await requireAuthWithOrg()
  await verifyProjectAccess(projectId, user.organizationId)

  const task = await prisma.task.findFirst({
    where: { id, projectId },
  })
  if (!task) throw new Error("Task not found")

  await prisma.task.update({
    where: { id },
    data: { status },
  })

  revalidatePath(`/projects/${projectId}`)
}
