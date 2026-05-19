"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type AlertSeverity = "CRITICAL" | "WARN" | "INFO"

interface AlertBadgeProps {
  severity: AlertSeverity
  className?: string
}

const severityStyles: Record<AlertSeverity, string> = {
  CRITICAL: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900 dark:text-red-300 dark:border-red-800",
  WARN: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900 dark:text-yellow-300 dark:border-yellow-800",
  INFO: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:border-blue-800",
}

export function AlertBadge({ severity, className }: AlertBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(severityStyles[severity], className)}
    >
      {severity}
    </Badge>
  )
}
