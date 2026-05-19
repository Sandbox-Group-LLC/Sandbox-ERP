import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuthWithOrg } from "@/lib/session"
import { createGoogleSheet, updateSheetData } from "@/lib/google-drive"

export const dynamic = "force-dynamic"

function extractFolderId(input: string): string {
  if (!input) return input
  const trimmed = input.trim()
  const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  if (match) return match[1]
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) return trimmed
  return trimmed
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthWithOrg()
    if (user.approvalStatus !== "APPROVED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const { id: projectId } = await params

    const project = await prisma.project.findFirst({
      where: { id: projectId, organizationId: user.organizationId },
      select: { id: true, name: true, proofSheetId: true, proofSheetFolderId: true },
    })

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    const proofs = await prisma.proofRequest.findMany({
      where: { projectId, organizationId: user.organizationId },
      orderBy: { createdAt: "asc" },
    })

    const headers = [
      "Proof ID",
      "Title",
      "Status",
      "Print Vendor",
      "Area",
      "Category",
      "Dimensions",
      "Quantity",
      "Production Artwork Folder",
      "Due Date",
      "Priority",
      "Designer",
      "Client",
      "Created",
    ]

    const rows = proofs.map((p) => [
      p.id.slice(-8).toUpperCase(),
      p.title,
      p.status,
      p.printVendor || "",
      p.area || "",
      p.category || "",
      p.dimensions || "",
      p.quantity?.toString() || "",
      p.productionArtworkUrl || "",
      p.dueDate ? new Date(p.dueDate).toLocaleDateString() : "",
      p.priority,
      p.designerName || "",
      p.clientName || "",
      new Date(p.createdAt).toLocaleDateString(),
    ])

    let sheetId = project.proofSheetId
    let sheetUrl: string

    if (sheetId) {
      try {
        await updateSheetData(sheetId, "Sheet1", headers, rows, user.organizationId)
        sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`
      } catch (e: any) {
        if (e?.code === 404 || e?.status === 404) {
          const folderId = project.proofSheetFolderId ? extractFolderId(project.proofSheetFolderId) : undefined
          const result = await createGoogleSheet(
            `${project.name} - Proof Tracker`,
            folderId,
            user.organizationId
          )
          sheetId = result.id
          sheetUrl = result.url
          await updateSheetData(sheetId, "Sheet1", headers, rows, user.organizationId)
          await prisma.project.update({
            where: { id: projectId },
            data: { proofSheetId: sheetId },
          })
        } else {
          throw e
        }
      }
    } else {
      const folderId = project.proofSheetFolderId ? extractFolderId(project.proofSheetFolderId) : undefined
      const result = await createGoogleSheet(
        `${project.name} - Proof Tracker`,
        folderId,
        user.organizationId
      )
      sheetId = result.id
      sheetUrl = result.url
      await updateSheetData(sheetId, "Sheet1", headers, rows, user.organizationId)
      await prisma.project.update({
        where: { id: projectId },
        data: { proofSheetId: sheetId },
      })
    }

    return NextResponse.json({ success: true, sheetUrl, sheetId })
  } catch (error: any) {
    console.error("Export proofs to sheet error:", error)
    return NextResponse.json(
      { error: error?.message || "Failed to export proofs to Google Sheet" },
      { status: 500 }
    )
  }
}
