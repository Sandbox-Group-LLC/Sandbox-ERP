"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertBadge } from "@/components/alerts/alert-badge"
import { ArrowLeft, ExternalLink, Circle, Calculator, Users } from "lucide-react"
import { formatDistanceToNow, startOfWeek, format } from "date-fns"

export const dynamic = "force-dynamic"

type AlertSeverity = "CRITICAL" | "WARN" | "INFO"

interface AlertData {
  actionUrl?: string
  weekStart?: string
  [key: string]: unknown
}

interface Alert {
  id: string
  ruleType: string
  severity: AlertSeverity
  title: string
  body: string
  data: AlertData | null
  createdAt: string
  projectId: string | null
  projectName: string | null
  readAt: string | null
  isRead: boolean
}

type FilterType = "all" | "unread" | "CRITICAL" | "WARN" | "INFO"

export default function ProjectAlertsPage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string
  
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [projectName, setProjectName] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterType>("all")

  useEffect(() => {
    fetchAlerts()
  }, [projectId, filter])

  async function fetchAlerts() {
    try {
      setLoading(true)
      const res = await fetch(`/api/projects/${projectId}/alerts`)
      if (res.status === 401) {
        router.push("/login")
        return
      }
      if (res.ok) {
        const data = await res.json()
        let alertsList: Alert[] = data.alerts || []
        
        if (alertsList.length > 0 && alertsList[0].projectName) {
          setProjectName(alertsList[0].projectName)
        }

        if (filter === "unread") {
          alertsList = alertsList.filter((a) => !a.isRead)
        } else if (filter === "CRITICAL" || filter === "WARN" || filter === "INFO") {
          alertsList = alertsList.filter((a) => a.severity === filter)
        }
        
        setAlerts(alertsList)
      }
    } catch (error) {
      console.error("Failed to fetch alerts:", error)
    } finally {
      setLoading(false)
    }
  }

  async function markAsRead(alertId: string) {
    try {
      const res = await fetch(`/api/alerts/${alertId}/read`, {
        method: "POST",
      })
      if (res.ok) {
        setAlerts((prev) =>
          prev.map((alert) =>
            alert.id === alertId
              ? { ...alert, isRead: true, readAt: new Date().toISOString() }
              : alert
          )
        )
      }
    } catch (error) {
      console.error("Failed to mark alert as read:", error)
    }
  }

  function handleAlertClick(alert: Alert) {
    if (!alert.isRead) {
      markAsRead(alert.id)
    }
  }

  function getActionUrl(alert: Alert): string | null {
    if (alert.data && typeof alert.data === "object" && "actionUrl" in alert.data) {
      return alert.data.actionUrl as string
    }
    return null
  }

  function isReconcileAlert(ruleType: string): boolean {
    return ruleType.toLowerCase().includes("reconcile") || 
           ruleType.toLowerCase().includes("budget") ||
           ruleType.toLowerCase().includes("variance")
  }

  function isStaffingAlert(ruleType: string): boolean {
    return ruleType.toLowerCase().includes("staffing") || 
           ruleType.toLowerCase().includes("allocation") ||
           ruleType.toLowerCase().includes("capacity")
  }

  function getStaffingWeekStart(alert: Alert): string {
    if (alert.data && typeof alert.data === "object" && "weekStart" in alert.data) {
      return alert.data.weekStart as string
    }
    return format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd")
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/projects/${projectId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Project Alerts
          </h1>
          {projectName && (
            <p className="text-gray-500 dark:text-gray-400">{projectName}</p>
          )}
        </div>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unread">Unread</TabsTrigger>
          <TabsTrigger value="CRITICAL" className="text-red-600">Critical</TabsTrigger>
          <TabsTrigger value="WARN" className="text-yellow-600">Warning</TabsTrigger>
          <TabsTrigger value="INFO" className="text-blue-600">Info</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="text-muted-foreground">Loading alerts...</div>
      ) : alerts.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-gray-500 dark:text-gray-400">
            No alerts found for this project.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => {
            const actionUrl = getActionUrl(alert)
            const showReconcileShortcut = isReconcileAlert(alert.ruleType)
            const showStaffingShortcut = isStaffingAlert(alert.ruleType)
            
            return (
              <Card
                key={alert.id}
                className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                  !alert.isRead ? "border-l-4 border-l-primary" : ""
                }`}
                onClick={() => handleAlertClick(alert)}
              >
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {!alert.isRead && (
                        <Circle className="h-2 w-2 fill-primary text-primary" />
                      )}
                      <AlertBadge severity={alert.severity} />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 dark:text-white">
                        {alert.title}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                        {alert.body}
                      </p>
                      <span className="text-xs text-muted-foreground mt-2 block">
                        {formatDistanceToNow(new Date(alert.createdAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2 flex-shrink-0">
                      {showReconcileShortcut && (
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link href={`/projects/${projectId}/budget/reconcile`}>
                            <Calculator className="h-4 w-4 mr-1" />
                            Reconcile
                          </Link>
                        </Button>
                      )}
                      
                      {showStaffingShortcut && (
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link href={`/projects/${projectId}/staffing-plan?weekStart=${getStaffingWeekStart(alert)}`}>
                            <Users className="h-4 w-4 mr-1" />
                            Staffing Plan
                          </Link>
                        </Button>
                      )}

                      {actionUrl && (
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link href={actionUrl}>
                            <ExternalLink className="h-4 w-4 mr-1" />
                            Open
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
