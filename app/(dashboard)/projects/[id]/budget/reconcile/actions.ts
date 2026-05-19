"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireAuthWithOrg } from "@/lib/session";

export async function getReconcileData(projectId: string) {
  const user = await requireAuthWithOrg();

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      organizationId: user.organizationId,
    },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  const budget = await prisma.budget.findUnique({
    where: { projectId },
    include: {
      lines: {
        orderBy: { rowOrder: "asc" },
      },
    },
  });

  const expenseEntries = await prisma.expenseEntry.findMany({
    where: { projectId },
    orderBy: { date: "desc" },
  });

  const actualCostEntries = await prisma.actualCostEntry.findMany({
    where: { projectId },
    orderBy: { date: "desc" },
  });

  return {
    budgetLines: budget?.lines || [],
    expenseEntries,
    actualCostEntries,
  };
}

export async function linkExpenseToLine(expenseId: string, budgetLineId: string) {
  const user = await requireAuthWithOrg();

  const expense = await prisma.expenseEntry.findUnique({
    where: { id: expenseId },
    include: { project: true },
  });

  if (!expense || expense.project.organizationId !== user.organizationId) {
    throw new Error("Expense entry not found");
  }

  const budgetLine = await prisma.budgetLine.findUnique({
    where: { id: budgetLineId },
    include: { budget: { include: { project: true } } },
  });

  if (!budgetLine || budgetLine.budget.project?.organizationId !== user.organizationId) {
    throw new Error("Budget line not found");
  }

  await prisma.expenseEntry.update({
    where: { id: expenseId },
    data: { budgetLineId },
  });

  revalidatePath(`/projects/${expense.projectId}/budget/reconcile`);
  revalidatePath(`/projects/${expense.projectId}/budget`);
}

export async function unlinkExpense(expenseId: string) {
  const user = await requireAuthWithOrg();

  const expense = await prisma.expenseEntry.findUnique({
    where: { id: expenseId },
    include: { project: true },
  });

  if (!expense || expense.project.organizationId !== user.organizationId) {
    throw new Error("Expense entry not found");
  }

  await prisma.expenseEntry.update({
    where: { id: expenseId },
    data: { budgetLineId: null },
  });

  revalidatePath(`/projects/${expense.projectId}/budget/reconcile`);
  revalidatePath(`/projects/${expense.projectId}/budget`);
}

export async function linkActualToLine(actualId: string, budgetLineId: string) {
  const user = await requireAuthWithOrg();

  const actual = await prisma.actualCostEntry.findUnique({
    where: { id: actualId },
    include: { project: true },
  });

  if (!actual || actual.project.organizationId !== user.organizationId) {
    throw new Error("Actual cost entry not found");
  }

  const budgetLine = await prisma.budgetLine.findUnique({
    where: { id: budgetLineId },
    include: { budget: { include: { project: true } } },
  });

  if (!budgetLine || budgetLine.budget.project?.organizationId !== user.organizationId) {
    throw new Error("Budget line not found");
  }

  await prisma.actualCostEntry.update({
    where: { id: actualId },
    data: { budgetLineId },
  });

  revalidatePath(`/projects/${actual.projectId}/budget/reconcile`);
  revalidatePath(`/projects/${actual.projectId}/budget`);
}

export async function unlinkActual(actualId: string) {
  const user = await requireAuthWithOrg();

  const actual = await prisma.actualCostEntry.findUnique({
    where: { id: actualId },
    include: { project: true },
  });

  if (!actual || actual.project.organizationId !== user.organizationId) {
    throw new Error("Actual cost entry not found");
  }

  await prisma.actualCostEntry.update({
    where: { id: actualId },
    data: { budgetLineId: null },
  });

  revalidatePath(`/projects/${actual.projectId}/budget/reconcile`);
  revalidatePath(`/projects/${actual.projectId}/budget`);
}
