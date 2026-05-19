import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuthWithOrg } from "@/lib/session"
import { createGoogleSheet, getGoogleSheetsClient } from "@/lib/google-drive"

export const dynamic = "force-dynamic"

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106"

const formatDate = (date: Date | null): string => {
  if (!date) return ""
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date))
}

function extractFolderId(input: string): string {
  if (!input) return input
  const trimmed = input.trim()
  const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  if (match) return match[1]
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) return trimmed
  return trimmed
}

async function resolveImageUrl(imageUrl: string | null | undefined): Promise<string> {
  if (!imageUrl) return ""
  if (!imageUrl.startsWith("storage://")) return imageUrl

  try {
    let objectPath = imageUrl.replace("storage://", "")
    if (!objectPath.startsWith("/")) objectPath = `/${objectPath}`
    const pathParts = objectPath.split("/")
    if (pathParts.length < 3) return ""
    const bucketName = pathParts[1]
    const objectName = pathParts.slice(2).join("/")

    const response = await fetch(
      `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bucket_name: bucketName,
          object_name: objectName,
          method: "GET",
          expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        }),
      }
    )
    if (!response.ok) return ""
    const { signed_url } = await response.json()
    return signed_url || ""
  } catch {
    return ""
  }
}

const COLUMN_HEADERS = [
  "ASSET CODE",
  "ITEM",
  "CATEGORY",
  "CONDITION",
  "QTY",
  "STORAGE LOCATION",
  "RESERVATION START",
  "RESERVATION END",
  "NOTES",
  "IMAGE",
]

async function writeSheetData(spreadsheetId: string, project: any, reservations: any[], imageUrls: Map<string, string>, organizationId?: string) {
  const sheets = await getGoogleSheetsClient(organizationId)

  const locationParts = [project.venue, project.city].filter(Boolean)
  const locationStr = locationParts.join(", ")

  const emptyRow = new Array(COLUMN_HEADERS.length).fill("")

  const dateRange =
    project.startDate && project.endDate
      ? `${formatDate(project.startDate)} - ${formatDate(project.endDate)}`
      : project.startDate
        ? formatDate(project.startDate)
        : ""

  const headerRows: (string | number)[][] = [
    ["LOAD LIST", ...emptyRow.slice(1)],
    emptyRow,
    ["Event:", project.name, ...emptyRow.slice(2)],
    ["Client:", project.client?.name || "", ...emptyRow.slice(2)],
    ["Date:", dateRange, ...emptyRow.slice(2)],
    ["Location:", locationStr, ...emptyRow.slice(2)],
    ["Project Manager:", project.owner?.name || "", ...emptyRow.slice(2)],
    emptyRow,
    COLUMN_HEADERS,
  ]

  const dataRows = reservations.map((r) => [
    r.asset.assetCode || "",
    r.asset.name,
    r.asset.category,
    r.asset.condition,
    r.quantity,
    r.asset.location || "",
    formatDate(r.startDate),
    formatDate(r.endDate),
    r.notes || "",
    imageUrls.get(r.asset.assetCode || r.assetId) || "",
  ])

  const allValues = [...headerRows, ...dataRows]

  const totalRows = allValues.length + 10
  const totalCols = COLUMN_HEADERS.length + 2

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `Sheet1!A1:${String.fromCharCode(64 + totalCols)}${totalRows}`,
  }).catch(() => {})

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Sheet1!A1",
    valueInputOption: "USER_ENTERED",
    requestBody: { values: allValues },
  })

  const sheetsInfo = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties",
  })
  const sheetId = sheetsInfo.data.sheets?.[0]?.properties?.sheetId ?? 0

  const columnHeaderRowIndex = 8

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          mergeCells: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: COLUMN_HEADERS.length,
            },
            mergeType: "MERGE_ALL",
          },
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true, fontSize: 14 },
              },
            },
            fields: "userEnteredFormat(textFormat)",
          },
        },
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 2,
              endRowIndex: 7,
              startColumnIndex: 0,
              endColumnIndex: 1,
            },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true },
              },
            },
            fields: "userEnteredFormat(textFormat)",
          },
        },
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: columnHeaderRowIndex,
              endRowIndex: columnHeaderRowIndex + 1,
            },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true },
                backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 },
              },
            },
            fields: "userEnteredFormat(textFormat,backgroundColor)",
          },
        },
        {
          updateSheetProperties: {
            properties: {
              sheetId,
              gridProperties: { frozenRowCount: columnHeaderRowIndex + 1 },
            },
            fields: "gridProperties.frozenRowCount",
          },
        },
        {
          autoResizeDimensions: {
            dimensions: {
              sheetId,
              dimension: "COLUMNS",
              startIndex: 0,
              endIndex: COLUMN_HEADERS.length,
            },
          },
        },
      ],
    },
  })
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
      select: {
        id: true,
        name: true,
        eventType: true,
        city: true,
        venue: true,
        startDate: true,
        endDate: true,
        client: { select: { name: true } },
        ownerUserId: true,
        owner: { select: { name: true } },
        assetSheetId: true,
        assetSheetFolderId: true,
      },
    })

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    const reservations = await prisma.assetReservation.findMany({
      where: { projectId },
      include: {
        asset: {
          select: {
            name: true,
            category: true,
            condition: true,
            quantity: true,
            location: true,
            assetCode: true,
            barcode: true,
            description: true,
            imageUrl: true,
          },
        },
      },
      orderBy: { startDate: "asc" },
    })

    const imageUrls = new Map<string, string>()
    await Promise.all(
      reservations.map(async (r) => {
        if (r.asset.imageUrl) {
          const url = await resolveImageUrl(r.asset.imageUrl)
          if (url) {
            imageUrls.set(r.asset.assetCode || r.assetId, url)
          }
        }
      })
    )

    let spreadsheetId = project.assetSheetId
    let sheetUrl: string

    if (spreadsheetId) {
      try {
        await writeSheetData(spreadsheetId, project, reservations, imageUrls, user.organizationId)
        sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
      } catch (e: any) {
        if (e?.code === 404 || e?.status === 404) {
          const folderId = project.assetSheetFolderId ? extractFolderId(project.assetSheetFolderId) : undefined
          const result = await createGoogleSheet(`${project.name} - Load List`, folderId, user.organizationId)
          spreadsheetId = result.id
          sheetUrl = result.url
          await writeSheetData(spreadsheetId, project, reservations, imageUrls, user.organizationId)
          await prisma.project.update({
            where: { id: projectId },
            data: { assetSheetId: spreadsheetId },
          })
        } else {
          throw e
        }
      }
    } else {
      const folderId = project.assetSheetFolderId ? extractFolderId(project.assetSheetFolderId) : undefined
      const result = await createGoogleSheet(`${project.name} - Load List`, folderId, user.organizationId)
      spreadsheetId = result.id
      sheetUrl = result.url
      await writeSheetData(spreadsheetId, project, reservations, imageUrls, user.organizationId)
      await prisma.project.update({
        where: { id: projectId },
        data: { assetSheetId: spreadsheetId },
      })
    }

    return NextResponse.json({ url: sheetUrl })
  } catch (error: any) {
    console.error("Export assets to sheet error:", error)
    return NextResponse.json(
      { error: error?.message || "Failed to export assets to Google Sheet" },
      { status: 500 }
    )
  }
}
