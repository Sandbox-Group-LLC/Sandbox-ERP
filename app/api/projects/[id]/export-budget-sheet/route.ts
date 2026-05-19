import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuthWithOrg } from "@/lib/session"
import { createGoogleSheet, updateSheetData } from "@/lib/google-drive"
import {
  computeAllBudgetLines,
  buildTaxCodeMap,
  buildStaffingRateMap,
  buildExpenseMap,
  buildActualMap,
  buildExpenseByBudgetLineIdMap,
  buildActualByBudgetLineIdMap,
  buildRoleAllocationsByBudgetLineIdMap,
  BudgetContext,
} from "@/lib/budget-engine"

export const dynamic = "force-dynamic"

function extractFolderId(input: string): string {
  if (!input) return input
  const trimmed = input.trim()
  const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  if (match) return match[1]
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) return trimmed
  return trimmed
}

const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  VENUE_SERVICES: "Venue Services",
  GUEST_SERVICES: "Guest Services",
  ONSITE_SUPPORT: "Onsite Staffing",
  AUDIO_VISUAL: "Audio Visual",
  CATERING: "Catering",
  ENVIRONMENTAL: "Environmental",
  CONTENT_DEVELOPMENT: "Content Development",
  DIGITAL_SERVICES: "Digital Services",
  MERCHANDISE: "Merchandise",
  INSURANCE: "Insurance",
  HEALTH_SAFETY: "Production Costs",
  TRAVEL_EXPENSES: "Travel & Expenses",
  PRODUCTION_COSTS: "Production Costs",
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthWithOrg()
    if (user.approvalStatus !== "APPROVED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const { id: projectId } = await params

    const project = await prisma.project.findFirst({
      where: { id: projectId, organizationId: user.organizationId },
      select: { id: true, name: true, budgetSheetId: true, budgetSheetFolderId: true },
    })

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    const fullProject = await prisma.project.findFirst({
      where: { id: projectId, organizationId: user.organizationId },
      include: { client: true },
    })

    if (!fullProject) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    const staffingPlan = await prisma.staffingPlan.findUnique({
      where: { projectId },
      include: {
        assignments: {
          include: {
            person: true,
            staffingRole: true,
            allocations: true,
          },
        },
      },
    })

    const budget = await prisma.budget.findUnique({
      where: { projectId },
      include: {
        lines: {
          orderBy: { rowOrder: "asc" },
          include: {
            roleLinks: {
              include: {
                role: {
                  include: { roleRate: true },
                },
              },
            },
          },
        },
      },
    })

    const headers = ["DESCRIPTION", "PARTY", "RATE", "HOURS", "TOTAL"]

    if (!budget) {
      const rows: string[][] = [["No budget data available", "", "", "", ""]]
      let sheetId = project.budgetSheetId
      let sheetUrl: string

      if (sheetId) {
        try {
          await updateSheetData(sheetId, "Sheet1", headers, rows, user.organizationId)
          sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`
        } catch (e: any) {
          if (e?.code === 404 || e?.status === 404) {
            const folderId = project.budgetSheetFolderId ? extractFolderId(project.budgetSheetFolderId) : undefined
            const result = await createGoogleSheet(`${project.name} - Client Budget`, folderId, user.organizationId)
            sheetId = result.id
            sheetUrl = result.url
            await updateSheetData(sheetId, "Sheet1", headers, rows, user.organizationId)
            await prisma.project.update({ where: { id: projectId }, data: { budgetSheetId: sheetId } })
          } else { throw e }
        }
      } else {
        const folderId = project.budgetSheetFolderId ? extractFolderId(project.budgetSheetFolderId) : undefined
        const result = await createGoogleSheet(`${project.name} - Client Budget`, folderId, user.organizationId)
        sheetId = result.id
        sheetUrl = result.url
        await updateSheetData(sheetId, "Sheet1", headers, rows, user.organizationId)
        await prisma.project.update({ where: { id: projectId }, data: { budgetSheetId: sheetId } })
      }

      return NextResponse.json({ success: true, sheetUrl, sheetId })
    }

    const [taxCodes, staffingRates, expenseEntries, actualCostEntries] = await Promise.all([
      prisma.taxCode.findMany(),
      prisma.staffingRate.findMany(),
      prisma.expenseEntry.findMany({ where: { projectId } }),
      prisma.actualCostEntry.findMany({ where: { projectId } }),
    ])

    const roleAllocationEntries: {
      budgetLineId: string
      roleId: string
      roleName: string
      internalRate: number
      totalHours: number
    }[] = []

    if (staffingPlan) {
      const roleIds = new Set<string>()
      for (const line of budget.lines) {
        for (const link of line.roleLinks) {
          roleIds.add(link.roleId)
        }
      }

      if (roleIds.size > 0) {
        const allocations = await prisma.staffingAllocation.findMany({
          where: {
            staffingPlanId: staffingPlan.id,
            roleId: { in: Array.from(roleIds) },
          },
        })

        const allocationsByRole = new Map<string, number>()
        for (const alloc of allocations) {
          const current = allocationsByRole.get(alloc.roleId) || 0
          allocationsByRole.set(alloc.roleId, current + Number(alloc.plannedHours))
        }

        for (const line of budget.lines) {
          for (const link of line.roleLinks) {
            const internalRate = link.role.roleRate
              ? Number(link.role.roleRate.internalRate)
              : 0
            const allocatedHours = allocationsByRole.get(link.roleId) || 0
            const totalHours = allocatedHours > 0 ? allocatedHours : Number(line.units || 0)
            if (totalHours > 0) {
              roleAllocationEntries.push({
                budgetLineId: line.id,
                roleId: link.role.id,
                roleName: link.role.name,
                internalRate,
                totalHours,
              })
            }
          }
        }
      }
    }

    const context: BudgetContext = {
      jurisdiction: budget.jurisdiction,
      baseMarkup: Number(budget.baseMarkup),
      taxCodes: buildTaxCodeMap(taxCodes),
      staffingRates: buildStaffingRateMap(staffingRates),
      expensesByDescription: buildExpenseMap(expenseEntries),
      actualsByDescription: buildActualMap(actualCostEntries),
      expensesByBudgetLineId: buildExpenseByBudgetLineIdMap(expenseEntries),
      actualsByBudgetLineId: buildActualByBudgetLineIdMap(actualCostEntries),
      purchasesByBudgetLineId: new Map(),
      roleAllocationsByBudgetLineId: buildRoleAllocationsByBudgetLineIdMap(roleAllocationEntries),
    }

    const lines = budget.lines.map((line) => ({
      id: line.id,
      rowOrder: line.rowOrder,
      section: line.section as "PASSTHROUGH" | "SANDBOX" | "STAFFING" | "SUMMARY",
      lineType: line.lineType as "NORMAL" | "STAFFING" | "SUBTOTAL",
      category: line.category,
      taxCategory: line.taxCategory,
      description: line.description,
      ovh: line.ovh,
      vendor: line.vendor,
      units: Number(line.units),
      internalCostInput: line.internalCostInput ? Number(line.internalCostInput) : null,
      markupOverride: line.markupOverride ? Number(line.markupOverride) : null,
      internalNotes: line.internalNotes,
      clientNotes: line.clientNotes,
      processingFeeEnabled: line.processingFeeEnabled,
      processingFeePercent: line.processingFeePercent,
    }))

    const computedLines = computeAllBudgetLines(lines, context)

    interface ClientBudgetLine {
      description: string
      party: string
      rate: number | null
      hours: number | null
      total: number
      category: string
      isStaffing: boolean
    }

    const categoryMap = new Map<string, ClientBudgetLine[]>()
    let totalTax = 0

    for (const line of computedLines) {
      if (line.lineType === "SUBTOTAL") continue

      const category = (line as any).category || "OTHER"
      const isStaffing = line.lineType === "STAFFING"

      const clientLine: ClientBudgetLine = {
        description: line.description || "Unnamed Item",
        party: isStaffing ? "Sandbox-XM" : "Third Party",
        rate: isStaffing ? (line.internalCost / (line.units || 1)) : null,
        hours: isStaffing ? line.units : null,
        total: line.subtotal,
        category,
        isStaffing,
      }

      if (!categoryMap.has(category)) {
        categoryMap.set(category, [])
      }
      categoryMap.get(category)!.push(clientLine)
      totalTax += line.taxAmount
    }

    if (staffingPlan?.assignments) {
      const staffingLines: ClientBudgetLine[] = []
      for (const assignment of staffingPlan.assignments) {
        const totalHours = assignment.allocations.reduce(
          (sum, alloc) => sum + Number(alloc.plannedHours),
          0
        )
        if (totalHours > 0) {
          const clientRate = Number(assignment.clientBillRate) || Number(assignment.billRate)
          staffingLines.push({
            description: `${assignment.staffingRole.name}${assignment.person ? ` - ${assignment.person.name}` : ""}`,
            party: "Sandbox-XM",
            rate: clientRate,
            hours: totalHours,
            total: clientRate * totalHours,
            category: "STAFFING",
            isStaffing: true,
          })
        }
      }
      if (staffingLines.length > 0) {
        categoryMap.set("STAFFING", staffingLines)
      }
    }

    const categoryOrder = [
      "GUEST_SERVICES",
      "VENUE_SERVICES",
      "ONSITE_SUPPORT",
      "AUDIO_VISUAL",
      "CATERING",
      "ENVIRONMENTAL",
      "CONTENT_DEVELOPMENT",
      "DIGITAL_SERVICES",
      "MERCHANDISE",
      "INSURANCE",
      "HEALTH_SAFETY",
      "TRAVEL_EXPENSES",
      "PRODUCTION_COSTS",
      "STAFFING",
    ]

    interface CategoryData {
      name: string
      lines: ClientBudgetLine[]
      subtotal: number
    }

    const categories: CategoryData[] = []
    let grandTotal = 0

    for (const catKey of categoryOrder) {
      const catLines = categoryMap.get(catKey)
      if (catLines && catLines.length > 0) {
        const subtotal = catLines.reduce((sum, l) => sum + l.total, 0)
        grandTotal += subtotal
        categories.push({
          name: catKey === "STAFFING" ? "Sandbox-XM Staffing" : (CATEGORY_DISPLAY_NAMES[catKey] || catKey),
          lines: catLines,
          subtotal,
        })
      }
    }

    Array.from(categoryMap.entries()).forEach(([catKey, catLines]) => {
      if (!categoryOrder.includes(catKey) && catLines.length > 0) {
        const subtotal = catLines.reduce((sum, l) => sum + l.total, 0)
        grandTotal += subtotal
        categories.push({
          name: CATEGORY_DISPLAY_NAMES[catKey] || catKey,
          lines: catLines,
          subtotal,
        })
      }
    })

    grandTotal += totalTax

    const rows: string[][] = []

    for (const category of categories) {
      rows.push([category.name.toUpperCase(), "", "", "", ""])
      for (const line of category.lines) {
        rows.push([
          line.description,
          line.party,
          line.rate !== null ? formatCurrency(line.rate) : "",
          line.hours !== null ? line.hours.toLocaleString() : "",
          formatCurrency(line.total),
        ])
      }
      rows.push(["", "", "", "Subtotal", formatCurrency(category.subtotal)])
    }

    if (totalTax > 0) {
      rows.push(["TAX", "", "", "", formatCurrency(totalTax)])
    }

    rows.push(["GRAND TOTAL", "", "", "", formatCurrency(grandTotal)])

    let sheetId = project.budgetSheetId
    let sheetUrl: string

    if (sheetId) {
      try {
        await updateSheetData(sheetId, "Sheet1", headers, rows, user.organizationId)
        sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`
      } catch (e: any) {
        if (e?.code === 404 || e?.status === 404) {
          const folderId = project.budgetSheetFolderId ? extractFolderId(project.budgetSheetFolderId) : undefined
          const result = await createGoogleSheet(
            `${project.name} - Client Budget`,
            folderId,
            user.organizationId
          )
          sheetId = result.id
          sheetUrl = result.url
          await updateSheetData(sheetId, "Sheet1", headers, rows, user.organizationId)
          await prisma.project.update({
            where: { id: projectId },
            data: { budgetSheetId: sheetId },
          })
        } else {
          throw e
        }
      }
    } else {
      const folderId = project.budgetSheetFolderId ? extractFolderId(project.budgetSheetFolderId) : undefined
      const result = await createGoogleSheet(
        `${project.name} - Client Budget`,
        folderId,
        user.organizationId
      )
      sheetId = result.id
      sheetUrl = result.url
      await updateSheetData(sheetId, "Sheet1", headers, rows, user.organizationId)
      await prisma.project.update({
        where: { id: projectId },
        data: { budgetSheetId: sheetId },
      })
    }

    return NextResponse.json({ success: true, sheetUrl, sheetId })
  } catch (error: any) {
    console.error("Export budget to sheet error:", error)
    return NextResponse.json(
      { error: error?.message || "Failed to export budget to Google Sheet" },
      { status: 500 }
    )
  }
}
