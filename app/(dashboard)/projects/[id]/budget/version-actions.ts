"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { revalidatePath } from "next/cache";

export async function createBudgetVersion(
  projectId: string,
  title: string,
  notes?: string
) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    throw new Error("Unauthorized");
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { organizationId: true },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { organizationId: true },
  });

  if (user?.organizationId !== project.organizationId) {
    throw new Error("Unauthorized");
  }

  const budget = await prisma.budget.findUnique({
    where: { projectId },
    include: {
      lines: {
        orderBy: { rowOrder: "asc" },
      },
    },
  });

  if (!budget) {
    throw new Error("Budget not found");
  }

  const lastVersion = await prisma.budgetVersion.findFirst({
    where: { budgetId: budget.id },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });

  const versionNumber = (lastVersion?.versionNumber ?? 0) + 1;

  const version = await prisma.budgetVersion.create({
    data: {
      budgetId: budget.id,
      versionNumber,
      title,
      notes,
      jurisdiction: budget.jurisdiction,
      baseMarkup: budget.baseMarkup,
      isClientVisible: false,
      createdById: sessionUser.id,
      lines: {
        create: budget.lines.map((line) => ({
          originalLineId: line.id,
          rowOrder: line.rowOrder,
          section: line.section,
          lineType: line.lineType,
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
        })),
      },
    },
    include: {
      lines: true,
      createdBy: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  revalidatePath(`/projects/${projectId}/budget`);
  return version;
}

export interface BudgetVersionSummary {
  id: string;
  versionNumber: number;
  title: string;
  notes: string | null;
  isClientVisible: boolean;
  createdAt: Date;
  createdBy: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
  lineCount: number;
}

export async function getBudgetVersions(
  projectId: string
): Promise<BudgetVersionSummary[]> {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return [];
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { organizationId: true },
  });

  if (!project) {
    return [];
  }

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { organizationId: true },
  });

  if (user?.organizationId !== project.organizationId) {
    return [];
  }

  const budget = await prisma.budget.findUnique({
    where: { projectId },
    select: { id: true },
  });

  if (!budget) {
    return [];
  }

  const versions = await prisma.budgetVersion.findMany({
    where: { budgetId: budget.id },
    orderBy: { versionNumber: "desc" },
    include: {
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      _count: {
        select: { lines: true },
      },
    },
  });

  return versions.map((v) => ({
    id: v.id,
    versionNumber: v.versionNumber,
    title: v.title,
    notes: v.notes,
    isClientVisible: v.isClientVisible,
    createdAt: v.createdAt,
    createdBy: v.createdBy,
    lineCount: v._count.lines,
  }));
}

export async function getBudgetVersionById(versionId: string) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    throw new Error("Unauthorized");
  }

  const version = await prisma.budgetVersion.findUnique({
    where: { id: versionId },
    include: {
      budget: {
        include: {
          project: { select: { organizationId: true } },
          opportunity: { select: { organizationId: true } },
        },
      },
      lines: {
        orderBy: { rowOrder: "asc" },
      },
      createdBy: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  if (!version) {
    throw new Error("Version not found");
  }

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { organizationId: true },
  });

  const budgetOrgId = version.budget.project?.organizationId ?? version.budget.opportunity?.organizationId;

  if (!budgetOrgId || user?.organizationId !== budgetOrgId) {
    throw new Error("Unauthorized");
  }

  return version;
}

export async function toggleVersionClientVisibility(
  versionId: string,
  visible: boolean
) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    throw new Error("Unauthorized");
  }

  const version = await prisma.budgetVersion.findUnique({
    where: { id: versionId },
    include: {
      budget: {
        include: {
          project: { select: { organizationId: true } },
          opportunity: { select: { organizationId: true } },
        },
      },
    },
  });

  if (!version) {
    throw new Error("Version not found");
  }

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { organizationId: true },
  });

  const budgetOrgId = version.budget.project?.organizationId ?? version.budget.opportunity?.organizationId;

  if (!budgetOrgId || user?.organizationId !== budgetOrgId) {
    throw new Error("Unauthorized");
  }

  const updated = await prisma.budgetVersion.update({
    where: { id: versionId },
    data: { isClientVisible: visible },
  });

  if (version.budget.projectId) {
    revalidatePath(`/projects/${version.budget.projectId}/budget`);
  }

  return updated;
}

export async function deleteBudgetVersion(versionId: string) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    throw new Error("Unauthorized");
  }

  const version = await prisma.budgetVersion.findUnique({
    where: { id: versionId },
    include: {
      budget: {
        include: {
          project: { select: { organizationId: true } },
          opportunity: { select: { organizationId: true } },
        },
      },
    },
  });

  if (!version) {
    throw new Error("Version not found");
  }

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { organizationId: true },
  });

  const budgetOrgId = version.budget.project?.organizationId ?? version.budget.opportunity?.organizationId;

  if (!budgetOrgId || user?.organizationId !== budgetOrgId) {
    throw new Error("Unauthorized");
  }

  await prisma.budgetVersion.delete({
    where: { id: versionId },
  });

  if (version.budget.projectId) {
    revalidatePath(`/projects/${version.budget.projectId}/budget`);
  }
}
