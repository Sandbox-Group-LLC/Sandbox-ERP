"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

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

export async function getClientBudgetComments(projectId: string): Promise<BudgetCommentData[]> {
  const user = await getCurrentUser();
  if (!user || user.role !== "CLIENT") {
    return [];
  }

  const comments = await prisma.budgetComment.findMany({
    where: { 
      projectId,
      isInternal: false,
    },
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

export async function addClientBudgetComment(
  projectId: string,
  data: {
    budgetLineId?: string;
    lineDescription?: string;
    category?: string;
    field?: string;
    content: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user || user.role !== "CLIENT") {
    return { success: false, error: "Unauthorized" };
  }

  const commenterName = user.name || user.email || "Client User";
  const commenterEmail = user.email || "";

  try {
    await prisma.budgetComment.create({
      data: {
        projectId,
        budgetLineId: data.budgetLineId || null,
        lineDescription: data.lineDescription || null,
        category: data.category || null,
        field: data.field || null,
        commenterName,
        commenterEmail,
        content: data.content,
        isInternal: false,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to add comment:", error);
    return { success: false, error: "Failed to add comment" };
  }
}

export async function addClientBudgetMessage(
  projectId: string,
  commentId: string,
  content: string
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user || user.role !== "CLIENT") {
    return { success: false, error: "Unauthorized" };
  }

  const comment = await prisma.budgetComment.findFirst({
    where: { id: commentId, projectId },
  });

  if (!comment) {
    return { success: false, error: "Comment not found" };
  }

  const authorName = user.name || user.email || "Client User";
  const authorEmail = user.email || "";

  try {
    await prisma.commentMessage.create({
      data: {
        commentId,
        authorType: "CLIENT",
        authorName,
        authorEmail,
        content,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to add message:", error);
    return { success: false, error: "Failed to add message" };
  }
}
