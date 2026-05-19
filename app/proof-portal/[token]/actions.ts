"use server"

import { prisma } from "@/lib/prisma"
import { getSignedReadUrl } from "@/lib/object-storage"

export interface ProofPortalAccessData {
  valid: boolean
  expired?: boolean
  proofId?: string
  proofTitle?: string
  clientName?: string
  clientEmail?: string
  projectName?: string
}

export async function validateProofPortalAccess(token: string): Promise<ProofPortalAccessData> {
  const access = await prisma.proofPortalAccess.findUnique({
    where: { accessToken: token },
    include: {
      proofRequest: {
        include: {
          project: { select: { name: true } },
        },
      },
    },
  })

  if (!access) {
    return { valid: false }
  }

  const now = new Date()
  if (access.expiresAt < now) {
    return { valid: false, expired: true }
  }

  await prisma.proofPortalAccess.update({
    where: { id: access.id },
    data: { lastAccess: now },
  })

  return {
    valid: true,
    proofId: access.proofRequest.id,
    proofTitle: access.proofRequest.title,
    clientName: access.proofRequest.clientName ?? undefined,
    clientEmail: access.proofRequest.clientEmail ?? undefined,
    projectName: access.proofRequest.project?.name || undefined,
  }
}

export interface ProofPortalData {
  id: string
  title: string
  description: string | null
  clientName: string | null
  printVendor: string | null
  area: string | null
  category: string | null
  dimensions: string | null
  material: string | null
  quantity: number | null
  dueDate: string | null
  priority: string
  status: string
  currentAsset: {
    id: string
    version: number
    fileName: string
    signedUrl: string | null
    googleDriveUrl: string | null
    mimeType: string | null
    uploadedByName: string
    notes: string | null
    createdAt: string
  } | null
  projectName: string | null
}

export async function getProofForClient(token: string): Promise<ProofPortalData | null> {
  const access = await prisma.proofPortalAccess.findUnique({
    where: { accessToken: token },
    include: {
      proofRequest: {
        include: {
          project: { select: { name: true } },
          assets: {
            where: { isCurrentVersion: true },
            take: 1,
          },
        },
      },
    },
  })

  if (!access || access.expiresAt < new Date()) {
    return null
  }

  const proof = access.proofRequest
  let currentAsset = null

  if (proof.assets[0]) {
    const asset = proof.assets[0]
    let signedUrl: string | null = null
    if (asset.objectPath) {
      try {
        signedUrl = await getSignedReadUrl(asset.objectPath)
      } catch {}
    }
    if (signedUrl || asset.googleDriveUrl) {
      currentAsset = {
        id: asset.id,
        version: asset.version,
        fileName: asset.fileName,
        signedUrl,
        googleDriveUrl: asset.googleDriveUrl || null,
        mimeType: asset.mimeType,
        uploadedByName: asset.uploadedByName,
        notes: asset.notes,
        createdAt: asset.createdAt.toISOString(),
      }
    }
  }

  return {
    id: proof.id,
    title: proof.title,
    description: proof.description,
    clientName: proof.clientName,
    printVendor: proof.printVendor,
    area: proof.area,
    category: proof.category,
    dimensions: proof.dimensions,
    material: proof.material,
    quantity: proof.quantity,
    dueDate: proof.dueDate?.toISOString() || null,
    priority: proof.priority,
    status: proof.status,
    currentAsset,
    projectName: proof.project?.name || null,
  }
}

export interface ProofVersionData {
  id: string
  version: number
  fileName: string
  signedUrl: string | null
  googleDriveUrl: string | null
  mimeType: string | null
  uploadedByName: string
  uploadedByRole: string
  notes: string | null
  createdAt: string
}

export async function getProofVersionsForClient(token: string): Promise<ProofVersionData[]> {
  const access = await prisma.proofPortalAccess.findUnique({
    where: { accessToken: token },
    include: {
      proofRequest: {
        include: {
          assets: { orderBy: { version: "desc" } },
        },
      },
    },
  })

  if (!access || access.expiresAt < new Date()) {
    return []
  }

  const versions: ProofVersionData[] = []
  for (const asset of access.proofRequest.assets) {
    let signedUrl: string | null = null
    if (asset.objectPath) {
      try {
        signedUrl = await getSignedReadUrl(asset.objectPath)
      } catch {}
    }
    if (signedUrl || asset.googleDriveUrl) {
      versions.push({
        id: asset.id,
        version: asset.version,
        fileName: asset.fileName,
        signedUrl,
        googleDriveUrl: asset.googleDriveUrl || null,
        mimeType: asset.mimeType,
        uploadedByName: asset.uploadedByName,
        uploadedByRole: asset.uploadedByRole,
        notes: asset.notes,
        createdAt: asset.createdAt.toISOString(),
      })
    }
  }

  return versions
}

export interface ProofCommentData {
  id: string
  authorName: string
  authorRole: string
  content: string
  createdAt: string
}

export async function getProofCommentsForClient(token: string): Promise<ProofCommentData[]> {
  const access = await prisma.proofPortalAccess.findUnique({
    where: { accessToken: token },
    include: {
      proofRequest: {
        include: {
          comments: {
            where: { isInternal: false },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  })

  if (!access || access.expiresAt < new Date()) {
    return []
  }

  return access.proofRequest.comments.map((c) => ({
    id: c.id,
    authorName: c.authorName,
    authorRole: c.authorRole,
    content: c.content,
    createdAt: c.createdAt.toISOString(),
  }))
}

export async function addClientComment(
  token: string,
  content: string
): Promise<{ success: boolean; error?: string }> {
  const access = await prisma.proofPortalAccess.findUnique({
    where: { accessToken: token },
    include: {
      proofRequest: { select: { id: true, clientName: true } },
    },
  })

  if (!access || access.expiresAt < new Date()) {
    return { success: false, error: "Invalid or expired access" }
  }

  try {
    await prisma.proofComment.create({
      data: {
        proofRequestId: access.proofRequest.id,
        authorName: access.proofRequest.clientName || "Client",
        authorRole: "VendorReviewer",
        content,
        isInternal: false,
      },
    })

    return { success: true }
  } catch (error) {
    console.error("Error adding client comment:", error)
    return { success: false, error: "Failed to add comment" }
  }
}

export async function submitProofDecision(
  token: string,
  decision: "APPROVED" | "REVISIONS_NEEDED",
  comment?: string
): Promise<{ success: boolean; error?: string }> {
  const access = await prisma.proofPortalAccess.findUnique({
    where: { accessToken: token },
    include: {
      proofRequest: { select: { id: true, clientName: true, status: true } },
    },
  })

  if (!access || access.expiresAt < new Date()) {
    return { success: false, error: "Invalid or expired access" }
  }

  if (access.proofRequest.status !== "CLIENT_REVIEW") {
    return { success: false, error: "This proof is not currently awaiting your review" }
  }

  if (decision !== "APPROVED" && !comment?.trim()) {
    return { success: false, error: "A comment is required when requesting revisions" }
  }

  try {
    const updateData: any = {
      status: decision,
    }

    if (decision === "APPROVED") {
      updateData.approvedAt = new Date()
      updateData.approvedByName = access.proofRequest.clientName || "Client"
    }

    await prisma.$transaction([
      prisma.proofRequest.update({
        where: { id: access.proofRequest.id },
        data: updateData,
      }),
      ...(comment?.trim()
        ? [
            prisma.proofComment.create({
              data: {
                proofRequestId: access.proofRequest.id,
                authorName: access.proofRequest.clientName || "Client",
                authorRole: "VendorReviewer",
                content: comment.trim(),
                isInternal: false,
              },
            }),
          ]
        : []),
    ])

    return { success: true }
  } catch (error) {
    console.error("Error submitting proof decision:", error)
    return { success: false, error: "Failed to submit decision" }
  }
}
