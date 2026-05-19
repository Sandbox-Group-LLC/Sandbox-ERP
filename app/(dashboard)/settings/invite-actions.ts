"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { requireAuthWithOrg } from "@/lib/session"
import { sendInviteEmail } from "@/lib/resend"

export async function createInvite(email: string, role: 'ADMIN' | 'MEMBER' | 'EXTERNAL' | 'CLIENT') {
  const currentUser = await requireAuthWithOrg()
  
  if (currentUser.role !== "ADMIN") {
    throw new Error("Unauthorized")
  }

  const normalizedEmail = email.toLowerCase().trim()

  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    throw new Error("Invalid email address")
  }

  const existingUser = await prisma.user.findFirst({
    where: {
      email: normalizedEmail,
      organizationId: currentUser.organizationId
    }
  })

  if (existingUser) {
    throw new Error("A user with this email already exists in your organization")
  }

  const existingPendingInvite = await prisma.userInvite.findFirst({
    where: {
      email: normalizedEmail,
      organizationId: currentUser.organizationId,
      acceptedAt: null,
      expiresAt: { gt: new Date() }
    }
  })

  if (existingPendingInvite) {
    throw new Error("An active invitation already exists for this email")
  }

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)

  const invite = await prisma.userInvite.create({
    data: {
      email: normalizedEmail,
      role,
      organizationId: currentUser.organizationId,
      invitedById: currentUser.id,
      expiresAt
    },
    include: {
      organization: true,
      invitedBy: true
    }
  })

  const inviterName = currentUser.name || currentUser.email || 'An administrator'
  
  await sendInviteEmail(
    normalizedEmail,
    inviterName,
    invite.organization.name,
    invite.token,
    role === 'ADMIN' ? 'Admin' : role === 'EXTERNAL' ? 'External' : role === 'CLIENT' ? 'Client' : 'Member'
  )

  revalidatePath("/settings")
  return { success: true }
}

export async function getInvites() {
  const user = await requireAuthWithOrg()
  
  if (user.role !== "ADMIN") {
    throw new Error("Unauthorized")
  }

  const invites = await prisma.userInvite.findMany({
    where: {
      organizationId: user.organizationId,
      acceptedAt: null
    },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      createdAt: true,
      invitedBy: {
        select: { name: true, email: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  })

  return invites
}

export async function revokeInvite(inviteId: string) {
  const currentUser = await requireAuthWithOrg()
  
  if (currentUser.role !== "ADMIN") {
    throw new Error("Unauthorized")
  }

  const invite = await prisma.userInvite.findFirst({
    where: {
      id: inviteId,
      organizationId: currentUser.organizationId,
      acceptedAt: null
    }
  })

  if (!invite) {
    throw new Error("Invite not found")
  }

  await prisma.userInvite.delete({
    where: { id: inviteId }
  })

  revalidatePath("/settings")
  return { success: true }
}

export async function resendInvite(inviteId: string) {
  const currentUser = await requireAuthWithOrg()
  
  if (currentUser.role !== "ADMIN") {
    throw new Error("Unauthorized")
  }

  const invite = await prisma.userInvite.findFirst({
    where: {
      id: inviteId,
      organizationId: currentUser.organizationId,
      acceptedAt: null
    },
    include: {
      organization: true
    }
  })

  if (!invite) {
    throw new Error("Invite not found")
  }

  const newExpiresAt = new Date()
  newExpiresAt.setDate(newExpiresAt.getDate() + 7)

  await prisma.userInvite.update({
    where: { id: inviteId },
    data: { expiresAt: newExpiresAt }
  })

  const inviterName = currentUser.name || currentUser.email || 'An administrator'
  
  await sendInviteEmail(
    invite.email,
    inviterName,
    invite.organization.name,
    invite.token,
    invite.role === 'ADMIN' ? 'Admin' : 'Member'
  )

  revalidatePath("/settings")
  return { success: true }
}
