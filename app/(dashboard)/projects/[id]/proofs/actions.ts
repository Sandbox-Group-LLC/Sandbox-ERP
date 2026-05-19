"use server"

import { prisma } from "@/lib/prisma"
import { requireAuthWithOrg } from "@/lib/session"
import { getSignedReadUrl } from "@/lib/object-storage"
import { getResendClient, getPortalBaseUrl } from "@/lib/resend"
import { randomBytes } from "crypto"

export interface ProofRequestData {
  id: string
  title: string
  description: string | null
  clientEmail: string | null
  clientName: string | null
  designerName: string | null
  designerEmail: string | null
  printVendor: string | null
  area: string | null
  category: string | null
  dimensions: string | null
  material: string | null
  quantity: number | null
  dueDate: string | null
  feedbackDueDate: string | null
  priority: string
  status: string
  createdBy: { name: string | null; email: string | null }
  currentAsset: {
    id: string
    version: number
    fileName: string
    signedUrl: string | null
    googleDriveUrl: string | null
    mimeType: string | null
    uploadedByName: string
    createdAt: string
  } | null
  approvedAt: string | null
  approvedByName: string | null
  productionArtworkUrl: string | null
  createdAt: string
  hasPortalAccess: boolean
}

export async function listProofRequests(projectId: string): Promise<ProofRequestData[]> {
  try {
    const user = await requireAuthWithOrg()
    if (user.approvalStatus !== "APPROVED") {
      return []
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, organizationId: user.organizationId },
      select: { id: true },
    })
    if (!project) return []

    const proofs = await prisma.proofRequest.findMany({
      where: { projectId, organizationId: user.organizationId },
      include: {
        createdBy: { select: { name: true, email: true } },
        assets: {
          where: { isCurrentVersion: true },
          take: 1,
          orderBy: { version: "desc" },
        },
        portalAccess: { select: { id: true }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    })

    const results: ProofRequestData[] = []
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
          googleDriveUrl: asset.googleDriveUrl,
          mimeType: asset.mimeType,
          uploadedByName: asset.uploadedByName,
          createdAt: asset.createdAt.toISOString(),
        }
      }

      results.push({
        id: proof.id,
        title: proof.title,
        description: proof.description,
        clientEmail: proof.clientEmail,
        clientName: proof.clientName,
        designerName: proof.designerName,
        designerEmail: proof.designerEmail,
        printVendor: proof.printVendor,
        area: proof.area,
        category: proof.category,
        dimensions: proof.dimensions,
        material: proof.material,
        quantity: proof.quantity,
        dueDate: proof.dueDate?.toISOString() || null,
        feedbackDueDate: proof.feedbackDueDate?.toISOString() ?? null,
        priority: proof.priority,
        status: proof.status,
        createdBy: proof.createdBy,
        currentAsset,
        approvedAt: proof.approvedAt?.toISOString() || null,
        approvedByName: proof.approvedByName,
        productionArtworkUrl: proof.productionArtworkUrl,
        createdAt: proof.createdAt.toISOString(),
        hasPortalAccess: proof.portalAccess.length > 0,
      })
    }

    return results
  } catch {
    return []
  }
}

export async function createProofRequest(
  projectId: string,
  data: {
    title: string
    description?: string
    clientEmail?: string
    clientName?: string
    designerName?: string
    designerEmail?: string
    printVendor?: string
    area?: string
    category?: string
    dimensions?: string
    material?: string
    quantity?: number
    dueDate?: string
    priority?: string
    productionArtworkUrl?: string
  }
): Promise<{ success: boolean; proofId?: string; error?: string }> {
  try {
    const user = await requireAuthWithOrg()
    if (user.approvalStatus !== "APPROVED") {
      return { success: false, error: "Unauthorized" }
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, organizationId: user.organizationId },
      select: { id: true, name: true },
    })
    if (!project) {
      return { success: false, error: "Project not found" }
    }

    const proof = await prisma.proofRequest.create({
      data: {
        organizationId: user.organizationId,
        projectId,
        title: data.title,
        description: data.description || null,
        clientEmail: data.clientEmail || null,
        clientName: data.clientName || null,
        designerName: data.designerName || null,
        designerEmail: data.designerEmail || null,
        printVendor: data.printVendor || null,
        area: data.area || null,
        category: data.category || null,
        dimensions: data.dimensions || null,
        material: data.material || null,
        quantity: data.quantity || null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        priority: (data.priority as any) || "NORMAL",
        productionArtworkUrl: data.productionArtworkUrl || null,
        status: "REQUESTED",
        createdById: user.id,
      },
    })

    if (data.designerEmail) {
      await sendDesignerNotification({
        designerEmail: data.designerEmail,
        designerName: data.designerName || "Designer",
        proofTitle: data.title,
        projectName: project.name,
        requestedBy: user.name || user.email || "A team member",
        projectId,
        proofId: proof.id,
        description: data.description,
      })
    }

    return { success: true, proofId: proof.id }
  } catch (error) {
    console.error("Error creating proof request:", error)
    return { success: false, error: "Failed to create proof request" }
  }
}

export async function editProofRequest(
  proofId: string,
  data: {
    title?: string
    description?: string
    designerName?: string
    designerEmail?: string
    clientName?: string
    clientEmail?: string
    printVendor?: string
    area?: string
    category?: string
    dimensions?: string
    material?: string
    quantity?: number | null
    dueDate?: string | null
    priority?: string
    productionArtworkUrl?: string | null
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuthWithOrg()
    if (user.approvalStatus !== "APPROVED") {
      return { success: false, error: "Unauthorized" }
    }

    const proof = await prisma.proofRequest.findFirst({
      where: { id: proofId, organizationId: user.organizationId },
    })

    if (!proof) {
      return { success: false, error: "Proof not found" }
    }

    if (["APPROVED", "PRODUCTION", "PREFLIGHT_REVIEW", "PREFLIGHT_REVISIONS", "PREFLIGHT_APPROVED", "PRINTED"].includes(proof.status)) {
      return { success: false, error: "Cannot edit a proof that is approved or in production" }
    }

    const updateData: any = {}

    if (data.title !== undefined) updateData.title = data.title || null
    if (data.description !== undefined) updateData.description = data.description || null
    if (data.designerName !== undefined) updateData.designerName = data.designerName || null
    if (data.designerEmail !== undefined) updateData.designerEmail = data.designerEmail || null
    if (data.clientName !== undefined) updateData.clientName = data.clientName || null
    if (data.clientEmail !== undefined) updateData.clientEmail = data.clientEmail || null
    if (data.printVendor !== undefined) updateData.printVendor = data.printVendor || null
    if (data.area !== undefined) updateData.area = data.area || null
    if (data.category !== undefined) updateData.category = data.category || null
    if (data.dimensions !== undefined) updateData.dimensions = data.dimensions || null
    if (data.material !== undefined) updateData.material = data.material || null
    if (data.quantity !== undefined) {
      updateData.quantity = data.quantity === null ? null : data.quantity
    }
    if (data.dueDate !== undefined) {
      updateData.dueDate = data.dueDate === null ? null : new Date(data.dueDate)
    }
    if (data.priority !== undefined) updateData.priority = data.priority || null
    if (data.productionArtworkUrl !== undefined) updateData.productionArtworkUrl = data.productionArtworkUrl || null

    await prisma.proofRequest.update({
      where: { id: proofId },
      data: updateData,
    })

    return { success: true }
  } catch (error) {
    console.error("Error editing proof request:", error)
    return { success: false, error: "Failed to update proof request" }
  }
}

async function sendDesignerNotification(params: {
  designerEmail: string
  designerName: string
  proofTitle: string
  projectName: string
  requestedBy: string
  projectId: string
  proofId?: string
  description?: string
}) {
  try {
    const resend = await getResendClient()
    if (!resend) {
      console.log("Resend not configured - skipping designer notification")
      return
    }

    const baseUrl = getPortalBaseUrl()
    const proofParam = params.proofId ? `?proofId=${params.proofId}` : ""
    const projectUrl = `${baseUrl}/projects/${params.projectId}${proofParam}#proofs`

    await resend.client.emails.send({
      from: resend.fromEmail,
      to: params.designerEmail,
      subject: `Layout Request: ${params.proofTitle}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>New Layout Request</h2>
          <p>Hi ${params.designerName},</p>
          <p>${params.requestedBy} has requested a layout for the following:</p>
          <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 0;"><strong>${params.proofTitle}</strong></p>
            <p style="margin: 8px 0 0; color: #666;">Project: ${params.projectName}</p>
            ${params.description ? `<p style="margin: 8px 0 0; color: #666;">${params.description}</p>` : ""}
          </div>
          <p>Please log into the ERP to view the full details and begin working on this request.</p>
          <p>
            <a href="${projectUrl}" style="display: inline-block; background: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
              View Request
            </a>
          </p>
        </div>
      `,
    })
  } catch (error) {
    console.error("Error sending designer notification:", error)
  }
}

export async function updateProofStatus(
  proofId: string,
  newStatus: string,
  data?: {
    clientName?: string
    clientEmail?: string
    comment?: string
    feedbackDueDate?: string
    adminApproveOnBehalf?: boolean
  }
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAuthWithOrg()
  if (user.approvalStatus !== "APPROVED") {
    return { success: false, error: "Unauthorized" }
  }

  const proof = await prisma.proofRequest.findFirst({
    where: { id: proofId, organizationId: user.organizationId },
    include: {
      createdBy: { select: { name: true, email: true } },
      project: { select: { name: true, id: true } },
      assets: { where: { isCurrentVersion: true }, take: 1 },
    },
  })

  if (!proof) {
    return { success: false, error: "Proof not found" }
  }

  const validTransitions: Record<string, string[]> = {
    REQUESTED: ["IN_PROGRESS"],
    IN_PROGRESS: ["INTERNAL_REVIEW"],
    INTERNAL_REVIEW: ["CLIENT_REVIEW", "REVISIONS_NEEDED"],
    CLIENT_REVIEW: ["APPROVED", "REVISIONS_NEEDED"],
    REVISIONS_NEEDED: ["IN_PROGRESS", "INTERNAL_REVIEW"],
    APPROVED: [],
    REJECTED: [],
    PRODUCTION: ["PREFLIGHT_REVIEW"],
    PREFLIGHT_REVIEW: ["PREFLIGHT_APPROVED", "PREFLIGHT_REVISIONS"],
    PREFLIGHT_REVISIONS: ["PREFLIGHT_REVIEW"],
    PREFLIGHT_APPROVED: ["PRINTED"],
    PRINTED: [],
  }

  const allowed = validTransitions[proof.status] || []
  if (!allowed.includes(newStatus)) {
    return { success: false, error: `Cannot transition from ${proof.status} to ${newStatus}` }
  }

  if (newStatus === "IN_PROGRESS" && proof.status === "REVISIONS_NEEDED") {
    // ok
  }

  if (newStatus === "INTERNAL_REVIEW") {
    if (proof.assets.length === 0) {
      return { success: false, error: "Please upload an asset or add a Google Drive link before submitting for review" }
    }
  }

  if (newStatus === "CLIENT_REVIEW") {
    const clientName = data?.clientName || proof.clientName
    const clientEmail = data?.clientEmail || proof.clientEmail
    if (!clientName || !clientEmail) {
      return { success: false, error: "Client name and email are required to send for client review" }
    }
  }

  try {
    const updateData: any = { status: newStatus }

    if (newStatus === "APPROVED") {
      updateData.approvedAt = new Date()
      if (data?.adminApproveOnBehalf) {
        if (user.role !== "ADMIN" && user.role !== "MEMBER") {
          return { success: false, error: "Only team members can approve on behalf of client" }
        }
        updateData.approvedByName = `${user.name || user.email || "Admin"} (on behalf of client)`
      } else {
        updateData.approvedByName = user.name || user.email || "Client"
      }
    }

    if (newStatus === "CLIENT_REVIEW" && (data?.clientName || data?.clientEmail)) {
      if (data?.clientName) updateData.clientName = data.clientName
      if (data?.clientEmail) updateData.clientEmail = data.clientEmail
      if (data?.feedbackDueDate) updateData.feedbackDueDate = new Date(data.feedbackDueDate)
    }

    const ops: any[] = [
      prisma.proofRequest.update({
        where: { id: proofId },
        data: updateData,
      }),
    ]

    if (data?.comment?.trim()) {
      ops.push(
        prisma.proofComment.create({
          data: {
            proofRequestId: proofId,
            authorId: user.id,
            authorName: user.name || user.email || "Unknown",
            authorRole: "InternalReviewer",
            content: data.comment.trim(),
            isInternal: newStatus !== "CLIENT_REVIEW",
          },
        })
      )
    }

    await prisma.$transaction(ops)

    if (newStatus === "INTERNAL_REVIEW" && proof.createdBy?.email) {
      await sendInternalReviewNotification({
        requesterEmail: proof.createdBy.email,
        requesterName: proof.createdBy.name || "Team Member",
        proofTitle: proof.title,
        projectName: proof.project?.name || "Project",
        designerName: proof.designerName || "The designer",
        projectId: proof.project?.id || "",
        proofId: proofId,
      })
    }

    if (newStatus === "CLIENT_REVIEW") {
      const clientEmail = data?.clientEmail || proof.clientEmail
      if (clientEmail) {
        await sendClientReviewEmail(proofId)
      }
    }

    if (newStatus === "PREFLIGHT_REVISIONS" && data?.comment?.trim()) {
      await prisma.proofComment.create({
        data: {
          proofRequestId: proofId,
          authorId: user.id,
          authorName: user.name || user.email || "Unknown",
          authorRole: "InternalReviewer",
          content: data.comment.trim(),
          isInternal: false,
        },
      })
    }

    if (newStatus === "REVISIONS_NEEDED" && proof.designerEmail) {
      await sendDesignerNotification({
        designerEmail: proof.designerEmail,
        designerName: proof.designerName || "Designer",
        proofTitle: proof.title,
        projectName: proof.project?.name || "Project",
        requestedBy: user.name || user.email || "A team member",
        projectId: proof.project?.id || "",
        proofId: proofId,
        description: data?.comment || "Revisions have been requested. Please check the proof for details.",
      })
    }

    return { success: true }
  } catch (error) {
    console.error("Error updating proof status:", error)
    return { success: false, error: "Failed to update status" }
  }
}

async function sendInternalReviewNotification(params: {
  requesterEmail: string
  requesterName: string
  proofTitle: string
  projectName: string
  designerName: string
  projectId: string
  proofId?: string
}) {
  try {
    const resend = await getResendClient()
    if (!resend) return

    const baseUrl = getPortalBaseUrl()
    const proofParam = params.proofId ? `?proofId=${params.proofId}` : ""
    const projectUrl = `${baseUrl}/projects/${params.projectId}${proofParam}#proofs`

    await resend.client.emails.send({
      from: resend.fromEmail,
      to: params.requesterEmail,
      subject: `Proof Ready for Review: ${params.proofTitle}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Proof Ready for Internal Review</h2>
          <p>Hi ${params.requesterName},</p>
          <p>${params.designerName} has completed the layout for <strong>${params.proofTitle}</strong> and it is ready for your review.</p>
          <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 0;"><strong>${params.proofTitle}</strong></p>
            <p style="margin: 8px 0 0; color: #666;">Project: ${params.projectName}</p>
          </div>
          <p>Please review the proof and either send it to the client or request revisions.</p>
          <p>
            <a href="${projectUrl}" style="display: inline-block; background: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
              Review Proof
            </a>
          </p>
        </div>
      `,
    })
  } catch (error) {
    console.error("Error sending internal review notification:", error)
  }
}

async function sendClientReviewEmail(proofId: string) {
  try {
    const proof = await prisma.proofRequest.findUnique({
      where: { id: proofId },
      include: {
        project: { select: { name: true } },
        portalAccess: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    })

    if (!proof || !proof.clientEmail) return

    let token = proof.portalAccess[0]?.accessToken
    if (!token || proof.portalAccess[0].expiresAt < new Date()) {
      const accessToken = randomBytes(32).toString("hex")
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7)
      await prisma.proofPortalAccess.create({
        data: { proofRequestId: proofId, accessToken, expiresAt },
      })
      token = accessToken
    }

    const resend = await getResendClient()
    if (!resend) return

    const baseUrl = getPortalBaseUrl()
    const portalUrl = `${baseUrl}/proof-portal/${token}`

    await resend.client.emails.send({
      from: resend.fromEmail,
      to: proof.clientEmail,
      subject: `Proof Review Request: ${proof.title}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Proof Review Request</h2>
          <p>Hi ${proof.clientName || "there"},</p>
          <p>You have a proof ready for your review:</p>
          <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 0;"><strong>${proof.title}</strong></p>
            ${proof.project ? `<p style="margin: 8px 0 0; color: #666;">Project: ${proof.project.name}</p>` : ""}
            ${proof.description ? `<p style="margin: 8px 0 0; color: #666;">${proof.description}</p>` : ""}
          </div>
          <p>
            <a href="${portalUrl}" style="display: inline-block; background: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
              Review Proof
            </a>
          </p>
          <p style="color: #666; font-size: 14px;">This link will expire in 7 days.</p>
        </div>
      `,
    })
  } catch (error) {
    console.error("Error sending client review email:", error)
  }
}

export async function getProofDetail(proofId: string): Promise<{
  proof: ProofRequestData | null
  versions: Array<{
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
  }>
  comments: Array<{
    id: string
    authorName: string
    authorRole: string
    content: string
    isInternal: boolean
    createdAt: string
  }>
  portalToken: string | null
}> {
  const user = await requireAuthWithOrg()
  if (user.approvalStatus !== "APPROVED") {
    return { proof: null, versions: [], comments: [], portalToken: null }
  }

  const proof = await prisma.proofRequest.findFirst({
    where: { id: proofId, organizationId: user.organizationId },
    include: {
      createdBy: { select: { name: true, email: true } },
      assets: { orderBy: { version: "desc" } },
      comments: { orderBy: { createdAt: "asc" } },
      portalAccess: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  })

  if (!proof) {
    return { proof: null, versions: [], comments: [], portalToken: null }
  }

  const currentAsset = proof.assets.find((a) => a.isCurrentVersion) || proof.assets[0]
  let currentAssetData = null
  if (currentAsset) {
    let signedUrl: string | null = null
    if (currentAsset.objectPath) {
      try {
        signedUrl = await getSignedReadUrl(currentAsset.objectPath)
      } catch {}
    }
    currentAssetData = {
      id: currentAsset.id,
      version: currentAsset.version,
      fileName: currentAsset.fileName,
      signedUrl,
      googleDriveUrl: currentAsset.googleDriveUrl,
      mimeType: currentAsset.mimeType,
      uploadedByName: currentAsset.uploadedByName,
      createdAt: currentAsset.createdAt.toISOString(),
    }
  }

  const versions = []
  for (const asset of proof.assets) {
    let signedUrl: string | null = null
    if (asset.objectPath) {
      try {
        signedUrl = await getSignedReadUrl(asset.objectPath)
      } catch {}
    }
    versions.push({
      id: asset.id,
      version: asset.version,
      fileName: asset.fileName,
      signedUrl,
      googleDriveUrl: asset.googleDriveUrl,
      mimeType: asset.mimeType,
      uploadedByName: asset.uploadedByName,
      uploadedByRole: asset.uploadedByRole,
      notes: asset.notes,
      createdAt: asset.createdAt.toISOString(),
    })
  }

  const comments = proof.comments.map((c) => ({
    id: c.id,
    authorName: c.authorName,
    authorRole: c.authorRole,
    content: c.content,
    isInternal: c.isInternal,
    createdAt: c.createdAt.toISOString(),
  }))

  const activeAccess = proof.portalAccess.find((a) => a.expiresAt > new Date())

  return {
    proof: {
      id: proof.id,
      title: proof.title,
      description: proof.description,
      clientEmail: proof.clientEmail,
      clientName: proof.clientName,
      designerName: proof.designerName,
      designerEmail: proof.designerEmail,
      printVendor: proof.printVendor,
      area: proof.area,
      category: proof.category,
      dimensions: proof.dimensions,
      material: proof.material,
      quantity: proof.quantity,
      dueDate: proof.dueDate?.toISOString() || null,
      feedbackDueDate: proof.feedbackDueDate?.toISOString() ?? null,
      priority: proof.priority,
      status: proof.status,
      createdBy: proof.createdBy,
      currentAsset: currentAssetData,
      approvedAt: proof.approvedAt?.toISOString() || null,
      approvedByName: proof.approvedByName,
      productionArtworkUrl: proof.productionArtworkUrl,
      createdAt: proof.createdAt.toISOString(),
      hasPortalAccess: !!activeAccess,
    },
    versions,
    comments,
    portalToken: activeAccess?.accessToken || null,
  }
}

export async function uploadNewVersion(
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
  const user = await requireAuthWithOrg()
  if (user.approvalStatus !== "APPROVED") {
    return { success: false, error: "Unauthorized" }
  }

  const proof = await prisma.proofRequest.findFirst({
    where: { id: proofId, organizationId: user.organizationId },
    include: { assets: { orderBy: { version: "desc" }, take: 1 } },
  })

  if (!proof) {
    return { success: false, error: "Proof not found" }
  }

  if (!data.objectPath && !data.googleDriveUrl) {
    return { success: false, error: "Either a file or Google Drive link is required" }
  }

  const nextVersion = (proof.assets[0]?.version || 0) + 1

  try {
    await prisma.$transaction(async (tx) => {
      await tx.proofAsset.updateMany({
        where: { proofRequestId: proofId },
        data: { isCurrentVersion: false },
      })
      await tx.proofAsset.create({
        data: {
          proofRequestId: proofId,
          version: nextVersion,
          fileName: data.fileName,
          objectPath: data.objectPath || null,
          googleDriveUrl: data.googleDriveUrl || null,
          fileSize: data.fileSize || null,
          mimeType: data.mimeType || null,
          uploadedById: user.id,
          uploadedByName: user.name || user.email || "Unknown",
          uploadedByRole: "Creator",
          notes: data.notes || null,
          isCurrentVersion: true,
        },
      })
      if (proof.status === "REVISIONS_NEEDED") {
        await tx.proofRequest.update({
          where: { id: proofId },
          data: { status: "IN_PROGRESS" },
        })
      }
    })

    return { success: true }
  } catch (error) {
    console.error("Error uploading new version:", error)
    return { success: false, error: "Failed to upload new version" }
  }
}

export async function addComment(
  proofId: string,
  content: string,
  isInternal: boolean = false
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAuthWithOrg()
  if (user.approvalStatus !== "APPROVED") {
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
        authorName: user.name || user.email || "Unknown",
        authorRole: "InternalReviewer",
        content,
        isInternal,
      },
    })

    return { success: true }
  } catch (error) {
    console.error("Error adding comment:", error)
    return { success: false, error: "Failed to add comment" }
  }
}

export async function sendMagicLinkEmail(
  proofId: string
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAuthWithOrg()
  if (user.approvalStatus !== "APPROVED") {
    return { success: false, error: "Unauthorized" }
  }

  await sendClientReviewEmail(proofId)
  return { success: true }
}

export async function sendVendorPortalAccess(
  proofRequestId: string,
  vendorEmail: string,
  vendorName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuthWithOrg()
    if (user.approvalStatus !== "APPROVED") {
      return { success: false, error: "Unauthorized" }
    }

    const proof = await prisma.proofRequest.findFirst({
      where: { id: proofRequestId, organizationId: user.organizationId },
      include: { project: { select: { name: true } } },
    })

    if (!proof) {
      return { success: false, error: "Proof not found" }
    }

    if (proof.status !== "APPROVED" && proof.status !== "PRODUCTION") {
      return { success: false, error: "Proof must be approved before sending to vendor" }
    }

    const accessToken = crypto.randomUUID()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30)

    await prisma.$transaction([
      prisma.vendorPortalAccess.create({
        data: {
          proofRequestId,
          vendorName,
          vendorEmail,
          accessToken,
          expiresAt,
        },
      }),
      prisma.proofRequest.update({
        where: { id: proofRequestId },
        data: { status: "PRODUCTION" },
      }),
    ])

    const resend = await getResendClient()
    if (resend) {
      const baseUrl = getPortalBaseUrl()
      const portalUrl = `${baseUrl}/vendor-portal/${accessToken}`

      await resend.client.emails.send({
        from: resend.fromEmail,
        to: vendorEmail,
        subject: `Production Details: ${proof.title}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Production Details Available</h2>
            <p>Hi ${vendorName},</p>
            <p>Your vendor production portal has been updated. View your approved proof production details and specifications:</p>
            <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 0;"><strong>${proof.title}</strong></p>
              ${proof.project ? `<p style="margin: 8px 0 0; color: #666;">Project: ${proof.project.name}</p>` : ""}
            </div>
            <p>
              <a href="${portalUrl}" style="display: inline-block; background: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
                View Production Details
              </a>
            </p>
            <p style="color: #666; font-size: 14px;">This link will expire in 30 days.</p>
          </div>
        `,
      })
    }

    return { success: true }
  } catch (error) {
    console.error("Error sending vendor portal access:", error)
    return { success: false, error: "Failed to send vendor portal access" }
  }
}

export async function adminUploadPreflightProof(
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
  const user = await requireAuthWithOrg()
  if (user.approvalStatus !== "APPROVED" || (user.role !== "ADMIN" && user.role !== "MEMBER")) {
    return { success: false, error: "Team member access required" }
  }

  const proof = await prisma.proofRequest.findFirst({
    where: { id: proofId, organizationId: user.organizationId },
    include: { assets: { orderBy: { version: "desc" }, take: 1 } },
  })

  if (!proof) return { success: false, error: "Proof not found" }

  if (proof.status !== "PRODUCTION" && proof.status !== "PREFLIGHT_REVISIONS") {
    return { success: false, error: "Preflight upload only allowed in Production or Pre-Flight Revisions status" }
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
          uploadedByName: `${user.name || user.email || "Admin"} (on behalf of vendor)`,
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
    console.error("Error uploading admin preflight proof:", error)
    return { success: false, error: "Failed to upload preflight proof" }
  }
}

export async function adminMarkPrinted(
  proofId: string
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAuthWithOrg()
  if (user.approvalStatus !== "APPROVED" || (user.role !== "ADMIN" && user.role !== "MEMBER")) {
    return { success: false, error: "Team member access required" }
  }

  const proof = await prisma.proofRequest.findFirst({
    where: { id: proofId, organizationId: user.organizationId },
    select: { id: true, status: true },
  })

  if (!proof) return { success: false, error: "Proof not found" }
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

export async function deleteProofRequest(
  proofId: string
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAuthWithOrg()
  if (user.approvalStatus !== "APPROVED") {
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
    await prisma.proofRequest.delete({
      where: { id: proofId },
    })

    return { success: true }
  } catch (error) {
    console.error("Error deleting proof request:", error)
    return { success: false, error: "Failed to delete proof request" }
  }
}
