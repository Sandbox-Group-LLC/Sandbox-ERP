"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { BudgetSection, BudgetLineType, BudgetCategory } from "@prisma/client";

export async function getBudgetWithContext(projectId: string) {
  const staffingPlan = await prisma.staffingPlan.findUnique({
    where: { projectId },
    select: { id: true },
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
                include: {
                  roleRate: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const taxCodes = await prisma.taxCode.findMany();
  const staffingRates = await prisma.staffingRate.findMany();
  const expenseEntries = await prisma.expenseEntry.findMany({
    where: { projectId },
  });
  const actualCostEntries = await prisma.actualCostEntry.findMany({
    where: { projectId },
  });
  const purchasesRaw = await prisma.purchase.findMany({
    where: { projectId },
    select: {
      description: true,
      amount: true,
      budgetLineId: true,
    },
  });
  const purchases = purchasesRaw.map((p) => ({
    description: p.description,
    amount: Number(p.amount),
    budgetLineId: p.budgetLineId,
  }));

  const roleAllocationEntries: {
    budgetLineId: string;
    roleId: string;
    roleName: string;
    internalRate: number;
    totalHours: number;
  }[] = [];

  if (budget?.lines && staffingPlan) {
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
          // Use allocated hours if > 0, otherwise fall back to budgeted units
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

  return {
    budget,
    taxCodes,
    staffingRates,
    expenseEntries,
    actualCostEntries,
    purchases,
    roleAllocationEntries,
  };
}

export async function createBudget(projectId: string, jurisdiction: string = "California") {
  const existing = await prisma.budget.findUnique({
    where: { projectId },
  });

  if (existing) {
    return existing;
  }

  const budget = await prisma.budget.create({
    data: {
      projectId,
      jurisdiction,
      baseMarkup: 1.0,
    },
  });

  revalidatePath(`/projects/${projectId}/budget`);
  return budget;
}

export async function updateBudgetSettings(
  budgetId: string,
  data: { jurisdiction?: string; baseMarkup?: number }
) {
  const budget = await prisma.budget.update({
    where: { id: budgetId },
    data,
  });

  if (budget.projectId) {
    revalidatePath(`/projects/${budget.projectId}/budget`);
  } else if (budget.opportunityId) {
    revalidatePath(`/opportunities/${budget.opportunityId}/budget`);
  }
  return budget;
}

export async function updateBudgetNotes(budgetId: string, notes: string) {
  const budget = await prisma.budget.update({
    where: { id: budgetId },
    data: { notes },
  });

  if (budget.projectId) {
    revalidatePath(`/projects/${budget.projectId}/budget`);
  } else if (budget.opportunityId) {
    revalidatePath(`/opportunities/${budget.opportunityId}/budget`);
  }
  return budget;
}

export async function addBudgetLine(
  budgetId: string,
  data: {
    section: BudgetSection;
    lineType?: BudgetLineType;
    category?: BudgetCategory;
    taxCategory?: string;
    description?: string;
    ovh?: boolean;
    vendor?: string;
    units?: number;
    internalCostInput?: number;
    markupOverride?: number;
    internalNotes?: string;
    clientNotes?: string;
  }
) {
  const lastLine = await prisma.budgetLine.findFirst({
    where: { budgetId },
    orderBy: { rowOrder: "desc" },
  });

  const rowOrder = lastLine ? lastLine.rowOrder + 1 : 1;

  const line = await prisma.budgetLine.create({
    data: {
      budgetId,
      rowOrder,
      section: data.section,
      lineType: data.lineType || "NORMAL",
      category: data.category,
      taxCategory: data.taxCategory,
      description: data.description,
      ovh: data.ovh ?? false,
      vendor: data.vendor,
      units: data.units ?? 1,
      internalCostInput: data.internalCostInput,
      markupOverride: data.markupOverride,
      internalNotes: data.internalNotes,
      clientNotes: data.clientNotes,
    },
  });

  const budget = await prisma.budget.findUnique({ where: { id: budgetId } });
  if (budget) {
    if (budget.projectId) {
      revalidatePath(`/projects/${budget.projectId}/budget`);
    } else if (budget.opportunityId) {
      revalidatePath(`/opportunities/${budget.opportunityId}/budget`);
    }
  }

  return line;
}

export async function updateBudgetLine(
  lineId: string,
  data: {
    section?: BudgetSection;
    category?: BudgetCategory | null;
    taxCategory?: string | null;
    description?: string | null;
    ovh?: boolean;
    vendor?: string | null;
    units?: number;
    internalCostInput?: number | null;
    markupOverride?: number | null;
    internalNotes?: string | null;
    clientNotes?: string | null;
    processingFeeEnabled?: boolean;
    processingFeePercent?: number;
  }
) {
  const line = await prisma.budgetLine.update({
    where: { id: lineId },
    data,
  });

  const budget = await prisma.budget.findUnique({ where: { id: line.budgetId } });
  if (budget) {
    if (budget.projectId) {
      revalidatePath(`/projects/${budget.projectId}/budget`);
    } else if (budget.opportunityId) {
      revalidatePath(`/opportunities/${budget.opportunityId}/budget`);
    }
  }

  return line;
}

export async function deleteBudgetLine(lineId: string) {
  const line = await prisma.budgetLine.findUnique({
    where: { id: lineId },
    include: { budget: true },
  });

  if (!line) return;

  await prisma.budgetLine.delete({ where: { id: lineId } });

  if (line.budget.projectId) {
    revalidatePath(`/projects/${line.budget.projectId}/budget`);
  } else if (line.budget.opportunityId) {
    revalidatePath(`/opportunities/${line.budget.opportunityId}/budget`);
  }
}

export async function reorderBudgetLines(
  budgetId: string,
  lineIds: string[]
) {
  const updates = lineIds.map((id, index) =>
    prisma.budgetLine.update({
      where: { id },
      data: { rowOrder: index + 1 },
    })
  );

  await prisma.$transaction(updates);

  const budget = await prisma.budget.findUnique({ where: { id: budgetId } });
  if (budget) {
    if (budget.projectId) {
      revalidatePath(`/projects/${budget.projectId}/budget`);
    } else if (budget.opportunityId) {
      revalidatePath(`/opportunities/${budget.opportunityId}/budget`);
    }
  }
}

export async function addExpenseEntry(
  projectId: string,
  description: string,
  amount: number
) {
  const entry = await prisma.expenseEntry.create({
    data: { projectId, description, amount },
  });

  revalidatePath(`/projects/${projectId}/budget`);
  return entry;
}

export async function addActualCostEntry(
  projectId: string,
  description: string,
  amount: number
) {
  const entry = await prisma.actualCostEntry.create({
    data: { projectId, description, amount },
  });

  revalidatePath(`/projects/${projectId}/budget`);
  return entry;
}

export async function getJurisdictions() {
  const codes = await prisma.taxCode.findMany({
    select: { jurisdiction: true },
    distinct: ["jurisdiction"],
  });
  return codes.map((c) => c.jurisdiction);
}

export async function getTaxCategories() {
  const codes = await prisma.taxCode.findMany({
    select: { categoryCode: true },
    distinct: ["categoryCode"],
  });
  return codes.map((c) => c.categoryCode);
}

export async function getStaffingRoles() {
  const rates = await prisma.staffingRate.findMany({
    select: { roleName: true },
  });
  return rates.map((r) => r.roleName);
}

export async function getVendorsForProject(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { organizationId: true },
  });
  
  if (!project) return [];
  
  const vendors = await prisma.vendor.findMany({
    where: { organizationId: project.organizationId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  
  return vendors;
}
