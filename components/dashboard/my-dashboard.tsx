"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Briefcase, CheckSquare, Calendar, AtSign, ExternalLink } from "lucide-react"
import type { MyProject, MyTask, MyMeeting, MyMention } from "@/app/(dashboard)/my-dashboard-actions"

interface MyDashboardProps {
  firstName: string
  projects: MyProject[]
  tasks: MyTask[]
  meetings: MyMeeting[]
  meetingsConnected: boolean
  mentions: MyMention[]
  mentionsGoogleConnected: boolean
}

function useHydrated() {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => { setHydrated(true) }, [])
  return hydrated
}

function LocalDate() {
  const hydrated = useHydrated()
  if (!hydrated) return <span />

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const formatted = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: tz,
  }).format(new Date())

  return <span>{formatted}</span>
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    Active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    Onsite: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    Draft: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
    Closed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    Todo: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
    "In Progress": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    InProgress: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    Blocked: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  }
  const c = colors[status] || "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${c}`}>
      {status}
    </span>
  )
}

function formatMeetingTime(start: string, end: string) {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const s = new Date(start)
    const isAllDay = !start.includes("T")

    if (isAllDay) {
      return new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: tz,
      }).format(s)
    }

    const day = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: tz,
    }).format(s)

    const time = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz,
    }).format(s)

    return `${day}, ${time}`
  } catch {
    return start
  }
}

function formatDueDate(dateStr: string | null) {
  if (!dateStr) return null
  try {
    const datePart = dateStr.split("T")[0]
    const [year, month, day] = datePart.split("-").map(Number)
    const d = new Date(year, month - 1, day)

    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const diffMs = d.getTime() - now.getTime()
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

    const formatted = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(d)

    if (diffDays < 0) return { text: formatted, className: "text-red-500" }
    if (diffDays <= 2) return { text: formatted, className: "text-yellow-600 dark:text-yellow-400" }
    return { text: formatted, className: "text-muted-foreground" }
  } catch {
    return { text: dateStr, className: "text-muted-foreground" }
  }
}

function ClientDate({ dateStr, className }: { dateStr: string | null; className?: string }) {
  const hydrated = useHydrated()
  if (!dateStr) return null
  if (!hydrated) return <span className={className}>—</span>
  const result = formatDueDate(dateStr)
  if (!result) return null
  return <span className={`${result.className} ${className || ""}`}>{result.text}</span>
}

function ClientMeetingTime({ start, end }: { start: string; end: string }) {
  const hydrated = useHydrated()
  if (!hydrated) return <span>—</span>
  return <>{formatMeetingTime(start, end)}</>
}

export function MyDashboard({
  firstName,
  projects,
  tasks,
  meetings,
  meetingsConnected,
  mentions,
  mentionsGoogleConnected,
}: MyDashboardProps) {
  const maxItems = 5

  return (
    <>
      <p className="text-sm text-muted-foreground -mb-4">
        Today is <LocalDate />
      </p>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">My Dashboard</h2>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">My Projects</CardTitle>
              <Briefcase className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">No projects assigned</p>
              ) : (
                <div className="space-y-2">
                  {projects.slice(0, maxItems).map((p) => (
                    <Link
                      key={p.id}
                      href={`/projects/${p.id}`}
                      className="flex items-center justify-between py-1.5 border-b last:border-b-0 hover:bg-muted/50 -mx-2 px-2 rounded"
                    >
                      <span className="text-sm truncate mr-2">{p.name}</span>
                      <StatusBadge status={p.status} />
                    </Link>
                  ))}
                  {projects.length > maxItems && (
                    <Link href="/projects" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                      View all ({projects.length})
                    </Link>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">My Tasks</CardTitle>
              <CheckSquare className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tasks assigned</p>
              ) : (
                <div className="space-y-2">
                  {tasks.slice(0, maxItems).map((t) => {
                    return (
                      <Link
                        key={t.id}
                        href={`/projects/${t.projectId}`}
                        className="flex items-center justify-between py-1.5 border-b last:border-b-0 hover:bg-muted/50 -mx-2 px-2 rounded"
                      >
                        <span className="text-sm truncate mr-2">{t.title}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <ClientDate dateStr={t.dueDate} className="text-[10px]" />
                          <StatusBadge status={t.status} />
                        </div>
                      </Link>
                    )
                  })}
                  {tasks.length > maxItems && (
                    <Link href="/projects" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                      View all ({tasks.length})
                    </Link>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">My Meetings</CardTitle>
              <Calendar className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {!meetingsConnected ? (
                <div className="text-sm text-muted-foreground">
                  <p>Google Calendar not connected.</p>
                  <Link href="/settings" className="text-blue-600 dark:text-blue-400 hover:underline text-xs">
                    Connect in Settings →
                  </Link>
                </div>
              ) : meetings.length === 0 ? (
                <p className="text-sm text-muted-foreground">No meetings this week</p>
              ) : (
                <div className="space-y-2">
                  {meetings.slice(0, maxItems).map((m) => (
                    <div
                      key={m.id}
                      className="py-1.5 border-b last:border-b-0"
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className="text-sm truncate">{m.title}</span>
                        {m.meetLink && (
                          <a
                            href={m.meetLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-blue-600 dark:text-blue-400"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        <ClientMeetingTime start={m.start} end={m.end} />
                      </p>
                    </div>
                  ))}
                  {meetings.length > maxItems && (
                    <p className="text-xs text-muted-foreground">
                      +{meetings.length - maxItems} more this week
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Mentions</CardTitle>
              <AtSign className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {mentions.length === 0 && !mentionsGoogleConnected ? (
                <div className="text-sm text-muted-foreground">
                  <p>No mentions yet.</p>
                  <Link href="/settings" className="text-blue-600 dark:text-blue-400 hover:underline text-xs">
                    Connect Google to see workspace mentions →
                  </Link>
                </div>
              ) : mentions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent mentions</p>
              ) : (
                <div className="space-y-2">
                  {mentions.slice(0, maxItems).map((m) => (
                    <div key={m.id} className="py-1.5 border-b last:border-b-0">
                      {m.link ? (
                        <Link
                          href={m.link}
                          target={m.source === "Google" ? "_blank" : undefined}
                          className="block hover:bg-muted/50 -mx-2 px-2 rounded"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${
                              m.source === "ERP"
                                ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                                : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                            }`}>
                              {m.source}
                            </span>
                            <span className="text-sm truncate">{m.text}</span>
                          </div>
                          {m.channelName && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 ml-8">
                              #{m.channelName}
                            </p>
                          )}
                        </Link>
                      ) : (
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${
                              m.source === "ERP"
                                ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                                : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                            }`}>
                              {m.source}
                            </span>
                            <span className="text-sm truncate">{m.text}</span>
                          </div>
                          {m.channelName && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 ml-8">
                              #{m.channelName}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {!mentionsGoogleConnected && (
                    <Link href="/settings" className="text-xs text-blue-600 dark:text-blue-400 hover:underline block mt-1">
                      Connect Google for workspace mentions →
                    </Link>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
