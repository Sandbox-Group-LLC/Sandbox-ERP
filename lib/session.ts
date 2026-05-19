import { redirect } from "next/navigation"
import { getUserWithOrganization } from "@/lib/replit-auth"

export interface SessionUser {
  id: string
  email: string | null
  name: string | null
  role: string
  organizationId: string | null
  organizationName: string | null
  approvalStatus: string
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const user = await getUserWithOrganization()
  if (!user) {
    return null
  }
  return {
    id: user.id,
    email: user.email,
    name: user.name || user.firstName || user.email?.split("@")[0] || "User",
    role: user.role,
    organizationId: user.organizationId,
    organizationName: user.organization?.name || null,
    approvalStatus: user.approvalStatus,
  }
}

export async function requireAuth(): Promise<SessionUser> {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }
  return user
}

export interface AuthenticatedUser extends SessionUser {
  organizationId: string
}

export async function requireAuthWithOrg(): Promise<AuthenticatedUser> {
  const user = await requireAuth()
  if (!user.organizationId) {
    throw new Error("Organization not found")
  }
  return user as AuthenticatedUser
}
