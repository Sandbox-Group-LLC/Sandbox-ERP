import { prisma } from "@/lib/prisma"
import type { TaxCode, StaffingRole, RoleRate, ExpenseEntry, ActualCostEntry, BudgetLine, Budget, Project, Client, BudgetLineRoleLink, ProjectStatus } from "@prisma/client"
import {
  BudgetContext,
  BudgetLineInput,
  BudgetSummary,
  ComputedBudgetLine,
  computeAllBudgetLines,
  calculateBudgetSummary,
  buildTaxCodeMap,
  buildStaffingRateMap,
  buildExpenseMap,
  buildActualMap,
  buildExpenseByBudgetLineIdMap,
  buildActualByBudgetLineIdMap,
  buildRoleAllocationsByBudgetLineIdMap,
  RoleAllocationEntry,
} from "@/lib/budget-engine"

export interface BudgetComputeResult {
  projectId: string
  projectName: string
  clientName: string | null
  jurisdiction: string
  baseMarkup: number
  summary: BudgetSummary
  lines: ComputedBudgetLine[]
  metadata: {
    lineCount: number
    hasPassthrough: boolean
    hasSandbox: boolean
    hasStaffing: boolean
    computedAt: string
  }
}

export interface BudgetVarianceResult {
  projectId: string
  projectName: string
  summary: {
    totalForecast: number
    totalActual: number
    totalVariance: number
    variancePercent: number
  }
  lineVariances: Array<{
    id: string
    description: string | null
    section: string
    forecast: number
    actual: number
    variance: number
    remaining: number
  }>
}

export interface BudgetReconcileResult {
  projectId: string
  projectName: string
  unmatchedExpenses: Array<{
    id: string
    description: string
    amount: number
    date: string | null
  }>
  unmatchedActuals: Array<{
    id: string
    description: string
    amount: number
    date: string | null
  }>
  matchedCount: number
  unmatchedExpenseTotal: number
  unmatchedActualTotal: number
}

async function buildBudgetContext(
  budget: {
    id: string
    projectId: string | null
    jurisdiction: string
    baseMarkup: number
  },
  organizationId: string
): Promise<BudgetContext> {
  const [
    taxCodes,
    staffingRoles,
    expenseEntries,
    actualCostEntries,
    purchases,
    roleLinks,
    staffingAllocations,
  ] = await Promise.all([
    prisma.taxCode.findMany(),
    prisma.staffingRole.findMany({
      where: { organizationId },
      include: { roleRate: true },
    }),
    budget.projectId
      ? prisma.expenseEntry.findMany({
          where: { projectId: budget.projectId },
        })
      : Promise.resolve([]),
    budget.projectId
      ? prisma.actualCostEntry.findMany({
          where: { projectId: budget.projectId },
        })
      : Promise.resolve([]),
    budget.projectId
      ? prisma.purchase.findMany({
          where: { projectId: budget.projectId },
        })
      : Promise.resolve([]),
    prisma.budgetLineRoleLink.findMany({
      where: {
        budgetLine: { budgetId: budget.id },
      },
      include: {
        role: { include: { roleRate: true } },
      },
    }),
    budget.projectId
      ? prisma.staffingAllocation.findMany({
          where: {
            staffingPlan: { projectId: budget.projectId },
          },
          include: {
            role: { include: { roleRate: true } },
          },
        })
      : Promise.resolve([]),
  ])

  const taxCodeMap = buildTaxCodeMap(
    taxCodes.map((tc) => ({
      categoryCode: tc.categoryCode,
      jurisdiction: tc.jurisdiction,
      taxRate: Number(tc.taxRate),
      defaultMarkup: Number(tc.defaultMarkup),
      isTaxable: tc.isTaxable,
    }))
  )

  const staffingRateMap = buildStaffingRateMap(
    staffingRoles.map((sr) => ({
      roleName: sr.name,
      internalRate: sr.roleRate ? Number(sr.roleRate.internalRate) : 0,
    }))
  )

  const expensesByDescription = buildExpenseMap(
    expenseEntries.map((e) => ({
      description: e.description,
      amount: Number(e.amount),
    }))
  )

  const actualsByDescription = buildActualMap(
    actualCostEntries.map((a) => ({
      description: a.description,
      amount: Number(a.amount),
    }))
  )

  const expensesByBudgetLineId = buildExpenseByBudgetLineIdMap(
    expenseEntries.map((e) => ({
      budgetLineId: e.budgetLineId,
      amount: Number(e.amount),
    }))
  )

  const allActuals = [
    ...actualCostEntries.map((a) => ({
      budgetLineId: a.budgetLineId,
      amount: Number(a.amount),
    })),
    ...purchases.map((p) => ({
      budgetLineId: p.budgetLineId,
      amount: Number(p.amount),
    })),
  ]

  const actualsByBudgetLineId = buildActualByBudgetLineIdMap(allActuals)

  const allocationHoursByRole = new Map<string, number>()
  for (const alloc of staffingAllocations) {
    const current = allocationHoursByRole.get(alloc.roleId) ?? 0
    allocationHoursByRole.set(alloc.roleId, current + Number(alloc.plannedHours))
  }

  const roleAllocationEntries: RoleAllocationEntry[] = roleLinks.map((link) => ({
    budgetLineId: link.budgetLineId,
    roleId: link.roleId,
    roleName: link.role.name,
    internalRate: link.role.roleRate ? Number(link.role.roleRate.internalRate) : 0,
    totalHours: allocationHoursByRole.get(link.roleId) ?? 0,
  }))

  const roleAllocationsByBudgetLineId = buildRoleAllocationsByBudgetLineIdMap(roleAllocationEntries)

  return {
    jurisdiction: budget.jurisdiction,
    baseMarkup: budget.baseMarkup,
    taxCodes: taxCodeMap,
    staffingRates: staffingRateMap,
    expensesByDescription,
    actualsByDescription,
    expensesByBudgetLineId,
    actualsByBudgetLineId,
    purchasesByBudgetLineId: new Map(),
    roleAllocationsByBudgetLineId,
  }
}

export async function computeBudgetSummary(
  projectId: string,
  organizationId: string
): Promise<BudgetComputeResult | null> {
  const budget = await prisma.budget.findFirst({
    where: {
      projectId,
      project: { organizationId },
    },
    include: {
      project: {
        include: { client: { select: { name: true } } },
      },
      lines: {
        orderBy: { rowOrder: "asc" },
      },
    },
  })

  if (!budget || !budget.project) return null

  const context = await buildBudgetContext(
    {
      id: budget.id,
      projectId: budget.projectId,
      jurisdiction: budget.jurisdiction,
      baseMarkup: budget.baseMarkup,
    },
    organizationId
  )

  const lineInputs: BudgetLineInput[] = budget.lines.map((line) => ({
    id: line.id,
    rowOrder: line.rowOrder,
    section: line.section as "PASSTHROUGH" | "SANDBOX" | "STAFFING" | "SUMMARY",
    lineType: line.lineType as "NORMAL" | "STAFFING" | "SUBTOTAL",
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
    processingFeePercent: line.processingFeePercent ? Number(line.processingFeePercent) : undefined,
  }))

  const computedLines = computeAllBudgetLines(lineInputs, context)
  const summary = calculateBudgetSummary(computedLines)

  return {
    projectId,
    projectName: budget.project.name,
    clientName: budget.project.client?.name || null,
    jurisdiction: budget.jurisdiction,
    baseMarkup: budget.baseMarkup,
    summary,
    lines: computedLines,
    metadata: {
      lineCount: computedLines.length,
      hasPassthrough: computedLines.some((l) => l.section === "PASSTHROUGH"),
      hasSandbox: computedLines.some((l) => l.section === "SANDBOX"),
      hasStaffing: computedLines.some((l) => l.section === "STAFFING"),
      computedAt: new Date().toISOString(),
    },
  }
}

export async function computeBudgetLines(
  projectId: string,
  organizationId: string
): Promise<ComputedBudgetLine[] | null> {
  const result = await computeBudgetSummary(projectId, organizationId)
  return result?.lines || null
}

export async function computeBudgetVariance(
  projectId: string,
  organizationId: string
): Promise<BudgetVarianceResult | null> {
  const result = await computeBudgetSummary(projectId, organizationId)
  if (!result) return null

  const lineVariances = result.lines
    .filter((line) => line.lineType !== "SUBTOTAL")
    .map((line) => ({
      id: line.id,
      description: line.description,
      section: line.section,
      forecast: line.forecast,
      actual: line.actual,
      variance: line.variance,
      remaining: line.remaining,
    }))

  const totalForecast = result.summary.cogsForecast
  const totalActual = result.summary.cogsActual
  const totalVariance = totalForecast - totalActual
  const variancePercent = totalForecast > 0 ? (totalVariance / totalForecast) * 100 : 0

  return {
    projectId,
    projectName: result.projectName,
    summary: {
      totalForecast,
      totalActual,
      totalVariance,
      variancePercent,
    },
    lineVariances,
  }
}

export async function computeBudgetReconcile(
  projectId: string,
  organizationId: string
): Promise<BudgetReconcileResult | null> {
  const budget = await prisma.budget.findFirst({
    where: {
      projectId,
      project: { organizationId },
    },
    include: {
      project: true,
      lines: true,
    },
  })

  if (!budget || !budget.projectId || !budget.project) return null

  const [expenseEntries, actualCostEntries] = await Promise.all([
    prisma.expenseEntry.findMany({
      where: { projectId: budget.projectId },
    }),
    prisma.actualCostEntry.findMany({
      where: { projectId: budget.projectId },
    }),
  ])

  const lineDescriptions = new Set(budget.lines.map((l) => l.description).filter(Boolean))
  const linkedExpenseIds = new Set(expenseEntries.filter((e) => e.budgetLineId).map((e) => e.id))
  const linkedActualIds = new Set(actualCostEntries.filter((a) => a.budgetLineId).map((a) => a.id))

  const unmatchedExpenses = expenseEntries
    .filter((e) => !linkedExpenseIds.has(e.id) && !lineDescriptions.has(e.description))
    .map((e) => ({
      id: e.id,
      description: e.description,
      amount: Number(e.amount),
      date: e.date?.toISOString() || null,
    }))

  const unmatchedActuals = actualCostEntries
    .filter((a) => !linkedActualIds.has(a.id) && !lineDescriptions.has(a.description))
    .map((a) => ({
      id: a.id,
      description: a.description,
      amount: Number(a.amount),
      date: a.date?.toISOString() || null,
    }))

  return {
    projectId,
    projectName: budget.project.name,
    unmatchedExpenses,
    unmatchedActuals,
    matchedCount: linkedExpenseIds.size + linkedActualIds.size,
    unmatchedExpenseTotal: unmatchedExpenses.reduce((sum, e) => sum + e.amount, 0),
    unmatchedActualTotal: unmatchedActuals.reduce((sum, a) => sum + a.amount, 0),
  }
}

export type AnomalyType = 'over_forecast' | 'over_budget' | 'high_variance' | 'unmatched_actual'

export interface BudgetAnomaly {
  projectId: string
  projectName: string
  clientName: string | null
  projectStatus: string
  lineId: string | null
  lineName: string
  section: string
  anomalyType: AnomalyType
  forecast: number
  actual: number
  variance: number
  variancePercent: number
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  internalCost?: number
  matchMode: 'linked' | 'description' | 'ambiguous' | 'unmatched'
  denominatorUsed: number
  topActualDrivers?: Array<{
    id: string
    date: string | null
    vendor: string | null
    description: string
    amount: number
    linkedToLine: boolean
  }>
  topForecastDrivers?: Array<{
    id: string
    date: string | null
    vendor: string | null
    description: string
    amount: number
    linkedToLine: boolean
  }>
  lastUpdatedAt?: string
}

export interface FindBudgetAnomaliesParams {
  anomalyType?: AnomalyType
  threshold?: number
  limit?: number
  projectStatus?: string[]
  minBase?: number
  variancePercentThreshold?: number
  epsilon?: number
  section?: string
  vendor?: string
  clientId?: string
  dateFrom?: string
  dateTo?: string
}

const anomalyCache = new Map<string, { data: BudgetAnomaly[], expiresAt: number }>()
const CACHE_TTL_MS = 60 * 1000

function getCacheKey(orgId: string, params: FindBudgetAnomaliesParams): string {
  return `${orgId}:${JSON.stringify(params)}`
}

export async function findBudgetAnomalies(
  organizationId: string,
  params: FindBudgetAnomaliesParams = {}
): Promise<BudgetAnomaly[]> {
  const cacheKey = getCacheKey(organizationId, params)
  const cached = anomalyCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data
  }

  const {
    anomalyType,
    threshold = 100,
    limit = 20,
    projectStatus = ['Active', 'Onsite'],
    minBase = 200,
    variancePercentThreshold = 0.20,
    epsilon = 10,
    section: sectionFilter,
    vendor: vendorFilter,
    clientId,
    dateFrom,
    dateTo,
  } = params

  const budgets = await prisma.budget.findMany({
    where: {
      projectId: { not: null },
      project: {
        organizationId,
        status: { in: projectStatus as ProjectStatus[] },
        ...(clientId && { clientId }),
      },
    },
    include: {
      project: {
        include: { client: { select: { name: true } } },
      },
      lines: {
        orderBy: { rowOrder: 'asc' },
      },
    },
  })

  type BudgetWithIncludes = typeof budgets[number] & {
    projectId: string
    project: NonNullable<typeof budgets[number]['project']>
  }

  const validBudgets = budgets.filter(
    (budget): budget is BudgetWithIncludes =>
      budget.projectId !== null && budget.project !== null
  )

  const projectIds = validBudgets.map((b) => b.projectId)
  
  const dateFilter: { gte?: Date; lte?: Date } = {}
  if (dateFrom) dateFilter.gte = new Date(dateFrom)
  if (dateTo) dateFilter.lte = new Date(dateTo)
  const hasDateFilter = Object.keys(dateFilter).length > 0

  const [allActualEntries, allExpenseEntries] = await Promise.all([
    prisma.actualCostEntry.findMany({
      where: {
        projectId: { in: projectIds },
        ...(hasDateFilter && { date: dateFilter }),
      },
      orderBy: { amount: 'desc' },
    }),
    prisma.expenseEntry.findMany({
      where: {
        projectId: { in: projectIds },
        ...(hasDateFilter && { date: dateFilter }),
      },
      orderBy: { amount: 'desc' },
    }),
  ])

  const actualsByProjectId = new Map<string, typeof allActualEntries>()
  const expensesByProjectId = new Map<string, typeof allExpenseEntries>()
  
  for (const entry of allActualEntries) {
    const arr = actualsByProjectId.get(entry.projectId) ?? []
    arr.push(entry)
    actualsByProjectId.set(entry.projectId, arr)
  }
  for (const entry of allExpenseEntries) {
    const arr = expensesByProjectId.get(entry.projectId) ?? []
    arr.push(entry)
    expensesByProjectId.set(entry.projectId, arr)
  }

  const anomalies: BudgetAnomaly[] = []

  for (const budget of validBudgets) {
    const context = await buildBudgetContext(
      {
        id: budget.id,
        projectId: budget.projectId,
        jurisdiction: budget.jurisdiction,
        baseMarkup: budget.baseMarkup,
      },
      organizationId
    )

    const lineInputs: BudgetLineInput[] = budget.lines.map((line) => ({
      id: line.id,
      rowOrder: line.rowOrder,
      section: line.section as 'PASSTHROUGH' | 'SANDBOX' | 'STAFFING' | 'SUMMARY',
      lineType: line.lineType as 'NORMAL' | 'STAFFING' | 'SUBTOTAL',
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
      processingFeePercent: line.processingFeePercent ? Number(line.processingFeePercent) : undefined,
    }))

    const computedLines = computeAllBudgetLines(lineInputs, context)
    const projectActuals = actualsByProjectId.get(budget.projectId) ?? []
    const projectExpenses = expensesByProjectId.get(budget.projectId) ?? []

    for (const line of computedLines) {
      if (line.lineType === 'SUBTOTAL') continue

      if (sectionFilter && line.section !== sectionFilter) continue
      if (vendorFilter && (!line.vendor || !line.vendor.toLowerCase().includes(vendorFilter.toLowerCase()))) continue

      const lineActuals = projectActuals.filter(
        (a) => a.budgetLineId === line.id || 
               (line.description && a.description.toLowerCase() === line.description.toLowerCase())
      )
      const lineExpenses = projectExpenses.filter(
        (e) => e.budgetLineId === line.id ||
               (line.description && e.description.toLowerCase() === line.description.toLowerCase())
      )

      const linkedActualAmount = lineActuals
        .filter((a) => a.budgetLineId === line.id)
        .reduce((sum, a) => sum + Number(a.amount), 0)
      const descMatchActualAmount = lineActuals
        .filter((a) => a.budgetLineId !== line.id)
        .reduce((sum, a) => sum + Number(a.amount), 0)
      const totalActualAmount = linkedActualAmount + descMatchActualAmount

      let matchMode: 'linked' | 'description' | 'ambiguous' | 'unmatched' = 'unmatched'
      if (totalActualAmount > 0) {
        if (linkedActualAmount >= totalActualAmount * 0.5) {
          matchMode = 'linked'
        } else if (descMatchActualAmount > 0) {
          matchMode = 'description'
        }
      }

      const topActualDrivers = lineActuals
        .slice(0, 3)
        .map((a) => ({
          id: a.id,
          date: a.date?.toISOString() || null,
          vendor: a.vendor,
          description: a.description,
          amount: Number(a.amount),
          linkedToLine: a.budgetLineId === line.id,
        }))

      const topForecastDrivers = lineExpenses
        .slice(0, 3)
        .map((e) => ({
          id: e.id,
          date: e.date?.toISOString() || null,
          vendor: e.vendor,
          description: e.description,
          amount: Number(e.amount),
          linkedToLine: e.budgetLineId === line.id,
        }))

      let detectedType: AnomalyType | null = null
      let variance = 0
      let variancePercent = 0
      let denominatorUsed = 1

      if (anomalyType === 'over_forecast' || !anomalyType) {
        if (line.forecast >= minBase && line.actual > line.forecast + epsilon) {
          variance = line.actual - line.forecast
          denominatorUsed = Math.max(line.actual, line.forecast, 1)
          variancePercent = (variance / denominatorUsed) * 100
          if (Math.abs(variance) >= threshold) {
            detectedType = 'over_forecast'
          }
        }
      }

      if (!detectedType && (anomalyType === 'over_budget' || !anomalyType)) {
        if (line.internalCost >= minBase && line.actual > line.internalCost + epsilon) {
          variance = line.actual - line.internalCost
          denominatorUsed = Math.max(line.actual, line.internalCost, 1)
          variancePercent = (variance / denominatorUsed) * 100
          if (Math.abs(variance) >= threshold) {
            detectedType = 'over_budget'
          }
        }
      }

      if (!detectedType && (anomalyType === 'high_variance' || !anomalyType)) {
        const maxBase = Math.max(line.actual, line.forecast)
        if (maxBase >= minBase) {
          const diff = Math.abs(line.actual - line.forecast)
          denominatorUsed = Math.max(line.actual, line.forecast, 1)
          const varianceRatio = diff / denominatorUsed
          if (varianceRatio >= variancePercentThreshold && diff >= threshold) {
            variance = line.actual - line.forecast
            variancePercent = varianceRatio * 100
            detectedType = 'high_variance'
          }
        }
      }

      if (detectedType) {
        const absVariance = Math.abs(variance)
        let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW'
        if (absVariance >= 5000) severity = 'CRITICAL'
        else if (absVariance >= 2000) severity = 'HIGH'
        else if (absVariance >= 500) severity = 'MEDIUM'

        const latestUpdate = [...lineActuals, ...lineExpenses]
          .map((e) => e.updatedAt)
          .filter(Boolean)
          .sort((a, b) => b.getTime() - a.getTime())[0]

        anomalies.push({
          projectId: budget.projectId,
          projectName: budget.project.name,
          clientName: budget.project.client?.name || null,
          projectStatus: budget.project.status,
          lineId: line.id,
          lineName: line.description || '(Unnamed line)',
          section: line.section,
          anomalyType: detectedType,
          forecast: line.forecast,
          actual: line.actual,
          variance,
          variancePercent,
          severity,
          internalCost: line.internalCost,
          matchMode,
          denominatorUsed,
          topActualDrivers: topActualDrivers.length > 0 ? topActualDrivers : undefined,
          topForecastDrivers: topForecastDrivers.length > 0 ? topForecastDrivers : undefined,
          lastUpdatedAt: latestUpdate?.toISOString(),
        })
      }
    }
  }

  if (!anomalyType || anomalyType === 'unmatched_actual') {
    const unmatchedActuals = allActualEntries.filter((a) => a.budgetLineId === null)
    
    const budgetLineDescriptions = new Map<string, Set<string>>()
    for (const budget of validBudgets) {
      const descriptions = new Set<string>()
      for (const line of budget.lines) {
        if (line.description) {
          descriptions.add(line.description.toLowerCase())
        }
      }
      budgetLineDescriptions.set(budget.projectId, descriptions)
    }

    const unmatchedByProject = new Map<string, typeof unmatchedActuals>()
    for (const entry of unmatchedActuals) {
      const projectDescriptions = budgetLineDescriptions.get(entry.projectId)
      if (!projectDescriptions) continue

      const matchingLines = Array.from(projectDescriptions).filter(
        (desc) => desc === entry.description.toLowerCase()
      )
      
      if (matchingLines.length === 0 || matchingLines.length > 1) {
        const arr = unmatchedByProject.get(entry.projectId) ?? []
        arr.push(entry)
        unmatchedByProject.set(entry.projectId, arr)
      }
    }

    for (const projectId of Array.from(unmatchedByProject.keys())) {
      const entries = unmatchedByProject.get(projectId)!
      const budget = validBudgets.find((b) => b.projectId === projectId)
      if (!budget) continue

      const totalAmount = entries.reduce((sum: number, e: typeof entries[number]) => sum + Number(e.amount), 0)
      if (totalAmount < threshold) continue

      const projectDescriptions = budgetLineDescriptions.get(projectId)!
      const hasAmbiguous = entries.some((e: typeof entries[number]) => {
        const matches = Array.from(projectDescriptions).filter(
          (desc) => desc === e.description.toLowerCase()
        )
        return matches.length > 1
      })

      let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW'
      if (totalAmount >= 5000) severity = 'CRITICAL'
      else if (totalAmount >= 2000) severity = 'HIGH'
      else if (totalAmount >= 500) severity = 'MEDIUM'

      anomalies.push({
        projectId,
        projectName: budget.project.name,
        clientName: budget.project.client?.name || null,
        projectStatus: budget.project.status,
        lineId: null,
        lineName: '(Unmatched costs)',
        section: 'UNKNOWN',
        anomalyType: 'unmatched_actual',
        forecast: 0,
        actual: totalAmount,
        variance: totalAmount,
        variancePercent: 100,
        severity,
        matchMode: hasAmbiguous ? 'ambiguous' : 'unmatched',
        denominatorUsed: totalAmount,
        topActualDrivers: entries.slice(0, 3).map((e: typeof entries[number]) => ({
          id: e.id,
          date: e.date?.toISOString() || null,
          vendor: e.vendor,
          description: e.description,
          amount: Number(e.amount),
          linkedToLine: false,
        })),
      })
    }
  }

  anomalies.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))

  const result = anomalies.slice(0, limit)
  anomalyCache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS })
  return result
}

export async function computeAgencyBudgetSummary(
  organizationId: string
): Promise<{
  projects: Array<{
    projectId: string
    projectName: string
    clientName: string | null
    status: string
    revenue: number
    cogsForecast: number
    cogsActual: number
    forecastMargin: number
    forecastMarginPercent: number
    actualMargin: number
    actualMarginPercent: number
    staffingRevenue: number
    staffingCost: number
  }>
  totals: {
    totalRevenue: number
    totalCogsForecast: number
    totalCogsActual: number
    totalForecastMargin: number
    overallForecastMarginPercent: number
    totalActualMargin: number
    overallActualMarginPercent: number
  }
}> {
  const [budgets, staffingPlans] = await Promise.all([
    prisma.budget.findMany({
      where: {
        projectId: { not: null },
        project: { organizationId },
      },
      include: {
        project: {
          include: { client: { select: { name: true } } },
        },
        lines: true,
      },
    }),
    prisma.staffingPlan.findMany({
      where: {
        project: { organizationId },
      },
      include: {
        assignments: {
          include: {
            allocations: true,
          },
        },
      },
    }),
  ])

  const staffingByProjectId = new Map<string, { revenue: number; cost: number }>()
  for (const plan of staffingPlans) {
    let revenue = 0
    let cost = 0
    for (const assignment of plan.assignments) {
      const totalHours = assignment.allocations.reduce(
        (sum, alloc) => sum + Number(alloc.plannedHours),
        0
      )
      const clientRate = Number(assignment.clientBillRate) || 0
      const internalBill = Number(assignment.billRate) || 0
      const internalCost = Number(assignment.costRate) || 0
      revenue += clientRate * totalHours
      cost += internalBill > 0
        ? (clientRate * totalHours) * (internalCost / internalBill)
        : internalCost * totalHours
    }
    staffingByProjectId.set(plan.projectId, { revenue, cost })
  }

  const validBudgets = budgets.filter(
    (budget): budget is typeof budget & { projectId: string; project: NonNullable<typeof budget.project> } =>
      budget.projectId !== null && budget.project !== null
  )

  const projectSummaries = await Promise.all(
    validBudgets.map(async (budget) => {
      const context = await buildBudgetContext(
        {
          id: budget.id,
          projectId: budget.projectId,
          jurisdiction: budget.jurisdiction,
          baseMarkup: budget.baseMarkup,
        },
        organizationId
      )

      const lineInputs: BudgetLineInput[] = budget.lines.map((line) => ({
        id: line.id,
        rowOrder: line.rowOrder,
        section: line.section as "PASSTHROUGH" | "SANDBOX" | "STAFFING" | "SUMMARY",
        lineType: line.lineType as "NORMAL" | "STAFFING" | "SUBTOTAL",
        taxCategory: line.taxCategory,
        description: line.description,
        ovh: line.ovh,
        vendor: line.vendor,
        units: line.units,
        internalCostInput: line.internalCostInput,
        markupOverride: line.markupOverride,
        internalNotes: line.internalNotes,
        clientNotes: line.clientNotes,
      }))

      const computedLines = computeAllBudgetLines(lineInputs, context)
      const summary = calculateBudgetSummary(computedLines)

      const staffingData = staffingByProjectId.get(budget.projectId) || { revenue: 0, cost: 0 }
      const totalRevenue = summary.revenue + staffingData.revenue
      const totalCogsForecast = summary.cogsForecast + staffingData.cost
      const totalCogsActual = summary.cogsActual + staffingData.cost
      const forecastMargin = totalRevenue - totalCogsForecast
      const forecastMarginPercent = totalRevenue > 0 ? (forecastMargin / totalRevenue) * 100 : 0
      const actualMargin = totalRevenue - totalCogsActual
      const actualMarginPercent = totalRevenue > 0 ? (actualMargin / totalRevenue) * 100 : 0

      return {
        projectId: budget.projectId,
        projectName: budget.project.name,
        clientName: budget.project.client?.name || null,
        status: budget.project.status,
        revenue: totalRevenue,
        cogsForecast: totalCogsForecast,
        cogsActual: totalCogsActual,
        forecastMargin,
        forecastMarginPercent,
        actualMargin,
        actualMarginPercent,
        staffingRevenue: staffingData.revenue,
        staffingCost: staffingData.cost,
      }
    })
  )

  const totals = projectSummaries.reduce(
    (acc, p) => ({
      totalRevenue: acc.totalRevenue + p.revenue,
      totalCogsForecast: acc.totalCogsForecast + p.cogsForecast,
      totalCogsActual: acc.totalCogsActual + p.cogsActual,
      totalForecastMargin: acc.totalForecastMargin + p.forecastMargin,
      totalActualMargin: acc.totalActualMargin + p.actualMargin,
    }),
    { totalRevenue: 0, totalCogsForecast: 0, totalCogsActual: 0, totalForecastMargin: 0, totalActualMargin: 0 }
  )

  const overallForecastMarginPercent =
    totals.totalRevenue > 0 ? (totals.totalForecastMargin / totals.totalRevenue) * 100 : 0
  const overallActualMarginPercent =
    totals.totalRevenue > 0 ? (totals.totalActualMargin / totals.totalRevenue) * 100 : 0

  return {
    projects: projectSummaries,
    totals: {
      ...totals,
      overallForecastMarginPercent,
      overallActualMarginPercent,
    },
  }
}
