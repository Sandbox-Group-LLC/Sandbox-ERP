"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Building2, LogOut } from "lucide-react"
import Link from "next/link"
import { createOrganization } from "./actions"

interface OnboardingFormProps {
  userId: string
  userName: string
  userEmail: string
}

export function OnboardingForm({ userId, userName, userEmail }: OnboardingFormProps) {
  const [orgName, setOrgName] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const result = await createOrganization(orgName)
      if (result.success) {
        router.push("/")
        router.refresh()
      } else {
        setError(result.error || "Something went wrong")
      }
    } catch {
      setError("An unexpected error occurred")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
          <Building2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        </div>
        <CardTitle className="text-xl">Welcome to Sandbox ERP</CardTitle>
        <CardDescription className="text-base">
          Create your organization to get started. You'll be set up as the administrator.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="text-center text-sm text-muted-foreground">
          <p>Signed in as:</p>
          <p className="font-medium text-foreground">{userName}</p>
          <p>{userEmail}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="orgName">Organization Name</Label>
            <Input
              id="orgName"
              placeholder="Your company name"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              required
              minLength={2}
              maxLength={100}
              disabled={isSubmitting}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={isSubmitting || orgName.trim().length < 2}
          >
            {isSubmitting ? "Creating..." : "Create Organization"}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t dark:border-gray-700" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white dark:bg-gray-950 px-2 text-muted-foreground">or</span>
          </div>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Have an invite? Ask an existing admin to send you an invitation link, then sign in through that link to join their organization.
        </p>

        <Link href="/api/auth/logout" className="block">
          <Button variant="outline" className="w-full">
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </Button>
        </Link>
      </CardContent>
    </Card>
  )
}
