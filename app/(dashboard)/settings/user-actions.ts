"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { requireAuthWithOrg } from "@/lib/session"

async function verifyUserInOrg(userId: string, organizationId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId }
  })
  if (!user) {
    throw new Error("User not found")
  }
  return user
}

export async function getUsers() {
  const user = await requireAuthWithOrg()
  
  if (user.role !== "ADMIN") {
    throw new Error("Unauthorized")
  }

  const users = await prisma.user.findMany({
    where: { organizationId: user.organizationId },
    select: {
      id: true,
      email: true,
      name: true,
      firstName: true,
      lastName: true,
      profileImageUrl: true,
      role: true,
      approvalStatus: true,
      approvedAt: true,
      createdAt: true,
      approvedBy: {
        select: { name: true, email: true }
      }
    },
    orderBy: [
      { approvalStatus: 'asc' },
      { createdAt: 'desc' }
    ]
  })

  return users
}

export async function approveUser(userId: string, role: 'ADMIN' | 'MEMBER' | 'EXTERNAL' | 'CLIENT' = 'MEMBER') {
  const currentUser = await requireAuthWithOrg()
  
  if (currentUser.role !== "ADMIN") {
    throw new Error("Unauthorized")
  }

  await verifyUserInOrg(userId, currentUser.organizationId)

  await prisma.user.update({
    where: { id: userId },
    data: {
      approvalStatus: "APPROVED",
      approvedById: currentUser.id,
      approvedAt: new Date(),
      role: role,
    }
  })

  revalidatePath("/settings")
  return { success: true }
}

export async function denyUser(userId: string) {
  const currentUser = await requireAuthWithOrg()
  
  if (currentUser.role !== "ADMIN") {
    throw new Error("Unauthorized")
  }

  if (userId === currentUser.id) {
    throw new Error("You cannot deny your own access")
  }

  await verifyUserInOrg(userId, currentUser.organizationId)

  await prisma.user.update({
    where: { id: userId },
    data: {
      approvalStatus: "DENIED",
      approvedById: currentUser.id,
      approvedAt: new Date(),
    }
  })

  revalidatePath("/settings")
  return { success: true }
}

export async function updateUserRole(userId: string, role: 'ADMIN' | 'MEMBER' | 'EXTERNAL' | 'CLIENT') {
  const currentUser = await requireAuthWithOrg()
  
  if (currentUser.role !== "ADMIN") {
    throw new Error("Unauthorized")
  }

  if (userId === currentUser.id && role === 'MEMBER') {
    const adminCount = await prisma.user.count({
      where: {
        organizationId: currentUser.organizationId,
        role: 'ADMIN',
        approvalStatus: 'APPROVED'
      }
    })
    if (adminCount <= 1) {
      throw new Error("Cannot demote - you are the only admin")
    }
  }

  await verifyUserInOrg(userId, currentUser.organizationId)

  await prisma.user.update({
    where: { id: userId },
    data: { role }
  })

  revalidatePath("/settings")
  return { success: true }
}

export async function revokeAccess(userId: string) {
  const currentUser = await requireAuthWithOrg()
  
  if (currentUser.role !== "ADMIN") {
    throw new Error("Unauthorized")
  }

  if (userId === currentUser.id) {
    throw new Error("You cannot revoke your own access")
  }

  await verifyUserInOrg(userId, currentUser.organizationId)

  await prisma.user.update({
    where: { id: userId },
    data: { approvalStatus: "DENIED" }
  })

  revalidatePath("/settings")
  return { success: true }
}
