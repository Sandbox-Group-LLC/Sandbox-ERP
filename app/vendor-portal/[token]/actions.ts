"use server"

import { prisma } from "@/lib/prisma"
import { getSignedReadUrl } from "@/lib/object-storage"

export type VendorPortalAccessData = {
  valid: boolean
  expired?: boolean
  vendorName?: string
  vendorEmail?: string
  proofId?: string
  organizationId?: string
}

export type VendorProofData = {
  id: string
  title: string
  description: string | null
  printVendor: string | null
  area: string | null
  category: string | null
  dimensions: string | null
  material: string | null
  quantity: number | null
  dueDate: string | null
  priority: string
  status: string
  productionArtworkUrl: string | null
  approvedAt: string | null
  approvedByName: string | null
  projectName: string | null
  currentAsset: {
    id: string
    version: number
    fileName: string
    signedUrl: string | null
    googleDriveUrl: string | null
    mimeType: string | null
    uploadedByName: string
    createdAt: string
    notes: string | null
  } | null
}

export async function validateVendorPortalAccess(token: string): Promise<VendorPortalAccessData> {
  const access = await prisma.vendorPortalAccess.findUnique({
    where: { accessToken: token },
    include: {
      proofRequest: {
        select: {
          id: true,
          organizationId: true,
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

  await prisma.vendorPortalAccess.update({
    where: { id: access.id },
    data: { lastAccess: now },
  })

  return {
    valid: true,
    vendorName: access.vendorName,
    vendorEmail: access.vendorEmail,
    proofId: access.proofRequest.id,
    organizationId: access.proofRequest.organizationId,
  }
}

export async function getVendorProofs(token: string): Promise<VendorProofData[]> {
  const access = await prisma.vendorPortalAccess.findUnique({
    where: { accessToken: token },
    include: {
      proofRequest: {
        select: {
          organizationId: true,
        },
      },
    },
  })

  if (!access || access.expiresAt < new Date()) {
    return []
  }

  const organizationId = access.proofRequest.organizationId
  const vendorName = access.vendorName

  const proofs = await prisma.proofRequest.findMany({
    where: {
      organizationId,
      status: { in: ["APPROVED", "PRODUCTION", "PREFLIGHT_REVIEW", "PREFLIGHT_REVISIONS", "PREFLIGHT_APPROVED", "PRINTED"] },
      OR: [
        { printVendor: { equals: vendorName, mode: "insensitive" } },
        { id: access.proofRequestId },
      ],
    },
    include: {
      project: { select: { name: true } },
      assets: {
        where: { isCurrentVersion: true },
        take: 1,
      },
    },
    orderBy: { approvedAt: "desc" },
  })

  const results: VendorProofData[] = []
  for (const proof of proofs) {
    let currentAsset = null
    if (proof.assets[0]) {
      const asset = proof.assets[0]
      let signedUrl: string | null = null
      if (asset.objectPath) {
        try {
          signedUrl = await getSignedReadUrl(asset.objectPath)
        } catch {}
      }
      currentAsset = {
        id: asset.id,
        version: asset.version,
        fileName: asset.fileName,
        signedUrl,
        googleDriveUrl: asset.googleDriveUrl || null,
        mimeType: asset.mimeType,
        uploadedByName: asset.uploadedByName,
        createdAt: asset.createdAt.toISOString(),
        notes: asset.notes,
      }
    }

    results.push({
      id: proof.id,
      title: proof.title,
      description: proof.description,
      printVendor: proof.printVendor,
      area: proof.area,
      category: proof.category,
      dimensions: proof.dimensions,
      material: proof.material,
      quantity: proof.quantity,
      dueDate: proof.dueDate?.toISOString() || null,
      priority: proof.priority,
      status: proof.status,
      productionArtworkUrl: proof.productionArtworkUrl,
      approvedAt: proof.approvedAt?.toISOString() || null,
      approvedByName: proof.approvedByName,
      projectName: proof.project?.name || null,
      currentAsset,
    })
  }

  return results
}

export async function vendorUploadPreflightProof(
  token: string,
  proofId: string,
  data: {
    objectPath?: string
    googleDriveUrl?: string
    fileName: string
    fileSize?: number
    mimeType?: string
    notes?: string
  }
): Promise<{ success: boolean; error?: string }> {
  const access = await prisma.vendorPortalAccess.findUnique({
    where: { accessToken: token },
    include: {
      proofRequest: {
        select: { organizationId: true },
      },
    },
  })

  if (!access || access.expiresAt < new Date()) {
    return { success: false, error: "Invalid or expired token" }
  }

  const proof = await prisma.proofRequest.findFirst({
    where: {
      id: proofId,
      organizationId: access.proofRequest.organizationId,
    },
    include: {
      assets: { orderBy: { version: "desc" }, take: 1 },
    },
  })

  if (!proof) {
    return { success: false, error: "Proof not found" }
  }

  // Verify vendor authorization
  const isOwnProof = proofId === access.proofRequestId
  const isVendorProof = proof.printVendor?.toLowerCase() === access.vendorName.toLowerCase()

  if (!isOwnProof && !isVendorProof) {
    return { success: false, error: "Unauthorized access to this proof" }
  }

  if (proof.status !== "PRODUCTION" && proof.status !== "PREFLIGHT_REVISIONS") {
    return { success: false, error: "Pre-flight upload is only allowed when proof is in Production or Pre-Flight Revisions status" }
  }

  if (!data.objectPath && !data.googleDriveUrl) {
    return { success: false, error: "Either a file or Google Drive link is required" }
  }

  const nextVersion = (proof.assets[0]?.version || 0) + 1

  try {
    await prisma.$transaction([
      prisma.proofAsset.updateMany({
        where: { proofRequestId: proofId },
        data: { isCurrentVersion: false },
      }),
      prisma.proofAsset.create({
        data: {
          proofRequestId: proofId,
          version: nextVersion,
          fileName: data.fileName,
          objectPath: data.objectPath || null,
          googleDriveUrl: data.googleDriveUrl || null,
          fileSize: data.fileSize || null,
          mimeType: data.mimeType || null,
          uploadedByName: access.vendorName,
          uploadedByRole: "Vendor",
          notes: data.notes || null,
          isCurrentVersion: true,
        },
      }),
      prisma.proofRequest.update({
        where: { id: proofId },
        data: { status: "PREFLIGHT_REVIEW" },
      }),
    ])

    return { success: true }
  } catch (error) {
    console.error("Error uploading pre-flight proof:", error)
    return { success: false, error: "Failed to upload pre-flight proof" }
  }
}

export async function vendorMarkPrinted(
  token: string,
  proofId: string
): Promise<{ success: boolean; error?: string }> {
  const access = await prisma.vendorPortalAccess.findUnique({
    where: { accessToken: token },
    include: {
      proofRequest: {
        select: { organizationId: true },
      },
    },
  })

  if (!access || access.expiresAt < new Date()) {
    return { success: false, error: "Invalid or expired token" }
  }

  const proof = await prisma.proofRequest.findFirst({
    where: {
      id: proofId,
      organizationId: access.proofRequest.organizationId,
    },
  })

  if (!proof) {
    return { success: false, error: "Proof not found" }
  }

  // Verify vendor authorization
  const isOwnProof = proofId === access.proofRequestId
  const isVendorProof = proof.printVendor?.toLowerCase() === access.vendorName.toLowerCase()

  if (!isOwnProof && !isVendorProof) {
    return { success: false, error: "Unauthorized access to this proof" }
  }

  if (proof.status !== "PREFLIGHT_APPROVED") {
    return { success: false, error: "Proof must be in Pre-Flight Approved status to mark as printed" }
  }

  try {
    await prisma.proofRequest.update({
      where: { id: proofId },
      data: { status: "PRINTED" },
    })

    return { success: true }
  } catch (error) {
    console.error("Error marking proof as printed:", error)
    return { success: false, error: "Failed to mark as printed" }
  }
}

export async function getVendorProofComments(
  token: string,
  proofId: string
): Promise<Array<{ id: string; authorName: string; content: string; createdAt: string }>> {
  const access = await prisma.vendorPortalAccess.findUnique({
    where: { accessToken: token },
    include: {
      proofRequest: {
        select: { organizationId: true },
      },
    },
  })

  if (!access || access.expiresAt < new Date()) {
    return []
  }

  const proof = await prisma.proofRequest.findFirst({
    where: {
      id: proofId,
      organizationId: access.proofRequest.organizationId,
    },
    select: { id: true, printVendor: true },
  })

  if (!proof) {
    return []
  }

  // Verify vendor authorization
  const isOwnProof = proofId === access.proofRequestId
  const isVendorProof = proof.printVendor?.toLowerCase() === access.vendorName.toLowerCase()

  if (!isOwnProof && !isVendorProof) {
    return []
  }

  const comments = await prisma.proofComment.findMany({
    where: {
      proofRequestId: proofId,
      isInternal: false,
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  })

  return comments.map((c) => ({
    id: c.id,
    authorName: c.authorName,
    content: c.content,
    createdAt: c.createdAt.toISOString(),
  }))
}
