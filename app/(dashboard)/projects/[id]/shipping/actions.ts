"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireAuthWithOrg } from "@/lib/session";
import { ShippingItemType, ShippingStatus, ShippingCarrier } from "@prisma/client";
import { trackPackage, TrackingResult } from "@/lib/postal-ninja";

export interface ShippingItemData {
  item: string;
  type?: ShippingItemType | null;
  vendor?: string | null;
  quantity?: number;
  purchaserId?: string | null;
  orderNumber?: string | null;
  status?: ShippingStatus;
  deliveringToVendorId?: string | null;
  estimatedDeliveryDate?: Date | null;
  carrier?: ShippingCarrier | null;
  trackingNumber?: string | null;
  postEvent?: string | null;
  notes?: string | null;
}

export interface PersonOption {
  id: string;
  name: string;
}

export interface VendorOption {
  id: string;
  name: string;
}

export async function getShippingItems(projectId: string) {
  const user = await requireAuthWithOrg();

  const project = await prisma.project.findFirst({
    where: { 
      id: projectId, 
      organizationId: user.organizationId 
    },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  const items = await prisma.shippingItem.findMany({
    where: { projectId },
    include: {
      purchaser: {
        select: {
          id: true,
          name: true,
        },
      },
      deliveringToVendor: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return items;
}

export async function getPeopleForDropdown(organizationId: string): Promise<PersonOption[]> {
  const user = await requireAuthWithOrg();

  if (user.organizationId !== organizationId) {
    throw new Error("Unauthorized");
  }

  const people = await prisma.person.findMany({
    where: { organizationId },
    select: {
      id: true,
      name: true,
    },
    orderBy: { name: "asc" },
  });

  return people;
}

export async function getVendorsForDropdown(organizationId: string): Promise<VendorOption[]> {
  const user = await requireAuthWithOrg();

  if (user.organizationId !== organizationId) {
    throw new Error("Unauthorized");
  }

  const vendors = await prisma.vendor.findMany({
    where: { organizationId },
    select: {
      id: true,
      name: true,
    },
    orderBy: { name: "asc" },
  });

  return vendors;
}

export async function createShippingItem(projectId: string, data: ShippingItemData) {
  const user = await requireAuthWithOrg();

  const project = await prisma.project.findFirst({
    where: { 
      id: projectId, 
      organizationId: user.organizationId 
    },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  const item = await prisma.shippingItem.create({
    data: {
      projectId,
      item: data.item,
      type: data.type || null,
      vendor: data.vendor || null,
      quantity: data.quantity ?? 1,
      purchaserId: data.purchaserId || null,
      orderNumber: data.orderNumber || null,
      status: data.status ?? "Ordered",
      deliveringToVendorId: data.deliveringToVendorId || null,
      estimatedDeliveryDate: data.estimatedDeliveryDate || null,
      carrier: data.carrier || null,
      trackingNumber: data.trackingNumber || null,
      postEvent: data.postEvent || null,
      notes: data.notes || null,
    },
  });

  revalidatePath(`/projects/${projectId}/shipping`);
  return item;
}

export async function updateShippingItem(id: string, data: Partial<ShippingItemData>) {
  const user = await requireAuthWithOrg();

  const item = await prisma.shippingItem.findUnique({
    where: { id },
    include: { project: true },
  });

  if (!item || item.project.organizationId !== user.organizationId) {
    throw new Error("Shipping item not found");
  }

  const updated = await prisma.shippingItem.update({
    where: { id },
    data: {
      item: data.item,
      type: data.type,
      vendor: data.vendor,
      quantity: data.quantity,
      purchaserId: data.purchaserId,
      orderNumber: data.orderNumber,
      status: data.status,
      deliveringToVendorId: data.deliveringToVendorId,
      estimatedDeliveryDate: data.estimatedDeliveryDate,
      carrier: data.carrier,
      trackingNumber: data.trackingNumber,
      postEvent: data.postEvent,
      notes: data.notes,
    },
  });

  revalidatePath(`/projects/${item.projectId}/shipping`);
  return updated;
}

export async function deleteShippingItem(id: string) {
  const user = await requireAuthWithOrg();

  const item = await prisma.shippingItem.findUnique({
    where: { id },
    include: { project: true },
  });

  if (!item || item.project.organizationId !== user.organizationId) {
    throw new Error("Shipping item not found");
  }

  await prisma.shippingItem.delete({ where: { id } });

  revalidatePath(`/projects/${item.projectId}/shipping`);
}

export interface TrackingInfo {
  success: boolean;
  carrier?: string;
  status?: string;
  estimatedDelivery?: string | null;
  lastUpdate?: string;
  error?: string;
  updated?: boolean;
}

export async function lookupTrackingInfo(shippingItemId: string): Promise<TrackingInfo> {
  const user = await requireAuthWithOrg();

  const item = await prisma.shippingItem.findUnique({
    where: { id: shippingItemId },
    include: { project: true },
  });

  if (!item || item.project.organizationId !== user.organizationId) {
    return { success: false, error: "Shipping item not found" };
  }

  if (!item.trackingNumber) {
    return { success: false, error: "No tracking number provided" };
  }

  const result = await trackPackage(item.trackingNumber);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  let updated = false;
  const updateData: { estimatedDeliveryDate?: Date; status?: ShippingStatus; carrier?: ShippingCarrier } = {};

  if (result.estimatedDelivery) {
    updateData.estimatedDeliveryDate = result.estimatedDelivery;
    updated = true;
  }

  if (result.status) {
    const statusLower = result.status.toLowerCase();
    if (statusLower.includes("deliver")) {
      updateData.status = "Delivered";
      updated = true;
    } else if (statusLower.includes("transit") || statusLower.includes("ship")) {
      updateData.status = "Shipped";
      updated = true;
    }
  }

  if (result.carrier && !item.carrier) {
    const carrierLower = result.carrier.toLowerCase();
    let detectedCarrier: ShippingCarrier | undefined;
    
    if (carrierLower.includes("usps") || carrierLower.includes("postal")) {
      detectedCarrier = "USPS";
    } else if (carrierLower.includes("fedex")) {
      detectedCarrier = "FedEx";
    } else if (carrierLower.includes("ups")) {
      detectedCarrier = "UPS";
    } else if (carrierLower.includes("dhl")) {
      detectedCarrier = "DHL";
    } else if (carrierLower.includes("amazon")) {
      detectedCarrier = "Amazon";
    } else if (result.carrier) {
      detectedCarrier = "Other";
    }
    
    if (detectedCarrier) {
      updateData.carrier = detectedCarrier;
      updated = true;
    }
  }

  if (updated) {
    await prisma.shippingItem.update({
      where: { id: shippingItemId },
      data: updateData,
    });
    revalidatePath(`/projects/${item.projectId}/shipping`);
  }

  return {
    success: true,
    carrier: result.carrier,
    status: result.status,
    estimatedDelivery: result.estimatedDelivery?.toISOString() || null,
    lastUpdate: result.lastUpdate,
    updated,
  };
}

export async function refreshAllTrackingForProject(projectId: string): Promise<{
  success: boolean;
  updated: number;
  failed: number;
  errors: string[];
}> {
  const user = await requireAuthWithOrg();

  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: user.organizationId },
  });

  if (!project) {
    return { success: false, updated: 0, failed: 0, errors: ["Project not found"] };
  }

  const items = await prisma.shippingItem.findMany({
    where: {
      projectId,
      trackingNumber: { not: null },
      status: { not: "Delivered" },
    },
  });

  let updated = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const item of items) {
    if (!item.trackingNumber) continue;

    try {
      const result = await trackPackage(item.trackingNumber);

      if (result.success) {
        const updateData: { estimatedDeliveryDate?: Date; status?: ShippingStatus; carrier?: ShippingCarrier } = {};
        let shouldUpdate = false;

        if (result.estimatedDelivery) {
          updateData.estimatedDeliveryDate = result.estimatedDelivery;
          shouldUpdate = true;
        }

        if (result.status) {
          const statusLower = result.status.toLowerCase();
          if (statusLower.includes("deliver")) {
            updateData.status = "Delivered";
            shouldUpdate = true;
          } else if (statusLower.includes("transit") || statusLower.includes("ship")) {
            updateData.status = "Shipped";
            shouldUpdate = true;
          }
        }

        if (result.carrier && !item.carrier) {
          const carrierLower = result.carrier.toLowerCase();
          let detectedCarrier: ShippingCarrier | undefined;
          
          if (carrierLower.includes("usps") || carrierLower.includes("postal")) {
            detectedCarrier = "USPS";
          } else if (carrierLower.includes("fedex")) {
            detectedCarrier = "FedEx";
          } else if (carrierLower.includes("ups")) {
            detectedCarrier = "UPS";
          } else if (carrierLower.includes("dhl")) {
            detectedCarrier = "DHL";
          } else if (carrierLower.includes("amazon")) {
            detectedCarrier = "Amazon";
          } else if (result.carrier) {
            detectedCarrier = "Other";
          }
          
          if (detectedCarrier) {
            updateData.carrier = detectedCarrier;
            shouldUpdate = true;
          }
        }

        if (shouldUpdate) {
          await prisma.shippingItem.update({
            where: { id: item.id },
            data: updateData,
          });
          updated++;
        }
      } else {
        failed++;
        errors.push(`${item.trackingNumber}: ${result.error}`);
      }
    } catch (error) {
      failed++;
      errors.push(`${item.trackingNumber}: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  revalidatePath(`/projects/${projectId}/shipping`);

  return { success: true, updated, failed, errors };
}
