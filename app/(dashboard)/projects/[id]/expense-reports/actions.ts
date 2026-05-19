"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireAuthWithOrg } from "@/lib/session";
import { sendExpenseReportNotification } from "@/lib/resend";

export async function getCurrentUser() {
  const user = await requireAuthWithOrg();
  return { id: user.id, role: user.role, name: user.name };
}

export async function getExpenseReports(projectId: string) {
  const user = await requireAuthWithOrg();

  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: user.organizationId },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  if (user.role === "EXTERNAL" || user.role === "CLIENT") {
    throw new Error("Access denied");
  }

  const where: any = { projectId };
  if (user.role === "MEMBER") {
    where.userId = user.id;
  }

  const reports = await prisma.contractorExpenseReport.findMany({
    where,
    include: {
      user: { select: { id: true, name: true } },
      lineItems: true,
      _count: { select: { activities: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return reports;
}

export async function createExpenseReport(
  projectId: string,
  data: {
    date: string;
    lineItems: Array<{
      category: string;
      subCategory?: string;
      description: string;
      amount: number;
      receiptUrl?: string;
    }>;
  }
) {
  const user = await requireAuthWithOrg();

  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: user.organizationId },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  if (!data.lineItems || data.lineItems.length === 0) {
    throw new Error("At least one line item is required");
  }

  const totalAmount = data.lineItems.reduce((sum, item) => sum + item.amount, 0);
  const firstItem = data.lineItems[0];

  const report = await prisma.$transaction(async (tx) => {
    const created = await tx.contractorExpenseReport.create({
      data: {
        projectId,
        userId: user.id,
        date: new Date(data.date),
        amount: totalAmount,
        category: firstItem.category,
        description: data.lineItems.map((li) => li.description).join("; "),
        status: "draft",
        activities: {
          create: {
            actorUserId: user.id,
            action: "created",
          },
        },
        lineItems: {
          create: data.lineItems.map((item) => ({
            category: item.category,
            subCategory: item.subCategory || null,
            description: item.description,
            amount: item.amount,
            receiptUrl: item.receiptUrl || null,
          })),
        },
      },
      include: { lineItems: true },
    });

    return created;
  });

  revalidatePath(`/projects/${projectId}`);
  return report;
}

export async function updateExpenseReport(
  reportId: string,
  data: {
    date?: string;
    lineItems?: Array<{
      category: string;
      subCategory?: string;
      description: string;
      amount: number;
      receiptUrl?: string;
    }>;
  }
) {
  const user = await requireAuthWithOrg();

  const report = await prisma.contractorExpenseReport.findUnique({
    where: { id: reportId },
    include: { project: true },
  });

  if (!report || report.project.organizationId !== user.organizationId) {
    throw new Error("Report not found");
  }

  if (report.status !== "draft" && report.status !== "returned") {
    throw new Error("Report can only be edited in draft or returned status");
  }

  if (report.userId !== user.id && user.role !== "ADMIN") {
    throw new Error("Not authorized to edit this report");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updateData: any = {};
    if (data.date !== undefined) updateData.date = new Date(data.date);

    if (data.lineItems && data.lineItems.length > 0) {
      await tx.contractorExpenseLineItem.deleteMany({
        where: { reportId },
      });

      await tx.contractorExpenseLineItem.createMany({
        data: data.lineItems.map((item) => ({
          reportId,
          category: item.category,
          subCategory: item.subCategory || null,
          description: item.description,
          amount: item.amount,
          receiptUrl: item.receiptUrl || null,
        })),
      });

      const totalAmount = data.lineItems.reduce((sum, item) => sum + item.amount, 0);
      updateData.amount = totalAmount;
      updateData.category = data.lineItems[0].category;
      updateData.description = data.lineItems.map((li) => li.description).join("; ");
    }

    const result = await tx.contractorExpenseReport.update({
      where: { id: reportId },
      data: updateData,
    });

    return result;
  });

  revalidatePath(`/projects/${report.projectId}`);
  return updated;
}

export async function deleteExpenseReport(reportId: string) {
  const user = await requireAuthWithOrg();

  const report = await prisma.contractorExpenseReport.findUnique({
    where: { id: reportId },
    include: { project: true },
  });

  if (!report || report.project.organizationId !== user.organizationId) {
    throw new Error("Report not found");
  }

  if (report.status !== "draft") {
    throw new Error("Only draft reports can be deleted");
  }

  if (report.userId !== user.id && user.role !== "ADMIN") {
    throw new Error("Not authorized to delete this report");
  }

  await prisma.contractorExpenseReport.delete({ where: { id: reportId } });

  revalidatePath(`/projects/${report.projectId}`);
}

export async function submitReport(reportId: string) {
  const user = await requireAuthWithOrg();

  const report = await prisma.contractorExpenseReport.findUnique({
    where: { id: reportId },
    include: { project: true },
  });

  if (!report || report.project.organizationId !== user.organizationId) {
    throw new Error("Report not found");
  }

  if (report.userId !== user.id) {
    throw new Error("Only the creator can submit this report");
  }

  if (report.status !== "draft") {
    throw new Error("Only draft reports can be submitted");
  }

  await prisma.contractorExpenseReport.update({
    where: { id: reportId },
    data: {
      status: "submitted",
      activities: {
        create: {
          actorUserId: user.id,
          action: "submitted",
        },
      },
    },
  });

  const admins = await prisma.user.findMany({
    where: {
      role: 'ADMIN',
      approvalStatus: 'APPROVED',
      organizationId: user.organizationId,
    },
    select: { email: true },
  });
  const adminEmails = admins.filter(a => a.email).map(a => a.email as string);
  if (adminEmails.length > 0) {
    sendExpenseReportNotification({
      action: 'submitted',
      recipientEmails: adminEmails,
      reportAmount: Number(report.amount),
      reportDate: report.date,
      projectName: report.project.name,
      projectId: report.projectId,
      submitterName: user.name || 'Unknown User',
    }).catch(err => console.error('Failed to send submit notification:', err));
  }

  revalidatePath(`/projects/${report.projectId}`);
}

export async function returnReport(reportId: string, comment: string) {
  const user = await requireAuthWithOrg();

  if (user.role !== "ADMIN") {
    throw new Error("Only admins can return reports");
  }

  if (!comment || comment.trim() === "") {
    throw new Error("Comment is required when returning a report");
  }

  const report = await prisma.contractorExpenseReport.findUnique({
    where: { id: reportId },
    include: { project: true },
  });

  if (!report || report.project.organizationId !== user.organizationId) {
    throw new Error("Report not found");
  }

  if (report.status !== "submitted") {
    throw new Error("Only submitted reports can be returned");
  }

  await prisma.contractorExpenseReport.update({
    where: { id: reportId },
    data: {
      status: "returned",
      activities: {
        create: {
          actorUserId: user.id,
          action: "returned",
          comment: comment.trim(),
        },
      },
    },
  });

  const creator = await prisma.user.findUnique({
    where: { id: report.userId },
    select: { email: true, name: true },
  });
  if (creator?.email) {
    sendExpenseReportNotification({
      action: 'returned',
      recipientEmails: [creator.email],
      reportAmount: Number(report.amount),
      reportDate: report.date,
      projectName: report.project.name,
      projectId: report.projectId,
      submitterName: creator.name || 'Unknown User',
      comment: comment.trim(),
    }).catch(err => console.error('Failed to send return notification:', err));
  }

  revalidatePath(`/projects/${report.projectId}`);
}

export async function approveReport(reportId: string) {
  const user = await requireAuthWithOrg();

  if (user.role !== "ADMIN") {
    throw new Error("Only admins can approve reports");
  }

  const report = await prisma.contractorExpenseReport.findUnique({
    where: { id: reportId },
    include: { project: true },
  });

  if (!report || report.project.organizationId !== user.organizationId) {
    throw new Error("Report not found");
  }

  if (report.status !== "submitted") {
    throw new Error("Only submitted reports can be approved");
  }

  await prisma.contractorExpenseReport.update({
    where: { id: reportId },
    data: {
      status: "approved",
      activities: {
        create: {
          actorUserId: user.id,
          action: "approved",
        },
      },
    },
  });

  const creator = await prisma.user.findUnique({
    where: { id: report.userId },
    select: { email: true, name: true },
  });
  if (creator?.email) {
    sendExpenseReportNotification({
      action: 'approved',
      recipientEmails: [creator.email],
      reportAmount: Number(report.amount),
      reportDate: report.date,
      projectName: report.project.name,
      projectId: report.projectId,
      submitterName: creator.name || 'Unknown User',
    }).catch(err => console.error('Failed to send approve notification:', err));
  }

  revalidatePath(`/projects/${report.projectId}`);
}

export async function resubmitReport(reportId: string) {
  const user = await requireAuthWithOrg();

  const report = await prisma.contractorExpenseReport.findUnique({
    where: { id: reportId },
    include: { project: true },
  });

  if (!report || report.project.organizationId !== user.organizationId) {
    throw new Error("Report not found");
  }

  if (report.userId !== user.id) {
    throw new Error("Only the creator can resubmit this report");
  }

  if (report.status !== "returned") {
    throw new Error("Only returned reports can be resubmitted");
  }

  await prisma.contractorExpenseReport.update({
    where: { id: reportId },
    data: {
      status: "submitted",
      activities: {
        create: {
          actorUserId: user.id,
          action: "resubmitted",
        },
      },
    },
  });

  const admins = await prisma.user.findMany({
    where: {
      role: 'ADMIN',
      approvalStatus: 'APPROVED',
      organizationId: user.organizationId,
    },
    select: { email: true },
  });
  const adminEmails = admins.filter(a => a.email).map(a => a.email as string);
  if (adminEmails.length > 0) {
    sendExpenseReportNotification({
      action: 'resubmitted',
      recipientEmails: adminEmails,
      reportAmount: Number(report.amount),
      reportDate: report.date,
      projectName: report.project.name,
      projectId: report.projectId,
      submitterName: user.name || 'Unknown User',
    }).catch(err => console.error('Failed to send resubmit notification:', err));
  }

  revalidatePath(`/projects/${report.projectId}`);
}

export async function getReportActivities(reportId: string) {
  const user = await requireAuthWithOrg();

  const report = await prisma.contractorExpenseReport.findUnique({
    where: { id: reportId },
    include: { project: true },
  });

  if (!report || report.project.organizationId !== user.organizationId) {
    throw new Error("Report not found");
  }

  if (user.role === "MEMBER" && report.userId !== user.id) {
    throw new Error("Not authorized to view this report's activities");
  }

  const activities = await prisma.contractorExpenseActivity.findMany({
    where: { reportId },
    include: {
      actor: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return activities;
}
