"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireAuthWithOrg } from "@/lib/session";

export interface ExpenseEntryData {
  date: Date;
  description: string;
  vendor?: string | null;
  amount: number;
  notes?: string | null;
  budgetLineId?: string | null;
}

export interface BudgetLineOption {
  id: string;
  description: string | null;
  section: string;
}

export async function getExpenseEntries(projectId: string) {
  const user = await requireAuthWithOrg();

  const project = await prisma.project.findFirst({
    where: { 
      id: projectId, 
      organizationId: user.organizationId 
    },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  const entries = await prisma.expenseEntry.findMany({
    where: { projectId },
    include: {
      budgetLine: {
        select: {
          id: true,
          description: true,
          section: true,
        },
      },
    },
    orderBy: { date: "desc" },
  });

  return entries;
}

export async function getBudgetLines(projectId: string): Promise<BudgetLineOption[]> {
  const user = await requireAuthWithOrg();

  const project = await prisma.project.findFirst({
    where: { 
      id: projectId, 
      organizationId: user.organizationId 
    },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  const budget = await prisma.budget.findUnique({
    where: { projectId },
    include: {
      lines: {
        select: {
          id: true,
          description: true,
          section: true,
        },
        orderBy: { rowOrder: "asc" },
      },
    },
  });

  return budget?.lines || [];
}

export async function createExpenseEntry(projectId: string, data: ExpenseEntryData) {
  const user = await requireAuthWithOrg();

  const project = await prisma.project.findFirst({
    where: { 
      id: projectId, 
      organizationId: user.organizationId 
    },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  const entry = await prisma.expenseEntry.create({
    data: {
      projectId,
      date: data.date,
      description: data.description,
      vendor: data.vendor || null,
      amount: data.amount,
      notes: data.notes || null,
      budgetLineId: data.budgetLineId || null,
      createdByUserId: user.id,
    },
  });

  revalidatePath(`/projects/${projectId}/expenses`);
  revalidatePath(`/projects/${projectId}/budget`);
  return entry;
}

export async function updateExpenseEntry(id: string, data: Partial<ExpenseEntryData>) {
  const user = await requireAuthWithOrg();

  const entry = await prisma.expenseEntry.findUnique({
    where: { id },
    include: { project: true },
  });

  if (!entry || entry.project.organizationId !== user.organizationId) {
    throw new Error("Expense entry not found");
  }

  const updated = await prisma.expenseEntry.update({
    where: { id },
    data: {
      date: data.date,
      description: data.description,
      vendor: data.vendor,
      amount: data.amount,
      notes: data.notes,
      budgetLineId: data.budgetLineId,
    },
  });

  revalidatePath(`/projects/${entry.projectId}/expenses`);
  revalidatePath(`/projects/${entry.projectId}/budget`);
  return updated;
}

export async function deleteExpenseEntry(id: string) {
  const user = await requireAuthWithOrg();

  const entry = await prisma.expenseEntry.findUnique({
    where: { id },
    include: { project: true },
  });

  if (!entry || entry.project.organizationId !== user.organizationId) {
    throw new Error("Expense entry not found");
  }

  await prisma.expenseEntry.delete({ where: { id } });

  revalidatePath(`/projects/${entry.projectId}/expenses`);
  revalidatePath(`/projects/${entry.projectId}/budget`);
}

export interface CSVRow {
  date: string;
  description: string;
  vendor: string;
  amount: string;
  notes: string;
}

export interface ImportResult {
  successCount: number;
  errorCount: number;
  errors: string[];
}

export async function importExpenseEntriesFromCSV(
  projectId: string,
  csvData: CSVRow[]
): Promise<ImportResult> {
  const user = await requireAuthWithOrg();

  const project = await prisma.project.findFirst({
    where: { 
      id: projectId, 
      organizationId: user.organizationId 
    },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  let successCount = 0;
  let errorCount = 0;
  const errors: string[] = [];

  for (let i = 0; i < csvData.length; i++) {
    const row = csvData[i];
    try {
      const parsedDate = new Date(row.date);
      if (isNaN(parsedDate.getTime())) {
        throw new Error(`Invalid date: ${row.date}`);
      }

      const parsedAmount = parseFloat(row.amount);
      if (isNaN(parsedAmount)) {
        throw new Error(`Invalid amount: ${row.amount}`);
      }

      if (!row.description || row.description.trim() === "") {
        throw new Error("Description is required");
      }

      await prisma.expenseEntry.create({
        data: {
          projectId,
          date: parsedDate,
          description: row.description.trim(),
          vendor: row.vendor?.trim() || null,
          amount: parsedAmount,
          notes: row.notes?.trim() || null,
          createdByUserId: user.id,
        },
      });

      successCount++;
    } catch (error) {
      errorCount++;
      errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  revalidatePath(`/projects/${projectId}/expenses`);
  revalidatePath(`/projects/${projectId}/budget`);

  return { successCount, errorCount, errors };
}
