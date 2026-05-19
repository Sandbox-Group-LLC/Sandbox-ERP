"use client"

import { Suspense, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useReplitAuth } from "@/hooks/use-replit-auth"

export const dynamic = "force-dynamic"

function LoginContent() {
  const searchParams = useSearchParams()
  const { isAuthenticated, isLoading, login } = useReplitAuth()
  const error = searchParams.get("error")
  const inviteToken = searchParams.get("invite")

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      window.location.href = "/"
    }
  }, [isLoading, isAuthenticated])

  const handleLogin = () => {
    login(inviteToken || undefined)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 relative">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Welcome to Sandbox ERP</CardTitle>
          <CardDescription>
            Event agency project management
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {inviteToken && (
            <div className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 p-3 rounded-md text-sm">
              You have been invited to join the team. Sign in to accept your invitation.
            </div>
          )}
          
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-md text-sm">
              {error === "auth_failed" && "Authentication failed. Please try again."}
              {error === "callback_failed" && "Login callback failed. Please try again."}
              {!["auth_failed", "callback_failed"].includes(error) && `Error: ${error}`}
            </div>
          )}
          
          <Button
            className="w-full"
            size="lg"
            onClick={handleLogin}
          >
            Sign in with Replit
          </Button>
          
          <p className="text-center text-sm text-muted-foreground">
            Sign in with Google, GitHub, X, Apple, or email through Replit
          </p>
        </CardContent>
      </Card>
      
      <div className="absolute bottom-4 left-0 right-0 text-center">
        <a 
          href="https://www.sandbox-gtm.com/privacy-policy" 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Privacy Policy
        </a>
      </div>
    </div>
  )
}

function LoginLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Loading...</p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginContent />
    </Suspense>
  )
}
