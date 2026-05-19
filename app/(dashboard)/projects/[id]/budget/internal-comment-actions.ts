"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { sendMentionNotifications } from "@/lib/push-notifications";

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  username: string;
}

export async function getTeamMembers(projectId: string): Promise<TeamMember[]> {
  const user = await requireAuth();
  if (!user || !user.organizationId) {
    return [];
  }

  const [users, people] = await Promise.all([
    prisma.user.findMany({
      where: {
        organizationId: user.organizationId,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    }),
    prisma.person.findMany({
      where: {
        organizationId: user.organizationId,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    }),
  ]);

  const teamMembers: TeamMember[] = [];
  const seenUsernames = new Set<string>();

  for (const u of users) {
    const email = u.email || "";
    const name = u.name || "";
    const username = email ? email.split("@")[0] : name.toLowerCase().replace(/\s+/g, "");
    const finalUsername = username || u.id.slice(0, 8);
    
    if (!seenUsernames.has(finalUsername.toLowerCase())) {
      seenUsernames.add(finalUsername.toLowerCase());
      teamMembers.push({
        id: u.id,
        name: name || email || "Unknown",
        email,
        username: finalUsername,
      });
    }
  }

  for (const p of people) {
    const email = p.email || "";
    const name = p.name || "";
    const username = email ? email.split("@")[0] : name.toLowerCase().replace(/\s+/g, "");
    const finalUsername = username || p.id.slice(0, 8);
    
    if (!seenUsernames.has(finalUsername.toLowerCase())) {
      seenUsernames.add(finalUsername.toLowerCase());
      teamMembers.push({
        id: p.id,
        name: name || email || "Unknown",
        email,
        username: finalUsername,
      });
    }
  }

  return teamMembers.sort((a, b) => a.name.localeCompare(b.name));
}

export interface InternalCommentMessageData {
  id: string;
  authorType: "CLIENT" | "INTERNAL";
  authorName: string;
  content: string;
  createdAt: Date;
}

export interface InternalCommentWithDetails {
  id: string;
  budgetLineId: string | null;
  lineDescription: string | null;
  category: string | null;
  commenterName: string;
  commenterEmail: string;
  content: string;
  isResolved: boolean;
  createdAt: Date;
  messages: InternalCommentMessageData[];
}

export async function getInternalComments(projectId: string): Promise<InternalCommentWithDetails[]> {
  const comments = await prisma.budgetComment.findMany({
    where: { 
      projectId,
      isInternal: true,
    },
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

export async function createInternalComment(
  projectId: string,
  data: {
    budgetLineId: string | null;
    lineDescription: string | null;
    category: string | null;
    content: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAuth();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const commenterName = user.name || user.email || "Team Member";
  const commenterEmail = user.email || "";

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, organizationId: true },
    });

    await prisma.budgetComment.create({
      data: {
        projectId,
        budgetLineId: data.budgetLineId,
        lineDescription: data.lineDescription,
        category: data.category,
        commenterName,
        commenterEmail,
        content: data.content,
        isInternal: true,
      },
    });

    if (project && user.organizationId) {
      sendMentionNotifications(
        data.content,
        commenterName,
        projectId,
        project.name,
        user.organizationId
      ).catch((err) => console.error("Failed to send mention notifications:", err));
    }

    revalidatePath(`/projects/${projectId}/budget`);
    return { success: true };
  } catch (error) {
    console.error("Failed to create internal comment:", error);
    return { success: false, error: "Failed to create comment" };
  }
}

export async function addInternalReply(
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
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, organizationId: true },
    });

    await prisma.commentMessage.create({
      data: {
        commentId,
        authorType: "INTERNAL",
        authorId: user.id,
        authorName,
        content,
      },
    });

    if (project && user.organizationId) {
      sendMentionNotifications(
        content,
        authorName,
        projectId,
        project.name,
        user.organizationId
      ).catch((err) => console.error("Failed to send mention notifications:", err));
    }

    revalidatePath(`/projects/${projectId}/budget`);
    return { success: true };
  } catch (error) {
    console.error("Failed to add reply:", error);
    return { success: false, error: "Failed to add reply" };
  }
}

export async function resolveInternalComment(
  projectId: string,
  commentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.budgetComment.update({
      where: { id: commentId },
      data: { isResolved: true },
    });

    revalidatePath(`/projects/${projectId}/budget`);
    return { success: true };
  } catch (error) {
    console.error("Failed to resolve comment:", error);
    return { success: false, error: "Failed to resolve comment" };
  }
}

export async function unresolveInternalComment(
  projectId: string,
  commentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.budgetComment.update({
      where: { id: commentId },
      data: { isResolved: false },
    });

    revalidatePath(`/projects/${projectId}/budget`);
    return { success: true };
  } catch (error) {
    console.error("Failed to unresolve comment:", error);
    return { success: false, error: "Failed to unresolve comment" };
  }
}
