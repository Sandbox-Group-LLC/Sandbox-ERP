import { redirect } from "next/navigation"
import { getUserWithOrganization } from "@/lib/replit-auth"
import { Sidebar } from "@/components/sidebar"
import { TopHeader } from "@/components/top-header"

export const metadata = {
  title: "Sandbox ERP",
  description: "Event agency project management",
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getUserWithOrganization()
  
  if (!user) {
    redirect("/login")
  }
  
  if (!user.organizationId) {
    redirect("/onboarding")
  }

  if (user.approvalStatus !== "APPROVED") {
    redirect("/pending-approval")
  }
  
  // Build the session user object for the sidebar
  const sessionUser = {
    id: user.id,
    email: user.email,
    name: user.name || user.firstName || user.email?.split("@")[0] || "User",
    role: user.role,
    organizationId: user.organizationId,
    organizationName: user.organization?.name || null,
    approvalStatus: user.approvalStatus,
  }

  return (
    <div className="flex h-screen">
      <Sidebar user={sessionUser} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopHeader />
        <main className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-950 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
