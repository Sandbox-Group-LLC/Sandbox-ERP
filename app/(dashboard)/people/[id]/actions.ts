"use server"

import { prisma } from "@/lib/prisma"
import { requireAuthWithOrg } from "@/lib/session"
import { revalidatePath } from "next/cache"
import { DocumentType, DocumentStatus, StripePayoutStatus } from "@prisma/client"
import { createStripeRecipient, createOnboardingLink, refreshAccountStatus, isStripeConfigured } from "@/lib/stripe"
import { randomBytes } from "crypto"
import { getLastFourDigits, decrypt } from "@/lib/encryption"

const SUPER_ADMIN_EMAIL = "brian@makemysandbox.com"

const ALL_DOCUMENT_TYPES: DocumentType[] = [
  "NDA",
  "COI",
  "W9",
  "CONTRACT",
  "DIRECT_DEPOSIT",
  "OTHER",
]

export async function checkAndExpireCOIDocuments(personId: string) {
  const now = new Date()
  
  await prisma.onboardingDocument.updateMany({
    where: {
      personId,
      documentType: "COI",
      expirationDate: { lt: now },
      status: { not: "EXPIRED" },
    },
    data: {
      status: "EXPIRED",
    },
  })
}

export async function getPersonWithDocuments(id: string) {
  const user = await requireAuthWithOrg()

  await checkAndExpireCOIDocuments(id)

  const person = await prisma.person.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      onboardingDocuments: {
        orderBy: { documentType: "asc" },
      },
    },
  })

  return person
}

export async function initializeDocuments(personId: string) {
  const user = await requireAuthWithOrg()

  const person = await prisma.person.findFirst({
    where: { id: personId, organizationId: user.organizationId },
  })

  if (!person) {
    throw new Error("Person not found")
  }

  const existingDocs = await prisma.onboardingDocument.findMany({
    where: { personId },
    select: { documentType: true },
  })

  const existingTypes = new Set(existingDocs.map((d) => d.documentType))
  const missingTypes = ALL_DOCUMENT_TYPES.filter((t) => !existingTypes.has(t))

  if (missingTypes.length > 0) {
    await prisma.onboardingDocument.createMany({
      data: missingTypes.map((documentType) => ({
        personId,
        documentType,
        status: "PENDING" as DocumentStatus,
      })),
    })
  }

  revalidatePath(`/people/${personId}`)
}

export async function createOrUpdateDocument(personId: string, formData: FormData) {
  const user = await requireAuthWithOrg()

  const person = await prisma.person.findFirst({
    where: { id: personId, organizationId: user.organizationId },
  })

  if (!person) {
    throw new Error("Person not found")
  }

  const documentType = formData.get("documentType") as DocumentType
  const status = formData.get("status") as DocumentStatus
  const fileName = formData.get("fileName") as string | null
  const filePath = formData.get("filePath") as string | null
  const expirationDate = formData.get("expirationDate") as string | null
  const notes = formData.get("notes") as string | null

  await prisma.onboardingDocument.upsert({
    where: {
      personId_documentType: {
        personId,
        documentType,
      },
    },
    update: {
      status,
      fileName: fileName || null,
      filePath: filePath || null,
      expirationDate: expirationDate ? new Date(expirationDate) : null,
      notes: notes || null,
    },
    create: {
      personId,
      documentType,
      status,
      fileName: fileName || null,
      filePath: filePath || null,
      expirationDate: expirationDate ? new Date(expirationDate) : null,
      notes: notes || null,
    },
  })

  revalidatePath(`/people/${personId}`)
}

export async function updateDocumentStatus(docId: string, status: DocumentStatus) {
  const user = await requireAuthWithOrg()

  const doc = await prisma.onboardingDocument.findUnique({
    where: { id: docId },
    include: { person: true },
  })

  if (!doc || doc.person.organizationId !== user.organizationId) {
    throw new Error("Document not found")
  }

  await prisma.onboardingDocument.update({
    where: { id: docId },
    data: { status },
  })

  revalidatePath(`/people/${doc.personId}`)
}

export async function updateDocumentFile(docId: string, fileName: string | null, filePath: string | null) {
  const user = await requireAuthWithOrg()

  const doc = await prisma.onboardingDocument.findUnique({
    where: { id: docId },
    include: { person: true },
  })

  if (!doc || doc.person.organizationId !== user.organizationId) {
    throw new Error("Document not found")
  }

  await prisma.onboardingDocument.update({
    where: { id: docId },
    data: { 
      fileName,
      filePath,
      status: fileName ? "RECEIVED" : doc.status,
    },
  })

  revalidatePath(`/people/${doc.personId}`)
}

export async function updateDocumentExpiration(docId: string, expirationDate: string | null) {
  const user = await requireAuthWithOrg()

  const doc = await prisma.onboardingDocument.findUnique({
    where: { id: docId },
    include: { person: true },
  })

  if (!doc || doc.person.organizationId !== user.organizationId) {
    throw new Error("Document not found")
  }

  await prisma.onboardingDocument.update({
    where: { id: docId },
    data: { 
      expirationDate: expirationDate ? new Date(expirationDate) : null,
    },
  })

  revalidatePath(`/people/${doc.personId}`)
}

export async function deleteDocument(docId: string) {
  const user = await requireAuthWithOrg()

  const doc = await prisma.onboardingDocument.findUnique({
    where: { id: docId },
    include: { person: true },
  })

  if (!doc || doc.person.organizationId !== user.organizationId) {
    throw new Error("Document not found")
  }

  const personId = doc.personId

  await prisma.onboardingDocument.delete({
    where: { id: docId },
  })

  revalidatePath(`/people/${personId}`)
}

export async function updatePerson(id: string, formData: FormData) {
  const user = await requireAuthWithOrg()

  await prisma.person.update({
    where: { id, organizationId: user.organizationId },
    data: {
      name: formData.get("name") as string,
      type: formData.get("type") as any,
      email: (formData.get("email") as string) || null,
      phone: (formData.get("phone") as string) || null,
      defaultCostRate: parseFloat(formData.get("defaultCostRate") as string) || 0,
      defaultBillRate: parseFloat(formData.get("defaultBillRate") as string) || 0,
      portfolioUrl: (formData.get("portfolioUrl") as string) || null,
      emergencyContactName: (formData.get("emergencyContactName") as string) || null,
      emergencyContactPhone: (formData.get("emergencyContactPhone") as string) || null,
    },
  })

  revalidatePath(`/people/${id}`)
  revalidatePath("/people")
}

export async function checkStripeConfigured(): Promise<boolean> {
  return isStripeConfigured()
}

export async function setupStripeRecipient(personId: string): Promise<{ success: boolean; error?: string; onboardingUrl?: string }> {
  const user = await requireAuthWithOrg()

  if (!isStripeConfigured()) {
    return { success: false, error: "Stripe is not configured. Please add your Stripe API key in Settings." }
  }

  const person = await prisma.person.findFirst({
    where: { id: personId, organizationId: user.organizationId },
  })

  if (!person) {
    return { success: false, error: "Person not found" }
  }

  if (!person.email) {
    return { success: false, error: "Email address is required for payout setup" }
  }

  try {
    let stripeAccountId = person.stripeAccountId

    if (!stripeAccountId) {
      const nameParts = person.name.split(" ")
      const firstName = person.firstName || nameParts[0] || ""
      const lastName = person.lastName || nameParts.slice(1).join(" ") || ""

      stripeAccountId = await createStripeRecipient({
        email: person.email,
        displayName: person.name,
        firstName,
        lastName,
        entityType: "individual",
      })

      await prisma.person.update({
        where: { id: personId },
        data: {
          stripeAccountId,
          stripePayoutStatus: "PENDING",
        },
      })
    }

    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : process.env.REPLIT_DEPLOYMENT_URL || "http://localhost:5000"

    const onboardingUrl = await createOnboardingLink({
      accountId: stripeAccountId,
      returnUrl: `${baseUrl}/people/${personId}?stripe=success`,
      refreshUrl: `${baseUrl}/people/${personId}?stripe=refresh`,
    })

    revalidatePath(`/people/${personId}`)
    return { success: true, onboardingUrl }
  } catch (error) {
    console.error("Stripe setup error:", error)
    return { success: false, error: error instanceof Error ? error.message : "Failed to setup payout recipient" }
  }
}

export async function refreshStripeStatus(personId: string): Promise<{ success: boolean; status?: StripePayoutStatus; error?: string }> {
  const user = await requireAuthWithOrg()

  const person = await prisma.person.findFirst({
    where: { id: personId, organizationId: user.organizationId },
  })

  if (!person || !person.stripeAccountId) {
    return { success: false, error: "No Stripe account linked" }
  }

  try {
    const status = await refreshAccountStatus(person.stripeAccountId)

    await prisma.person.update({
      where: { id: personId },
      data: { stripePayoutStatus: status },
    })

    revalidatePath(`/people/${personId}`)
    return { success: true, status }
  } catch (error) {
    console.error("Stripe refresh error:", error)
    return { success: false, error: error instanceof Error ? error.message : "Failed to refresh status" }
  }
}

export async function getContractsForPerson(personId: string) {
  const user = await requireAuthWithOrg()

  const person = await prisma.person.findFirst({
    where: { id: personId, organizationId: user.organizationId },
  })

  if (!person) {
    throw new Error("Person not found")
  }

  const contracts = await prisma.contract.findMany({
    where: { personId },
    include: {
      project: true,
      vendor: true,
    },
    orderBy: { createdAt: "desc" },
  })

  return contracts
}

function generateBankingToken(): string {
  return randomBytes(32).toString("hex")
}

function getBaseUrl(): string {
  // Custom domain takes priority for production
  if (process.env.APP_URL) {
    return process.env.APP_URL
  }
  // Development domain
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`
  }
  // Replit deployment URL (fallback)
  return process.env.REPLIT_DEPLOYMENT_URL || "http://localhost:5000"
}

export interface BankingLinkInfo {
  id: string
  accessToken: string
  linkUrl: string
  expiresAt: Date
  lastAccess: Date | null
  submittedAt: Date | null
  bankName: string | null
  accountHolderName: string | null
  routingNumberLast4: string | null
  accountNumberLast4: string | null
  accountType: string | null
}

export async function getBankingLinkInfo(personId: string): Promise<BankingLinkInfo | null> {
  const user = await requireAuthWithOrg()

  const person = await prisma.person.findFirst({
    where: { id: personId, organizationId: user.organizationId },
  })

  if (!person) {
    throw new Error("Person not found")
  }

  const info = await prisma.personBankingInfo.findUnique({
    where: { personId },
  })

  if (!info) {
    return null
  }

  return {
    id: info.id,
    accessToken: info.accessToken,
    linkUrl: `${getBaseUrl()}/banking/${info.accessToken}`,
    expiresAt: info.expiresAt,
    lastAccess: info.lastAccess,
    submittedAt: info.submittedAt,
    bankName: info.bankName,
    accountHolderName: info.accountHolderName,
    routingNumberLast4: getLastFourDigits(info.routingNumber),
    accountNumberLast4: getLastFourDigits(info.accountNumber),
    accountType: info.accountType,
  }
}

export async function generateBankingLink(personId: string, expiresInDays: number = 7): Promise<{ url: string }> {
  const user = await requireAuthWithOrg()

  const person = await prisma.person.findFirst({
    where: { id: personId, organizationId: user.organizationId },
  })

  if (!person) {
    throw new Error("Person not found")
  }

  const accessToken = generateBankingToken()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + expiresInDays)

  await prisma.personBankingInfo.upsert({
    where: { personId },
    update: {
      accessToken,
      expiresAt,
      lastAccess: null,
      // Note: Do NOT clear submittedAt or banking details here
      // This allows regenerating a link without losing previously submitted info
    },
    create: {
      personId,
      accessToken,
      expiresAt,
    },
  })

  revalidatePath(`/people/${personId}`)
  return { url: `${getBaseUrl()}/banking/${accessToken}` }
}

export async function revokeBankingLink(personId: string): Promise<void> {
  const user = await requireAuthWithOrg()

  const person = await prisma.person.findFirst({
    where: { id: personId, organizationId: user.organizationId },
  })

  if (!person) {
    throw new Error("Person not found")
  }

  await prisma.personBankingInfo.deleteMany({
    where: { personId },
  })

  revalidatePath(`/people/${personId}`)
}

export async function isSuperAdmin(): Promise<boolean> {
  const user = await requireAuthWithOrg()
  return user.email === SUPER_ADMIN_EMAIL
}

export interface FullBankingInfo {
  bankName: string | null
  accountHolderName: string | null
  routingNumber: string | null
  accountNumber: string | null
  accountType: string | null
  submittedAt: Date | null
}

export async function getFullBankingDetails(personId: string): Promise<FullBankingInfo | null> {
  const user = await requireAuthWithOrg()
  
  // Restrict to super admin only
  if (user.email !== SUPER_ADMIN_EMAIL) {
    throw new Error("Unauthorized: This action is restricted to the super administrator")
  }

  const person = await prisma.person.findFirst({
    where: { id: personId, organizationId: user.organizationId },
  })

  if (!person) {
    throw new Error("Person not found")
  }

  const info = await prisma.personBankingInfo.findUnique({
    where: { personId },
  })

  if (!info || !info.submittedAt) {
    return null
  }

  return {
    bankName: info.bankName,
    accountHolderName: info.accountHolderName,
    routingNumber: info.routingNumber ? decrypt(info.routingNumber) : null,
    accountNumber: info.accountNumber ? decrypt(info.accountNumber) : null,
    accountType: info.accountType,
    submittedAt: info.submittedAt,
  }
}
