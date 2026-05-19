"use server"

import { prisma } from "@/lib/prisma"
import { getUserWithOrganization } from "@/lib/replit-auth"
import { revalidatePath } from "next/cache"

export async function createOrganization(orgName: string): Promise<{ success: boolean; error?: string }> {
  const user = await getUserWithOrganization()

  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  if (user.organizationId) {
    return { success: false, error: "You already belong to an organization" }
  }

  const trimmed = orgName.trim()
  if (!trimmed || trimmed.length < 2) {
    return { success: false, error: "Organization name must be at least 2 characters" }
  }

  if (trimmed.length > 100) {
    return { success: false, error: "Organization name must be 100 characters or less" }
  }

  try {
    const organization = await prisma.organization.create({
      data: {
        name: trimmed,
      },
    })

    await prisma.user.update({
      where: { id: user.id },
      data: {
        organizationId: organization.id,
        role: "ADMIN",
        approvalStatus: "APPROVED",
      },
    })

    revalidatePath("/")
    return { success: true }
  } catch (error) {
    console.error("Failed to create organization:", error)
    return { success: false, error: "Failed to create organization. Please try again." }
  }
}
