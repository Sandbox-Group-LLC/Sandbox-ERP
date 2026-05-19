"use server"

import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/session"
import { revalidatePath } from "next/cache"

export async function updateOrganization(organizationId: string, name: string) {
  const user = await requireAuth()

  if (user.role !== "ADMIN") {
    return { success: false, error: "You don't have permission to update organization settings" }
  }

  if (user.organizationId !== organizationId) {
    return { success: false, error: "Invalid organization" }
  }

  try {
    await prisma.organization.update({
      where: { id: organizationId },
      data: { name },
    })

    revalidatePath("/settings")
    revalidatePath("/")
    
    return { success: true }
  } catch (error) {
    console.error("Failed to update organization:", error)
    return { success: false, error: "Failed to update organization" }
  }
}

export async function getStaffingRoles() {
  const user = await requireAuth()

  if (!user.organizationId) {
    return []
  }

  const roles = await prisma.staffingRole.findMany({
    where: { organizationId: user.organizationId },
    include: {
      roleRate: true,
      _count: {
        select: {
          allocations: true,
          budgetLineLinks: true,
        },
      },
    },
    orderBy: { name: "asc" },
  })

  return roles
}

export async function createStaffingRole(name: string, internalRate: number) {
  const user = await requireAuth()

  if (user.role !== "ADMIN") {
    return { success: false, error: "You don't have permission to manage staffing roles" }
  }

  if (!user.organizationId) {
    return { success: false, error: "No organization found" }
  }

  if (!name.trim()) {
    return { success: false, error: "Role name is required" }
  }

  if (internalRate < 0) {
    return { success: false, error: "Rate cannot be negative" }
  }

  try {
    const existingRole = await prisma.staffingRole.findUnique({
      where: {
        organizationId_name: {
          organizationId: user.organizationId,
          name: name.trim(),
        },
      },
    })

    if (existingRole) {
      return { success: false, error: "A role with this name already exists" }
    }

    const role = await prisma.staffingRole.create({
      data: {
        organizationId: user.organizationId,
        name: name.trim(),
      },
    })

    await prisma.roleRate.create({
      data: {
        roleId: role.id,
        organizationId: user.organizationId,
        internalRate,
      },
    })

    revalidatePath("/settings")
    return { success: true, roleId: role.id }
  } catch (error) {
    console.error("Failed to create staffing role:", error)
    return { success: false, error: "Failed to create staffing role" }
  }
}

export async function updateStaffingRole(roleId: string, name: string, internalRate: number) {
  const user = await requireAuth()

  if (user.role !== "ADMIN") {
    return { success: false, error: "You don't have permission to manage staffing roles" }
  }

  if (!user.organizationId) {
    return { success: false, error: "No organization found" }
  }

  if (!name.trim()) {
    return { success: false, error: "Role name is required" }
  }

  if (internalRate < 0) {
    return { success: false, error: "Rate cannot be negative" }
  }

  try {
    const role = await prisma.staffingRole.findFirst({
      where: { id: roleId, organizationId: user.organizationId },
    })

    if (!role) {
      return { success: false, error: "Role not found" }
    }

    const existingRole = await prisma.staffingRole.findFirst({
      where: {
        organizationId: user.organizationId,
        name: name.trim(),
        id: { not: roleId },
      },
    })

    if (existingRole) {
      return { success: false, error: "A role with this name already exists" }
    }

    await prisma.staffingRole.update({
      where: { id: roleId },
      data: { name: name.trim() },
    })

    await prisma.roleRate.upsert({
      where: { roleId },
      update: { internalRate },
      create: {
        roleId,
        organizationId: user.organizationId,
        internalRate,
      },
    })

    revalidatePath("/settings")
    return { success: true }
  } catch (error) {
    console.error("Failed to update staffing role:", error)
    return { success: false, error: "Failed to update staffing role" }
  }
}

export async function deleteStaffingRole(roleId: string) {
  const user = await requireAuth()

  if (user.role !== "ADMIN") {
    return { success: false, error: "You don't have permission to manage staffing roles" }
  }

  if (!user.organizationId) {
    return { success: false, error: "No organization found" }
  }

  try {
    const role = await prisma.staffingRole.findFirst({
      where: { id: roleId, organizationId: user.organizationId },
      include: {
        _count: {
          select: {
            allocations: true,
            budgetLineLinks: true,
          },
        },
      },
    })

    if (!role) {
      return { success: false, error: "Role not found" }
    }

    if (role._count.allocations > 0) {
      return { 
        success: false, 
        error: `This role has ${role._count.allocations} staffing allocation(s). Remove them first before deleting the role.` 
      }
    }

    if (role._count.budgetLineLinks > 0) {
      return { 
        success: false, 
        error: `This role is linked to ${role._count.budgetLineLinks} budget line(s). Unlink them first before deleting the role.` 
      }
    }

    await prisma.staffingRole.delete({
      where: { id: roleId },
    })

    revalidatePath("/settings")
    return { success: true }
  } catch (error) {
    console.error("Failed to delete staffing role:", error)
    return { success: false, error: "Failed to delete staffing role" }
  }
}

export async function checkGoogleConnection(userId: string) {
  const user = await requireAuth()

  if (user.id !== userId) {
    return { success: false, isConnected: false, error: "Unauthorized" }
  }

  try {
    const userRecord = await prisma.user.findUnique({
      where: { id: userId },
      select: { googleAccessToken: true },
    })

    return { 
      success: true, 
      isConnected: !!userRecord?.googleAccessToken 
    }
  } catch (error) {
    console.error("Failed to check Google connection:", error)
    return { success: false, isConnected: false, error: "Failed to check connection" }
  }
}

export async function disconnectGoogleAccount(userId: string) {
  const user = await requireAuth()

  if (user.id !== userId) {
    return { success: false, error: "Unauthorized" }
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        googleAccessToken: null,
        googleRefreshToken: null,
        googleTokenExpiry: null,
      },
    })

    revalidatePath("/settings")
    return { success: true }
  } catch (error) {
    console.error("Failed to disconnect Google account:", error)
    return { success: false, error: "Failed to disconnect Google account" }
  }
}

export async function disconnectGoogleWorkspace(): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth()
    if (user.role !== "ADMIN") {
      return { success: false, error: "Only admins can disconnect Google Workspace" }
    }

    if (!user.organizationId) {
      return { success: false, error: "No organization found" }
    }

    await prisma.organization.update({
      where: { id: user.organizationId },
      data: {
        googleRefreshToken: null,
        googleAccessToken: null,
        googleTokenExpiry: null,
        googleConnectedEmail: null,
        googleConnectedAt: null,
      },
    })

    revalidatePath("/settings")
    return { success: true }
  } catch (error) {
    console.error("Failed to disconnect Google Workspace:", error)
    return { success: false, error: "Failed to disconnect Google Workspace" }
  }
}
