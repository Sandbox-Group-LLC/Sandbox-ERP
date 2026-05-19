"use server";

import { prisma } from "@/lib/prisma";
import { getResendClient, getPortalBaseUrl } from "@/lib/resend";
import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";

function generateAccessToken(): string {
  return randomBytes(32).toString("hex");
}

export interface ClientAccessEntry {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  expiresAt: Date;
  lastAccess: Date | null;
  createdAt: Date;
  isExpired: boolean;
}

export async function getClientAccessList(projectId: string): Promise<ClientAccessEntry[]> {
  const entries = await prisma.clientPortalAccess.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  const now = new Date();
  return entries.map((entry) => ({
    id: entry.id,
    firstName: entry.firstName,
    lastName: entry.lastName,
    email: entry.email,
    expiresAt: entry.expiresAt,
    lastAccess: entry.lastAccess,
    createdAt: entry.createdAt,
    isExpired: entry.expiresAt < now,
  }));
}

export async function createClientAccess(
  projectId: string,
  data: {
    firstName: string;
    lastName: string;
    email: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { client: true },
    });

    if (!project) {
      return { success: false, error: "Project not found" };
    }

    const accessToken = generateAccessToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);

    await prisma.clientPortalAccess.create({
      data: {
        projectId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        accessToken,
        expiresAt,
      },
    });

    const portalUrl = `${getPortalBaseUrl()}/portal/${accessToken}`;

    const resendClient = await getResendClient();
    if (resendClient) {
      try {
        await resendClient.client.emails.send({
          from: resendClient.fromEmail,
          to: data.email,
          subject: `Budget Review Invitation - ${project.name}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>You've Been Invited to Review a Budget</h2>
              <p>Hi ${data.firstName},</p>
              <p>You've been invited to review the budget for <strong>${project.name}</strong> by ${project.client.name}.</p>
              <p>Click the button below to access the budget portal:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${portalUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                  View Budget
                </a>
              </div>
              <p style="color: #666; font-size: 14px;">
                This link will expire in 90 days. If you have any questions, please contact your project manager.
              </p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
              <p style="color: #999; font-size: 12px;">
                If the button doesn't work, copy and paste this URL into your browser:<br/>
                <a href="${portalUrl}" style="color: #2563eb;">${portalUrl}</a>
              </p>
            </div>
          `,
        });
      } catch (emailError) {
        console.error("Failed to send email:", emailError);
      }
    } else {
      console.warn("Email not sent - no email service configured");
    }

    revalidatePath(`/projects/${projectId}/client-access`);
    return { success: true };
  } catch (error) {
    console.error("Failed to create client access:", error);
    return { success: false, error: "Failed to create access" };
  }
}

export async function revokeClientAccess(
  projectId: string,
  accessId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.clientPortalAccess.delete({
      where: { id: accessId },
    });

    revalidatePath(`/projects/${projectId}/client-access`);
    return { success: true };
  } catch (error) {
    console.error("Failed to revoke client access:", error);
    return { success: false, error: "Failed to revoke access" };
  }
}

export async function resendInviteEmail(
  projectId: string,
  accessId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const access = await prisma.clientPortalAccess.findUnique({
      where: { id: accessId },
      include: {
        project: {
          include: { client: true },
        },
      },
    });

    if (!access) {
      return { success: false, error: "Access not found" };
    }

    const portalUrl = `${getPortalBaseUrl()}/portal/${access.accessToken}`;

    const resendClient = await getResendClient();
    if (!resendClient) {
      return { success: false, error: "Email service not configured" };
    }

    await resendClient.client.emails.send({
      from: resendClient.fromEmail,
      to: access.email,
      subject: `Reminder: Budget Review - ${access.project.name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Reminder: Budget Review Invitation</h2>
          <p>Hi ${access.firstName},</p>
          <p>This is a reminder that you have access to review the budget for <strong>${access.project.name}</strong>.</p>
          <p>Click the button below to access the budget portal:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${portalUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              View Budget
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">
            This link expires on ${access.expiresAt.toLocaleDateString()}. If you have any questions, please contact your project manager.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="color: #999; font-size: 12px;">
            If the button doesn't work, copy and paste this URL into your browser:<br/>
            <a href="${portalUrl}" style="color: #2563eb;">${portalUrl}</a>
          </p>
        </div>
      `,
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to resend invite:", error);
    return { success: false, error: "Failed to send email" };
  }
}

export async function extendClientAccess(
  projectId: string,
  accessId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);

    await prisma.clientPortalAccess.update({
      where: { id: accessId },
      data: { expiresAt },
    });

    revalidatePath(`/projects/${projectId}/client-access`);
    return { success: true };
  } catch (error) {
    console.error("Failed to extend access:", error);
    return { success: false, error: "Failed to extend access" };
  }
}
