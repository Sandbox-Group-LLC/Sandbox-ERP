import { prisma } from "@/lib/prisma"

export interface StaffingRoleAllocation {
  roleId: string
  roleName: string
  weekStartDate: string
  plannedHours: number
  internalRate: number
  billRate: number | null
  plannedCost: number
  plannedRevenue: number | null
}

export interface StaffingRoleSummary {
  roleId: string
  roleName: string
  totalPlannedHours: number
  internalRate: number
  billRate: number | null
  totalPlannedCost: number
  totalPlannedRevenue: number | null
}

export interface StaffingWeeklySummary {
  weekStartDate: string
  totalPlannedHours: number
  totalPlannedCost: number
  totalPlannedRevenue: number
  roleBreakdown: Array<{
    roleId: string
    roleName: string
    plannedHours: number
    plannedCost: number
    plannedRevenue: number | null
  }>
}

export interface StaffingPlanResult {
  projectId: string
  projectName: string
  staffingPlanId: string
  startDate: string
  endDate: string
  allocations: StaffingRoleAllocation[]
  metadata: {
    totalAllocations: number
    uniqueRoles: number
    uniqueWeeks: number
    computedAt: string
  }
}

export interface StaffingTotalsResult {
  projectId: string
  projectName: string
  roles: StaffingRoleSummary[]
  totals: {
    totalPlannedHours: number
    totalPlannedCost: number
    totalPlannedRevenue: number
    margin: number
    marginPercent: number
  }
}

export interface StaffingWeeklyResult {
  projectId: string
  projectName: string
  weeks: StaffingWeeklySummary[]
  totals: {
    totalPlannedHours: number
    totalPlannedCost: number
    totalPlannedRevenue: number
  }
}

export async function computeStaffingPlan(
  projectId: string,
  organizationId: string
): Promise<StaffingPlanResult | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true, name: true },
  })

  if (!project) return null

  const staffingPlan = await prisma.staffingPlan.findUnique({
    where: { projectId },
    include: {
      allocations: {
        include: {
          role: {
            include: { roleRate: true },
          },
        },
        orderBy: [{ roleId: "asc" }, { weekStartDate: "asc" }],
      },
    },
  })

  if (!staffingPlan) return null

  const allocations: StaffingRoleAllocation[] = staffingPlan.allocations.map((alloc) => {
    const plannedHours = Number(alloc.plannedHours)
    const internalRate = alloc.role.roleRate ? Number(alloc.role.roleRate.internalRate) : 0
    const billRate = alloc.role.roleRate?.billRate ? Number(alloc.role.roleRate.billRate) : null

    return {
      roleId: alloc.roleId,
      roleName: alloc.role.name,
      weekStartDate: alloc.weekStartDate.toISOString(),
      plannedHours,
      internalRate,
      billRate,
      plannedCost: plannedHours * internalRate,
      plannedRevenue: billRate !== null ? plannedHours * billRate : null,
    }
  })

  const uniqueRoles = new Set(allocations.map((a) => a.roleId)).size
  const uniqueWeeks = new Set(allocations.map((a) => a.weekStartDate)).size

  return {
    projectId,
    projectName: project.name,
    staffingPlanId: staffingPlan.id,
    startDate: staffingPlan.startDate.toISOString(),
    endDate: staffingPlan.endDate.toISOString(),
    allocations,
    metadata: {
      totalAllocations: allocations.length,
      uniqueRoles,
      uniqueWeeks,
      computedAt: new Date().toISOString(),
    },
  }
}

export async function computeStaffingTotals(
  projectId: string,
  organizationId: string
): Promise<StaffingTotalsResult | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true, name: true },
  })

  if (!project) return null

  const staffingPlan = await prisma.staffingPlan.findUnique({
    where: { projectId },
    include: {
      allocations: {
        include: {
          role: {
            include: { roleRate: true },
          },
        },
      },
    },
  })

  if (!staffingPlan) return null

  const roleMap = new Map<
    string,
    {
      roleId: string
      roleName: string
      totalPlannedHours: number
      internalRate: number
      billRate: number | null
    }
  >()

  for (const alloc of staffingPlan.allocations) {
    const existing = roleMap.get(alloc.roleId)
    const plannedHours = Number(alloc.plannedHours)
    const internalRate = alloc.role.roleRate ? Number(alloc.role.roleRate.internalRate) : 0
    const billRate = alloc.role.roleRate?.billRate ? Number(alloc.role.roleRate.billRate) : null

    if (existing) {
      existing.totalPlannedHours += plannedHours
    } else {
      roleMap.set(alloc.roleId, {
        roleId: alloc.roleId,
        roleName: alloc.role.name,
        totalPlannedHours: plannedHours,
        internalRate,
        billRate,
      })
    }
  }

  const roles: StaffingRoleSummary[] = Array.from(roleMap.values()).map((r) => ({
    roleId: r.roleId,
    roleName: r.roleName,
    totalPlannedHours: r.totalPlannedHours,
    internalRate: r.internalRate,
    billRate: r.billRate,
    totalPlannedCost: r.totalPlannedHours * r.internalRate,
    totalPlannedRevenue: r.billRate !== null ? r.totalPlannedHours * r.billRate : null,
  }))

  const totalPlannedHours = roles.reduce((sum, r) => sum + r.totalPlannedHours, 0)
  const totalPlannedCost = roles.reduce((sum, r) => sum + r.totalPlannedCost, 0)
  const totalPlannedRevenue = roles.reduce(
    (sum, r) => sum + (r.totalPlannedRevenue ?? 0),
    0
  )
  const margin = totalPlannedRevenue - totalPlannedCost
  const marginPercent = totalPlannedRevenue > 0 ? (margin / totalPlannedRevenue) * 100 : 0

  return {
    projectId,
    projectName: project.name,
    roles,
    totals: {
      totalPlannedHours,
      totalPlannedCost,
      totalPlannedRevenue,
      margin,
      marginPercent,
    },
  }
}

export async function computeStaffingWeekly(
  projectId: string,
  organizationId: string
): Promise<StaffingWeeklyResult | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true, name: true },
  })

  if (!project) return null

  const staffingPlan = await prisma.staffingPlan.findUnique({
    where: { projectId },
    include: {
      allocations: {
        include: {
          role: {
            include: { roleRate: true },
          },
        },
        orderBy: { weekStartDate: "asc" },
      },
    },
  })

  if (!staffingPlan) return null

  const weekMap = new Map<
    string,
    {
      weekStartDate: string
      totalPlannedHours: number
      totalPlannedCost: number
      totalPlannedRevenue: number
      roleBreakdown: Map<
        string,
        {
          roleId: string
          roleName: string
          plannedHours: number
          plannedCost: number
          plannedRevenue: number | null
        }
      >
    }
  >()

  for (const alloc of staffingPlan.allocations) {
    const weekKey = alloc.weekStartDate.toISOString()
    const plannedHours = Number(alloc.plannedHours)
    const internalRate = alloc.role.roleRate ? Number(alloc.role.roleRate.internalRate) : 0
    const billRate = alloc.role.roleRate?.billRate ? Number(alloc.role.roleRate.billRate) : null
    const plannedCost = plannedHours * internalRate
    const plannedRevenue = billRate !== null ? plannedHours * billRate : null

    let week = weekMap.get(weekKey)
    if (!week) {
      week = {
        weekStartDate: weekKey,
        totalPlannedHours: 0,
        totalPlannedCost: 0,
        totalPlannedRevenue: 0,
        roleBreakdown: new Map(),
      }
      weekMap.set(weekKey, week)
    }

    week.totalPlannedHours += plannedHours
    week.totalPlannedCost += plannedCost
    week.totalPlannedRevenue += plannedRevenue ?? 0

    const existingRole = week.roleBreakdown.get(alloc.roleId)
    if (existingRole) {
      existingRole.plannedHours += plannedHours
      existingRole.plannedCost += plannedCost
      if (plannedRevenue !== null) {
        existingRole.plannedRevenue =
          (existingRole.plannedRevenue ?? 0) + plannedRevenue
      }
    } else {
      week.roleBreakdown.set(alloc.roleId, {
        roleId: alloc.roleId,
        roleName: alloc.role.name,
        plannedHours,
        plannedCost,
        plannedRevenue,
      })
    }
  }

  const weeks: StaffingWeeklySummary[] = Array.from(weekMap.values())
    .sort((a, b) => a.weekStartDate.localeCompare(b.weekStartDate))
    .map((week) => ({
      weekStartDate: week.weekStartDate,
      totalPlannedHours: week.totalPlannedHours,
      totalPlannedCost: week.totalPlannedCost,
      totalPlannedRevenue: week.totalPlannedRevenue,
      roleBreakdown: Array.from(week.roleBreakdown.values()),
    }))

  const totals = weeks.reduce(
    (acc, week) => ({
      totalPlannedHours: acc.totalPlannedHours + week.totalPlannedHours,
      totalPlannedCost: acc.totalPlannedCost + week.totalPlannedCost,
      totalPlannedRevenue: acc.totalPlannedRevenue + week.totalPlannedRevenue,
    }),
    { totalPlannedHours: 0, totalPlannedCost: 0, totalPlannedRevenue: 0 }
  )

  return {
    projectId,
    projectName: project.name,
    weeks,
    totals,
  }
}
