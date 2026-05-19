"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import {
  Plus,
  Circle,
  Clock,
  AlertCircle,
  CheckCircle2,
  Calendar,
  List,
  ChevronLeft,
  ChevronRight,
  Trash2,
} from "lucide-react"
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  isToday,
  parseISO,
} from "date-fns"

import { createTask, updateTask, deleteTask } from "./plan/actions"

function getLocalDateString(date: Date | string | null): string | null {
  if (!date) return null
  if (typeof date === 'string') {
    return date.split('T')[0]
  }
  const isoString = date.toISOString()
  return isoString.split('T')[0]
}

function parseLocalDate(date: Date | string | null): Date | null {
  const dateStr = getLocalDateString(date)
  if (!dateStr) return null
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

type TaskStatus = "Todo" | "InProgress" | "Review" | "Done"
type TaskWorkstream = "MARKETING" | "LOGISTICS" | "CONTENT" | "SPEAKERS" | "SPONSORSHIP" | "REGISTRATION" | "PRODUCTION" | "CREATIVE" | "OPERATIONS" | "OTHER"
type TaskPhase = "PRE_PROGRAM" | "LIVE" | "POST_PROGRAM"
type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT"

interface Task {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  workstream: TaskWorkstream
  phase: TaskPhase
  priority: TaskPriority
  dueDate: Date | null
  executionTime: Date | null
  isMilestone: boolean
  assigneePerson: { id: string; name: string } | null
}

interface ProjectPlanProps {
  project: {
    id: string
    tasks: Task[]
  }
  people: { id: string; name: string }[]
}

const STATUS_DISPLAY: Record<TaskStatus, { label: string; icon: typeof Circle; color: string }> = {
  Todo: { label: "To Do", icon: Circle, color: "text-gray-500" },
  InProgress: { label: "In Progress", icon: Clock, color: "text-blue-500" },
  Review: { label: "In Review", icon: AlertCircle, color: "text-yellow-500" },
  Done: { label: "Done", icon: CheckCircle2, color: "text-green-500" },
}

const WORKSTREAM_DISPLAY: Record<TaskWorkstream, string> = {
  MARKETING: "Marketing",
  LOGISTICS: "Logistics",
  CONTENT: "Content",
  SPEAKERS: "Speakers",
  SPONSORSHIP: "Sponsorship",
  REGISTRATION: "Registration",
  PRODUCTION: "Production",
  CREATIVE: "Creative",
  OPERATIONS: "Operations",
  OTHER: "Other",
}

const PHASE_DISPLAY: Record<TaskPhase, string> = {
  PRE_PROGRAM: "Pre-Program",
  LIVE: "Program-Live",
  POST_PROGRAM: "Post-Program",
}

const PRIORITY_DISPLAY: Record<TaskPriority, { label: string; variant: "outline" | "secondary" | "default" | "destructive" }> = {
  LOW: { label: "Low", variant: "outline" },
  MEDIUM: { label: "Medium", variant: "secondary" },
  HIGH: { label: "High", variant: "default" },
  URGENT: { label: "Urgent", variant: "destructive" },
}

const STATUS_BG_COLORS: Record<TaskStatus, string> = {
  Todo: "bg-gray-100",
  InProgress: "bg-blue-100",
  Review: "bg-yellow-100",
  Done: "bg-green-100",
}

type SortKey = "title" | "status" | "priority" | "workstream" | "phase" | "assignee" | "dueDate"
type SortDirection = "asc" | "desc"

export function ProjectPlan({ project, people }: ProjectPlanProps) {
  const router = useRouter()
  const [view, setView] = useState<"board" | "calendar">("board")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>("dueDate")
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc")
  const [calendarDate, setCalendarDate] = useState(new Date())
  const [showCompleted, setShowCompleted] = useState(false)
  const [filterPersonId, setFilterPersonId] = useState<string>("all")

  const statusCounts = useMemo(() => {
    const counts: Record<TaskStatus, number> = { Todo: 0, InProgress: 0, Review: 0, Done: 0 }
    project.tasks.forEach((task) => {
      counts[task.status]++
    })
    return counts
  }, [project.tasks])

  const sortedTasks = useMemo(() => {
    const tasks = [...project.tasks]
    tasks.sort((a, b) => {
      let aVal: string | number | null = null
      let bVal: string | number | null = null

      switch (sortKey) {
        case "title":
          aVal = a.title.toLowerCase()
          bVal = b.title.toLowerCase()
          break
        case "status":
          const statusOrder = { Todo: 0, InProgress: 1, Review: 2, Done: 3 }
          aVal = statusOrder[a.status]
          bVal = statusOrder[b.status]
          break
        case "priority":
          const priorityOrder = { LOW: 0, MEDIUM: 1, HIGH: 2, URGENT: 3 }
          aVal = priorityOrder[a.priority]
          bVal = priorityOrder[b.priority]
          break
        case "workstream":
          aVal = a.workstream
          bVal = b.workstream
          break
        case "phase":
          const phaseOrder = { PRE_PROGRAM: 0, LIVE: 1, POST_PROGRAM: 2 }
          aVal = phaseOrder[a.phase]
          bVal = phaseOrder[b.phase]
          break
        case "assignee":
          aVal = a.assigneePerson?.name?.toLowerCase() || "zzz"
          bVal = b.assigneePerson?.name?.toLowerCase() || "zzz"
          break
        case "dueDate":
          aVal = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_VALUE
          bVal = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_VALUE
          break
      }

      if (aVal === null || bVal === null) return 0
      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1
      return 0
    })
    return tasks
  }, [project.tasks, sortKey, sortDirection])

  const filteredTasks = useMemo(() => {
    if (filterPersonId === "all") return sortedTasks
    if (filterPersonId === "unassigned") return sortedTasks.filter(t => !t.assigneePerson)
    return sortedTasks.filter(t => t.assigneePerson?.id === filterPersonId)
  }, [sortedTasks, filterPersonId])

  const activeTasks = useMemo(() => {
    return filteredTasks.filter(task => task.status !== "Done")
  }, [filteredTasks])

  const doneTasks = useMemo(() => {
    return filteredTasks.filter(task => task.status === "Done")
  }, [filteredTasks])

  const todoTasks = useMemo(() => filteredTasks.filter(t => t.status === "Todo"), [filteredTasks])
  const inProgressTasks = useMemo(() => filteredTasks.filter(t => t.status === "InProgress"), [filteredTasks])
  const reviewTasks = useMemo(() => filteredTasks.filter(t => t.status === "Review"), [filteredTasks])

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDirection("asc")
    }
  }

  function openCreateDialog() {
    setEditingTask(null)
    setDialogOpen(true)
  }

  function openEditDialog(task: Task) {
    setEditingTask(task)
    setDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    try {
      if (editingTask) {
        await updateTask(editingTask.id, project.id, formData)
      } else {
        await createTask(project.id, formData)
      }
      setDialogOpen(false)
      setEditingTask(null)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(taskId: string) {
    if (!confirm("Are you sure you want to delete this task?")) return
    await deleteTask(taskId, project.id)
    router.refresh()
  }

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(calendarDate)
    const monthEnd = endOfMonth(calendarDate)
    const start = startOfWeek(monthStart, { weekStartsOn: 0 })
    const end = endOfWeek(monthEnd, { weekStartsOn: 0 })

    const days: Date[] = []
    let day = start
    while (day <= end) {
      days.push(day)
      day = addDays(day, 1)
    }
    return days
  }, [calendarDate])

  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {}
    project.tasks.forEach((task) => {
      if (task.dueDate) {
        const key = getLocalDateString(task.dueDate)
        if (key) {
          if (!map[key]) map[key] = []
          map[key].push(task)
        }
      }
    })
    return map
  }, [project.tasks])

  return (
    <div className="space-y-6">
      {(() => {
        const milestones = project.tasks
          .filter(t => t.isMilestone)
          .sort((a, b) => {
            if (!a.dueDate && !b.dueDate) return 0
            if (!a.dueDate) return 1
            if (!b.dueDate) return -1
            return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
          })

        if (milestones.length === 0) return null

        return (
          <div className="space-y-3">
            <h2 className="text-xl font-bold dark:text-white">Major Milestones</h2>
            <Card>
              <CardContent className="pt-8 pb-6 px-2 sm:px-4 lg:px-6">
                <div className="grid gap-y-6 relative" style={{ gridTemplateColumns: `repeat(${Math.min(milestones.length, 9)}, minmax(0, 1fr))` }}>
                  <div className="absolute top-[9px] left-[24px] right-[24px] h-[2px] bg-gray-200 dark:bg-gray-700" />

                  {milestones.map((milestone, idx) => {
                    const localDate = milestone.dueDate ? parseLocalDate(milestone.dueDate) : null
                    const now = new Date()
                    now.setHours(0,0,0,0)
                    const daysUntil = localDate ? Math.ceil((localDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null

                    const isCompleted = milestone.status === "Done"
                    const isOverdue = localDate && daysUntil !== null && daysUntil < 0 && !isCompleted
                    const isAtRisk = localDate && daysUntil !== null && daysUntil >= 0 && daysUntil <= 3 && !isCompleted

                    let diamondColor = "bg-gray-300 dark:bg-gray-600"
                    let statusLabel = "Upcoming"
                    let statusColor = "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30"

                    if (isCompleted) {
                      diamondColor = "bg-green-500"
                      statusLabel = "Completed"
                      statusColor = "text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/30"
                    } else if (isOverdue) {
                      diamondColor = "bg-red-500"
                      statusLabel = "Overdue"
                      statusColor = "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/30"
                    } else if (isAtRisk) {
                      diamondColor = "bg-amber-500"
                      statusLabel = "At Risk"
                      statusColor = "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/30"
                    } else if (localDate) {
                      diamondColor = "bg-blue-500"
                    }

                    let dueText = ""
                    if (daysUntil !== null) {
                      if (daysUntil === 0) dueText = "Due today"
                      else if (daysUntil === 1) dueText = "Due tomorrow"
                      else if (daysUntil > 0) dueText = `Due in ${daysUntil} days`
                      else dueText = `Overdue by ${Math.abs(daysUntil)} days`
                    }

                    return (
                      <MilestoneMarker
                        key={milestone.id}
                        milestone={milestone}
                        diamondColor={diamondColor}
                        statusLabel={statusLabel}
                        statusColor={statusColor}
                        dueText={dueText}
                        localDate={localDate}
                      />
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        )
      })()}

      <div className="grid grid-cols-4 gap-4">
        {(["Todo", "InProgress", "Review", "Done"] as TaskStatus[]).map((status) => {
          const config = STATUS_DISPLAY[status]
          const Icon = config.icon
          return (
            <Card key={status}>
              <CardContent className="p-4 flex items-center gap-3">
                <Icon className={`h-5 w-5 ${config.color}`} />
                <div>
                  <p className="text-2xl font-bold">{statusCounts[status]}</p>
                  <p className="text-sm text-muted-foreground">{config.label}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant={view === "board" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("board")}
          >
            <List className="h-4 w-4 mr-2" />
            Board
          </Button>
          <Button
            variant={view === "calendar" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("calendar")}
          >
            <Calendar className="h-4 w-4 mr-2" />
            Calendar
          </Button>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select value={filterPersonId} onValueChange={setFilterPersonId}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Filter by person" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All People</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {people.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={openCreateDialog} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Add Task
          </Button>
        </div>
      </div>

      {view === "board" ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {([
              { status: "Todo" as TaskStatus, tasks: todoTasks, label: "To Do", icon: Circle, color: "text-gray-500", borderColor: "border-t-gray-400" },
              { status: "InProgress" as TaskStatus, tasks: inProgressTasks, label: "In Progress", icon: Clock, color: "text-blue-500", borderColor: "border-t-blue-500" },
              { status: "Review" as TaskStatus, tasks: reviewTasks, label: "In Review", icon: AlertCircle, color: "text-yellow-500", borderColor: "border-t-yellow-500" },
            ]).map((column) => {
              const ColumnIcon = column.icon
              return (
                <Card key={column.status} className={`border-t-2 ${column.borderColor}`}>
                  <CardHeader className="pb-3 pt-4 px-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ColumnIcon className={`h-4 w-4 ${column.color}`} />
                        <CardTitle className="text-sm font-semibold">{column.label}</CardTitle>
                      </div>
                      <Badge variant="secondary" className="text-xs">{column.tasks.length}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="px-3 pb-3 space-y-2 min-h-[100px]">
                    {column.tasks.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-6">No tasks</p>
                    ) : (
                      column.tasks.map((task) => {
                        const priorityConfig = PRIORITY_DISPLAY[task.priority]
                        const localDate = task.dueDate ? parseLocalDate(task.dueDate) : null
                        const isOverdue = localDate && localDate < new Date() && task.status !== "Done"
                        return (
                          <div
                            key={task.id}
                            className="border rounded-lg p-3 bg-background hover:bg-muted/50 cursor-pointer transition-colors"
                            onClick={() => openEditDialog(task)}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-1.5">
                                <p className="text-sm font-medium leading-tight">{task.title}</p>
                                {task.isMilestone && (
                                  <span className="inline-block w-2.5 h-2.5 bg-blue-500 rotate-45 rounded-[1px] shrink-0 mt-0.5" title="Major Milestone" />
                                )}
                              </div>
                              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={(e) => { e.stopPropagation(); handleDelete(task.id) }}>
                                <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                              </Button>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-2">
                              <Badge variant={priorityConfig.variant} className="text-[10px] px-1.5 py-0">{priorityConfig.label}</Badge>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{WORKSTREAM_DISPLAY[task.workstream]}</Badge>
                            </div>
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-[11px] text-muted-foreground">{task.assigneePerson?.name || "Unassigned"}</span>
                              {localDate && (
                                <span className={`text-[11px] ${isOverdue ? "text-red-500 font-medium" : "text-muted-foreground"}`}>
                                  {format(localDate, "MMM d")}
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {doneTasks.length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4 cursor-pointer" onClick={() => setShowCompleted(!showCompleted)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <CardTitle className="text-sm font-semibold">Completed</CardTitle>
                    <Badge variant="secondary" className="text-xs">{doneTasks.length}</Badge>
                  </div>
                  <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${showCompleted ? "rotate-90" : ""}`} />
                </div>
              </CardHeader>
              {showCompleted && (
                <CardContent className="px-3 pb-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {doneTasks.map((task) => {
                      const priorityConfig = PRIORITY_DISPLAY[task.priority]
                      const localDate = task.dueDate ? parseLocalDate(task.dueDate) : null
                      return (
                        <div
                          key={task.id}
                          className="border rounded-lg p-3 bg-muted/30 opacity-70 hover:opacity-100 cursor-pointer transition-opacity"
                          onClick={() => openEditDialog(task)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium leading-tight line-through decoration-green-500/50">{task.title}</p>
                            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={(e) => { e.stopPropagation(); handleDelete(task.id) }}>
                              <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                            </Button>
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-[11px] text-muted-foreground">{task.assigneePerson?.name || "Unassigned"}</span>
                            {localDate && (
                              <span className="text-[11px] text-muted-foreground">{format(localDate, "MMM d")}</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              )}
            </Card>
          )}
        </>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle>{format(calendarDate, "MMMM yyyy")}</CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => setCalendarDate(subMonths(calendarDate, 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCalendarDate(new Date())}>
                  Today
                </Button>
                <Button variant="outline" size="icon" onClick={() => setCalendarDate(addMonths(calendarDate, 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-px bg-muted rounded-lg overflow-hidden">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div key={day} className="bg-background p-2 text-center text-sm font-medium text-muted-foreground">
                  {day}
                </div>
              ))}
              {calendarDays.map((day, idx) => {
                const dateKey = format(day, "yyyy-MM-dd")
                const dayTasks = tasksByDate[dateKey] || []
                const inMonth = isSameMonth(day, calendarDate)

                return (
                  <div
                    key={idx}
                    className={`bg-background min-h-[100px] p-2 ${!inMonth ? "opacity-40" : ""} ${isToday(day) ? "ring-2 ring-primary ring-inset" : ""}`}
                  >
                    <div className="text-sm font-medium mb-1">{format(day, "d")}</div>
                    <div className="space-y-1">
                      {dayTasks.slice(0, 3).map((task) => (
                        <div
                          key={task.id}
                          className={`text-xs px-1.5 py-0.5 rounded truncate cursor-pointer ${STATUS_BG_COLORS[task.status]}`}
                          onClick={() => openEditDialog(task)}
                          title={task.title}
                        >
                          {task.title}
                        </div>
                      ))}
                      {dayTasks.length > 3 && (
                        <div className="text-xs text-muted-foreground">+{dayTasks.length - 3} more</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <TaskDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditingTask(null)
        }}
        task={editingTask}
        people={people}
        onSubmit={handleSubmit}
        loading={loading}
      />
    </div>
  )
}

interface TaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: Task | null
  people: { id: string; name: string }[]
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  loading: boolean
}

function TaskDialog({ open, onOpenChange, task, people, onSubmit, loading }: TaskDialogProps) {
  const [phase, setPhase] = useState<TaskPhase>(task?.phase || "PRE_PROGRAM")

  const handlePhaseChange = (value: string) => {
    setPhase(value as TaskPhase)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task ? "Edit Task" : "Create Task"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" defaultValue={task?.title || ""} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" defaultValue={task?.description || ""} rows={3} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Workstream</Label>
              <Select name="workstream" defaultValue={task?.workstream || "OTHER"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(WORKSTREAM_DISPLAY).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Phase</Label>
              <Select name="phase" defaultValue={task?.phase || "PRE_PROGRAM"} onValueChange={handlePhaseChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PHASE_DISPLAY).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select name="priority" defaultValue={task?.priority || "MEDIUM"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_DISPLAY).map(([value, config]) => (
                    <SelectItem key={value} value={value}>{config.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select name="status" defaultValue={task?.status || "Todo"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_DISPLAY).map(([value, config]) => (
                    <SelectItem key={value} value={value}>{config.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Assignee</Label>
            <Select name="assigneePersonId" defaultValue={task?.assigneePerson?.id || "__unassigned__"}>
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__unassigned__">Unassigned</SelectItem>
                {people.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dueDate">Due Date</Label>
            <Input
              id="dueDate"
              name="dueDate"
              type="date"
              defaultValue={task?.dueDate ? getLocalDateString(task.dueDate) || "" : ""}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isMilestone"
              name="isMilestone"
              value="true"
              defaultChecked={task?.isMilestone || false}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="isMilestone" className="text-sm font-normal cursor-pointer">
              Major Milestone
            </Label>
            <span className="text-xs text-muted-foreground">(appears in timeline)</span>
          </div>

          {phase === "LIVE" && (
            <div className="space-y-2">
              <Label htmlFor="executionTime">Execution Time</Label>
              <Input
                id="executionTime"
                name="executionTime"
                type="datetime-local"
                defaultValue={task?.executionTime ? format(new Date(task.executionTime), "yyyy-MM-dd'T'HH:mm") : ""}
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {task ? "Save Changes" : "Create Task"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function MilestoneMarker({
  milestone,
  diamondColor,
  statusLabel,
  statusColor,
  dueText,
  localDate,
}: {
  milestone: Task
  diamondColor: string
  statusLabel: string
  statusColor: string
  dueText: string
  localDate: Date | null
}) {
  const [showTooltip, setShowTooltip] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showTooltip) return
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShowTooltip(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [showTooltip])

  return (
    <div
      ref={ref}
      className="relative flex flex-col items-center px-1 sm:px-2"
    >
      <div
        className={`w-3.5 h-3.5 sm:w-[18px] sm:h-[18px] ${diamondColor} rotate-45 rounded-[2px] sm:rounded-[3px] z-10 relative shrink-0 cursor-pointer`}
        onClick={() => setShowTooltip(!showTooltip)}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      />

      <p className="text-[0.7rem] sm:text-xs lg:text-sm font-medium text-center mt-2 sm:mt-3 leading-tight dark:text-white line-clamp-2">
        {milestone.title}
      </p>

      {localDate && (
        <p className="text-[0.65rem] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">
          {format(localDate, "MMM d")}
        </p>
      )}

      <span className={`text-[8px] sm:text-[10px] font-medium px-1.5 sm:px-2 py-0.5 rounded-full mt-1 sm:mt-1.5 whitespace-nowrap ${statusColor}`}>
        {statusLabel}
      </span>

      {showTooltip && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-lg p-3 min-w-[200px] z-50">
          <div className="flex items-center gap-2 mb-1.5">
            <div className={`w-[10px] h-[10px] ${diamondColor} rotate-45 rounded-[2px] shrink-0`} />
            <span className="text-sm font-semibold dark:text-white">{milestone.title}</span>
          </div>
          <p className={`text-xs font-medium ${statusColor.split(' ').filter(c => c.startsWith('text-') || c.startsWith('dark:text-')).join(' ')}`}>{statusLabel}</p>
          <p className="text-xs text-muted-foreground mt-1">{milestone.assigneePerson?.name || "Unassigned"}</p>
          {dueText && <p className="text-xs text-muted-foreground">{dueText}</p>}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-white dark:border-t-gray-800" />
        </div>
      )}
    </div>
  )
}
