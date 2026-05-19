"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { disconnectGoogleAccount } from "./actions"

interface GoogleConnectProps {
  isConnected: boolean
  userId: string
}

export function GoogleConnect({ isConnected, userId }: GoogleConnectProps) {
  const [connected, setConnected] = useState(isConnected)
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    if (searchParams.get("google_connected") === "true") {
      setConnected(true)
      toast({
        title: "Success",
        description: "Your Google account has been connected successfully!",
      })
      window.history.replaceState({}, "", window.location.pathname)
    }
  }, [toast])

  const handleDisconnect = async () => {
    if (!window.confirm("Are you sure you want to disconnect your Google account?")) {
      return
    }

    setIsLoading(true)
    try {
      const result = await disconnectGoogleAccount(userId)
      if (result.success) {
        setConnected(false)
        toast({
          title: "Success",
          description: "Your Google account has been disconnected",
        })
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to disconnect Google account",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="dark:bg-gray-800 dark:border-gray-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="dark:text-white">Google Account</CardTitle>
          {connected ? (
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
              Connected
            </Badge>
          ) : (
            <Badge variant="outline" className="dark:border-gray-600 dark:text-gray-400">
              Not Connected
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Connect your Google account to enable Google Docs mentions on your My Dashboard.
        </p>

        {connected ? (
          <Button
            variant="destructive"
            onClick={handleDisconnect}
            disabled={isLoading}
          >
            {isLoading ? "Disconnecting..." : "Disconnect Google Account"}
          </Button>
        ) : (
          <a href={`/api/auth/google?returnTo=/settings`}>
            <Button className="w-full">
              Connect Google Account
            </Button>
          </a>
        )}
      </CardContent>
    </Card>
  )
}
