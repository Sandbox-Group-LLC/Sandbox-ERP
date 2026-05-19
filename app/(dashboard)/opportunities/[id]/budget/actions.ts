"use server";

import { prisma } from "@/lib/prisma";
import { requireAuthWithOrg } from "@/lib/session";
import { revalidatePath } from "next/cache";

export async function getOpportunityBudgetWithContext(opportunityId: string) {
  const user = await requireAuthWithOrg();
  
  // Verify opportunity belongs to user's organization
  const opportunity = await prisma.opportunity.findFirst({
    where: { id: opportunityId, organizationId: user.organizationId },
  });
  
  if (!opportunity) {
    throw new Error("Opportunity not found");
  }
  
  const budget = await prisma.budget.findUnique({
    where: { opportunityId },
    include: {
      lines: {
        orderBy: { rowOrder: "asc" },
      },
    },
  });

  const taxCodes = await prisma.taxCode.findMany();
  const staffingRates = await prisma.staffingRate.findMany();

  return {
    budget,
    taxCodes,
    staffingRates,
    expenseEntries: [],
    actualCostEntries: [],
    purchases: [],
    roleAllocationEntries: [],
  };
}

export async function createOpportunityBudget(opportunityId: string, jurisdiction: string = "California") {
  const user = await requireAuthWithOrg();
  
  // Verify opportunity belongs to user's organization
  const opportunity = await prisma.opportunity.findFirst({
    where: { id: opportunityId, organizationId: user.organizationId },
  });
  
  if (!opportunity) {
    throw new Error("Opportunity not found");
  }
  
  const existing = await prisma.budget.findUnique({
    where: { opportunityId },
  });

  if (existing) {
    return existing;
  }

  const budget = await prisma.budget.create({
    data: {
      opportunityId,
      jurisdiction,
      baseMarkup: 1.0,
    },
  });

  revalidatePath(`/opportunities/${opportunityId}/budget`);
  return budget;
}

export async function getVendorsForOpportunity(opportunityId: string) {
  const user = await requireAuthWithOrg();
  
  // Verify opportunity belongs to user's organization
  const opportunity = await prisma.opportunity.findFirst({
    where: { id: opportunityId, organizationId: user.organizationId },
    select: { organizationId: true },
  });
  
  if (!opportunity) return [];
  
  const vendors = await prisma.vendor.findMany({
    where: { organizationId: opportunity.organizationId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  
  return vendors;
}
