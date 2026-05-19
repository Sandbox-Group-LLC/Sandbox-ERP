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

export interface PortalAccessData {
  valid: boolean;
  expired?: boolean;
  firstName?: string;
  lastName?: string;
  email?: string;
  projectId?: string;
  projectName?: string;
  clientName?: string;
}

export async function validatePortalAccess(token: string): Promise<PortalAccessData> {
  const access = await prisma.clientPortalAccess.findUnique({
    where: { accessToken: token },
    include: {
      project: {
        include: { client: true },
      },
    },
  });

  if (!access) {
    return { valid: false };
  }

  const now = new Date();
  if (access.expiresAt < now) {
    return { valid: false, expired: true };
  }

  await prisma.clientPortalAccess.update({
    where: { id: access.id },
    data: { lastAccess: now },
  });

  return {
    valid: true,
    firstName: access.firstName,
    lastName: access.lastName,
    email: access.email,
    projectId: access.projectId,
    projectName: access.project.name,
    clientName: access.project.client.name,
  };
}

export interface PortalBudgetLine {
  id: string;
  description: string;
  party: "Third Party" | "Sandbox-XM";
  rate: number | null;
  hours: number | null;
  total: number;
  category: string;
  isStaffing: boolean;
}

export interface PortalBudgetCategory {
  name: string;
  lines: PortalBudgetLine[];
  subtotal: number;
}

export interface PortalBudgetData {
  categories: PortalBudgetCategory[];
  subtotal: number;
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

export async function getPortalBudgetData(projectId: string): Promise<PortalBudgetData | null> {
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
      categories: [],
      subtotal: 0,
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

  const categoryMap = new Map<string, PortalBudgetLine[]>();
  let totalTax = 0;

  for (const line of computedLines) {
    if (line.lineType === "SUBTOTAL") continue;

    const category = (line as any).category || "OTHER";
    const isStaffing = line.lineType === "STAFFING";

    const portalLine: PortalBudgetLine = {
      id: (line as any).id || `line-${line.rowOrder}`,
      description: line.description || "Unnamed Item",
      party: isStaffing ? "Sandbox-XM" : "Third Party",
      rate: isStaffing ? (line.internalCost / (line.units || 1)) : null,
      hours: isStaffing ? line.units : null,
      total: line.clientEstimate,
      category,
      isStaffing,
    };

    if (!categoryMap.has(category)) {
      categoryMap.set(category, []);
    }
    categoryMap.get(category)!.push(portalLine);
    totalTax += line.taxAmount;
  }

  if (staffingPlan?.assignments) {
    const staffingLines: PortalBudgetLine[] = [];
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

  const categories: PortalBudgetCategory[] = [];
  let subtotal = 0;

  for (const catKey of categoryOrder) {
    const catLines = categoryMap.get(catKey);
    if (catLines && catLines.length > 0) {
      const catSubtotal = catLines.reduce((sum, l) => sum + l.total, 0);
      subtotal += catSubtotal;
      categories.push({
        name: catKey === "STAFFING" ? "Sandbox-XM Staffing" : (CATEGORY_DISPLAY_NAMES[catKey] || catKey),
        lines: catLines,
        subtotal: catSubtotal,
      });
    }
  }

  Array.from(categoryMap.entries()).forEach(([catKey, catLines]) => {
    if (!categoryOrder.includes(catKey) && catLines.length > 0) {
      const catSubtotal = catLines.reduce((sum, l) => sum + l.total, 0);
      subtotal += catSubtotal;
      categories.push({
        name: CATEGORY_DISPLAY_NAMES[catKey] || catKey,
        lines: catLines,
        subtotal: catSubtotal,
      });
    }
  });

  return {
    categories,
    subtotal,
    taxAmount: totalTax,
    grandTotal: subtotal + totalTax,
  };
}

export interface CommentMessageData {
  id: string;
  authorType: "CLIENT" | "INTERNAL";
  authorName: string;
  content: string;
  createdAt: Date;
}

export interface BudgetCommentData {
  id: string;
  budgetLineId: string | null;
  lineDescription: string | null;
  category: string | null;
  field: string | null;
  commenterName: string;
  content: string;
  isResolved: boolean;
  createdAt: Date;
  messages: CommentMessageData[];
}

export async function getPortalComments(projectId: string): Promise<BudgetCommentData[]> {
  const comments = await prisma.budgetComment.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return comments.map((c) => ({
    id: c.id,
    budgetLineId: c.budgetLineId,
    lineDescription: c.lineDescription,
    category: c.category,
    field: c.field,
    commenterName: c.commenterName,
    content: c.content,
    isResolved: c.isResolved,
    createdAt: c.createdAt,
    messages: c.messages.map((m) => ({
      id: m.id,
      authorType: m.authorType as "CLIENT" | "INTERNAL",
      authorName: m.authorName,
      content: m.content,
      createdAt: m.createdAt,
    })),
  }));
}

export async function addPortalMessage(
  token: string,
  commentId: string,
  content: string
): Promise<{ success: boolean; error?: string }> {
  const access = await prisma.clientPortalAccess.findUnique({
    where: { accessToken: token },
  });

  if (!access || access.expiresAt < new Date()) {
    return { success: false, error: "Invalid or expired access" };
  }

  try {
    await prisma.commentMessage.create({
      data: {
        commentId,
        authorType: "CLIENT",
        authorName: `${access.firstName} ${access.lastName}`,
        authorEmail: access.email,
        content,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to add message:", error);
    return { success: false, error: "Failed to add message" };
  }
}

export async function addPortalComment(
  token: string,
  data: {
    budgetLineId?: string;
    lineDescription?: string;
    category?: string;
    field?: string;
    content: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const access = await prisma.clientPortalAccess.findUnique({
    where: { accessToken: token },
  });

  if (!access || access.expiresAt < new Date()) {
    return { success: false, error: "Invalid or expired access" };
  }

  const commenterName = `${access.firstName} ${access.lastName}`;

  try {
    await prisma.budgetComment.create({
      data: {
        projectId: access.projectId,
        budgetLineId: data.budgetLineId || null,
        lineDescription: data.lineDescription || null,
        category: data.category || null,
        field: data.field || null,
        commenterName,
        commenterEmail: access.email,
        content: data.content,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to add comment:", error);
    return { success: false, error: "Failed to add comment" };
  }
}

export interface PortalBudgetVersionSummary {
  id: string;
  versionNumber: number;
  title: string;
  notes: string | null;
  createdAt: Date;
}

export async function getPortalClientVisibleVersions(
  token: string
): Promise<PortalBudgetVersionSummary[]> {
  const access = await prisma.clientPortalAccess.findUnique({
    where: { accessToken: token },
  });

  if (!access || access.expiresAt < new Date()) {
    return [];
  }

  const budget = await prisma.budget.findUnique({
    where: { projectId: access.projectId },
    select: { id: true },
  });

  if (!budget) {
    return [];
  }

  const versions = await prisma.budgetVersion.findMany({
    where: {
      budgetId: budget.id,
      isClientVisible: true,
    },
    orderBy: { versionNumber: "desc" },
    select: {
      id: true,
      versionNumber: true,
      title: true,
      notes: true,
      createdAt: true,
    },
  });

  return versions;
}

export async function getPortalVersionBudgetData(
  token: string,
  versionId: string
): Promise<PortalBudgetData | null> {
  const access = await prisma.clientPortalAccess.findUnique({
    where: { accessToken: token },
  });

  if (!access || access.expiresAt < new Date()) {
    return null;
  }

  const version = await prisma.budgetVersion.findUnique({
    where: { id: versionId },
    include: {
      budget: {
        select: { projectId: true },
      },
      lines: {
        orderBy: { rowOrder: "asc" },
      },
    },
  });

  if (!version || version.budget.projectId !== access.projectId) {
    return null;
  }

  if (!version.lines || version.lines.length === 0) {
    return {
      categories: [],
      subtotal: 0,
      taxAmount: 0,
      grandTotal: 0,
    };
  }

  const [taxCodes, staffingRates] = await Promise.all([
    prisma.taxCode.findMany(),
    prisma.staffingRate.findMany(),
  ]);

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

  const categoryMap = new Map<string, PortalBudgetLine[]>();
  let totalTax = 0;

  for (const line of computedLines) {
    if (line.lineType === "SUBTOTAL") continue;

    const category = (line as any).category || "OTHER";
    const isStaffing = line.lineType === "STAFFING";

    const portalLine: PortalBudgetLine = {
      id: (line as any).id || `line-${line.rowOrder}`,
      description: line.description || "Unnamed Item",
      party: isStaffing ? "Sandbox-XM" : "Third Party",
      rate: isStaffing ? (line.internalCost / (line.units || 1)) : null,
      hours: isStaffing ? line.units : null,
      total: line.clientEstimate,
      category,
      isStaffing,
    };

    if (!categoryMap.has(category)) {
      categoryMap.set(category, []);
    }
    categoryMap.get(category)!.push(portalLine);
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

  const categories: PortalBudgetCategory[] = [];
  let subtotal = 0;

  for (const catKey of categoryOrder) {
    const catLines = categoryMap.get(catKey);
    if (catLines && catLines.length > 0) {
      const catSubtotal = catLines.reduce((sum, l) => sum + l.total, 0);
      subtotal += catSubtotal;
      categories.push({
        name: catKey === "STAFFING" ? "Sandbox-XM Staffing" : (CATEGORY_DISPLAY_NAMES[catKey] || catKey),
        lines: catLines,
        subtotal: catSubtotal,
      });
    }
  }

  Array.from(categoryMap.entries()).forEach(([catKey, catLines]) => {
    if (!categoryOrder.includes(catKey) && catLines.length > 0) {
      const catSubtotal = catLines.reduce((sum, l) => sum + l.total, 0);
      subtotal += catSubtotal;
      categories.push({
        name: CATEGORY_DISPLAY_NAMES[catKey] || catKey,
        lines: catLines,
        subtotal: catSubtotal,
      });
    }
  });

  return {
    categories,
    subtotal,
    taxAmount: totalTax,
    grandTotal: subtotal + totalTax,
  };
}
