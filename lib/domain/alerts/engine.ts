import { prisma } from "@/lib/prisma"
import { computeBudgetSummary, computeBudgetReconcile, computeBudgetLines } from "@/lib/domain/budget/compute"
import { computeStaffingPlan } from "@/lib/domain/staffing/compute"
import type { AlertRuleType, AlertSeverity, Prisma } from "@prisma/client"

const SAFETY_CAP_PER_ORG_RUN = 50
const DEFAULT_COOLDOWN_HOURS = 4

interface AlertThresholds {
  marginTargetPercent: number
  marginCriticalPercent: number
  marginDropThreshold: number
  unmatchedAmountThreshold: number
  unmatchedCountThreshold: number
  lineForecastDiffThreshold: number
  lineForecastPctThreshold: number
  sectionForecastDiffThreshold: number
  sectionForecastPctThreshold: number
  weeklyCapHours: number
  onsiteMinimumHours: number
  purchaseAgeHours: number
  purchaseEventDays: number
  taskDueHours: number
}

const DEFAULT_THRESHOLDS: AlertThresholds = {
  marginTargetPercent: 30,
  marginCriticalPercent: 20,
  marginDropThreshold: 3,
  unmatchedAmountThreshold: 5000,
  unmatchedCountThreshold: 10,
  lineForecastDiffThreshold: 2000,
  lineForecastPctThreshold: 20,
  sectionForecastDiffThreshold: 5000,
  sectionForecastPctThreshold: 25,
  weeklyCapHours: 40,
  onsiteMinimumHours: 20,
  purchaseAgeHours: 24,
  purchaseEventDays: 7,
  taskDueHours: 72,
}

interface AlertRuleConfigMap {
  [key: string]: { isEnabled: boolean; config?: Record<string, unknown> }
}

interface CreateAlertParams {
  organizationId: string
  projectId: string | null
  ruleType: AlertRuleType
  severity: AlertSeverity
  dimension: string
  title: string
  body: string
  data: Record<string, unknown>
  recipientUserIds: string[]
}

interface AlertCounter {
  count: number
}

async function getDefaultThresholds(organizationId: string): Promise<AlertThresholds> {
  const configs = await prisma.alertRuleConfig.findMany({
    where: { organizationId },
  })

  const thresholds = { ...DEFAULT_THRESHOLDS }

  for (const config of configs) {
    if (config.config && typeof config.config === "object") {
      const cfg = config.config as Record<string, unknown>
      if (config.key === "MARGIN_BELOW_TARGET") {
        if (typeof cfg.targetPercent === "number") thresholds.marginTargetPercent = cfg.targetPercent
        if (typeof cfg.criticalPercent === "number") thresholds.marginCriticalPercent = cfg.criticalPercent
      } else if (config.key === "MARGIN_DROP_24H") {
        if (typeof cfg.dropThreshold === "number") thresholds.marginDropThreshold = cfg.dropThreshold
      } else if (config.key === "UNMATCHED_ACTUALS" || config.key === "UNMATCHED_FORECAST") {
        if (typeof cfg.amountThreshold === "number") thresholds.unmatchedAmountThreshold = cfg.amountThreshold
        if (typeof cfg.countThreshold === "number") thresholds.unmatchedCountThreshold = cfg.countThreshold
      } else if (config.key === "STAFFING_OVER_CAP_NEXT_WEEK") {
        if (typeof cfg.weeklyCapHours === "number") thresholds.weeklyCapHours = cfg.weeklyCapHours
      } else if (config.key === "ONSITE_UNDERSTAFFED") {
        if (typeof cfg.minimumHours === "number") thresholds.onsiteMinimumHours = cfg.minimumHours
      }
    }
  }

  return thresholds
}

async function getRuleConfigs(organizationId: string): Promise<AlertRuleConfigMap> {
  const configs = await prisma.alertRuleConfig.findMany({
    where: { organizationId },
  })

  const configMap: AlertRuleConfigMap = {}
  for (const config of configs) {
    configMap[config.key] = {
      isEnabled: config.isEnabled,
      config: config.config as Record<string, unknown> | undefined,
    }
  }

  return configMap
}

function isRuleEnabled(ruleType: AlertRuleType, configMap: AlertRuleConfigMap): boolean {
  if (ruleType === "ONSITE_UNDERSTAFFED") {
    return configMap[ruleType]?.isEnabled ?? false
  }
  return configMap[ruleType]?.isEnabled ?? true
}

async function getAlertRecipients(
  projectId: string | null,
  organizationId: string
): Promise<string[]> {
  const recipientIds: Set<string> = new Set()

  const orgAdmins = await prisma.user.findMany({
    where: {
      organizationId,
      role: "ADMIN",
      approvalStatus: "APPROVED",
    },
    select: { id: true },
  })
  for (const admin of orgAdmins) {
    recipientIds.add(admin.id)
  }

  if (projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerUserId: true },
    })
    if (project?.ownerUserId) {
      recipientIds.add(project.ownerUserId)
    }
  }

  return Array.from(recipientIds)
}

function buildDedupeKey(ruleType: AlertRuleType, projectId: string | null, dimension: string): string {
  return `${ruleType}:${projectId ?? "org"}:${dimension}`
}

function getCooldownUntil(): Date {
  const cooldownUntil = new Date()
  cooldownUntil.setHours(cooldownUntil.getHours() + DEFAULT_COOLDOWN_HOURS)
  return cooldownUntil
}

async function createOrUpdateAlert(
  params: CreateAlertParams,
  counter: AlertCounter
): Promise<void> {
  if (counter.count >= SAFETY_CAP_PER_ORG_RUN) {
    return
  }

  const dedupeKey = buildDedupeKey(params.ruleType, params.projectId, params.dimension)
  const now = new Date()

  const existingAlert = await prisma.alertEvent.findUnique({
    where: {
      organizationId_dedupeKey: {
        organizationId: params.organizationId,
        dedupeKey,
      },
    },
  })

  if (existingAlert) {
    if (existingAlert.resolvedAt) {
      await prisma.alertEvent.update({
        where: { id: existingAlert.id },
        data: {
          severity: params.severity,
          title: params.title,
          body: params.body,
          data: params.data as Prisma.InputJsonValue,
          resolvedAt: null,
          lastFiredAt: now,
          cooldownUntil: getCooldownUntil(),
        },
      })
      counter.count++
      return
    }

    if (existingAlert.cooldownUntil && now < existingAlert.cooldownUntil) {
      const severityOrder: Record<AlertSeverity, number> = { INFO: 0, WARN: 1, CRITICAL: 2 }
      const existingSeverityLevel = severityOrder[existingAlert.severity as AlertSeverity]
      const newSeverityLevel = severityOrder[params.severity]

      if (newSeverityLevel > existingSeverityLevel) {
        await prisma.alertEvent.update({
          where: { id: existingAlert.id },
          data: {
            severity: params.severity,
            title: params.title,
            body: params.body,
            data: params.data as Prisma.InputJsonValue,
            lastFiredAt: now,
            cooldownUntil: getCooldownUntil(),
          },
        })
        counter.count++
      }
      return
    }

    await prisma.alertEvent.update({
      where: { id: existingAlert.id },
      data: {
        severity: params.severity,
        title: params.title,
        body: params.body,
        data: params.data as Prisma.InputJsonValue,
        lastFiredAt: now,
        cooldownUntil: getCooldownUntil(),
      },
    })
    counter.count++
    return
  }

  const alert = await prisma.alertEvent.create({
    data: {
      organizationId: params.organizationId,
      projectId: params.projectId,
      ruleType: params.ruleType,
      severity: params.severity,
      title: params.title,
      body: params.body,
      data: params.data as Prisma.InputJsonValue,
      dedupeKey,
      cooldownUntil: getCooldownUntil(),
      lastFiredAt: now,
    },
  })

  if (params.recipientUserIds.length > 0) {
    await prisma.alertRecipient.createMany({
      data: params.recipientUserIds.map((userId) => ({
        alertEventId: alert.id,
        userId,
      })),
      skipDuplicates: true,
    })
  }

  counter.count++
}

async function resolveAlert(
  ruleType: AlertRuleType,
  projectId: string | null,
  dimension: string,
  organizationId: string
): Promise<void> {
  const dedupeKey = buildDedupeKey(ruleType, projectId, dimension)

  await prisma.alertEvent.updateMany({
    where: {
      organizationId,
      dedupeKey,
      resolvedAt: null,
    },
    data: {
      resolvedAt: new Date(),
    },
  })
}

async function evaluateMarginBelowTarget(
  projectId: string,
  organizationId: string,
  thresholds: AlertThresholds,
  counter: AlertCounter
): Promise<void> {
  const budgetSummary = await computeBudgetSummary(projectId, organizationId)
  if (!budgetSummary) return

  const { summary, projectName } = budgetSummary
  const forecastMarginPercent = summary.forecastMarginPercent
  const dimension = "margin"
  const recipientUserIds = await getAlertRecipients(projectId, organizationId)

  if (forecastMarginPercent < thresholds.marginCriticalPercent) {
    await createOrUpdateAlert(
      {
        organizationId,
        projectId,
        ruleType: "MARGIN_BELOW_TARGET",
        severity: "CRITICAL",
        dimension,
        title: `Critical: ${projectName} margin at ${forecastMarginPercent.toFixed(1)}%`,
        body: `Project "${projectName}" forecast margin is critically low at ${forecastMarginPercent.toFixed(1)}%, well below the ${thresholds.marginTargetPercent}% target.`,
        data: {
          forecastMarginPercent,
          targetMarginPercent: thresholds.marginTargetPercent,
          revenue: summary.revenue,
          cogsForecast: summary.cogsForecast,
          actionUrl: `/projects/${projectId}/budget`,
        },
        recipientUserIds,
      },
      counter
    )
  } else if (forecastMarginPercent < thresholds.marginTargetPercent) {
    await createOrUpdateAlert(
      {
        organizationId,
        projectId,
        ruleType: "MARGIN_BELOW_TARGET",
        severity: "WARN",
        dimension,
        title: `Warning: ${projectName} margin below target at ${forecastMarginPercent.toFixed(1)}%`,
        body: `Project "${projectName}" forecast margin of ${forecastMarginPercent.toFixed(1)}% is below the ${thresholds.marginTargetPercent}% target.`,
        data: {
          forecastMarginPercent,
          targetMarginPercent: thresholds.marginTargetPercent,
          revenue: summary.revenue,
          cogsForecast: summary.cogsForecast,
          actionUrl: `/projects/${projectId}/budget`,
        },
        recipientUserIds,
      },
      counter
    )
  } else {
    await resolveAlert("MARGIN_BELOW_TARGET", projectId, dimension, organizationId)
  }
}

async function evaluateMarginDrop24H(
  projectId: string,
  organizationId: string,
  thresholds: AlertThresholds,
  counter: AlertCounter
): Promise<void> {
  const budgetSummary = await computeBudgetSummary(projectId, organizationId)
  if (!budgetSummary) return

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const yesterdaySnapshot = await prisma.budgetSnapshotDaily.findUnique({
    where: {
      projectId_date: {
        projectId,
        date: yesterday,
      },
    },
  })

  if (!yesterdaySnapshot) {
    return
  }

  const currentMargin = budgetSummary.summary.forecastMarginPercent
  const yesterdayMargin = (yesterdaySnapshot.forecastMargin / yesterdaySnapshot.revenue) * 100

  const marginDrop = yesterdayMargin - currentMargin
  const dimension = "drop24h"
  const recipientUserIds = await getAlertRecipients(projectId, organizationId)

  if (marginDrop >= thresholds.marginDropThreshold) {
    await createOrUpdateAlert(
      {
        organizationId,
        projectId,
        ruleType: "MARGIN_DROP_24H",
        severity: "WARN",
        dimension,
        title: `${budgetSummary.projectName} margin dropped ${marginDrop.toFixed(1)}pp in 24h`,
        body: `Project "${budgetSummary.projectName}" margin dropped from ${yesterdayMargin.toFixed(1)}% to ${currentMargin.toFixed(1)}% in the last 24 hours.`,
        data: {
          currentMarginPercent: currentMargin,
          previousMarginPercent: yesterdayMargin,
          dropAmount: marginDrop,
          actionUrl: `/projects/${projectId}/budget`,
        },
        recipientUserIds,
      },
      counter
    )
  } else {
    await resolveAlert("MARGIN_DROP_24H", projectId, dimension, organizationId)
  }
}

async function evaluateUnmatchedActuals(
  projectId: string,
  organizationId: string,
  thresholds: AlertThresholds,
  counter: AlertCounter
): Promise<void> {
  const reconcileResult = await computeBudgetReconcile(projectId, organizationId)
  if (!reconcileResult) return

  const { unmatchedActualTotal, unmatchedActuals, projectName } = reconcileResult
  const unmatchedCount = unmatchedActuals.length
  const dimension = "actuals"
  const recipientUserIds = await getAlertRecipients(projectId, organizationId)

  const atThreshold =
    unmatchedActualTotal > thresholds.unmatchedAmountThreshold ||
    unmatchedCount > thresholds.unmatchedCountThreshold
  const atCriticalThreshold =
    unmatchedActualTotal > thresholds.unmatchedAmountThreshold * 2 ||
    unmatchedCount > thresholds.unmatchedCountThreshold * 2

  if (atCriticalThreshold) {
    await createOrUpdateAlert(
      {
        organizationId,
        projectId,
        ruleType: "UNMATCHED_ACTUALS",
        severity: "CRITICAL",
        dimension,
        title: `Critical: ${projectName} has $${unmatchedActualTotal.toLocaleString()} unmatched actuals`,
        body: `Project "${projectName}" has ${unmatchedCount} unmatched actual cost entries totaling $${unmatchedActualTotal.toLocaleString()}. This exceeds double the threshold.`,
        data: {
          unmatchedActualTotal,
          unmatchedCount,
          threshold: thresholds.unmatchedAmountThreshold,
          actionUrl: `/projects/${projectId}/budget/reconcile`,
        },
        recipientUserIds,
      },
      counter
    )
  } else if (atThreshold) {
    await createOrUpdateAlert(
      {
        organizationId,
        projectId,
        ruleType: "UNMATCHED_ACTUALS",
        severity: "WARN",
        dimension,
        title: `${projectName} has $${unmatchedActualTotal.toLocaleString()} unmatched actuals`,
        body: `Project "${projectName}" has ${unmatchedCount} unmatched actual cost entries totaling $${unmatchedActualTotal.toLocaleString()}.`,
        data: {
          unmatchedActualTotal,
          unmatchedCount,
          threshold: thresholds.unmatchedAmountThreshold,
          actionUrl: `/projects/${projectId}/budget/reconcile`,
        },
        recipientUserIds,
      },
      counter
    )
  } else {
    await resolveAlert("UNMATCHED_ACTUALS", projectId, dimension, organizationId)
  }
}

async function evaluateUnmatchedForecast(
  projectId: string,
  organizationId: string,
  thresholds: AlertThresholds,
  counter: AlertCounter
): Promise<void> {
  const reconcileResult = await computeBudgetReconcile(projectId, organizationId)
  if (!reconcileResult) return

  const { unmatchedExpenseTotal, unmatchedExpenses, projectName } = reconcileResult
  const unmatchedCount = unmatchedExpenses.length
  const dimension = "forecast"
  const recipientUserIds = await getAlertRecipients(projectId, organizationId)

  const atThreshold =
    unmatchedExpenseTotal > thresholds.unmatchedAmountThreshold ||
    unmatchedCount > thresholds.unmatchedCountThreshold

  if (atThreshold) {
    await createOrUpdateAlert(
      {
        organizationId,
        projectId,
        ruleType: "UNMATCHED_FORECAST",
        severity: "WARN",
        dimension,
        title: `${projectName} has $${unmatchedExpenseTotal.toLocaleString()} unmatched forecast expenses`,
        body: `Project "${projectName}" has ${unmatchedCount} unmatched expense entries totaling $${unmatchedExpenseTotal.toLocaleString()}.`,
        data: {
          unmatchedExpenseTotal,
          unmatchedCount,
          threshold: thresholds.unmatchedAmountThreshold,
          actionUrl: `/projects/${projectId}/budget/reconcile`,
        },
        recipientUserIds,
      },
      counter
    )
  } else {
    await resolveAlert("UNMATCHED_FORECAST", projectId, dimension, organizationId)
  }
}

async function evaluateLineForecastOverBudget(
  projectId: string,
  organizationId: string,
  thresholds: AlertThresholds,
  counter: AlertCounter
): Promise<void> {
  const lines = await computeBudgetLines(projectId, organizationId)
  if (!lines) return

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true },
  })
  const projectName = project?.name ?? "Unknown Project"
  const recipientUserIds = await getAlertRecipients(projectId, organizationId)

  const triggeredLineIds = new Set<string>()

  for (const line of lines) {
    if (line.lineType === "SUBTOTAL") continue

    const diff = line.forecast - line.internalCost
    const pct = line.internalCost > 0 ? (diff / line.internalCost) * 100 : 0
    const dimension = `line:${line.id}`

    if (
      line.forecast > line.internalCost &&
      diff > thresholds.lineForecastDiffThreshold &&
      pct > thresholds.lineForecastPctThreshold
    ) {
      triggeredLineIds.add(line.id)
      await createOrUpdateAlert(
        {
          organizationId,
          projectId,
          ruleType: "LINE_FORECAST_OVER_BUDGET",
          severity: "WARN",
          dimension,
          title: `${projectName}: "${line.description ?? "Line"}" over budget by $${diff.toFixed(0)}`,
          body: `Budget line "${line.description ?? "Unknown"}" in "${projectName}" is forecasting $${line.forecast.toFixed(0)} vs budget of $${line.internalCost.toFixed(0)} (${pct.toFixed(1)}% over).`,
          data: {
            budgetLineId: line.id,
            description: line.description,
            forecast: line.forecast,
            internalCost: line.internalCost,
            difference: diff,
            percentOver: pct,
            actionUrl: `/projects/${projectId}/budget`,
          },
          recipientUserIds,
        },
        counter
      )
    }
  }

  const existingAlerts = await prisma.alertEvent.findMany({
    where: {
      organizationId,
      projectId,
      ruleType: "LINE_FORECAST_OVER_BUDGET",
      resolvedAt: null,
    },
  })

  for (const alert of existingAlerts) {
    const lineIdMatch = alert.dedupeKey.match(/line:([^:]+)$/)
    if (lineIdMatch && !triggeredLineIds.has(lineIdMatch[1])) {
      const dimension = `line:${lineIdMatch[1]}`
      await resolveAlert("LINE_FORECAST_OVER_BUDGET", projectId, dimension, organizationId)
    }
  }
}

async function evaluateSectionForecastOverBudget(
  projectId: string,
  organizationId: string,
  thresholds: AlertThresholds,
  counter: AlertCounter
): Promise<void> {
  const lines = await computeBudgetLines(projectId, organizationId)
  if (!lines) return

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true },
  })
  const projectName = project?.name ?? "Unknown Project"
  const recipientUserIds = await getAlertRecipients(projectId, organizationId)

  const sectionTotals: Record<string, { forecast: number; internalCost: number }> = {}

  for (const line of lines) {
    if (line.lineType === "SUBTOTAL") continue
    if (!sectionTotals[line.section]) {
      sectionTotals[line.section] = { forecast: 0, internalCost: 0 }
    }
    sectionTotals[line.section].forecast += line.forecast
    sectionTotals[line.section].internalCost += line.internalCost
  }

  const triggeredSections = new Set<string>()

  for (const [section, totals] of Object.entries(sectionTotals)) {
    const diff = totals.forecast - totals.internalCost
    const pct = totals.internalCost > 0 ? (diff / totals.internalCost) * 100 : 0
    const dimension = `section:${section}`

    if (
      totals.forecast > totals.internalCost &&
      diff > thresholds.sectionForecastDiffThreshold &&
      pct > thresholds.sectionForecastPctThreshold
    ) {
      triggeredSections.add(section)
      await createOrUpdateAlert(
        {
          organizationId,
          projectId,
          ruleType: "SECTION_FORECAST_OVER_BUDGET",
          severity: "WARN",
          dimension,
          title: `${projectName}: ${section} section over budget by $${diff.toFixed(0)}`,
          body: `The ${section} section in "${projectName}" is forecasting $${totals.forecast.toFixed(0)} vs budget of $${totals.internalCost.toFixed(0)} (${pct.toFixed(1)}% over).`,
          data: {
            section,
            forecast: totals.forecast,
            internalCost: totals.internalCost,
            difference: diff,
            percentOver: pct,
            actionUrl: `/projects/${projectId}/budget`,
          },
          recipientUserIds,
        },
        counter
      )
    }
  }

  const existingAlerts = await prisma.alertEvent.findMany({
    where: {
      organizationId,
      projectId,
      ruleType: "SECTION_FORECAST_OVER_BUDGET",
      resolvedAt: null,
    },
  })

  for (const alert of existingAlerts) {
    const sectionMatch = alert.dedupeKey.match(/section:([^:]+)$/)
    if (sectionMatch && !triggeredSections.has(sectionMatch[1])) {
      const dimension = `section:${sectionMatch[1]}`
      await resolveAlert("SECTION_FORECAST_OVER_BUDGET", projectId, dimension, organizationId)
    }
  }
}

async function evaluateStaffingOverCapNextWeek(
  projectId: string,
  organizationId: string,
  thresholds: AlertThresholds,
  counter: AlertCounter
): Promise<void> {
  const staffingPlan = await computeStaffingPlan(projectId, organizationId)
  if (!staffingPlan) return

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true },
  })
  const projectName = project?.name ?? "Unknown Project"
  const recipientUserIds = await getAlertRecipients(projectId, organizationId)

  const now = new Date()
  const nextWeekStart = new Date(now)
  nextWeekStart.setDate(now.getDate() + (7 - now.getDay() + 1))
  nextWeekStart.setHours(0, 0, 0, 0)
  const nextWeekEnd = new Date(nextWeekStart)
  nextWeekEnd.setDate(nextWeekEnd.getDate() + 7)

  const weeklyRoleHours: Record<string, Record<string, number>> = {}

  for (const allocation of staffingPlan.allocations) {
    const allocDate = new Date(allocation.weekStartDate)
    if (allocDate >= nextWeekStart && allocDate < nextWeekEnd) {
      const weekKey = allocation.weekStartDate.split("T")[0]
      if (!weeklyRoleHours[weekKey]) {
        weeklyRoleHours[weekKey] = {}
      }
      if (!weeklyRoleHours[weekKey][allocation.roleName]) {
        weeklyRoleHours[weekKey][allocation.roleName] = 0
      }
      weeklyRoleHours[weekKey][allocation.roleName] += allocation.plannedHours
    }
  }

  const triggeredDimensions = new Set<string>()

  for (const [weekStart, roles] of Object.entries(weeklyRoleHours)) {
    for (const [roleName, hours] of Object.entries(roles)) {
      const dimension = `weekStart:${weekStart}:role:${roleName}`

      if (hours > thresholds.weeklyCapHours) {
        triggeredDimensions.add(dimension)
        const severity: AlertSeverity = hours > thresholds.weeklyCapHours * 1.5 ? "CRITICAL" : "WARN"

        await createOrUpdateAlert(
          {
            organizationId,
            projectId,
            ruleType: "STAFFING_OVER_CAP_NEXT_WEEK",
            severity,
            dimension,
            title: `${projectName}: ${roleName} scheduled for ${hours.toFixed(0)}h next week`,
            body: `Role "${roleName}" in "${projectName}" is scheduled for ${hours.toFixed(0)} hours in the week of ${weekStart}, exceeding the ${thresholds.weeklyCapHours}h cap.`,
            data: {
              roleName,
              weekStart,
              plannedHours: hours,
              capHours: thresholds.weeklyCapHours,
              actionUrl: `/projects/${projectId}/staffing-plan`,
            },
            recipientUserIds,
          },
          counter
        )
      }
    }
  }

  const existingAlerts = await prisma.alertEvent.findMany({
    where: {
      organizationId,
      projectId,
      ruleType: "STAFFING_OVER_CAP_NEXT_WEEK",
      resolvedAt: null,
    },
  })

  for (const alert of existingAlerts) {
    const match = alert.dedupeKey.match(/weekStart:([^:]+):role:(.+)$/)
    if (match) {
      const dim = `weekStart:${match[1]}:role:${match[2]}`
      if (!triggeredDimensions.has(dim)) {
        await resolveAlert("STAFFING_OVER_CAP_NEXT_WEEK", projectId, dim, organizationId)
      }
    }
  }
}

async function evaluateOnsiteUnderstaffed(
  projectId: string,
  organizationId: string,
  thresholds: AlertThresholds,
  counter: AlertCounter
): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, startDate: true },
  })
  if (!project?.startDate) return

  const staffingPlan = await computeStaffingPlan(projectId, organizationId)
  if (!staffingPlan) return

  const recipientUserIds = await getAlertRecipients(projectId, organizationId)

  const startWeek = new Date(project.startDate)
  startWeek.setDate(startWeek.getDate() - startWeek.getDay())
  startWeek.setHours(0, 0, 0, 0)
  const startWeekKey = startWeek.toISOString().split("T")[0]

  let onsiteWeekHours = 0
  for (const allocation of staffingPlan.allocations) {
    const allocWeek = allocation.weekStartDate.split("T")[0]
    if (allocWeek === startWeekKey) {
      onsiteWeekHours += allocation.plannedHours
    }
  }

  const dimension = `onsiteWeek:${startWeekKey}`

  if (onsiteWeekHours < thresholds.onsiteMinimumHours) {
    await createOrUpdateAlert(
      {
        organizationId,
        projectId,
        ruleType: "ONSITE_UNDERSTAFFED",
        severity: "WARN",
        dimension,
        title: `${project.name}: Only ${onsiteWeekHours.toFixed(0)}h staffed for onsite week`,
        body: `Project "${project.name}" has only ${onsiteWeekHours.toFixed(0)} hours staffed for the onsite week starting ${startWeekKey}, below the ${thresholds.onsiteMinimumHours}h minimum.`,
        data: {
          weekStart: startWeekKey,
          plannedHours: onsiteWeekHours,
          minimumHours: thresholds.onsiteMinimumHours,
          actionUrl: `/projects/${projectId}/staffing-plan`,
        },
        recipientUserIds,
      },
      counter
    )
  } else {
    await resolveAlert("ONSITE_UNDERSTAFFED", projectId, dimension, organizationId)
  }
}

async function evaluatePurchaseApprovalAtRisk(
  projectId: string,
  organizationId: string,
  thresholds: AlertThresholds,
  counter: AlertCounter
): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, startDate: true },
  })
  if (!project) return

  const recipientUserIds = await getAlertRecipients(projectId, organizationId)
  const now = new Date()

  const ageThreshold = new Date(now)
  ageThreshold.setHours(ageThreshold.getHours() - thresholds.purchaseAgeHours)

  const eventThreshold = project.startDate
    ? new Date(project.startDate)
    : null
  if (eventThreshold) {
    eventThreshold.setDate(eventThreshold.getDate() + thresholds.purchaseEventDays)
  }

  const requestedPurchases = await prisma.purchase.findMany({
    where: {
      projectId,
      status: "Requested",
      createdAt: { lt: ageThreshold },
    },
  })

  const triggeredPurchaseIds = new Set<string>()

  for (const purchase of requestedPurchases) {
    const withinEventWindow = !eventThreshold || now < eventThreshold
    if (!withinEventWindow) continue

    const dimension = `purchase:${purchase.id}`
    triggeredPurchaseIds.add(purchase.id)

    await createOrUpdateAlert(
      {
        organizationId,
        projectId,
        ruleType: "PURCHASE_APPROVAL_AT_RISK",
        severity: "WARN",
        dimension,
        title: `${project.name}: Purchase "${purchase.description}" pending > 24h`,
        body: `Purchase "${purchase.description}" ($${Number(purchase.amount).toLocaleString()}) has been pending approval for over ${thresholds.purchaseAgeHours} hours with the event approaching.`,
        data: {
          purchaseId: purchase.id,
          description: purchase.description,
          amount: Number(purchase.amount),
          createdAt: purchase.createdAt.toISOString(),
          actionUrl: `/projects/${projectId}`,
        },
        recipientUserIds,
      },
      counter
    )
  }

  const existingAlerts = await prisma.alertEvent.findMany({
    where: {
      organizationId,
      projectId,
      ruleType: "PURCHASE_APPROVAL_AT_RISK",
      resolvedAt: null,
    },
  })

  for (const alert of existingAlerts) {
    const match = alert.dedupeKey.match(/purchase:([^:]+)$/)
    if (match && !triggeredPurchaseIds.has(match[1])) {
      await resolveAlert("PURCHASE_APPROVAL_AT_RISK", projectId, `purchase:${match[1]}`, organizationId)
    }
  }
}

async function evaluateCriticalTaskDueSoon(
  projectId: string,
  organizationId: string,
  thresholds: AlertThresholds,
  counter: AlertCounter
): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true },
  })
  if (!project) return

  const recipientUserIds = await getAlertRecipients(projectId, organizationId)
  const now = new Date()

  const dueSoonThreshold = new Date(now)
  dueSoonThreshold.setHours(dueSoonThreshold.getHours() + thresholds.taskDueHours)

  const criticalTasks = await prisma.task.findMany({
    where: {
      projectId,
      status: { not: "Done" },
      priority: { in: ["HIGH", "URGENT"] },
      dueDate: {
        gte: now,
        lte: dueSoonThreshold,
      },
    },
  })

  const triggeredTaskIds = new Set<string>()

  for (const task of criticalTasks) {
    const dimension = `task:${task.id}`
    triggeredTaskIds.add(task.id)

    const hoursUntilDue = task.dueDate
      ? Math.round((task.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60))
      : 0

    await createOrUpdateAlert(
      {
        organizationId,
        projectId,
        ruleType: "CRITICAL_TASK_DUE_SOON",
        severity: task.priority === "URGENT" ? "CRITICAL" : "WARN",
        dimension,
        title: `${project.name}: "${task.title}" due in ${hoursUntilDue}h`,
        body: `High-priority task "${task.title}" in "${project.name}" is due in ${hoursUntilDue} hours and is not yet complete.`,
        data: {
          taskId: task.id,
          title: task.title,
          priority: task.priority,
          dueDate: task.dueDate?.toISOString(),
          hoursUntilDue,
          actionUrl: `/projects/${projectId}/plan`,
        },
        recipientUserIds,
      },
      counter
    )
  }

  const existingAlerts = await prisma.alertEvent.findMany({
    where: {
      organizationId,
      projectId,
      ruleType: "CRITICAL_TASK_DUE_SOON",
      resolvedAt: null,
    },
  })

  for (const alert of existingAlerts) {
    const match = alert.dedupeKey.match(/task:([^:]+)$/)
    if (match && !triggeredTaskIds.has(match[1])) {
      await resolveAlert("CRITICAL_TASK_DUE_SOON", projectId, `task:${match[1]}`, organizationId)
    }
  }
}

export async function evaluateAlertsForProject(
  projectId: string,
  organizationId: string
): Promise<{ alertsCreatedOrUpdated: number }> {
  const thresholds = await getDefaultThresholds(organizationId)
  const ruleConfigs = await getRuleConfigs(organizationId)
  const counter: AlertCounter = { count: 0 }

  if (isRuleEnabled("MARGIN_BELOW_TARGET", ruleConfigs)) {
    await evaluateMarginBelowTarget(projectId, organizationId, thresholds, counter)
  }

  if (isRuleEnabled("MARGIN_DROP_24H", ruleConfigs)) {
    await evaluateMarginDrop24H(projectId, organizationId, thresholds, counter)
  }

  if (isRuleEnabled("UNMATCHED_ACTUALS", ruleConfigs)) {
    await evaluateUnmatchedActuals(projectId, organizationId, thresholds, counter)
  }

  if (isRuleEnabled("UNMATCHED_FORECAST", ruleConfigs)) {
    await evaluateUnmatchedForecast(projectId, organizationId, thresholds, counter)
  }

  if (isRuleEnabled("LINE_FORECAST_OVER_BUDGET", ruleConfigs)) {
    await evaluateLineForecastOverBudget(projectId, organizationId, thresholds, counter)
  }

  if (isRuleEnabled("SECTION_FORECAST_OVER_BUDGET", ruleConfigs)) {
    await evaluateSectionForecastOverBudget(projectId, organizationId, thresholds, counter)
  }

  if (isRuleEnabled("STAFFING_OVER_CAP_NEXT_WEEK", ruleConfigs)) {
    await evaluateStaffingOverCapNextWeek(projectId, organizationId, thresholds, counter)
  }

  if (isRuleEnabled("ONSITE_UNDERSTAFFED", ruleConfigs)) {
    await evaluateOnsiteUnderstaffed(projectId, organizationId, thresholds, counter)
  }

  if (isRuleEnabled("PURCHASE_APPROVAL_AT_RISK", ruleConfigs)) {
    await evaluatePurchaseApprovalAtRisk(projectId, organizationId, thresholds, counter)
  }

  if (isRuleEnabled("CRITICAL_TASK_DUE_SOON", ruleConfigs)) {
    await evaluateCriticalTaskDueSoon(projectId, organizationId, thresholds, counter)
  }

  return { alertsCreatedOrUpdated: counter.count }
}

export async function evaluateAlertsForOrg(
  organizationId: string
): Promise<{ projectsEvaluated: number; totalAlertsCreatedOrUpdated: number }> {
  const projects = await prisma.project.findMany({
    where: {
      organizationId,
      status: { in: ["Draft", "Active", "Onsite"] },
    },
    select: { id: true },
  })

  let totalAlerts = 0

  for (const project of projects) {
    const result = await evaluateAlertsForProject(project.id, organizationId)
    totalAlerts += result.alertsCreatedOrUpdated

    if (totalAlerts >= SAFETY_CAP_PER_ORG_RUN) {
      break
    }
  }

  return {
    projectsEvaluated: projects.length,
    totalAlertsCreatedOrUpdated: totalAlerts,
  }
}
