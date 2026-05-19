"use server"

import { prisma } from "@/lib/prisma"
import { requireAuthWithOrg } from "@/lib/session"
import { revalidatePath } from "next/cache"

async function verifyProjectAccess(projectId: string) {
  const user = await requireAuthWithOrg()
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: user.organizationId },
    select: { id: true },
  })
  if (!project) throw new Error("Project not found")
  return user
}

export async function getRoomingLists(projectId: string) {
  await verifyProjectAccess(projectId)
  return prisma.roomingList.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  })
}

export async function getRoomingListWithGuests(projectId: string, listId: string) {
  await verifyProjectAccess(projectId)
  const list = await prisma.roomingList.findFirst({
    where: { id: listId, projectId },
    include: {
      guests: { orderBy: { sortOrder: "asc" } },
    },
  })
  if (!list) throw new Error("Rooming list not found")
  return list
}

export async function createRoomingList(projectId: string, name: string) {
  await verifyProjectAccess(projectId)
  const list = await prisma.roomingList.create({
    data: { projectId, name: name.trim() || "Untitled Rooming List" },
  })
  revalidatePath(`/projects/${projectId}`)
  return list
}

export async function deleteRoomingList(projectId: string, listId: string) {
  await verifyProjectAccess(projectId)
  const list = await prisma.roomingList.findFirst({ where: { id: listId, projectId } })
  if (!list) throw new Error("Rooming list not found")
  await prisma.roomingList.delete({ where: { id: listId } })
  revalidatePath(`/projects/${projectId}`)
}

export async function renameRoomingList(projectId: string, listId: string, name: string) {
  await verifyProjectAccess(projectId)
  const existing = await prisma.roomingList.findFirst({ where: { id: listId, projectId } })
  if (!existing) throw new Error("Rooming list not found")
  const list = await prisma.roomingList.update({
    where: { id: listId },
    data: { name: name.trim() || "Untitled Rooming List" },
  })
  revalidatePath(`/projects/${projectId}`)
  return list
}

export async function updateRoomingListDates(projectId: string, listId: string, dates: string[]) {
  await verifyProjectAccess(projectId)
  const existing = await prisma.roomingList.findFirst({ where: { id: listId, projectId } })
  if (!existing) throw new Error("Rooming list not found")
  const list = await prisma.roomingList.update({
    where: { id: listId },
    data: { dates },
  })
  revalidatePath(`/projects/${projectId}`)
  return list
}

export async function addGuest(projectId: string, listId: string) {
  await verifyProjectAccess(projectId)
  const list = await prisma.roomingList.findFirst({ where: { id: listId, projectId } })
  if (!list) throw new Error("Rooming list not found")
  const maxOrder = await prisma.roomingListGuest.aggregate({
    where: { roomingListId: listId },
    _max: { sortOrder: true },
  })
  const guest = await prisma.roomingListGuest.create({
    data: {
      roomingListId: listId,
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
    },
  })
  revalidatePath(`/projects/${projectId}`)
  return guest
}

export async function updateGuest(
  projectId: string,
  listId: string,
  guestId: string,
  data: {
    firstName?: string
    lastName?: string
    email?: string
    wwid?: string
    company?: string
    role?: string
    hotelId?: string | null
    rate?: string
    nights?: Record<string, boolean>
  }
) {
  await verifyProjectAccess(projectId)
  const list = await prisma.roomingList.findFirst({ where: { id: listId, projectId } })
  if (!list) throw new Error("Rooming list not found")
  if (data.hotelId) {
    const hotel = await prisma.housingHotel.findFirst({ where: { id: data.hotelId, projectId } })
    if (!hotel) throw new Error("Hotel not found in this project")
  }
  const guest = await prisma.roomingListGuest.findFirst({
    where: { id: guestId, roomingListId: listId },
  })
  if (!guest) throw new Error("Guest not found")
  const updated = await prisma.roomingListGuest.update({
    where: { id: guestId },
    data,
  })
  revalidatePath(`/projects/${projectId}`)
  return updated
}

export async function deleteGuest(projectId: string, listId: string, guestId: string) {
  await verifyProjectAccess(projectId)
  const list = await prisma.roomingList.findFirst({ where: { id: listId, projectId } })
  if (!list) throw new Error("Rooming list not found")
  const guest = await prisma.roomingListGuest.findFirst({
    where: { id: guestId, roomingListId: listId },
  })
  if (!guest) throw new Error("Guest not found")
  await prisma.roomingListGuest.delete({ where: { id: guestId } })
  revalidatePath(`/projects/${projectId}`)
}

export async function getHousingOverview(projectId: string) {
  await verifyProjectAccess(projectId)
  const [lists, hotels] = await Promise.all([
    prisma.roomingList.findMany({
      where: { projectId },
      include: { guests: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.housingHotel.findMany({
      where: { projectId },
      include: {
        roomTypes: true,
        taxFees: true,
      },
    }),
  ])

  const hotelMap = new Map(hotels.map((h) => [h.id, h]))

  function calcGuestAmount(guest: { hotelId: string | null; rate: string; nights: unknown }): number {
    const nightsMap = (guest.nights as Record<string, boolean>) || {}
    const activeDates = Object.entries(nightsMap).filter(([, v]) => v).map(([d]) => d)
    if (activeDates.length === 0) return 0

    const hotel = guest.hotelId ? hotelMap.get(guest.hotelId) : null
    if (!hotel) {
      const numericRate = parseFloat(guest.rate)
      if (!isNaN(numericRate)) return activeDates.length * numericRate
      return 0
    }

    const roomType = hotel.roomTypes.find((rt) => rt.name === guest.rate)
    const inventory = roomType ? (roomType.inventory as Record<string, { rate: number; rooms: number }>) || {} : {}

    let baseTotal = 0
    for (const date of activeDates) {
      const dayRate = inventory[date]?.rate
      if (dayRate != null && dayRate > 0) {
        baseTotal += dayRate
      } else {
        const numericRate = parseFloat(guest.rate)
        if (!isNaN(numericRate)) baseTotal += numericRate
      }
    }

    let taxMultiplier = 1
    let flatFeePerNight = 0
    for (const tf of hotel.taxFees) {
      if (tf.type === "PERCENTAGE") {
        taxMultiplier += tf.value / 100
      } else {
        flatFeePerNight += tf.value
      }
    }

    return baseTotal * taxMultiplier + activeDates.length * flatFeePerNight
  }

  let totalContractedRoomNights = 0
  let lowestContractedAttrition: number | null = null
  for (const hotel of hotels) {
    for (const rt of hotel.roomTypes) {
      const inv = (rt.inventory as Record<string, { rate: number; rooms: number }>) || {}
      for (const day of Object.values(inv)) {
        totalContractedRoomNights += day.rooms || 0
      }
    }
    if (hotel.contractedAttrition != null) {
      if (lowestContractedAttrition == null || hotel.contractedAttrition < lowestContractedAttrition) {
        lowestContractedAttrition = hotel.contractedAttrition
      }
    }
  }

  let totalGuests = 0
  let totalRoomNights = 0
  let totalAmount = 0
  const dateNightCounts: Record<string, number> = {}

  const listResults = lists.map((l) => {
    let listRoomNights = 0
    let listAmount = 0
    totalGuests += l.guests.length

    for (const guest of l.guests) {
      const nights = (guest.nights as Record<string, boolean>) || {}
      for (const [date, needed] of Object.entries(nights)) {
        if (needed) {
          totalRoomNights++
          listRoomNights++
          dateNightCounts[date] = (dateNightCounts[date] || 0) + 1
        }
      }
      listAmount += calcGuestAmount(guest)
    }

    totalAmount += listAmount

    return {
      id: l.id,
      name: l.name,
      guestCount: l.guests.length,
      roomNights: listRoomNights,
      totalAmount: listAmount,
    }
  })

  const attritionPercent = totalContractedRoomNights > 0
    ? (totalRoomNights / totalContractedRoomNights) * 100
    : null

  return {
    listCount: lists.length,
    totalGuests,
    totalRoomNights,
    totalAmount,
    totalContractedRoomNights,
    attritionPercent,
    contractedAttritionThreshold: lowestContractedAttrition,
    dateBreakdown: dateNightCounts,
    lists: listResults,
  }
}

export async function getHousingHotels(projectId: string) {
  await verifyProjectAccess(projectId)
  return prisma.housingHotel.findMany({
    where: { projectId },
    include: { roomTypes: { orderBy: { sortOrder: "asc" } }, taxFees: { orderBy: { sortOrder: "asc" } } },
    orderBy: { createdAt: "asc" },
  })
}

export async function createHousingHotel(projectId: string, name: string) {
  await verifyProjectAccess(projectId)
  const hotel = await prisma.housingHotel.create({
    data: { projectId, name: name.trim() || "Untitled Hotel" },
    include: { roomTypes: true },
  })
  revalidatePath(`/projects/${projectId}`)
  return hotel
}

export async function updateHousingHotel(
  projectId: string,
  hotelId: string,
  data: { name?: string; notes?: string; dates?: string[]; contractedAttrition?: number | null }
) {
  await verifyProjectAccess(projectId)
  const hotel = await prisma.housingHotel.findFirst({ where: { id: hotelId, projectId } })
  if (!hotel) throw new Error("Hotel not found")
  const updated = await prisma.housingHotel.update({
    where: { id: hotelId },
    data: {
      ...(data.name !== undefined && { name: data.name.trim() || "Untitled Hotel" }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.dates !== undefined && { dates: data.dates }),
      ...(data.contractedAttrition !== undefined && { contractedAttrition: data.contractedAttrition }),
    },
    include: { roomTypes: { orderBy: { sortOrder: "asc" } }, taxFees: { orderBy: { sortOrder: "asc" } } },
  })
  revalidatePath(`/projects/${projectId}`)
  return updated
}

export async function deleteHousingHotel(projectId: string, hotelId: string) {
  await verifyProjectAccess(projectId)
  const hotel = await prisma.housingHotel.findFirst({ where: { id: hotelId, projectId } })
  if (!hotel) throw new Error("Hotel not found")
  await prisma.housingHotel.delete({ where: { id: hotelId } })
  revalidatePath(`/projects/${projectId}`)
}

export async function createRoomType(projectId: string, hotelId: string, name: string) {
  await verifyProjectAccess(projectId)
  const hotel = await prisma.housingHotel.findFirst({ where: { id: hotelId, projectId } })
  if (!hotel) throw new Error("Hotel not found")
  const maxOrder = await prisma.housingRoomType.aggregate({
    where: { hotelId },
    _max: { sortOrder: true },
  })
  const roomType = await prisma.housingRoomType.create({
    data: {
      hotelId,
      name: name.trim() || "Untitled Room Type",
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
    },
  })
  revalidatePath(`/projects/${projectId}`)
  return roomType
}

export async function updateRoomType(
  projectId: string,
  hotelId: string,
  roomTypeId: string,
  data: { name?: string; minNightStay?: number; description?: string; inventory?: Record<string, { rate: number; rooms: number }> }
) {
  await verifyProjectAccess(projectId)
  const hotel = await prisma.housingHotel.findFirst({ where: { id: hotelId, projectId } })
  if (!hotel) throw new Error("Hotel not found")
  const roomType = await prisma.housingRoomType.findFirst({ where: { id: roomTypeId, hotelId } })
  if (!roomType) throw new Error("Room type not found")
  const updated = await prisma.housingRoomType.update({
    where: { id: roomTypeId },
    data: {
      ...(data.name !== undefined && { name: data.name.trim() || "Untitled Room Type" }),
      ...(data.minNightStay !== undefined && { minNightStay: data.minNightStay }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.inventory !== undefined && { inventory: data.inventory }),
    },
  })
  revalidatePath(`/projects/${projectId}`)
  return updated
}

export async function deleteRoomType(projectId: string, hotelId: string, roomTypeId: string) {
  await verifyProjectAccess(projectId)
  const hotel = await prisma.housingHotel.findFirst({ where: { id: hotelId, projectId } })
  if (!hotel) throw new Error("Hotel not found")
  const roomType = await prisma.housingRoomType.findFirst({ where: { id: roomTypeId, hotelId } })
  if (!roomType) throw new Error("Room type not found")
  await prisma.housingRoomType.delete({ where: { id: roomTypeId } })
  revalidatePath(`/projects/${projectId}`)
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

function fuzzyMatchKey(input: string, keys: string[]): string | undefined {
  const normalized = input.toLowerCase().trim()
  if (keys.includes(normalized)) return normalized
  const threshold = Math.max(2, Math.floor(normalized.length * 0.3))
  let bestKey: string | undefined
  let bestDist = Infinity
  for (const key of keys) {
    const dist = levenshtein(normalized, key)
    if (dist < bestDist && dist <= threshold) {
      bestDist = dist
      bestKey = key
    }
  }
  return bestKey
}

function resolveHotelAndRate(
  g: { hotel?: string; roomType?: string },
  hotelNameMap: Map<string, { id: string; roomTypes: { id: string; name: string }[] }>
): { hotelId: string | null; rate: string } {
  let hotelId: string | null = null
  let rate = ""

  if (g.hotel) {
    const hotelKeys = Array.from(hotelNameMap.keys())
    const matchedKey = fuzzyMatchKey(g.hotel, hotelKeys)
    const matched = matchedKey ? hotelNameMap.get(matchedKey) : undefined
    if (matched) {
      hotelId = matched.id
      if (g.roomType) {
        const rtNames = matched.roomTypes.map((rt) => rt.name.toLowerCase().trim())
        const matchedRtKey = fuzzyMatchKey(g.roomType, rtNames)
        const matchedRt = matchedRtKey
          ? matched.roomTypes.find((rt) => rt.name.toLowerCase().trim() === matchedRtKey)
          : undefined
        rate = matchedRt ? matchedRt.name : g.roomType
      }
    }
  }

  return { hotelId, rate }
}

function parseDateToISO(dateStr: string, yearHint?: number): string | null {
  if (!dateStr) return null
  const cleaned = dateStr.trim()
  const isoMatch = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`
  const usMatch = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (usMatch) {
    const year = usMatch[3].length === 2 ? `20${usMatch[3]}` : usMatch[3]
    return `${year}-${usMatch[1].padStart(2, "0")}-${usMatch[2].padStart(2, "0")}`
  }
  const noYearMatch = cleaned.match(/^(?:[A-Za-z]+\s+)?(\d{1,2})[\/\-](\d{1,2})$/)
  if (noYearMatch) {
    const year = yearHint || new Date().getFullYear()
    return `${year}-${noYearMatch[1].padStart(2, "0")}-${noYearMatch[2].padStart(2, "0")}`
  }
  const d = new Date(cleaned)
  if (!isNaN(d.getTime())) {
    return d.toISOString().split("T")[0]
  }
  return null
}

function generateNightsBetween(checkIn: string, checkOut: string, yearHint?: number): Record<string, boolean> {
  const start = parseDateToISO(checkIn, yearHint)
  const end = parseDateToISO(checkOut, yearHint)
  if (!start || !end) return {}
  const nights: Record<string, boolean> = {}
  const current = new Date(start + "T12:00:00Z")
  const last = new Date(end + "T12:00:00Z")
  while (current < last) {
    nights[current.toISOString().split("T")[0]] = true
    current.setUTCDate(current.getUTCDate() + 1)
  }
  return nights
}

export async function importGuestsFromSheet(
  projectId: string,
  listId: string,
  guests: { firstName: string; lastName: string; email: string; company: string; role: string; wwid?: string; hotel?: string; roomType?: string; checkIn?: string; checkOut?: string }[],
  mode: "replace" | "merge" = "replace"
) {
  await verifyProjectAccess(projectId)
  const list = await prisma.roomingList.findFirst({ where: { id: listId, projectId } })
  if (!list) throw new Error("Rooming list not found")

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { startDate: true } })
  const yearHint = project?.startDate ? new Date(project.startDate).getFullYear() : new Date().getFullYear()

  const hotels = await prisma.housingHotel.findMany({
    where: { projectId },
    include: { roomTypes: true },
  })

  const hotelNameMap = new Map<string, { id: string; roomTypes: { id: string; name: string }[] }>()
  for (const h of hotels) {
    hotelNameMap.set(h.name.toLowerCase().trim(), { id: h.id, roomTypes: h.roomTypes })
  }

  console.log(`[Housing Import] mode=${mode}, guests=${guests.length}, hotels=${hotels.length}`)
  const sampleGuest = guests[0]
  if (sampleGuest) {
    console.log(`[Housing Import] Sample guest: hotel="${sampleGuest.hotel}", roomType="${sampleGuest.roomType}", email="${sampleGuest.email}"`)
  }
  console.log(`[Housing Import] Hotel map keys:`, Array.from(hotelNameMap.keys()))

  if (mode === "merge") {
    const existingGuests = await prisma.roomingListGuest.findMany({
      where: { roomingListId: listId },
    })

    const emailIndex = new Map<string, typeof existingGuests[0]>()
    const nameIndex = new Map<string, typeof existingGuests[0]>()
    for (const eg of existingGuests) {
      if (eg.email) emailIndex.set(eg.email.toLowerCase().trim(), eg)
      const nameKey = `${eg.firstName.toLowerCase().trim()}|${eg.lastName.toLowerCase().trim()}`
      if (nameKey !== "|") nameIndex.set(nameKey, eg)
    }

    const ops: any[] = []
    let updated = 0
    let added = 0

    for (const g of guests) {
      let existing: typeof existingGuests[0] | undefined
      if (g.email) existing = emailIndex.get(g.email.toLowerCase().trim())
      if (!existing) {
        const nameKey = `${g.firstName.toLowerCase().trim()}|${g.lastName.toLowerCase().trim()}`
        if (nameKey !== "|") existing = nameIndex.get(nameKey)
      }

      const { hotelId, rate } = resolveHotelAndRate(g, hotelNameMap)

      const importedNights = (g.checkIn && g.checkOut) ? generateNightsBetween(g.checkIn, g.checkOut, yearHint) : {}

      if (existing) {
        const updateData: Record<string, any> = {}
        if (g.email && g.email !== existing.email) updateData.email = g.email
        if (g.company && g.company !== existing.company) updateData.company = g.company
        if (g.role && g.role !== existing.role) updateData.role = g.role
        if (g.wwid && g.wwid !== existing.wwid) updateData.wwid = g.wwid
        if (hotelId && hotelId !== existing.hotelId) updateData.hotelId = hotelId
        if (rate && rate !== existing.rate) updateData.rate = rate

        if (Object.keys(importedNights).length > 0) {
          const existingNights = (existing.nights as Record<string, boolean>) || {}
          updateData.nights = { ...existingNights, ...importedNights }
        }

        if (Object.keys(updateData).length > 0) {
          ops.push(prisma.roomingListGuest.update({ where: { id: existing.id }, data: updateData }))
          updated++
        }
      } else {
        const maxSort = existingGuests.length + added
        ops.push(prisma.roomingListGuest.create({
          data: {
            roomingListId: listId,
            firstName: g.firstName,
            lastName: g.lastName,
            email: g.email,
            company: g.company,
            role: g.role,
            wwid: g.wwid || "",
            hotelId,
            rate,
            nights: Object.keys(importedNights).length > 0 ? importedNights : {},
            sortOrder: maxSort,
          },
        }))
        added++
      }
    }

    if (ops.length > 0) await prisma.$transaction(ops)

    const allImportedDates = new Set<string>()
    for (const g of guests) {
      if (g.checkIn && g.checkOut) {
        const nights = generateNightsBetween(g.checkIn, g.checkOut, yearHint)
        Object.keys(nights).forEach((d) => allImportedDates.add(d))
      }
    }
    if (allImportedDates.size > 0) {
      const currentDates = (list.dates as string[]) || []
      const merged = Array.from(new Set([...currentDates, ...allImportedDates])).sort()
      if (merged.length > currentDates.length) {
        await prisma.roomingList.update({ where: { id: listId }, data: { dates: merged } })
      }
    }

    revalidatePath(`/projects/${projectId}`)
    return { count: guests.length, updated, added }
  }

  await prisma.roomingListGuest.deleteMany({ where: { roomingListId: listId } })

  const createOps = guests.map((g, i) => {
    const { hotelId, rate } = resolveHotelAndRate(g, hotelNameMap)
    const importedNights = (g.checkIn && g.checkOut) ? generateNightsBetween(g.checkIn, g.checkOut, yearHint) : {}

    return prisma.roomingListGuest.create({
      data: {
        roomingListId: listId,
        firstName: g.firstName,
        lastName: g.lastName,
        email: g.email,
        company: g.company,
        role: g.role,
        wwid: g.wwid || "",
        hotelId,
        rate,
        nights: Object.keys(importedNights).length > 0 ? importedNights : {},
        sortOrder: i,
      },
    })
  })

  await prisma.$transaction(createOps)

  const allImportedDates = new Set<string>()
  for (const g of guests) {
    if (g.checkIn && g.checkOut) {
      const nights = generateNightsBetween(g.checkIn, g.checkOut, yearHint)
      Object.keys(nights).forEach((d) => allImportedDates.add(d))
    }
  }
  if (allImportedDates.size > 0) {
    const currentDates = (list.dates as string[]) || []
    const merged = Array.from(new Set([...currentDates, ...allImportedDates])).sort()
    if (merged.length > currentDates.length) {
      await prisma.roomingList.update({ where: { id: listId }, data: { dates: merged } })
    }
  }

  revalidatePath(`/projects/${projectId}`)
  return { count: guests.length, updated: 0, added: guests.length }
}

export async function createTaxFee(projectId: string, hotelId: string, name: string) {
  await verifyProjectAccess(projectId)
  const hotel = await prisma.housingHotel.findFirst({ where: { id: hotelId, projectId } })
  if (!hotel) throw new Error("Hotel not found")
  const maxOrder = await prisma.housingTaxFee.aggregate({
    where: { hotelId },
    _max: { sortOrder: true },
  })
  const taxFee = await prisma.housingTaxFee.create({
    data: {
      hotelId,
      name: name.trim() || "New Tax/Fee",
      type: "PERCENTAGE",
      value: 0,
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
    },
  })
  revalidatePath(`/projects/${projectId}`)
  return taxFee
}

export async function updateTaxFee(
  projectId: string,
  hotelId: string,
  taxFeeId: string,
  data: { name?: string; type?: string; value?: number }
) {
  await verifyProjectAccess(projectId)
  const hotel = await prisma.housingHotel.findFirst({ where: { id: hotelId, projectId } })
  if (!hotel) throw new Error("Hotel not found")
  const taxFee = await prisma.housingTaxFee.findFirst({ where: { id: taxFeeId, hotelId } })
  if (!taxFee) throw new Error("Tax/fee not found")
  if (data.type !== undefined && !["PERCENTAGE", "FLAT"].includes(data.type)) {
    throw new Error("Invalid tax/fee type")
  }
  const updated = await prisma.housingTaxFee.update({
    where: { id: taxFeeId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.type !== undefined && { type: data.type }),
      ...(data.value !== undefined && { value: data.value }),
    },
  })
  revalidatePath(`/projects/${projectId}`)
  return updated
}

export async function deleteTaxFee(projectId: string, hotelId: string, taxFeeId: string) {
  await verifyProjectAccess(projectId)
  const hotel = await prisma.housingHotel.findFirst({ where: { id: hotelId, projectId } })
  if (!hotel) throw new Error("Hotel not found")
  const taxFee = await prisma.housingTaxFee.findFirst({ where: { id: taxFeeId, hotelId } })
  if (!taxFee) throw new Error("Tax/fee not found")
  await prisma.housingTaxFee.delete({ where: { id: taxFeeId } })
  revalidatePath(`/projects/${projectId}`)
}
