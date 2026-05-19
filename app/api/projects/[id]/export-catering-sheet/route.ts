import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuthWithOrg } from "@/lib/session"
import { createGoogleSheet, updateSheetData, getGoogleSheetsClient } from "@/lib/google-drive"

export const dynamic = "force-dynamic"

const extractFolderId = (input: string): string => {
  if (!input) return input
  const trimmed = input.trim()
  const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  if (match) return match[1]
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) return trimmed
  return trimmed
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

type CatWithItems = {
  id: string
  name: string
  sortOrder: number
  items: {
    id: string
    beoNumber: string
    date: string
    functionName: string
    startTime: string
    endTime: string
    room: string
    menuDescription: string
    pax: number
    retailPrice: number
    discountedPrice: number | null
    banquetCheck: number | null
    notes: string
    sortOrder: number
  }[]
}

const OVERVIEW_HEADERS = ["CATEGORY", "ITEMS", "FOOD/BEV TOTAL", "SERVICE CHARGE", "TAX", "INCLUSIVE TOTAL", "BANQUET CHECKS"]
const CATEGORY_HEADERS = ["BEO #", "DATE", "FUNCTION", "START", "END", "ROOM", "MENU/DESCRIPTION", "PAX", "PRICE", "DISC. PRICE", "TOTAL", "BANQUET CHECK", "NOTES"]

const buildOverviewRows = (
  categories: CatWithItems[],
  serviceChargePct: number,
  taxPct: number
): { rows: string[][]; grandExclusive: number; grandServiceCharge: number; grandTax: number; grandInclusive: number; grandBanquetCheck: number } => {
  const rows: string[][] = []
  rows.push([`Service Charge: ${serviceChargePct}%`, "", "", `Tax: ${taxPct}%`, "", "", ""])
  rows.push(["", "", "", "", "", "", ""])

  let grandExclusive = 0
  let grandServiceCharge = 0
  let grandTax = 0
  let grandInclusive = 0
  let grandBanquetCheck = 0

  for (const cat of categories) {
    const exclusiveTotal = cat.items.reduce(
      (sum, item) => sum + (Number(item.discountedPrice) || Number(item.retailPrice) || 0) * (Number(item.pax) || 0),
      0
    )
    const serviceChargeTotal = exclusiveTotal * (serviceChargePct / 100)
    const taxTotal = (exclusiveTotal + serviceChargeTotal) * (taxPct / 100)
    const inclusiveTotal = exclusiveTotal + serviceChargeTotal + taxTotal
    const banquetCheckTotal = cat.items.reduce(
      (sum, item) => sum + (Number(item.banquetCheck) || 0),
      0
    )

    grandExclusive += exclusiveTotal
    grandServiceCharge += serviceChargeTotal
    grandTax += taxTotal
    grandInclusive += inclusiveTotal
    grandBanquetCheck += banquetCheckTotal

    rows.push([
      cat.name,
      String(cat.items.length),
      formatCurrency(exclusiveTotal),
      formatCurrency(serviceChargeTotal),
      formatCurrency(taxTotal),
      formatCurrency(inclusiveTotal),
      formatCurrency(banquetCheckTotal),
    ])
  }

  rows.push([
    "GRAND TOTAL",
    "",
    formatCurrency(grandExclusive),
    formatCurrency(grandServiceCharge),
    formatCurrency(grandTax),
    formatCurrency(grandInclusive),
    formatCurrency(grandBanquetCheck),
  ])

  return { rows, grandExclusive, grandServiceCharge, grandTax, grandInclusive, grandBanquetCheck }
}

const buildCategoryRows = (cat: CatWithItems): string[][] => {
  const rows: string[][] = []
  for (const item of cat.items) {
    const price = Number(item.retailPrice) || 0
    const discPrice = item.discountedPrice !== null ? Number(item.discountedPrice) : null
    const pax = Number(item.pax) || 0
    const total = (discPrice ?? price) * pax

    rows.push([
      item.beoNumber || "",
      item.date || "",
      item.functionName || "",
      item.startTime || "",
      item.endTime || "",
      item.room || "",
      item.menuDescription || "",
      pax ? String(pax) : "",
      formatCurrency(price),
      discPrice !== null ? formatCurrency(discPrice) : "",
      formatCurrency(total),
      item.banquetCheck !== null ? formatCurrency(Number(item.banquetCheck)) : "",
      item.notes || "",
    ])
  }

  const exclusiveTotal = cat.items.reduce(
    (sum, item) => sum + ((item.discountedPrice !== null ? Number(item.discountedPrice) : Number(item.retailPrice)) || 0) * (Number(item.pax) || 0),
    0
  )
  rows.push(["", "", "", "", "", "", "TOTAL", "", "", "", formatCurrency(exclusiveTotal), "", ""])

  return rows
}

const getTabNames = (categories: CatWithItems[]): string[] => {
  const names = ["Overview", ...categories.map((cat) => cat.name.substring(0, 100))]
  const seen = new Map<string, number>()
  return names.map((name) => {
    const count = seen.get(name) || 0
    seen.set(name, count + 1)
    return count > 0 ? `${name} (${count})` : name
  })
}

const writeAllTabs = async (
  spreadsheetId: string,
  tabNames: string[],
  categories: CatWithItems[],
  overviewRows: string[][],
  organizationId?: string
): Promise<void> => {
  await updateSheetData(spreadsheetId, tabNames[0], OVERVIEW_HEADERS, overviewRows, organizationId)

  for (let i = 0; i < categories.length; i++) {
    const catRows = buildCategoryRows(categories[i])
    await updateSheetData(spreadsheetId, tabNames[i + 1], CATEGORY_HEADERS, catRows, organizationId)
  }
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
      select: { id: true, name: true, cateringSheetId: true, cateringSheetFolderId: true },
    })

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    const settings = await prisma.cateringSettings.findUnique({
      where: { projectId },
    })

    const serviceChargePct = settings?.serviceChargePct ? Number(settings.serviceChargePct) : 0
    const taxPct = settings?.taxPct ? Number(settings.taxPct) : 0

    const categories = await prisma.cateringCategory.findMany({
      where: { projectId },
      orderBy: { sortOrder: "asc" },
      include: {
        items: {
          orderBy: { sortOrder: "asc" },
        },
      },
    })

    const { rows: overviewRows } = buildOverviewRows(categories, serviceChargePct, taxPct)
    const tabNames = getTabNames(categories)

    let sheetId = project.cateringSheetId
    let sheetUrl: string

    if (sheetId) {
      try {
        const sheets = await getGoogleSheetsClient(user.organizationId)

        const sheetsInfo = await sheets.spreadsheets.get({
          spreadsheetId: sheetId,
          fields: "sheets.properties",
        })
        const existingSheets = sheetsInfo.data.sheets || []

        const tempSheet = await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: {
            requests: [{ addSheet: { properties: { title: "_temp_placeholder" } } }],
          },
        })
        const tempSheetNumId = tempSheet.data.replies?.[0]?.addSheet?.properties?.sheetId

        const deleteRequests = existingSheets
          .filter((s) => s.properties?.sheetId !== undefined)
          .map((s) => ({ deleteSheet: { sheetId: s.properties!.sheetId! } }))

        if (deleteRequests.length > 0) {
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: sheetId,
            requestBody: { requests: deleteRequests },
          })
        }

        const addRequests = tabNames.map((title) => ({
          addSheet: { properties: { title } },
        }))

        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: { requests: addRequests },
        })

        if (tempSheetNumId !== undefined) {
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: sheetId,
            requestBody: {
              requests: [{ deleteSheet: { sheetId: tempSheetNumId } }],
            },
          })
        }

        await writeAllTabs(sheetId, tabNames, categories, overviewRows, user.organizationId)
        sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`
      } catch (e: any) {
        if (e?.code === 404 || e?.status === 404) {
          sheetId = null
        } else {
          throw e
        }
      }
    }

    if (!sheetId) {
      const folderId = project.cateringSheetFolderId ? extractFolderId(project.cateringSheetFolderId) : undefined
      const result = await createGoogleSheet(`${project.name} - Catering`, folderId, user.organizationId)
      sheetId = result.id
      sheetUrl = result.url

      const sheets = await getGoogleSheetsClient(user.organizationId)

      if (categories.length > 0) {
        const addSheetRequests = tabNames.map((title) => ({
          addSheet: { properties: { title } },
        }))

        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: { requests: addSheetRequests },
        })

        await writeAllTabs(sheetId, tabNames, categories, overviewRows, user.organizationId)

        const sheetsInfo = await sheets.spreadsheets.get({
          spreadsheetId: sheetId,
          fields: "sheets.properties",
        })
        const defaultSheet = sheetsInfo.data.sheets?.find(
          (s) => s.properties?.title === "Sheet1"
        )
        if (defaultSheet?.properties?.sheetId !== undefined) {
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: sheetId,
            requestBody: {
              requests: [
                { deleteSheet: { sheetId: defaultSheet.properties.sheetId } },
              ],
            },
          })
        }
      } else {
        await updateSheetData(sheetId, "Sheet1", OVERVIEW_HEADERS, [["No catering data available", "", "", "", "", "", ""]], user.organizationId)
      }

      await prisma.project.update({
        where: { id: projectId },
        data: { cateringSheetId: sheetId },
      })
    }

    return NextResponse.json({ success: true, sheetUrl: sheetUrl!, sheetId })
  } catch (error: any) {
    console.error("Export catering to sheet error:", error)
    return NextResponse.json(
      { error: error?.message || "Failed to export catering to Google Sheet" },
      { status: 500 }
    )
  }
}
