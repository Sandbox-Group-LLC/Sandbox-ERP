import { getCurrentUser, SessionUser } from "@/lib/session"

export interface AuthenticatedUser extends SessionUser {
  organizationId: string
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const user = await getCurrentUser()
  if (!user || !user.organizationId || user.approvalStatus !== "APPROVED") {
    return null
  }
  return user as AuthenticatedUser
}
