"use server"

import { prisma } from "@/lib/prisma"
import { requireAuthWithOrg } from "@/lib/session"
import { getSignedReadUrl } from "@/lib/object-storage"

export interface ClientProofData {
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
  approvedAt: string | null
  approvedByName: string | null
  createdAt: string
}

export interface ClientProofVersionData {
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

export interface ClientProofCommentData {
  id: string
  authorName: string
  authorRole: string
  content: string
  createdAt: string
}

export async function listClientProofs(projectId: string): Promise<ClientProofData[]> {
  try {
    const user = await requireAuthWithOrg()
    if (user.approvalStatus !== "APPROVED" || user.role !== "CLIENT") {
      return []
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, organizationId: user.organizationId },
      select: { id: true },
    })
    if (!project) return []

    const proofs = await prisma.proofRequest.findMany({
      where: { projectId, organizationId: user.organizationId, status: { in: ["CLIENT_REVIEW", "APPROVED"] } },
      include: {
        assets: {
          where: { isCurrentVersion: true },
          take: 1,
          orderBy: { version: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    const results: ClientProofData[] = []
    for (const proof of proofs) {
      let currentAsset = null
      if (proof.assets[0]) {
        const asset = proof.assets[0]
        try {
          const signedUrl = asset.objectPath ? await getSignedReadUrl(asset.objectPath) : null
          currentAsset = {
            id: asset.id,
            version: asset.version,
            fileName: asset.fileName,
            signedUrl,
            googleDriveUrl: (asset as any).googleDriveUrl ?? null,
            mimeType: asset.mimeType,
            uploadedByName: asset.uploadedByName,
            notes: asset.notes,
            createdAt: asset.createdAt.toISOString(),
          }
        } catch {
          currentAsset = null
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
        currentAsset,
        approvedAt: proof.approvedAt?.toISOString() || null,
        approvedByName: proof.approvedByName,
        createdAt: proof.createdAt.toISOString(),
      })
    }

    return results
  } catch {
    return []
  }
}

export async function getClientProofDetail(proofId: string): Promise<{
  proof: ClientProofData | null
  versions: ClientProofVersionData[]
  comments: ClientProofCommentData[]
}> {
  const user = await requireAuthWithOrg()
  if (user.approvalStatus !== "APPROVED" || user.role !== "CLIENT") {
    return { proof: null, versions: [], comments: [] }
  }

  const proof = await prisma.proofRequest.findFirst({
    where: { id: proofId, organizationId: user.organizationId },
    include: {
      assets: { orderBy: { version: "desc" } },
      comments: { 
        where: { isInternal: false },
        orderBy: { createdAt: "asc" } 
      },
    },
  })

  if (!proof) {
    return { proof: null, versions: [], comments: [] }
  }

  const currentAsset = proof.assets.find((a) => a.isCurrentVersion) || proof.assets[0]
  let currentAssetData = null
  if (currentAsset) {
    try {
      const signedUrl = currentAsset.objectPath ? await getSignedReadUrl(currentAsset.objectPath) : null
      currentAssetData = {
        id: currentAsset.id,
        version: currentAsset.version,
        fileName: currentAsset.fileName,
        signedUrl,
        googleDriveUrl: (currentAsset as any).googleDriveUrl ?? null,
        mimeType: currentAsset.mimeType,
        uploadedByName: currentAsset.uploadedByName,
        notes: currentAsset.notes,
        createdAt: currentAsset.createdAt.toISOString(),
      }
    } catch {}
  }

  const versions: ClientProofVersionData[] = []
  for (const asset of proof.assets) {
    try {
      const signedUrl = asset.objectPath ? await getSignedReadUrl(asset.objectPath) : null
      versions.push({
        id: asset.id,
        version: asset.version,
        fileName: asset.fileName,
        signedUrl,
        googleDriveUrl: (asset as any).googleDriveUrl ?? null,
        mimeType: asset.mimeType,
        uploadedByName: asset.uploadedByName,
        uploadedByRole: asset.uploadedByRole,
        notes: asset.notes,
        createdAt: asset.createdAt.toISOString(),
      })
    } catch {}
  }

  const comments = proof.comments.map((c) => ({
    id: c.id,
    authorName: c.authorName,
    authorRole: c.authorRole,
    content: c.content,
    createdAt: c.createdAt.toISOString(),
  }))

  return {
    proof: {
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
      currentAsset: currentAssetData,
      approvedAt: proof.approvedAt?.toISOString() || null,
      approvedByName: proof.approvedByName,
      createdAt: proof.createdAt.toISOString(),
    },
    versions,
    comments,
  }
}

export async function addClientProofComment(
  proofId: string,
  content: string
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAuthWithOrg()
  if (user.approvalStatus !== "APPROVED" || user.role !== "CLIENT") {
    return { success: false, error: "Unauthorized" }
  }

  const proof = await prisma.proofRequest.findFirst({
    where: { id: proofId, organizationId: user.organizationId },
    select: { id: true },
  })

  if (!proof) {
    return { success: false, error: "Proof not found" }
  }

  try {
    await prisma.proofComment.create({
      data: {
        proofRequestId: proofId,
        authorId: user.id,
        authorName: user.name || user.email || "Client",
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

export async function submitClientProofDecision(
  proofId: string,
  decision: "APPROVED" | "REVISIONS_NEEDED",
  comment?: string
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAuthWithOrg()
  if (user.approvalStatus !== "APPROVED" || user.role !== "CLIENT") {
    return { success: false, error: "Unauthorized" }
  }

  const proof = await prisma.proofRequest.findFirst({
    where: { id: proofId, organizationId: user.organizationId },
    select: { id: true, status: true },
  })

  if (!proof) {
    return { success: false, error: "Proof not found" }
  }

  if (proof.status !== "CLIENT_REVIEW") {
    return { success: false, error: "Proof is not in client review status" }
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
      updateData.approvedByName = user.name || user.email || "Client"
    }

    await prisma.$transaction([
      prisma.proofRequest.update({
        where: { id: proofId },
        data: updateData,
      }),
      ...(comment?.trim()
        ? [
            prisma.proofComment.create({
              data: {
                proofRequestId: proofId,
                authorId: user.id,
                authorName: user.name || user.email || "Client",
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
