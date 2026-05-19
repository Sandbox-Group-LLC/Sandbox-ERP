"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireAuthWithOrg } from "@/lib/session";

export interface ReceivableData {
  projectId?: string | null;
  poNumber?: string | null;
  poAmount?: number;
  invoiced?: number;
  uninvoiced?: number;
  paid?: number;
}

export async function getReceivables(clientId: string) {
  const user = await requireAuthWithOrg();

  const client = await prisma.client.findFirst({
    where: { 
      id: clientId, 
      organizationId: user.organizationId 
    },
  });

  if (!client) {
    throw new Error("Client not found");
  }

  const receivables = await prisma.receivable.findMany({
    where: { clientId },
    include: {
      project: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return receivables;
}

export async function createReceivable(clientId: string, data: ReceivableData) {
  const user = await requireAuthWithOrg();

  const client = await prisma.client.findFirst({
    where: { 
      id: clientId, 
      organizationId: user.organizationId 
    },
  });

  if (!client) {
    throw new Error("Client not found");
  }

  if (data.projectId) {
    const project = await prisma.project.findFirst({
      where: {
        id: data.projectId,
        clientId: clientId,
      },
    });
    if (!project) {
      throw new Error("Project not found or does not belong to this client");
    }
  }

  const receivable = await prisma.receivable.create({
    data: {
      clientId,
      projectId: data.projectId || null,
      poNumber: data.poNumber || null,
      poAmount: data.poAmount ?? 0,
      invoiced: data.invoiced ?? 0,
      uninvoiced: data.uninvoiced ?? 0,
      paid: data.paid ?? 0,
    },
  });

  revalidatePath(`/clients/${clientId}`);
  return receivable;
}

export async function updateReceivable(id: string, data: Partial<ReceivableData>) {
  const user = await requireAuthWithOrg();

  const receivable = await prisma.receivable.findUnique({
    where: { id },
    include: { client: true },
  });

  if (!receivable || receivable.client.organizationId !== user.organizationId) {
    throw new Error("Receivable not found");
  }

  if (data.projectId) {
    const project = await prisma.project.findFirst({
      where: {
        id: data.projectId,
        clientId: receivable.clientId,
      },
    });
    if (!project) {
      throw new Error("Project not found or does not belong to this client");
    }
  }

  const updated = await prisma.receivable.update({
    where: { id },
    data: {
      projectId: data.projectId,
      poNumber: data.poNumber,
      poAmount: data.poAmount,
      invoiced: data.invoiced,
      uninvoiced: data.uninvoiced,
      paid: data.paid,
    },
  });

  revalidatePath(`/clients/${receivable.clientId}`);
  return updated;
}

export async function deleteReceivable(id: string) {
  const user = await requireAuthWithOrg();

  const receivable = await prisma.receivable.findUnique({
    where: { id },
    include: { client: true },
  });

  if (!receivable || receivable.client.organizationId !== user.organizationId) {
    throw new Error("Receivable not found");
  }

  await prisma.receivable.delete({ where: { id } });

  revalidatePath(`/clients/${receivable.clientId}`);
}
