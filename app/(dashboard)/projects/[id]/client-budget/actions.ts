"use server";

import { prisma } from "@/lib/prisma";
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
} from "@/lib/budget-engine";

export interface ClientBudgetLine {
  id: string;
  description: string;
  party: "Third Party" | "Sandbox-XM";
  rate: number | null;
  hours: number | null;
  total: number;
  category: string;
  isStaffing: boolean;
}

export interface ClientBudgetCategory {
  name: string;
  lines: ClientBudgetLine[];
  subtotal: number;
}

export interface ClientBudgetData {
  projectName: string;
  clientName: string;
  categories: ClientBudgetCategory[];
  taxAmount: number;
  grandTotal: number;
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
};

export async function getClientBudgetData(projectId: string): Promise<ClientBudgetData | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { client: true },
  });

  if (!project) return null;

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
  });

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
  });

  if (!budget) {
    return {
      projectName: project.name,
      clientName: project.client.name,
      categories: [],
      taxAmount: 0,
      grandTotal: 0,
    };
  }

  const [taxCodes, staffingRates, expenseEntries, actualCostEntries] = await Promise.all([
    prisma.taxCode.findMany(),
    prisma.staffingRate.findMany(),
    prisma.expenseEntry.findMany({ where: { projectId } }),
    prisma.actualCostEntry.findMany({ where: { projectId } }),
  ]);

  const roleAllocationEntries: {
    budgetLineId: string;
    roleId: string;
    roleName: string;
    internalRate: number;
    totalHours: number;
  }[] = [];

  if (staffingPlan) {
    const roleIds = new Set<string>();
    for (const line of budget.lines) {
      for (const link of line.roleLinks) {
        roleIds.add(link.roleId);
      }
    }

    if (roleIds.size > 0) {
      const allocations = await prisma.staffingAllocation.findMany({
        where: {
          staffingPlanId: staffingPlan.id,
          roleId: { in: Array.from(roleIds) },
        },
      });

      const allocationsByRole = new Map<string, number>();
      for (const alloc of allocations) {
        const current = allocationsByRole.get(alloc.roleId) || 0;
        allocationsByRole.set(alloc.roleId, current + Number(alloc.plannedHours));
      }

      for (const line of budget.lines) {
        for (const link of line.roleLinks) {
          const internalRate = link.role.roleRate
            ? Number(link.role.roleRate.internalRate)
            : 0;
          const allocatedHours = allocationsByRole.get(link.roleId) || 0;
          const totalHours = allocatedHours > 0 ? allocatedHours : Number(line.units || 0);
          if (totalHours > 0) {
            roleAllocationEntries.push({
              budgetLineId: line.id,
              roleId: link.role.id,
              roleName: link.role.name,
              internalRate,
              totalHours,
            });
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
  };

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
  }));

  const computedLines = computeAllBudgetLines(lines, context);

  const categoryMap = new Map<string, ClientBudgetLine[]>();
  let totalTax = 0;

  for (const line of computedLines) {
    if (line.lineType === "SUBTOTAL") continue;

    const category = (line as any).category || "OTHER";
    const isStaffing = line.lineType === "STAFFING";

    const clientLine: ClientBudgetLine = {
      id: (line as any).id || `line-${line.rowOrder}`,
      description: line.description || "Unnamed Item",
      party: isStaffing ? "Sandbox-XM" : "Third Party",
      rate: isStaffing ? (line.internalCost / (line.units || 1)) : null,
      hours: isStaffing ? line.units : null,
      total: line.subtotal, // Use pre-tax subtotal, tax is added separately to grandTotal
      category,
      isStaffing,
    };

    if (!categoryMap.has(category)) {
      categoryMap.set(category, []);
    }
    categoryMap.get(category)!.push(clientLine);
    totalTax += line.taxAmount;
  }

  // Add staffing plan assignments (Sandbox-XM staffing)
  if (staffingPlan?.assignments) {
    const staffingLines: ClientBudgetLine[] = [];
    for (const assignment of staffingPlan.assignments) {
      const totalHours = assignment.allocations.reduce(
        (sum, alloc) => sum + Number(alloc.plannedHours),
        0
      );
      if (totalHours > 0) {
        const clientRate = Number(assignment.clientBillRate) || Number(assignment.billRate);
        staffingLines.push({
          id: `staffing-${assignment.id}`,
          description: `${assignment.staffingRole.name}${assignment.person ? ` - ${assignment.person.name}` : ""}`,
          party: "Sandbox-XM",
          rate: clientRate,
          hours: totalHours,
          total: clientRate * totalHours,
          category: "STAFFING",
          isStaffing: true,
        });
      }
    }
    if (staffingLines.length > 0) {
      categoryMap.set("STAFFING", staffingLines);
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
  ];

  const categories: ClientBudgetCategory[] = [];
  let grandTotal = 0;

  for (const catKey of categoryOrder) {
    const lines = categoryMap.get(catKey);
    if (lines && lines.length > 0) {
      const subtotal = lines.reduce((sum, l) => sum + l.total, 0);
      grandTotal += subtotal;
      categories.push({
        name: catKey === "STAFFING" ? "Sandbox-XM Staffing" : (CATEGORY_DISPLAY_NAMES[catKey] || catKey),
        lines,
        subtotal,
      });
    }
  }

  // Add any remaining categories not in the order
  Array.from(categoryMap.entries()).forEach(([catKey, lines]) => {
    if (!categoryOrder.includes(catKey) && lines.length > 0) {
      const subtotal = lines.reduce((sum, l) => sum + l.total, 0);
      grandTotal += subtotal;
      categories.push({
        name: CATEGORY_DISPLAY_NAMES[catKey] || catKey,
        lines,
        subtotal,
      });
    }
  });

  grandTotal += totalTax;

  return {
    projectName: project.name,
    clientName: project.client.name,
    categories,
    taxAmount: totalTax,
    grandTotal,
  };
}

export interface ClientBudgetVersionData {
  versionNumber: number;
  title: string;
  notes: string | null;
  createdAt: Date;
  categories: ClientBudgetCategory[];
  taxAmount: number;
  grandTotal: number;
}

export async function getClientVisibleVersions(projectId: string): Promise<ClientBudgetVersionData[]> {
  const budget = await prisma.budget.findUnique({
    where: { projectId },
    select: { id: true, jurisdiction: true, baseMarkup: true },
  });

  if (!budget) {
    return [];
  }

  const versions = await prisma.budgetVersion.findMany({
    where: {
      budgetId: budget.id,
      isClientVisible: true,
    },
    orderBy: { versionNumber: "asc" },
    include: {
      lines: {
        orderBy: { rowOrder: "asc" },
      },
    },
  });

  if (versions.length === 0) {
    return [];
  }

  const [taxCodes, staffingRates] = await Promise.all([
    prisma.taxCode.findMany(),
    prisma.staffingRate.findMany(),
  ]);

  const results: ClientBudgetVersionData[] = [];

  for (const version of versions) {
    const context: BudgetContext = {
      jurisdiction: version.jurisdiction,
      baseMarkup: Number(version.baseMarkup),
      taxCodes: buildTaxCodeMap(taxCodes),
      staffingRates: buildStaffingRateMap(staffingRates),
      expensesByDescription: new Map(),
      actualsByDescription: new Map(),
      expensesByBudgetLineId: new Map(),
      actualsByBudgetLineId: new Map(),
      purchasesByBudgetLineId: new Map(),
      roleAllocationsByBudgetLineId: new Map(),
    };

    const lines = version.lines.map((line) => ({
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
    }));

    const computedLines = computeAllBudgetLines(lines, context);

    const categoryMap = new Map<string, ClientBudgetLine[]>();
    let totalTax = 0;

    for (const line of computedLines) {
      if (line.lineType === "SUBTOTAL") continue;

      const category = (line as any).category || "OTHER";
      const isStaffing = line.lineType === "STAFFING";

      const clientLine: ClientBudgetLine = {
        id: (line as any).id || `line-${line.rowOrder}`,
        description: line.description || "Unnamed Item",
        party: isStaffing ? "Sandbox-XM" : "Third Party",
        rate: isStaffing ? (line.internalCost / (line.units || 1)) : null,
        hours: isStaffing ? line.units : null,
        total: line.subtotal, // Use pre-tax subtotal, tax is added separately to grandTotal
        category,
        isStaffing,
      };

      if (!categoryMap.has(category)) {
        categoryMap.set(category, []);
      }
      categoryMap.get(category)!.push(clientLine);
      totalTax += line.taxAmount;
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
    ];

    const categories: ClientBudgetCategory[] = [];
    let grandTotal = 0;

    for (const catKey of categoryOrder) {
      const catLines = categoryMap.get(catKey);
      if (catLines && catLines.length > 0) {
        const subtotal = catLines.reduce((sum, l) => sum + l.total, 0);
        grandTotal += subtotal;
        categories.push({
          name: catKey === "STAFFING" ? "Sandbox-XM Staffing" : (CATEGORY_DISPLAY_NAMES[catKey] || catKey),
          lines: catLines,
          subtotal,
        });
      }
    }

    Array.from(categoryMap.entries()).forEach(([catKey, catLines]) => {
      if (!categoryOrder.includes(catKey) && catLines.length > 0) {
        const subtotal = catLines.reduce((sum, l) => sum + l.total, 0);
        grandTotal += subtotal;
        categories.push({
          name: CATEGORY_DISPLAY_NAMES[catKey] || catKey,
          lines: catLines,
          subtotal,
        });
      }
    });

    grandTotal += totalTax;

    results.push({
      versionNumber: version.versionNumber,
      title: version.title,
      notes: version.notes,
      createdAt: version.createdAt,
      categories,
      taxAmount: totalTax,
      grandTotal,
    });
  }

  return results;
}
