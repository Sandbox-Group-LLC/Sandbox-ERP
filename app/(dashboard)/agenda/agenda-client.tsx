"use client"

import { useState, useTransition } from "react"
import { format } from "date-fns"
import { useToast } from "@/hooks/use-toast"
import { ClipboardList, Send, ExternalLink, RefreshCw, Calendar, CheckCircle2, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { getAgendaData, pushAgendaToGoogleDoc } from "./actions"

const GOOGLE_DOC_URL = "https://docs.google.com/document/d/1PMEG40-A5LbhRueLKDTk91Q2VXs9tIWGP4R5UxfgrqQ/edit"

interface Project {
  id: string
  name: string
  clientName: string
}

interface TaskItem {
  id: string
  title: string
  status: string
  dueDate: string | null
  assigneeName: string | null
  priority: string
  workstream: string
}

interface AgendaData {
  project: { name: string; clientName: string }
  tasks: TaskItem[]
  nextMeetingAgenda: string | null
  agendaSource: string | null
}

function formatStatus(status: string) {
  switch (status) {
    case "Todo": return "To Do"
    case "InProgress": return "In Progress"
    case "Review": return "Review"
    default: return status
  }
}

function priorityColor(priority: string) {
  switch (priority) {
    case "URGENT": return "destructive"
    case "HIGH": return "destructive"
    case "MEDIUM": return "default"
    case "LOW": return "secondary"
    default: return "default"
  }
}

function generatePlainText(data: AgendaData): string {
  const lines: string[] = []

  lines.push("📋 Upcoming Tasks (Next 7 Days)")
  if (data.tasks.length === 0) {
    lines.push("No upcoming or overdue tasks.")
  } else {
    for (const task of data.tasks) {
      const due = task.dueDate ? format(new Date(task.dueDate), "MM/dd/yyyy") : "No date"
      const assignee = task.assigneeName || "Unassigned"
      lines.push(`• ${task.title} — ${formatStatus(task.status)} — Due: ${due} — ${assignee}`)
    }
  }

  lines.push("")
  lines.push("🗓️ Next Meeting Agenda")
  if (data.nextMeetingAgenda) {
    lines.push(data.nextMeetingAgenda)
  } else {
    lines.push("No AI-generated agenda available.")
  }

  return lines.join("\n")
}

export function AgendaClient({ projects }: { projects: Project[] }) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  const [agendaData, setAgendaData] = useState<AgendaData | null>(null)
  const [editableContent, setEditableContent] = useState("")
  const [isLoading, startTransition] = useTransition()
  const [isPushing, startPushTransition] = useTransition()
  const [pushed, setPushed] = useState(false)
  const { toast } = useToast()

  function handleProjectChange(projectId: string) {
    setSelectedProjectId(projectId)
    setPushed(false)
    startTransition(async () => {
      try {
        const data = await getAgendaData(projectId)
        setAgendaData(data)
        setEditableContent(generatePlainText(data))
      } catch {
        toast({ title: "Error", description: "Failed to load agenda data", variant: "destructive" })
      }
    })
  }

  function handleRefresh() {
    if (!selectedProjectId) return
    setPushed(false)
    startTransition(async () => {
      try {
        const data = await getAgendaData(selectedProjectId)
        setAgendaData(data)
        setEditableContent(generatePlainText(data))
        toast({ title: "Refreshed", description: "Agenda refreshed successfully" })
      } catch {
        toast({ title: "Error", description: "Failed to refresh agenda data", variant: "destructive" })
      }
    })
  }

  function handlePush() {
    if (!selectedProjectId || !editableContent.trim()) return
    startPushTransition(async () => {
      try {
        await pushAgendaToGoogleDoc(selectedProjectId, editableContent)
        setPushed(true)
        toast({ title: "Success", description: "Agenda pushed to Google Doc" })
      } catch {
        toast({ title: "Error", description: "Failed to push agenda to Google Doc", variant: "destructive" })
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6" />
            Meeting Agenda
          </h1>
          <p className="text-muted-foreground mt-1">
            Build and push per-project meeting agendas to Google Docs
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {selectedProjectId && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading}
              className="w-full sm:w-auto"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          )}
          <a href={GOOGLE_DOC_URL} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="w-full sm:w-auto">
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Google Doc
            </Button>
          </a>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select Project</CardTitle>
          <CardDescription>Choose a project to generate the meeting agenda</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selectedProjectId} onValueChange={handleProjectChange}>
            <SelectTrigger className="w-full sm:w-[400px]">
              <SelectValue placeholder="Select a project..." />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} — {p.clientName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {agendaData && !isLoading && (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Upcoming Tasks (Next 7 Days)
                </CardTitle>
                <CardDescription>
                  {agendaData.project.name} — {agendaData.project.clientName}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {agendaData.tasks.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No upcoming or overdue tasks.</p>
                ) : (
                  <div className="space-y-3">
                    {agendaData.tasks.map((task) => {
                      const isOverdue = task.dueDate && new Date(task.dueDate) < new Date(new Date().toDateString())
                      return (
                        <div key={task.id} className="flex items-start gap-3 p-3 rounded-lg border">
                          <CheckCircle2 className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{task.title}</p>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              <Badge variant={priorityColor(task.priority) as any} className="text-xs">
                                {task.priority}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {formatStatus(task.status)}
                              </Badge>
                              {task.dueDate && (
                                <Badge variant={isOverdue ? "destructive" : "outline"} className="text-xs">
                                  {isOverdue ? "Overdue: " : "Due: "}
                                  {format(new Date(task.dueDate), "MMM d")}
                                </Badge>
                              )}
                              {task.assigneeName && (
                                <Badge variant="secondary" className="text-xs">
                                  {task.assigneeName}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  🗓️ Next Meeting Agenda
                </CardTitle>
                <CardDescription>
                  {agendaData.agendaSource
                    ? `From: ${agendaData.agendaSource}`
                    : "AI-generated agenda from Meeting Analyzer"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {agendaData.nextMeetingAgenda ? (
                  <div className="text-sm whitespace-pre-wrap">{agendaData.nextMeetingAgenda}</div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    No AI-generated agenda available. Analyze a meeting first in the AI Meeting Analyzer.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Edit Agenda</CardTitle>
              <CardDescription>
                Review and edit the agenda content before pushing to Google Docs
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="agenda-content">Agenda Content</Label>
                <Textarea
                  id="agenda-content"
                  value={editableContent}
                  onChange={(e) => setEditableContent(e.target.value)}
                  rows={16}
                  className="mt-2 font-mono text-sm"
                />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  onClick={handlePush}
                  disabled={isPushing || !editableContent.trim()}
                  className="w-full sm:w-auto"
                >
                  {isPushing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Push to Google Doc
                </Button>
                {pushed && (
                  <a href={GOOGLE_DOC_URL} target="_blank" rel="noopener noreferrer">
                    <Button variant="link" className="w-full sm:w-auto">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View in Google Docs
                    </Button>
                  </a>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
