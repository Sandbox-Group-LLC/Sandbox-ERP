import { redirect } from "next/navigation"
import { getUserWithOrganization } from "@/lib/replit-auth"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Clock, LogOut } from "lucide-react"
import Link from "next/link"

export const dynamic = "force-dynamic"

export default async function PendingApprovalPage() {
  const user = await getUserWithOrganization()
  
  if (!user) {
    redirect("/login")
  }
  
  // If already approved, redirect to dashboard
  if (user.approvalStatus === "APPROVED") {
    redirect("/")
  }
  
  // If denied, show different message
  const isDenied = user.approvalStatus === "DENIED"
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center">
            <Clock className="h-6 w-6 text-orange-600 dark:text-orange-400" />
          </div>
          <CardTitle className="text-xl">
            {isDenied ? "Access Denied" : "Access Request Submitted"}
          </CardTitle>
          <CardDescription className="text-base">
            {isDenied 
              ? "Your request to access Sandbox ERP has been denied. Please contact an administrator if you believe this is an error."
              : "Your request to access Sandbox ERP has been sent to an administrator for approval."
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center text-sm text-muted-foreground">
            <p>Signed in as:</p>
            <p className="font-medium text-foreground">{user.name || user.firstName || "User"}</p>
            <p>{user.email}</p>
          </div>
          
          {!isDenied && (
            <p className="text-center text-sm text-muted-foreground">
              You'll be notified once your access is approved. Check back soon!
            </p>
          )}
          
          <div className="pt-4">
            <Link href="/api/auth/logout" className="w-full">
              <Button variant="outline" className="w-full">
                <LogOut className="h-4 w-4 mr-2" />
                Sign out
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
