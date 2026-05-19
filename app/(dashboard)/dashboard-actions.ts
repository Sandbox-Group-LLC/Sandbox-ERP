"use server"

import { prisma } from "@/lib/prisma"
import { OpportunityStage, ProjectStatus, TaskStatus, ContractStage, PurchaseStatus, BudgetSection, BudgetLineType } from "@prisma/client"
import {
  computeAllBudgetLines,
  calculateBudgetSummary,
  buildTaxCodeMap,
  buildExpenseMap,
  buildActualMap,
  buildExpenseByBudgetLineIdMap,
  buildActualByBudgetLineIdMap,
  buildStaffingRateMap,
  BudgetContext,
  BudgetLineInput,
  RoleAllocationLookup,
} from "@/lib/budget-engine"

export interface AgencyMarginPulseData {
  revenue: number
  cost: number
  margin: number
  marginPercent: number
}

export async function getAgencyMarginPulse(organizationId: string): Promise<AgencyMarginPulseData> {
  const activeProjects = await prisma.project.findMany({
    where: {
      organizationId,
      status: { in: [ProjectStatus.Active, ProjectStatus.Onsite] },
    },
    include: {
      budget: {
        include: {
          lines: true,
        },
      },
      staffingPlan: {
        include: {
          assignments: {
            include: {
              allocations: true,
            },
          },
        },
      },
      expenseEntries: true,
      actualCostEntries: true,
      purchases: true,
    },
  })

  const [taxCodes, staffingRates] = await Promise.all([
    prisma.taxCode.findMany(),
    prisma.staffingRate.findMany(),
  ])

  const taxCodeMap = buildTaxCodeMap(taxCodes)
  const staffingRateMap = buildStaffingRateMap(staffingRates)

  let totalRevenue = 0
  let totalCost = 0

  for (const project of activeProjects) {
    if (project.budget) {
      const expenseMap = buildExpenseMap(project.expenseEntries)
      const actualMap = buildActualMap(project.actualCostEntries)
      const expenseByBudgetLineIdMap = buildExpenseByBudgetLineIdMap(project.expenseEntries)
      const actualByBudgetLineIdMap = buildActualByBudgetLineIdMap(project.actualCostEntries)
      const purchaseMap = new Map<string, number>()
      for (const purchase of project.purchases) {
        if (purchase.budgetLineId) {
          purchaseMap.set(purchase.budgetLineId, (purchaseMap.get(purchase.budgetLineId) || 0) + Number(purchase.amount))
        }
      }
      const roleAllocationsByBudgetLineIdMap = new Map<string, RoleAllocationLookup[]>()

      const context: BudgetContext = {
        jurisdiction: project.budget.jurisdiction,
        baseMarkup: project.budget.baseMarkup ?? 1.0,
        taxCodes: taxCodeMap,
        staffingRates: staffingRateMap,
        expensesByDescription: expenseMap,
        actualsByDescription: actualMap,
        expensesByBudgetLineId: expenseByBudgetLineIdMap,
        actualsByBudgetLineId: actualByBudgetLineIdMap,
        purchasesByBudgetLineId: purchaseMap,
        roleAllocationsByBudgetLineId: roleAllocationsByBudgetLineIdMap,
      }

      const budgetLines: BudgetLineInput[] = project.budget.lines.map(line => ({
        id: line.id,
        rowOrder: line.rowOrder,
        section: line.section as "PASSTHROUGH" | "SANDBOX" | "STAFFING" | "SUMMARY",
        lineType: line.lineType as "NORMAL" | "SUBTOTAL",
        category: line.category,
        taxCategory: line.taxCategory,
        description: line.description,
        ovh: line.ovh,
        vendor: line.vendor,
        units: line.units,
        internalCostInput: line.internalCostInput,
        markupOverride: line.markupOverride,
        internalNotes: line.internalNotes,
        clientNotes: line.clientNotes,
        processingFeeEnabled: line.processingFeeEnabled,
        processingFeePercent: line.processingFeePercent,
      }))

      const computedLines = computeAllBudgetLines(budgetLines, context)
      const summary = calculateBudgetSummary(computedLines)

      totalRevenue += summary.revenue
      totalCost += summary.cogsForecast
    }

    if (project.staffingPlan) {
      for (const assignment of project.staffingPlan.assignments) {
        const totalHours = assignment.allocations.reduce(
          (sum, alloc) => sum + Number(alloc.plannedHours),
          0
        )
        const clientRate = Number(assignment.clientBillRate) || 0
        const internalBill = Number(assignment.billRate) || 0
        totalRevenue += clientRate * totalHours
        totalCost += internalBill * totalHours
      }
    }
  }

  const margin = totalRevenue - totalCost
  const marginPercent = totalRevenue > 0 ? (margin / totalRevenue) * 100 : 0

  return {
    revenue: totalRevenue,
    cost: totalCost,
    margin,
    marginPercent,
  }
}

export interface ForecastVsBookedData {
  pipelineValue: number
  bookedRevenue: number
}

const stageWeights: Record<OpportunityStage, number> = {
  [OpportunityStage.Lead]: 0.1,
  [OpportunityStage.Qualified]: 0.25,
  [OpportunityStage.Proposal]: 0.5,
  [OpportunityStage.Won]: 1.0,
  [OpportunityStage.Lost]: 0,
}

export async function getForecastVsBooked(organizationId: string): Promise<ForecastVsBookedData> {
  const opportunities = await prisma.opportunity.findMany({
    where: {
      organizationId,
      stage: { not: OpportunityStage.Lost },
    },
    select: {
      stage: true,
      budgetRange: true,
    },
  })

  let pipelineValue = 0
  for (const opp of opportunities) {
    if (opp.budgetRange) {
      const numericValue = parseFloat(opp.budgetRange.replace(/[^0-9.]/g, "")) || 0
      pipelineValue += numericValue * stageWeights[opp.stage]
    }
  }

  const activeProjects = await prisma.project.findMany({
    where: {
      organizationId,
      status: { in: [ProjectStatus.Active, ProjectStatus.Onsite] },
    },
    include: {
      budget: {
        include: {
          lines: true,
        },
      },
      staffingPlan: {
        include: {
          assignments: {
            include: {
              allocations: true,
            },
          },
        },
      },
      expenseEntries: true,
      actualCostEntries: true,
      purchases: true,
    },
  })

  const [taxCodes, staffingRates] = await Promise.all([
    prisma.taxCode.findMany(),
    prisma.staffingRate.findMany(),
  ])

  const taxCodeMap = buildTaxCodeMap(taxCodes)
  const staffingRateMap = buildStaffingRateMap(staffingRates)

  let bookedRevenue = 0
  for (const project of activeProjects) {
    if (project.budget) {
      const expenseMap = buildExpenseMap(project.expenseEntries)
      const actualMap = buildActualMap(project.actualCostEntries)
      const expenseByBudgetLineIdMap = buildExpenseByBudgetLineIdMap(project.expenseEntries)
      const actualByBudgetLineIdMap = buildActualByBudgetLineIdMap(project.actualCostEntries)
      const purchaseMap = new Map<string, number>()
      for (const purchase of project.purchases) {
        if (purchase.budgetLineId) {
          purchaseMap.set(purchase.budgetLineId, (purchaseMap.get(purchase.budgetLineId) || 0) + Number(purchase.amount))
        }
      }
      const roleAllocationsByBudgetLineIdMap = new Map<string, RoleAllocationLookup[]>()

      const context: BudgetContext = {
        jurisdiction: project.budget.jurisdiction,
        baseMarkup: project.budget.baseMarkup ?? 1.0,
        taxCodes: taxCodeMap,
        staffingRates: staffingRateMap,
        expensesByDescription: expenseMap,
        actualsByDescription: actualMap,
        expensesByBudgetLineId: expenseByBudgetLineIdMap,
        actualsByBudgetLineId: actualByBudgetLineIdMap,
        purchasesByBudgetLineId: purchaseMap,
        roleAllocationsByBudgetLineId: roleAllocationsByBudgetLineIdMap,
      }

      const budgetLines: BudgetLineInput[] = project.budget.lines.map(line => ({
        id: line.id,
        rowOrder: line.rowOrder,
        section: line.section as "PASSTHROUGH" | "SANDBOX" | "STAFFING" | "SUMMARY",
        lineType: line.lineType as "NORMAL" | "SUBTOTAL",
        category: line.category,
        taxCategory: line.taxCategory,
        description: line.description,
        ovh: line.ovh,
        vendor: line.vendor,
        units: line.units,
        internalCostInput: line.internalCostInput,
        markupOverride: line.markupOverride,
        internalNotes: line.internalNotes,
        clientNotes: line.clientNotes,
        processingFeeEnabled: line.processingFeeEnabled,
        processingFeePercent: line.processingFeePercent,
      }))

      const computedLines = computeAllBudgetLines(budgetLines, context)
      const summary = calculateBudgetSummary(computedLines)

      bookedRevenue += summary.revenue
    }

    if (project.staffingPlan) {
      for (const assignment of project.staffingPlan.assignments) {
        const totalHours = assignment.allocations.reduce(
          (sum, alloc) => sum + Number(alloc.plannedHours),
          0
        )
        bookedRevenue += (Number(assignment.clientBillRate) || 0) * totalHours
      }
    }
  }

  return {
    pipelineValue,
    bookedRevenue,
  }
}

export interface ProjectProfitabilityItem {
  id: string
  name: string
  revenue: number
  cost: number
  margin: number
  marginPercent: number
}

export interface ProjectProfitabilityData {
  topProjects: ProjectProfitabilityItem[]
  bottomProjects: ProjectProfitabilityItem[]
}

export async function getProjectProfitability(organizationId: string): Promise<ProjectProfitabilityData> {
  const projects = await prisma.project.findMany({
    where: {
      organizationId,
      status: { in: [ProjectStatus.Active, ProjectStatus.Onsite] },
    },
    include: {
      budget: {
        include: {
          lines: true,
        },
      },
      staffingPlan: {
        include: {
          assignments: {
            include: {
              allocations: true,
            },
          },
        },
      },
      expenseEntries: true,
      actualCostEntries: true,
      purchases: true,
    },
  })

  const [taxCodes, staffingRates] = await Promise.all([
    prisma.taxCode.findMany(),
    prisma.staffingRate.findMany(),
  ])

  const taxCodeMap = buildTaxCodeMap(taxCodes)
  const staffingRateMap = buildStaffingRateMap(staffingRates)

  const projectMetrics: ProjectProfitabilityItem[] = []

  for (const project of projects) {
    let revenue = 0
    let cost = 0
    let marginPercent = 0

    if (project.budget) {
      const expenseMap = buildExpenseMap(project.expenseEntries)
      const actualMap = buildActualMap(project.actualCostEntries)
      const expenseByBudgetLineIdMap = buildExpenseByBudgetLineIdMap(project.expenseEntries)
      const actualByBudgetLineIdMap = buildActualByBudgetLineIdMap(project.actualCostEntries)
      const purchaseMap = new Map<string, number>()
      for (const purchase of project.purchases) {
        if (purchase.budgetLineId) {
          purchaseMap.set(purchase.budgetLineId, (purchaseMap.get(purchase.budgetLineId) || 0) + Number(purchase.amount))
        }
      }
      const roleAllocationsByBudgetLineIdMap = new Map<string, RoleAllocationLookup[]>()

      const context: BudgetContext = {
        jurisdiction: project.budget.jurisdiction,
        baseMarkup: project.budget.baseMarkup ?? 1.0,
        taxCodes: taxCodeMap,
        staffingRates: staffingRateMap,
        expensesByDescription: expenseMap,
        actualsByDescription: actualMap,
        expensesByBudgetLineId: expenseByBudgetLineIdMap,
        actualsByBudgetLineId: actualByBudgetLineIdMap,
        purchasesByBudgetLineId: purchaseMap,
        roleAllocationsByBudgetLineId: roleAllocationsByBudgetLineIdMap,
      }

      const budgetLines: BudgetLineInput[] = project.budget.lines.map(line => ({
        id: line.id,
        rowOrder: line.rowOrder,
        section: line.section as "PASSTHROUGH" | "SANDBOX" | "STAFFING" | "SUMMARY",
        lineType: line.lineType as "NORMAL" | "SUBTOTAL",
        category: line.category,
        taxCategory: line.taxCategory,
        description: line.description,
        ovh: line.ovh,
        vendor: line.vendor,
        units: line.units,
        internalCostInput: line.internalCostInput,
        markupOverride: line.markupOverride,
        internalNotes: line.internalNotes,
        clientNotes: line.clientNotes,
        processingFeeEnabled: line.processingFeeEnabled,
        processingFeePercent: line.processingFeePercent,
      }))

      const computedLines = computeAllBudgetLines(budgetLines, context)
      const summary = calculateBudgetSummary(computedLines)

      revenue = summary.revenue
      cost = summary.cogsForecast
      marginPercent = summary.forecastMarginPercent
    }

    // Add staffing plan revenue and cost
    if (project.staffingPlan) {
      for (const assignment of project.staffingPlan.assignments) {
        const totalHours = assignment.allocations.reduce(
          (sum, alloc) => sum + Number(alloc.plannedHours),
          0
        )
        const sClientRate = Number(assignment.clientBillRate) || 0
        const sInternalBill = Number(assignment.billRate) || 0
        revenue += sClientRate * totalHours
        cost += sInternalBill * totalHours
      }
      // Recalculate margin percent with staffing included
      marginPercent = revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0
    }

    const margin = revenue - cost

    projectMetrics.push({
      id: project.id,
      name: project.name,
      revenue,
      cost,
      margin,
      marginPercent,
    })
  }

  projectMetrics.sort((a, b) => b.marginPercent - a.marginPercent)

  // Only show projects below 35% margin in "Needs Attention"
  const needsAttentionProjects = projectMetrics.filter(p => p.marginPercent < 35)

  return {
    topProjects: projectMetrics.slice(0, 3),
    bottomProjects: needsAttentionProjects.slice(-3).reverse(),
  }
}

export interface BudgetVarianceData {
  alertCount: number
}

export async function getBudgetVarianceAlerts(organizationId: string): Promise<BudgetVarianceData> {
  const budgetLines = await prisma.budgetLine.findMany({
    where: {
      budget: {
        project: {
          organizationId,
          status: { in: [ProjectStatus.Active, ProjectStatus.Onsite] },
        },
      },
    },
    include: {
      actualCostEntries: true,
    },
  })

  let alertCount = 0
  for (const line of budgetLines) {
    const estimated = (line.internalCostInput ?? 0) * line.units
    const actualTotal = line.actualCostEntries.reduce((sum, entry) => sum + entry.amount, 0)

    if (estimated > 0 && actualTotal > estimated * 1.1) {
      alertCount++
    }
  }

  return { alertCount }
}

export interface StaffingUtilizationData {
  plannedHours: number
  targetHours: number
  utilizationPercent: number
  personCount: number
}

export async function getStaffingUtilization(organizationId: string): Promise<StaffingUtilizationData> {
  const now = new Date()
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay())
  startOfWeek.setHours(0, 0, 0, 0)

  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(startOfWeek.getDate() + 7)

  const allocations = await prisma.staffingAllocation.findMany({
    where: {
      staffingPlan: {
        project: {
          organizationId,
        },
      },
      weekStartDate: {
        gte: startOfWeek,
        lt: endOfWeek,
      },
      personId: { not: null },
    },
    select: {
      plannedHours: true,
      personId: true,
    },
  })

  const uniquePersonIds = new Set(allocations.map((a) => a.personId).filter(Boolean))
  const personCount = uniquePersonIds.size

  const plannedHours = allocations.reduce(
    (sum, a) => sum + parseFloat(a.plannedHours.toString()),
    0
  )
  const targetHours = personCount * 40

  return {
    plannedHours,
    targetHours,
    utilizationPercent: targetHours > 0 ? (plannedHours / targetHours) * 100 : 0,
    personCount,
  }
}

export interface StaffingGapsData {
  unfilledCount: number
  conflictCount: number
}

export async function getStaffingGapsAndConflicts(organizationId: string): Promise<StaffingGapsData> {
  const now = new Date()
  const thirtyDaysFromNow = new Date(now)
  thirtyDaysFromNow.setDate(now.getDate() + 30)

  const unfilledAllocations = await prisma.staffingAllocation.count({
    where: {
      staffingPlan: {
        project: {
          organizationId,
        },
      },
      weekStartDate: {
        gte: now,
        lte: thirtyDaysFromNow,
      },
      personId: null,
      plannedHours: { gt: 0 },
    },
  })

  const assignments = await prisma.staffingAssignment.findMany({
    where: {
      project: {
        organizationId,
      },
      personId: { not: undefined },
      startDate: { lte: thirtyDaysFromNow },
      endDate: { gte: now },
    },
    select: {
      personId: true,
      startDate: true,
      endDate: true,
    },
    orderBy: [{ personId: "asc" }, { startDate: "asc" }],
  })

  let conflictCount = 0
  const assignmentsByPerson = new Map<string, typeof assignments>()

  for (const assignment of assignments) {
    const existing = assignmentsByPerson.get(assignment.personId) || []
    existing.push(assignment)
    assignmentsByPerson.set(assignment.personId, existing)
  }

  for (const personAssignments of Array.from(assignmentsByPerson.values())) {
    for (let i = 0; i < personAssignments.length; i++) {
      for (let j = i + 1; j < personAssignments.length; j++) {
        const a = personAssignments[i]
        const b = personAssignments[j]
        if (a.startDate <= b.endDate && b.startDate <= a.endDate) {
          conflictCount++
        }
      }
    }
  }

  return {
    unfilledCount: unfilledAllocations,
    conflictCount,
  }
}

export interface TaskRiskData {
  atRiskCount: number
}

export async function getTaskRiskRadar(organizationId: string): Promise<TaskRiskData> {
  const now = new Date()
  const fourteenDaysFromNow = new Date(now)
  fourteenDaysFromNow.setDate(now.getDate() + 14)

  const atRiskTasks = await prisma.task.count({
    where: {
      project: {
        organizationId,
        status: { in: [ProjectStatus.Active, ProjectStatus.Onsite] },
      },
      status: { not: TaskStatus.Done },
      dueDate: {
        lte: fourteenDaysFromNow,
      },
    },
  })

  return { atRiskCount: atRiskTasks }
}

export interface ContractStageCount {
  stage: ContractStage
  count: number
  stalledCount: number
}

export interface ContractPipelineData {
  stages: ContractStageCount[]
  totalStalled: number
}

export async function getContractPipelineStatus(organizationId: string): Promise<ContractPipelineData> {
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const contracts = await prisma.contract.findMany({
    where: {
      project: {
        organizationId,
      },
    },
    select: {
      stage: true,
      updatedAt: true,
    },
  })

  const stageMap = new Map<ContractStage, { count: number; stalledCount: number }>()

  for (const stage of Object.values(ContractStage)) {
    stageMap.set(stage, { count: 0, stalledCount: 0 })
  }

  for (const contract of contracts) {
    const stageData = stageMap.get(contract.stage)!
    stageData.count++
    if (contract.stage !== ContractStage.Signed && contract.updatedAt < sevenDaysAgo) {
      stageData.stalledCount++
    }
  }

  const stages: ContractStageCount[] = []
  let totalStalled = 0

  for (const [stage, data] of Array.from(stageMap.entries())) {
    stages.push({
      stage,
      count: data.count,
      stalledCount: data.stalledCount,
    })
    totalStalled += data.stalledCount
  }

  return { stages, totalStalled }
}

export interface VendorSpendData {
  byStatus: Record<PurchaseStatus, number>
  topUnpaid: Array<{
    id: string
    vendorName: string
    description: string
    amount: number
  }>
}

export async function getVendorSpendPayables(organizationId: string): Promise<VendorSpendData> {
  const now = new Date()
  const startOfQuarter = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)

  const purchases = await prisma.purchase.findMany({
    where: {
      project: {
        organizationId,
      },
      createdAt: { gte: startOfQuarter },
    },
    include: {
      vendor: true,
    },
    orderBy: { amount: "desc" },
  })

  const byStatus: Record<PurchaseStatus, number> = {
    [PurchaseStatus.Requested]: 0,
    [PurchaseStatus.Approved]: 0,
    [PurchaseStatus.Paid]: 0,
  }

  for (const purchase of purchases) {
    byStatus[purchase.status] += purchase.amount
  }

  const unpaidPurchases = purchases
    .filter((p) => p.status !== PurchaseStatus.Paid)
    .slice(0, 5)
    .map((p) => ({
      id: p.id,
      vendorName: p.vendor.name,
      description: p.description,
      amount: p.amount,
    }))

  return {
    byStatus,
    topUnpaid: unpaidPurchases,
  }
}

export interface ClientEngagementData {
  activeTokenCount: number
  unresolvedCommentCount: number
  recentAccessCount: number
}

export async function getClientEngagementMetrics(organizationId: string): Promise<ClientEngagementData> {
  const now = new Date()
  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(now.getDate() - 7)

  const [activeTokenCount, unresolvedCommentCount, recentAccessCount] = await Promise.all([
    prisma.clientPortalAccess.count({
      where: {
        project: {
          organizationId,
        },
        expiresAt: { gt: now },
      },
    }),
    prisma.budgetComment.count({
      where: {
        project: {
          organizationId,
        },
        isResolved: false,
        isInternal: false,
      },
    }),
    prisma.clientPortalAccess.count({
      where: {
        project: {
          organizationId,
        },
        lastAccess: { gte: sevenDaysAgo },
      },
    }),
  ])

  return {
    activeTokenCount,
    unresolvedCommentCount,
    recentAccessCount,
  }
}
