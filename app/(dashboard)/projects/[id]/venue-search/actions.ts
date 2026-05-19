"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { revalidatePath } from "next/cache";

export async function getVenueSearches(projectId: string) {
  const user = await requireAuth();
  if (!user.organizationId) {
    throw new Error("Unauthorized");
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: user.organizationId },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  const venueSearches = await prisma.venueSearch.findMany({
    where: { projectId },
    include: {
      entries: {
        include: { vendor: true },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return venueSearches;
}

export async function createVenueSearch(data: {
  projectId: string;
  name: string;
  startDate: Date;
  endDate: Date;
}) {
  const user = await requireAuth();
  if (!user.organizationId) {
    throw new Error("Unauthorized");
  }

  const project = await prisma.project.findFirst({
    where: { id: data.projectId, organizationId: user.organizationId },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  const venueSearch = await prisma.venueSearch.create({
    data: {
      projectId: data.projectId,
      name: data.name,
      startDate: data.startDate,
      endDate: data.endDate,
    },
    include: {
      entries: {
        include: { vendor: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  revalidatePath(`/projects/${data.projectId}`);
  return venueSearch;
}

export async function deleteVenueSearch(id: string) {
  const user = await requireAuth();
  if (!user.organizationId) {
    throw new Error("Unauthorized");
  }

  const venueSearch = await prisma.venueSearch.findFirst({
    where: { id },
    include: { project: { select: { organizationId: true, id: true } } },
  });

  if (!venueSearch || venueSearch.project.organizationId !== user.organizationId) {
    throw new Error("Venue Search not found");
  }

  await prisma.venueSearch.delete({ where: { id } });

  revalidatePath(`/projects/${venueSearch.project.id}`);
}

export async function addVenueEntry(venueSearchId: string) {
  const user = await requireAuth();
  if (!user.organizationId) {
    throw new Error("Unauthorized");
  }

  const venueSearch = await prisma.venueSearch.findFirst({
    where: { id: venueSearchId },
    include: {
      project: { select: { organizationId: true, id: true } },
      entries: { select: { sortOrder: true }, orderBy: { sortOrder: "desc" }, take: 1 },
    },
  });

  if (!venueSearch || venueSearch.project.organizationId !== user.organizationId) {
    throw new Error("Venue Search not found");
  }

  const maxSortOrder = venueSearch.entries[0]?.sortOrder ?? -1;

  const entry = await prisma.venueSearchEntry.create({
    data: {
      venueSearchId,
      sortOrder: maxSortOrder + 1,
    },
    include: { vendor: true },
  });

  revalidatePath(`/projects/${venueSearch.project.id}`);
  return entry;
}

export async function updateVenueEntry(
  id: string,
  data: {
    brand?: string | null;
    state?: string | null;
    city?: string | null;
    hotelName?: string | null;
    starRating?: string | null;
    comment?: string | null;
    date1Available?: string | null;
    date2Available?: string | null;
    date3Available?: string | null;
    date4Available?: string | null;
    date5Available?: string | null;
    contactName?: string | null;
    contactTitle?: string | null;
    contactPhone?: string | null;
    contactEmail?: string | null;
    totalSleepingRooms?: string | null;
    lastRenovated?: string | null;
    rate?: string | null;
    resortFee?: string | null;
    housekeepingCharge?: string | null;
    inRoomWifi?: string | null;
    attrition?: string | null;
    earnedComps?: string | null;
    unionStatus?: string | null;
    fbMinimum?: string | null;
    functionSpaceRental?: string | null;
    cateringMenuDiscount?: string | null;
    rebate?: string | null;
    exclusiveVendors?: string | null;
    avDiscount?: string | null;
    parkingFees?: string | null;
    siteVisitNights?: string | null;
    distanceFromAirport?: string | null;
    biggestFunctionRoom?: string | null;
    floorPlanLink?: string | null;
    capacityChartLink?: string | null;
  }
) {
  const user = await requireAuth();
  if (!user.organizationId) {
    throw new Error("Unauthorized");
  }

  const entry = await prisma.venueSearchEntry.findFirst({
    where: { id },
    include: {
      venueSearch: {
        include: { project: { select: { organizationId: true, id: true } } },
      },
    },
  });

  if (!entry || entry.venueSearch.project.organizationId !== user.organizationId) {
    throw new Error("Venue entry not found");
  }

  let vendorId = entry.vendorId;

  // Handle vendor auto-creation/linking when hotelName changes
  if (data.hotelName !== undefined) {
    const hotelName = data.hotelName?.trim() || "";
    
    if (hotelName === "") {
      // Clear vendor link when hotel name is cleared
      vendorId = null;
    } else {
      // Check for existing vendor with exact name and Venue category
      const existingVendor = await prisma.vendor.findFirst({
        where: {
          organizationId: user.organizationId,
          name: { equals: hotelName, mode: "insensitive" },
        },
      });

      // Check if existing vendor has Venue category
      if (existingVendor) {
        const categories = existingVendor.categories?.split(",").map(c => c.trim().toLowerCase()) || [];
        if (categories.includes("venue")) {
          vendorId = existingVendor.id;
        } else {
          // Update existing vendor to include Venue category
          const updatedCategories = existingVendor.categories 
            ? `${existingVendor.categories}, Venue` 
            : "Venue";
          await prisma.vendor.update({
            where: { id: existingVendor.id },
            data: { categories: updatedCategories },
          });
          vendorId = existingVendor.id;
        }
      } else {
        // Create new vendor with Venue category
        const newVendor = await prisma.vendor.create({
          data: {
            name: hotelName,
            categories: "Venue",
            organizationId: user.organizationId,
          },
        });
        vendorId = newVendor.id;
      }
    }
  }

  const updated = await prisma.venueSearchEntry.update({
    where: { id },
    data: {
      ...data,
      vendorId,
    },
    include: { vendor: true },
  });

  revalidatePath(`/projects/${entry.venueSearch.project.id}`);
  return updated;
}

export async function deleteVenueEntry(id: string) {
  const user = await requireAuth();
  if (!user.organizationId) {
    throw new Error("Unauthorized");
  }

  const entry = await prisma.venueSearchEntry.findFirst({
    where: { id },
    include: {
      venueSearch: {
        include: { project: { select: { organizationId: true, id: true } } },
      },
    },
  });

  if (!entry || entry.venueSearch.project.organizationId !== user.organizationId) {
    throw new Error("Venue entry not found");
  }

  await prisma.venueSearchEntry.delete({ where: { id } });

  revalidatePath(`/projects/${entry.venueSearch.project.id}`);
}
