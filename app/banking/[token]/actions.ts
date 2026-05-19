"use server";

import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { encrypt } from "@/lib/encryption";

export interface BankingAccessData {
  valid: boolean;
  expired?: boolean;
  personName?: string;
  alreadySubmitted?: boolean;
  submittedAt?: Date;
}

export async function validateBankingAccess(token: string): Promise<BankingAccessData> {
  const info = await prisma.personBankingInfo.findUnique({
    where: { accessToken: token },
    include: {
      person: { select: { name: true } },
    },
  });

  if (!info) {
    return { valid: false };
  }

  const now = new Date();
  if (info.expiresAt < now) {
    return { valid: false, expired: true };
  }

  await prisma.personBankingInfo.update({
    where: { id: info.id },
    data: { lastAccess: now },
  });

  return {
    valid: true,
    personName: info.person.name,
    alreadySubmitted: !!info.submittedAt,
    submittedAt: info.submittedAt || undefined,
  };
}

export async function submitBankingInfo(
  token: string,
  data: {
    bankName: string;
    accountHolderName: string;
    routingNumber: string;
    accountNumber: string;
    accountType: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const info = await prisma.personBankingInfo.findUnique({
    where: { accessToken: token },
  });

  if (!info) {
    return { success: false, error: "Invalid access link" };
  }

  const now = new Date();
  if (info.expiresAt < now) {
    return { success: false, error: "This link has expired" };
  }

  const headersList = headers();
  const forwardedFor = headersList.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown";

  await prisma.personBankingInfo.update({
    where: { id: info.id },
    data: {
      bankName: data.bankName,
      accountHolderName: data.accountHolderName,
      routingNumber: encrypt(data.routingNumber),
      accountNumber: encrypt(data.accountNumber),
      accountType: data.accountType,
      submittedAt: now,
      submittedFromIp: ip,
    },
  });

  return { success: true };
}
