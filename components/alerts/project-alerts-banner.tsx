"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, AlertCircle, Info } from "lucide-react"
import { cn } from "@/lib/utils"

type AlertSeverity = "CRITICAL" | "WARN" | "INFO"

interface Alert {
  id: string
  severity: AlertSeverity
  isRead: boolean
}

interface ProjectAlertsBannerProps {
  projectId: string
}

const severityOrder: Record<AlertSeverity, number> = {
  CRITICAL: 3,
  WARN: 2,
  INFO: 1,
}

export function ProjectAlertsBanner({ projectId }: ProjectAlertsBannerProps) {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAlerts() {
      try {
        const res = await fetch(`/api/projects/${projectId}/alerts`)
        if (res.ok) {
          const data = await res.json()
          setAlerts(data.alerts || [])
        }
      } catch (error) {
        console.error("Failed to fetch project alerts:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchAlerts()
  }, [projectId])

  if (loading || alerts.length === 0) {
    return null
  }

  const unreadCount = alerts.filter((a) => !a.isRead).length
  const highestSeverity = alerts.reduce<AlertSeverity>((highest, alert) => {
    return severityOrder[alert.severity] > severityOrder[highest]
      ? alert.severity
      : highest
  }, "INFO")

  const bannerStyles: Record<AlertSeverity, string> = {
    CRITICAL: "bg-red-50 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-200",
    WARN: "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-950 dark:border-yellow-800 dark:text-yellow-200",
    INFO: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-200",
  }

  const IconComponent = highestSeverity === "CRITICAL" 
    ? AlertTriangle 
    : highestSeverity === "WARN" 
    ? AlertCircle 
    : Info

  return (
    <Link href={`/projects/${projectId}/alerts`}>
      <div
        className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer hover:opacity-80 transition-opacity mb-4",
          bannerStyles[highestSeverity]
        )}
      >
        <IconComponent className="h-4 w-4 flex-shrink-0" />
        <span className="text-sm font-medium">
          {alerts.length} alert{alerts.length !== 1 ? "s" : ""}
          {unreadCount > 0 && ` (${unreadCount} unread)`}
        </span>
      </div>
    </Link>
  )
}
