"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { revalidatePath } from "next/cache";

export interface CommentMessageData {
  id: string;
  authorType: "CLIENT" | "INTERNAL";
  authorName: string;
  content: string;
  createdAt: Date;
}

export interface BudgetCommentWithDetails {
  id: string;
  budgetLineId: string | null;
  lineDescription: string | null;
  category: string | null;
  field: string | null;
  commenterName: string;
  commenterEmail: string;
  content: string;
  isResolved: boolean;
  createdAt: Date;
  messages: CommentMessageData[];
}

export async function getProjectComments(projectId: string): Promise<BudgetCommentWithDetails[]> {
  const comments = await prisma.budgetComment.findMany({
    where: { projectId },
    orderBy: [{ isResolved: "asc" }, { createdAt: "desc" }],
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
    commenterEmail: c.commenterEmail,
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

export async function resolveComment(
  projectId: string,
  commentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.budgetComment.update({
      where: { id: commentId },
      data: { isResolved: true },
    });

    revalidatePath(`/projects/${projectId}/client-access`);
    return { success: true };
  } catch (error) {
    console.error("Failed to resolve comment:", error);
    return { success: false, error: "Failed to resolve comment" };
  }
}

export async function unresolveComment(
  projectId: string,
  commentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.budgetComment.update({
      where: { id: commentId },
      data: { isResolved: false },
    });

    revalidatePath(`/projects/${projectId}/client-access`);
    return { success: true };
  } catch (error) {
    console.error("Failed to unresolve comment:", error);
    return { success: false, error: "Failed to unresolve comment" };
  }
}

export async function addMessage(
  projectId: string,
  commentId: string,
  content: string
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAuth();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const authorName = user.name || user.email || "Team Member";

  try {
    await prisma.commentMessage.create({
      data: {
        commentId,
        authorType: "INTERNAL",
        authorId: user.id,
        authorName,
        content,
      },
    });

    revalidatePath(`/projects/${projectId}/client-access`);
    return { success: true };
  } catch (error) {
    console.error("Failed to add message:", error);
    return { success: false, error: "Failed to add message" };
  }
}
