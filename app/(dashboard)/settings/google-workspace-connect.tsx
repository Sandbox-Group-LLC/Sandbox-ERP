"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { disconnectGoogleWorkspace } from "./actions"

interface GoogleWorkspaceConnectProps {
  isConnected: boolean
  connectedEmail: string | null
  connectedAt: string | null
}

export function GoogleWorkspaceConnect({ isConnected, connectedEmail, connectedAt }: GoogleWorkspaceConnectProps) {
  const [connected, setConnected] = useState(isConnected)
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    if (searchParams.get("workspace_connected") === "true") {
      setConnected(true)
      toast({
        title: "Success",
        description: "Google Workspace has been connected for your organization.",
      })
      window.history.replaceState({}, "", window.location.pathname)
    }
  }, [toast])

  const handleDisconnect = async () => {
    if (!window.confirm("Are you sure you want to disconnect Google Workspace? All Google Drive, Sheets, and Docs integrations will stop working until reconnected.")) {
      return
    }

    setIsLoading(true)
    try {
      const result = await disconnectGoogleWorkspace()
      if (result.success) {
        setConnected(false)
        toast({
          title: "Disconnected",
          description: "Google Workspace has been disconnected from your organization.",
        })
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to disconnect Google Workspace",
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
          <CardTitle className="dark:text-white">Google Workspace</CardTitle>
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
          Connect your organization's Google Workspace to enable Google Drive, Docs, Sheets, and Calendar integrations.
          Files will be created in the connected account's Google Drive.
        </p>

        {connected ? (
          <div className="space-y-3">
            {connectedEmail && (
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Connected as <span className="font-medium">{connectedEmail}</span>
              </p>
            )}
            {connectedAt && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Connected on {new Date(connectedAt).toLocaleDateString()}
              </p>
            )}
            <Button
              variant="destructive"
              onClick={handleDisconnect}
              disabled={isLoading}
            >
              {isLoading ? "Disconnecting..." : "Disconnect Google Workspace"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Google Workspace is not connected. Sheet exports, contract documents, and other Google integrations will not work until connected.
            </p>
            <a href="/api/auth/google-workspace?returnTo=/settings">
              <Button className="w-full sm:w-auto">
                Connect Google Workspace
              </Button>
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
