"use server"

import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/session"
import { revalidatePath } from "next/cache"
import { createGoogleDoc, copyGoogleDoc, exportDocumentAsPdf, buildGoogleDocUrl, getFileMetadata, findSignedPdfInFolder, downloadFileContent } from "@/lib/google-drive"
import { ContractStage } from "@prisma/client"
import { canAdvanceToStage, extractGoogleDocId } from "@/lib/contract-utils"

const SUPER_ADMIN_EMAIL = "brian@makemysandbox.com"
const SIGNED_CONTRACTS_FOLDER_ID = "10GgTgUJ_pjUUQ9906_Z2kCW74XYvUfna"

export async function checkIsSuperAdmin(): Promise<boolean> {
  const user = await requireAuth()
  return user.email === SUPER_ADMIN_EMAIL
}

export async function getDocumentTemplatesForContracts() {
  const user = await requireAuth()
  if (!user.organizationId) throw new Error("Not authorized")

  return prisma.documentTemplate.findMany({
    where: { organizationId: user.organizationId },
    orderBy: [{ templateType: "asc" }, { name: "asc" }],
  })
}

export async function getContractsForProject(projectId: string) {
  const user = await requireAuth()
  if (!user.organizationId) throw new Error("Not authorized")

  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: user.organizationId }
  })
  if (!project) throw new Error("Project not found")

  const isSuperAdmin = user.email === SUPER_ADMIN_EMAIL

  const contracts = await prisma.contract.findMany({
    where: { projectId },
    include: {
      vendor: true,
      person: true,
      versions: { orderBy: { versionNum: "desc" }, take: 1 },
      participants: { include: { person: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  // Filter out freelance contractor contracts for non-super-admins
  if (!isSuperAdmin) {
    return contracts.filter(c => !c.isFreelanceContractor)
  }

  return contracts
}

export async function createContract(projectId: string, data: {
  name: string
  vendorId?: string
  personId?: string
  docOption?: "none" | "blank" | "template"
  templateUrl?: string
  isFreelanceContractor?: boolean
}) {
  const user = await requireAuth()
  if (!user.organizationId) throw new Error("Not authorized")

  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: user.organizationId }
  })
  if (!project) throw new Error("Project not found")

  // Only super admin can set isFreelanceContractor flag
  const isSuperAdmin = user.email === SUPER_ADMIN_EMAIL
  const isFreelanceContractor = isSuperAdmin ? (data.isFreelanceContractor ?? false) : false

  let googleDocId: string | undefined
  let googleDocUrl: string | undefined

  const docOption = data.docOption || "none"

  if (docOption === "template" && !data.templateUrl?.trim()) {
    throw new Error("Template URL is required when copying from a template")
  }

  if (docOption === "blank") {
    try {
      const doc = await createGoogleDoc(`${project.name} - ${data.name}`, undefined, user.organizationId!)
      googleDocId = doc.id
      googleDocUrl = doc.url
    } catch (error) {
      console.error("Failed to create Google Doc:", error)
      throw new Error("Failed to create Google Doc. Please try again.")
    }
  } else if (docOption === "template" && data.templateUrl) {
    try {
      const templateId = extractGoogleDocId(data.templateUrl)
      const doc = await copyGoogleDoc(templateId, `${project.name} - ${data.name}`, user.organizationId!)
      googleDocId = doc.id
      googleDocUrl = doc.url
    } catch (error) {
      console.error("Failed to copy template:", error)
      throw new Error("Failed to copy template. Please check the template URL and ensure you have access to it.")
    }
  }

  const contract = await prisma.contract.create({
    data: {
      projectId,
      vendorId: data.vendorId || null,
      personId: data.personId || null,
      name: data.name,
      googleDocId,
      googleDocUrl,
      stage: "Draft",
      isFreelanceContractor,
    },
  })

  revalidatePath(`/projects/${projectId}`)
  return contract
}

export async function updateContract(contractId: string, data: {
  name?: string
  vendorId?: string | null
  googleDocId?: string
}) {
  const user = await requireAuth()
  if (!user.organizationId) throw new Error("Not authorized")

  const contract = await prisma.contract.findFirst({
    where: { id: contractId },
    include: { project: true },
  })
  if (!contract || contract.project.organizationId !== user.organizationId) {
    throw new Error("Contract not found")
  }

  let normalizedDocId: string | undefined
  let docUrl: string | undefined
  
  if (data.googleDocId !== undefined) {
    normalizedDocId = extractGoogleDocId(data.googleDocId)
    docUrl = buildGoogleDocUrl(normalizedDocId)
  }

  const updated = await prisma.contract.update({
    where: { id: contractId },
    data: {
      name: data.name,
      vendorId: data.vendorId,
      googleDocId: normalizedDocId,
      googleDocUrl: docUrl,
    },
  })

  revalidatePath(`/projects/${contract.projectId}`)
  return updated
}

export async function updateContractStage(contractId: string, newStage: ContractStage) {
  const user = await requireAuth()
  if (!user.organizationId) throw new Error("Not authorized")

  const contract = await prisma.contract.findFirst({
    where: { id: contractId },
    include: { project: true, versions: { orderBy: { versionNum: "desc" }, take: 1 } },
  })
  if (!contract || contract.project.organizationId !== user.organizationId) {
    throw new Error("Contract not found")
  }

  if (!canAdvanceToStage(contract.stage, newStage)) {
    throw new Error(`Cannot transition from ${contract.stage} to ${newStage}. Only forward progression to the next stage is allowed.`)
  }

  const nextVersionNum = (contract.versions[0]?.versionNum ?? 0) + 1

  await prisma.$transaction([
    prisma.contractVersion.create({
      data: {
        contractId,
        versionNum: nextVersionNum,
        snapshotUrl: contract.googleDocUrl,
        note: `Stage changed to ${newStage}`,
      },
    }),
    prisma.contract.update({
      where: { id: contractId },
      data: {
        stage: newStage,
        signedAt: newStage === "Signed" ? new Date() : undefined,
      },
    }),
  ])

  revalidatePath(`/projects/${contract.projectId}`)
  revalidatePath(`/projects/${contract.projectId}/contracts/${contractId}`)
}

export async function deleteContract(contractId: string) {
  const user = await requireAuth()
  if (!user.organizationId) throw new Error("Not authorized")

  const contract = await prisma.contract.findFirst({
    where: { id: contractId },
    include: { project: true },
  })
  if (!contract || contract.project.organizationId !== user.organizationId) {
    throw new Error("Contract not found")
  }

  await prisma.contract.delete({ where: { id: contractId } })
  revalidatePath(`/projects/${contract.projectId}`)
}

export async function getContractDetails(contractId: string) {
  const user = await requireAuth()
  if (!user.organizationId) throw new Error("Not authorized")

  const contract = await prisma.contract.findFirst({
    where: { id: contractId },
    include: {
      project: true,
      vendor: true,
      versions: { orderBy: { versionNum: "desc" } },
      participants: { include: { person: true, vendor: true } },
    },
  })

  if (!contract || contract.project.organizationId !== user.organizationId) {
    throw new Error("Contract not found")
  }

  return contract
}

export async function pullSignedDocument(contractId: string) {
  const user = await requireAuth()
  if (!user.organizationId) throw new Error("Not authorized")

  const contract = await prisma.contract.findFirst({
    where: { id: contractId },
    include: { project: true },
  })
  if (!contract || contract.project.organizationId !== user.organizationId) {
    throw new Error("Contract not found")
  }

  if (contract.stage !== "SentForSignature" && contract.stage !== "Signed") {
    throw new Error("Contract must be in 'Sent for Signature' or 'Signed' stage to pull the signed document")
  }

  if (!contract.googleDocId) {
    throw new Error("No Google Doc linked to this contract")
  }

  let pdfBuffer: Buffer
  let foundPdfName: string | null = null

  try {
    const docMetadata = await getFileMetadata(contract.googleDocId, user.organizationId!)
    
    const signedPdf = await findSignedPdfInFolder(SIGNED_CONTRACTS_FOLDER_ID, docMetadata.name, user.organizationId!)
    
    if (signedPdf) {
      pdfBuffer = await downloadFileContent(signedPdf.id, user.organizationId!)
      foundPdfName = signedPdf.name
      console.log(`Found signed PDF in folder: ${signedPdf.name}`)
    } else {
      console.log("No signed PDF found in contracts folder, falling back to exporting Google Doc as PDF")
      pdfBuffer = await exportDocumentAsPdf(contract.googleDocId, user.organizationId!)
    }
  } catch (error) {
    console.error("Error scanning for signed PDF, falling back to export:", error)
    pdfBuffer = await exportDocumentAsPdf(contract.googleDocId, user.organizationId!)
  }
  
  const fileName = `contracts/${contract.projectId}/${contractId}-signed-${Date.now()}.pdf`
  
  const { Client } = await import("@replit/object-storage")
  const client = new Client()
  await client.uploadFromBytes(fileName, pdfBuffer)

  await prisma.contract.update({
    where: { id: contractId },
    data: {
      signedPdfPath: fileName,
      signedAt: new Date(),
      stage: "Signed",
    },
  })

  revalidatePath(`/projects/${contract.projectId}`)
  revalidatePath(`/projects/${contract.projectId}/contracts/${contractId}`)
  
  return { success: true, path: fileName, foundPdfName }
}

export async function getVendorsForProject(projectId: string) {
  const user = await requireAuth()
  if (!user.organizationId) throw new Error("Not authorized")

  return prisma.vendor.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { name: "asc" },
  })
}

export async function getPeopleForProject(projectId: string) {
  const user = await requireAuth()
  if (!user.organizationId) throw new Error("Not authorized")

  return prisma.person.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { name: "asc" },
  })
}
