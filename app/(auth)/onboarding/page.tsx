import { redirect } from "next/navigation"
import { getUserWithOrganization } from "@/lib/replit-auth"
import { OnboardingForm } from "./onboarding-form"

export const dynamic = "force-dynamic"

export default async function OnboardingPage() {
  const user = await getUserWithOrganization()

  if (!user) {
    redirect("/login")
  }

  if (user.organizationId && user.approvalStatus === "APPROVED") {
    redirect("/")
  }

  if (user.organizationId && user.approvalStatus !== "APPROVED") {
    redirect("/pending-approval")
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
      <OnboardingForm
        userId={user.id}
        userName={user.name || user.firstName || "User"}
        userEmail={user.email || ""}
      />
    </div>
  )
}
