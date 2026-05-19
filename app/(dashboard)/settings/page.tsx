import { requireAuth } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { SettingsForm } from "./settings-form"
import { StaffingRolesForm } from "./staffing-roles-form"
import { UserManagement } from "./user-management"
import { GoogleConnect } from "./google-connect"
import { GoogleWorkspaceConnect } from "./google-workspace-connect"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  const user = await requireAuth()

  if (user.role !== "ADMIN" && user.role !== "MEMBER") {
    return (
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-4 dark:text-white">Settings</h1>
        <p className="text-gray-500 dark:text-gray-400">You don't have permission to access this page.</p>
      </div>
    )
  }

  const userRecord = await prisma.user.findUnique({
    where: { id: user.id },
    select: { googleAccessToken: true },
  })

  const isGoogleConnected = !!userRecord?.googleAccessToken

  let orgGoogleWorkspace = { isConnected: false, connectedEmail: null as string | null, connectedAt: null as string | null }
  if (user.organizationId) {
    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { googleRefreshToken: true, googleConnectedEmail: true, googleConnectedAt: true },
    })
    if (org?.googleRefreshToken) {
      orgGoogleWorkspace = {
        isConnected: true,
        connectedEmail: org.googleConnectedEmail,
        connectedAt: org.googleConnectedAt?.toISOString() || null,
      }
    }
  }

  if (user.role === "MEMBER") {
    return (
      <div className="max-w-2xl mx-auto space-y-8">
        <h1 className="text-2xl font-bold dark:text-white">My Settings</h1>
        <GoogleConnect isConnected={isGoogleConnected} userId={user.id} />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold dark:text-white">Organization Settings</h1>
      
      <UserManagement currentUserId={user.id} />
      
      <SettingsForm 
        organizationId={user.organizationId!}
        currentName={user.organizationName || ""}
      />
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6">
        <StaffingRolesForm />
      </div>

      <GoogleWorkspaceConnect
        isConnected={orgGoogleWorkspace.isConnected}
        connectedEmail={orgGoogleWorkspace.connectedEmail}
        connectedAt={orgGoogleWorkspace.connectedAt}
      />

      <GoogleConnect isConnected={isGoogleConnected} userId={user.id} />
    </div>
  )
}
