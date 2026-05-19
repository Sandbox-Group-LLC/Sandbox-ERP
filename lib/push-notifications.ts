"use server";

import webpush from "web-push";
import { prisma } from "@/lib/prisma";

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(
    "mailto:notifications@sandbox-erp.com",
    vapidPublicKey,
    vapidPrivateKey
  );
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  projectId?: string;
}

export async function sendPushNotification(
  userId: string,
  payload: PushPayload
): Promise<{ success: boolean; error?: string }> {
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.error("VAPID keys not configured");
    return { success: false, error: "VAPID keys not configured" };
  }

  try {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
    });

    if (subscriptions.length === 0) {
      return { success: true };
    }

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            JSON.stringify(payload)
          );
        } catch (error: any) {
          if (error.statusCode === 410 || error.statusCode === 404) {
            await prisma.pushSubscription.delete({
              where: { id: sub.id },
            });
            console.log(`Removed invalid subscription ${sub.id}`);
          }
          throw error;
        }
      })
    );

    const successful = results.filter((r) => r.status === "fulfilled").length;
    console.log(`Sent ${successful}/${subscriptions.length} notifications to user ${userId}`);

    return { success: true };
  } catch (error) {
    console.error("Failed to send push notification:", error);
    return { success: false, error: "Failed to send notification" };
  }
}

export async function sendMentionNotifications(
  content: string,
  authorName: string,
  projectId: string,
  projectName: string,
  organizationId: string
): Promise<void> {
  const mentionRegex = /@([a-zA-Z0-9._-]+)/g;
  const mentions: string[] = [];
  let match;

  while ((match = mentionRegex.exec(content)) !== null) {
    const username = match[1].toLowerCase().trim();
    if (username) {
      mentions.push(username);
    }
  }

  if (mentions.length === 0) return;

  const uniqueMentions = Array.from(new Set(mentions));

  const users = await prisma.user.findMany({
    where: {
      organizationId,
      email: { not: null },
    },
    select: { id: true, email: true },
  });

  const matchedUserIds = new Set<string>();

  for (const user of users) {
    if (!user.email) continue;
    const emailPrefix = user.email.split("@")[0].toLowerCase();
    if (uniqueMentions.includes(emailPrefix)) {
      matchedUserIds.add(user.id);
    }
  }

  if (matchedUserIds.size === 0) return;

  const url = `/projects/${projectId}/budget`;

  await Promise.all(
    Array.from(matchedUserIds).map((userId) =>
      sendPushNotification(userId, {
        title: `${authorName} mentioned you`,
        body: `You were mentioned in a comment on ${projectName}`,
        url,
        projectId,
      })
    )
  );
}
