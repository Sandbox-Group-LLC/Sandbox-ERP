"use server"

import { prisma } from "@/lib/prisma"
import { requireAuthWithOrg } from "@/lib/session"
import { revalidatePath } from "next/cache"
import { evaluateAlertsForProject } from "@/lib/domain/alerts/engine"

function normalizeToMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function getWeeksBetween(start: Date, end: Date): Date[] {
  const weeks: Date[] = []
  let current = normalizeToMonday(start)
  const endNorm = normalizeToMonday(end)
  
  while (current.getTime() <= endNorm.getTime()) {
    weeks.push(new Date(current))
    current = new Date(current.getTime() + 7 * 24 * 60 * 60 * 1000)
  }
  
  return weeks
}

export async function getStaffingRoles() {
  const user = await requireAuthWithOrg()
  
  return prisma.staffingRole.findMany({
    where: { organizationId: user.organizationId },
    include: { roleRate: true },
    orderBy: { name: "asc" },
  })
}

export async function getOrCreateStaffingPlan(projectId: string) {
  const user = await requireAuthWithOrg()
  
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: user.organizationId },
    include: { staffingPlan: true },
  })
  
  if (!project) {
    throw new Error("Project not found")
  }
  
  if (project.staffingPlan) {
    return project.staffingPlan
  }
  
  const startDate = project.startDate || new Date()
  const endDate = project.endDate || new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000)
  
  const plan = await prisma.staffingPlan.create({
    data: {
      projectId,
      startDate: normalizeToMonday(startDate),
      endDate,
    },
  })
  
  revalidatePath(`/projects/${projectId}`)
  return plan
}

export async function getProjectPeople(projectId: string) {
  const user = await requireAuthWithOrg()
  
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: user.organizationId },
  })
  
  if (!project) {
    throw new Error("Project not found")
  }
  
  return prisma.person.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { name: "asc" },
  })
}

export async function getStaffingPlanWithAssignments(projectId: string) {
  const user = await requireAuthWithOrg()
  
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: user.organizationId },
    include: {
      staffingPlan: {
        include: {
          assignments: {
            include: {
              person: true,
              staffingRole: { include: { roleRate: true } },
              allocations: true,
            },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  })
  
  if (!project) {
    throw new Error("Project not found")
  }
  
  return project.staffingPlan
}

export async function createStaffingAssignment(data: {
  staffingPlanId: string
  roleId: string
  personId: string
  startDate: Date
  endDate: Date
  memo?: string
}) {
  const user = await requireAuthWithOrg()
  
  const plan = await prisma.staffingPlan.findFirst({
    where: { id: data.staffingPlanId },
    include: { project: true },
  })
  
  if (!plan || plan.project.organizationId !== user.organizationId) {
    throw new Error("Staffing plan not found")
  }
  
  const role = await prisma.staffingRole.findFirst({
    where: { id: data.roleId, organizationId: user.organizationId },
    include: { roleRate: true },
  })
  
  if (!role) {
    throw new Error("Role not found")
  }
  
  const person = await prisma.person.findFirst({
    where: { id: data.personId, organizationId: user.organizationId },
  })
  
  if (!person) {
    throw new Error("Person not found")
  }
  
  const billRate = person.defaultBillRate || 0
  const costRate = person.defaultCostRate
  const clientBillRate = person.clientBillRate || 0
  
  const result = await prisma.$transaction(async (tx) => {
    const assignment = await tx.staffingAssignment.create({
      data: {
        projectId: plan.projectId,
        staffingPlanId: data.staffingPlanId,
        personId: data.personId,
        roleId: data.roleId,
        startDate: data.startDate,
        endDate: data.endDate,
        billRate,
        costRate,
        clientBillRate,
        memo: data.memo || null,
      },
      include: { person: true, staffingRole: true },
    })
    
    const weeks = getWeeksBetween(data.startDate, data.endDate)
    
    for (const week of weeks) {
      await tx.staffingAllocation.create({
        data: {
          staffingPlanId: data.staffingPlanId,
          assignmentId: assignment.id,
          roleId: data.roleId,
          personId: data.personId,
          weekStartDate: week,
          plannedHours: 0,
        },
      })
    }
    
    return assignment
  })
  
  revalidatePath(`/projects/${plan.projectId}`)

  // Fire-and-forget alert evaluation
  evaluateAlertsForProject(plan.projectId, user.id).catch(err => console.error('Alert evaluation failed:', err))

  return result
}

export async function updateStaffingAssignment(data: {
  assignmentId: string
  roleId: string
  personId: string
  memo?: string
}) {
  const user = await requireAuthWithOrg()
  
  const assignment = await prisma.staffingAssignment.findFirst({
    where: { id: data.assignmentId },
    include: { project: true },
  })
  
  if (!assignment || assignment.project.organizationId !== user.organizationId) {
    throw new Error("Assignment not found")
  }
  
  const role = await prisma.staffingRole.findFirst({
    where: { id: data.roleId, organizationId: user.organizationId },
    include: { roleRate: true },
  })
  
  if (!role) {
    throw new Error("Role not found")
  }
  
  const person = await prisma.person.findFirst({
    where: { id: data.personId, organizationId: user.organizationId },
  })
  
  if (!person) {
    throw new Error("Person not found")
  }
  
  const billRate = person.defaultBillRate || 0
  const costRate = person.defaultCostRate
  const clientBillRate = person.clientBillRate || 0
  
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.staffingAssignment.update({
      where: { id: data.assignmentId },
      data: {
        roleId: data.roleId,
        personId: data.personId,
        billRate,
        costRate,
        clientBillRate,
        memo: data.memo !== undefined ? (data.memo || null) : undefined,
      },
    })
    
    await tx.staffingAllocation.updateMany({
      where: { assignmentId: data.assignmentId },
      data: {
        roleId: data.roleId,
        personId: data.personId,
      },
    })
    
    return updated
  })
  
  revalidatePath(`/projects/${assignment.projectId}`)

  evaluateAlertsForProject(assignment.projectId, user.id).catch(err => console.error('Alert evaluation failed:', err))

  return result
}

export async function deleteStaffingAssignment(assignmentId: string) {
  const user = await requireAuthWithOrg()
  
  const assignment = await prisma.staffingAssignment.findFirst({
    where: { id: assignmentId },
    include: { project: true },
  })
  
  if (!assignment || assignment.project.organizationId !== user.organizationId) {
    throw new Error("Assignment not found")
  }
  
  await prisma.staffingAssignment.delete({
    where: { id: assignmentId },
  })
  
  revalidatePath(`/projects/${assignment.projectId}`)

  // Fire-and-forget alert evaluation
  evaluateAlertsForProject(assignment.projectId, user.id).catch(err => console.error('Alert evaluation failed:', err))
}

export async function updateStaffingAssignmentCostRate(assignmentId: string, costRate: number) {
  const user = await requireAuthWithOrg()
  
  const assignment = await prisma.staffingAssignment.findFirst({
    where: { id: assignmentId },
    include: { project: true },
  })
  
  if (!assignment || assignment.project.organizationId !== user.organizationId) {
    throw new Error("Assignment not found")
  }
  
  const updated = await prisma.staffingAssignment.update({
    where: { id: assignmentId },
    data: { costRate },
  })
  
  revalidatePath(`/projects/${assignment.projectId}`)

  // Fire-and-forget alert evaluation
  evaluateAlertsForProject(assignment.projectId, user.id).catch(err => console.error('Alert evaluation failed:', err))

  return updated
}

export async function updateStaffingAssignmentBillRate(assignmentId: string, billRate: number) {
  const user = await requireAuthWithOrg()
  
  const assignment = await prisma.staffingAssignment.findFirst({
    where: { id: assignmentId },
    include: { project: true },
  })
  
  if (!assignment || assignment.project.organizationId !== user.organizationId) {
    throw new Error("Assignment not found")
  }
  
  const updated = await prisma.staffingAssignment.update({
    where: { id: assignmentId },
    data: { billRate },
  })
  
  revalidatePath(`/projects/${assignment.projectId}`)

  // Fire-and-forget alert evaluation
  evaluateAlertsForProject(assignment.projectId, user.id).catch(err => console.error('Alert evaluation failed:', err))

  return updated
}

export async function bulkUpsertStaffingAllocations(data: {
  staffingPlanId: string
  allocations: Array<{
    assignmentId: string
    weekStartDate: Date
    plannedHours: number
  }>
}) {
  const user = await requireAuthWithOrg()

  const plan = await prisma.staffingPlan.findFirst({
    where: { id: data.staffingPlanId },
    include: { project: true },
  })

  if (!plan || plan.project.organizationId !== user.organizationId) {
    throw new Error("Staffing plan not found")
  }

  await prisma.$transaction(async (tx) => {
    for (const alloc of data.allocations) {
      if (alloc.plannedHours < 0) {
        throw new Error("Planned hours cannot be negative")
      }

      const normalizedWeekStart = normalizeToMonday(alloc.weekStartDate)

      const existing = await tx.staffingAllocation.findFirst({
        where: {
          staffingPlanId: data.staffingPlanId,
          assignmentId: alloc.assignmentId,
          weekStartDate: normalizedWeekStart,
        },
      })

      if (existing) {
        await tx.staffingAllocation.update({
          where: { id: existing.id },
          data: { plannedHours: alloc.plannedHours },
        })
      } else {
        const assignment = await tx.staffingAssignment.findFirst({
          where: { id: alloc.assignmentId },
        })
        
        if (assignment) {
          await tx.staffingAllocation.create({
            data: {
              staffingPlanId: data.staffingPlanId,
              assignmentId: alloc.assignmentId,
              roleId: assignment.roleId,
              personId: assignment.personId,
              weekStartDate: normalizedWeekStart,
              plannedHours: alloc.plannedHours,
            },
          })
        }
      }
    }
  })

  revalidatePath(`/projects/${plan.projectId}`)

  // Fire-and-forget alert evaluation
  evaluateAlertsForProject(plan.projectId, user.id).catch(err => console.error('Alert evaluation failed:', err))

  return { success: true, count: data.allocations.length }
}

export async function updateStaffingPlanDates(
  staffingPlanId: string,
  startDate: Date,
  endDate: Date
) {
  const user = await requireAuthWithOrg()
  
  const plan = await prisma.staffingPlan.findFirst({
    where: { id: staffingPlanId },
    include: { project: true },
  })
  
  if (!plan || plan.project.organizationId !== user.organizationId) {
    throw new Error("Staffing plan not found")
  }
  
  const normalizedStart = normalizeToMonday(startDate)
  const normalizedEnd = new Date(endDate)
  normalizedEnd.setUTCHours(23, 59, 59, 999)
  
  await prisma.staffingAllocation.deleteMany({
    where: {
      staffingPlanId,
      OR: [
        { weekStartDate: { lt: normalizedStart } },
        { weekStartDate: { gt: normalizedEnd } },
      ],
    },
  })
  
  const updated = await prisma.staffingPlan.update({
    where: { id: staffingPlanId },
    data: {
      startDate: normalizedStart,
      endDate,
    },
  })
  
  revalidatePath(`/projects/${plan.projectId}`)
  return updated
}
