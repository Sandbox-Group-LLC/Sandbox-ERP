"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { 
  Loader2, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  User, 
  Calendar,
  Lightbulb,
  AlertTriangle,
  Mail,
  ListChecks,
  Copy,
  Check,
  ArrowRight,
  Target,
  FileText,
  History,
  Save,
  BookOpen,
  ChevronDown,
  ChevronUp
} from "lucide-react"
import { 
  analyzeMeetingNotes, 
  createTasksFromAnalysis, 
  StrategistOutput,
  ExtractedTask,
  MeetingMetadata,
  getPriorMeetings,
  saveMeetingLog,
  getMeetingLogs,
  MeetingLogSummary,
  RankedMove,
  RiskGapItem,
  CreativeIdea
} from "./actions"
import { useToast } from "@/hooks/use-toast"
import { format } from "date-fns"

interface Project {
  id: string
  name: string
}

interface Person {
  id: string
  name: string
}

interface Client {
  id: string
  name: string
}

interface PriorMeeting {
  id: string
  title: string
  datetime: string
  executiveBrief: string | null
}

interface MeetingNotesClientProps {
  projects: Project[]
  people: Person[]
  clients: Client[]
}

interface TaskSelection extends ExtractedTask {
  selected: boolean
  overrideAssigneeId: string | null
}

export function MeetingNotesClient({ projects, people, clients }: MeetingNotesClientProps) {
  const searchParams = useSearchParams()
  const [notes, setNotes] = useState("")
  const [projectId, setProjectId] = useState<string>("")
  const [clientId, setClientId] = useState<string>("")
  const [analyzing, setAnalyzing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [output, setOutput] = useState<StrategistOutput | null>(null)
  const [tasks, setTasks] = useState<TaskSelection[]>([])
  const [error, setError] = useState<string | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<MeetingMetadata>({})
  const [priorMeetings, setPriorMeetings] = useState<PriorMeeting[]>([])
  const [loadingPriorMeetings, setLoadingPriorMeetings] = useState(false)
  const [meetingLogs, setMeetingLogs] = useState<MeetingLogSummary[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null)
  const [meetingTitle, setMeetingTitle] = useState("")
  const { toast } = useToast()

  useEffect(() => {
    if (clientId) {
      setLoadingPriorMeetings(true)
      getPriorMeetings(clientId, 3)
        .then(setPriorMeetings)
        .catch(() => setPriorMeetings([]))
        .finally(() => setLoadingPriorMeetings(false))
    } else {
      setPriorMeetings([])
    }
  }, [clientId])

  useEffect(() => {
    if (searchParams.get('fromCalendar') === 'true') {
      const geminiNotes = sessionStorage.getItem('geminiNotes')
      const geminiNotesTitle = sessionStorage.getItem('geminiNotesTitle')
      const geminiNotesClientId = sessionStorage.getItem('geminiNotesClientId')
      const geminiNotesClientName = sessionStorage.getItem('geminiNotesClientName')
      const geminiNotesEventId = sessionStorage.getItem('geminiNotesEventId')
      const geminiNotesDatetime = sessionStorage.getItem('geminiNotesDatetime')
      const geminiNotesAttendees = sessionStorage.getItem('geminiNotesAttendees')
      const geminiNotesMeetLink = sessionStorage.getItem('geminiNotesMeetLink')

      if (geminiNotes) {
        setNotes(geminiNotes)
        if (geminiNotesClientId) {
          setClientId(geminiNotesClientId)
        }
        setMetadata({
          clientId: geminiNotesClientId || undefined,
          clientName: geminiNotesClientName || undefined,
          eventId: geminiNotesEventId || undefined,
          datetime: geminiNotesDatetime || undefined,
          attendees: geminiNotesAttendees ? JSON.parse(geminiNotesAttendees) : undefined,
          meetLink: geminiNotesMeetLink || undefined,
          hasGeminiNotes: true,
        })

        sessionStorage.removeItem('geminiNotes')
        sessionStorage.removeItem('geminiNotesTitle')
        sessionStorage.removeItem('geminiNotesClientId')
        sessionStorage.removeItem('geminiNotesClientName')
        sessionStorage.removeItem('geminiNotesEventId')
        sessionStorage.removeItem('geminiNotesDatetime')
        sessionStorage.removeItem('geminiNotesAttendees')
        sessionStorage.removeItem('geminiNotesMeetLink')

        toast({
          title: "Notes imported",
          description: geminiNotesTitle 
            ? `Gemini notes from "${geminiNotesTitle}" loaded.`
            : "Gemini notes loaded from calendar event.",
        })
      }
    }
  }, [searchParams, toast])

  const notesCompleteness = () => {
    const length = notes.trim().length
    if (length < 200) return { level: "Low", color: "destructive" as const }
    if (length < 500) return { level: "Medium", color: "secondary" as const }
    return { level: "High", color: "default" as const }
  }

  const handleAnalyze = async () => {
    setAnalyzing(true)
    setError(null)
    setOutput(null)
    setTasks([])
    setSaved(false)

    const selectedProject = projects.find(p => p.id === projectId)
    const selectedClient = clients.find(c => c.id === clientId)
    
    const fullMetadata: MeetingMetadata = {
      ...metadata,
      clientId: clientId || metadata.clientId,
      clientName: selectedClient?.name || metadata.clientName,
    }

    try {
      const result = await analyzeMeetingNotes(
        notes, 
        projectId || null, 
        selectedProject?.name || null,
        fullMetadata
      )
      if (result.success && result.output) {
        setOutput(result.output)
        setTasks(
          result.output.tasks.map((t) => ({
            ...t,
            selected: true,
            overrideAssigneeId: t.matchedPersonId,
          }))
        )
      } else {
        setError(result.error || "Analysis failed")
      }
    } catch (err) {
      setError("An unexpected error occurred")
    } finally {
      setAnalyzing(false)
    }
  }

  const handleCreateTasks = async () => {
    if (!projectId) {
      toast({
        title: "Select a project",
        description: "Please select a project to create tasks in.",
        variant: "destructive",
      })
      return
    }

    const selectedTasks = tasks.filter((t) => t.selected)
    if (selectedTasks.length === 0) {
      toast({
        title: "No tasks selected",
        description: "Please select at least one task to create.",
        variant: "destructive",
      })
      return
    }

    setCreating(true)
    try {
      const result = await createTasksFromAnalysis(
        projectId,
        selectedTasks.map((t) => ({
          title: t.title,
          description: t.description,
          evidence: t.evidence,
          assigneePersonId: t.overrideAssigneeId,
          priority: t.priority,
          category: t.category,
          dueDate: t.suggestedDueDate,
        }))
      )

      if (result.success) {
        toast({
          title: "Tasks created",
          description: `Successfully created ${result.createdCount} task${result.createdCount !== 1 ? "s" : ""}.`,
        })
        setTasks((prev) => prev.filter((t) => !t.selected))
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to create tasks",
          variant: "destructive",
        })
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      })
    } finally {
      setCreating(false)
    }
  }

  const toggleTask = (index: number) => {
    setTasks((prev) =>
      prev.map((t, i) => (i === index ? { ...t, selected: !t.selected } : t))
    )
  }

  const updateAssignee = (index: number, personId: string | null) => {
    setTasks((prev) =>
      prev.map((t, i) => (i === index ? { ...t, overrideAssigneeId: personId } : t))
    )
  }

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
    toast({ title: "Copied to clipboard" })
  }

  const priorityColor = (priority: string) => {
    switch (priority) {
      case "P0":
        return "destructive"
      case "P1":
        return "default"
      case "P2":
        return "secondary"
      default:
        return "outline"
    }
  }

  const handleSaveToLogs = async () => {
    if (!output) return

    setSaving(true)
    try {
      const result = await saveMeetingLog(
        meetingTitle || output.meeting || "Untitled Meeting",
        notes,
        output,
        clientId || undefined,
        projectId || undefined
      )

      if (result.success) {
        setSaved(true)
        toast({
          title: "Saved to logs",
          description: "Meeting notes have been saved successfully.",
        })
        // Refresh logs if panel is open
        if (showLogs) {
          loadMeetingLogs()
        }
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to save meeting notes",
          variant: "destructive",
        })
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const loadMeetingLogs = async () => {
    setLoadingLogs(true)
    try {
      const logs = await getMeetingLogs(20)
      setMeetingLogs(logs)
    } catch (err) {
      console.error("Error loading meeting logs:", err)
    } finally {
      setLoadingLogs(false)
    }
  }

  const handleToggleLogs = () => {
    if (!showLogs) {
      loadMeetingLogs()
    }
    setShowLogs(!showLogs)
  }

  const impactColor = (impact: string) => {
    switch (impact) {
      case "High":
        return "text-green-600 dark:text-green-400"
      case "Med":
        return "text-yellow-600 dark:text-yellow-400"
      case "Low":
        return "text-gray-500"
      default:
        return ""
    }
  }

  const completeness = notesCompleteness()

  return (
    <div className="container mx-auto py-6 px-4 sm:px-6 max-w-6xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-purple-500" />
            AI Meeting Analyzer
          </h1>
          <p className="text-muted-foreground">
            Turn meeting notes into actionable strategy and tasks
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleToggleLogs}
          className="w-full sm:w-auto"
        >
          <BookOpen className="mr-2 h-4 w-4" />
          {showLogs ? "Hide" : "View"} Saved Logs
          {showLogs ? <ChevronUp className="ml-2 h-4 w-4" /> : <ChevronDown className="ml-2 h-4 w-4" />}
        </Button>
      </div>

      {showLogs && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Saved Meeting Logs
            </CardTitle>
            <CardDescription>
              Previously analyzed and saved meeting notes
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingLogs ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : meetingLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No saved meeting logs yet</p>
                <p className="text-sm">Analyze meeting notes and save them to view here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {meetingLogs.map((log) => (
                  <div key={log.id} className="border rounded-lg">
                    <button
                      onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                      className="w-full p-4 flex items-start justify-between text-left hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-medium">{log.title}</h4>
                          {log.clientName && (
                            <Badge variant="outline" className="text-xs">{log.clientName}</Badge>
                          )}
                          {log.projectName && (
                            <Badge variant="secondary" className="text-xs">{log.projectName}</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {format(new Date(log.datetime), "MMM d, yyyy 'at' h:mm a")}
                        </p>
                        {log.executiveBrief && expandedLogId !== log.id && (
                          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                            {log.executiveBrief.split('\n')[0]}
                          </p>
                        )}
                      </div>
                      {expandedLogId === log.id ? (
                        <ChevronUp className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      )}
                    </button>
                    
                    {expandedLogId === log.id && (
                      <div className="px-4 pb-4 space-y-4 border-t pt-4">
                        {log.executiveBrief && (
                          <div>
                            <h5 className="font-medium text-sm flex items-center gap-2 mb-2">
                              <Target className="h-4 w-4" />
                              Brief
                            </h5>
                            <ul className="space-y-1 text-sm">
                              {log.executiveBrief.split('\n').map((line, i) => (
                                line.trim() && (
                                  <li key={i} className="flex items-start gap-2">
                                    <ArrowRight className="h-3 w-3 mt-1 text-muted-foreground flex-shrink-0" />
                                    <span>{line}</span>
                                  </li>
                                )
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {log.rankedMoves && log.rankedMoves.length > 0 && (
                          <div>
                            <h5 className="font-medium text-sm flex items-center gap-2 mb-2">
                              <ListChecks className="h-4 w-4" />
                              Moves ({log.rankedMoves.length})
                            </h5>
                            <div className="space-y-2">
                              {log.rankedMoves.slice(0, 3).map((move, i) => (
                                <div key={i} className="text-sm border-l-2 pl-3 py-1">
                                  <div className="font-medium">{i + 1}. {move.title}</div>
                                  <div className="text-muted-foreground text-xs">{move.why}</div>
                                </div>
                              ))}
                              {log.rankedMoves.length > 3 && (
                                <p className="text-xs text-muted-foreground">+{log.rankedMoves.length - 3} more moves</p>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {log.risksGapsContradictions && log.risksGapsContradictions.length > 0 && (
                          <div>
                            <h5 className="font-medium text-sm flex items-center gap-2 mb-2">
                              <AlertTriangle className="h-4 w-4 text-yellow-500" />
                              Risks ({log.risksGapsContradictions.length})
                            </h5>
                            <div className="space-y-2">
                              {log.risksGapsContradictions.slice(0, 2).map((item, i) => (
                                <div key={i} className="text-sm border-l-2 border-yellow-300 pl-3 py-1">
                                  <div className="font-medium text-yellow-700 dark:text-yellow-400">{item.risk}</div>
                                  <div className="text-muted-foreground text-xs">{item.nextStep}</div>
                                </div>
                              ))}
                              {log.risksGapsContradictions.length > 2 && (
                                <p className="text-xs text-muted-foreground">+{log.risksGapsContradictions.length - 2} more risks</p>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {log.creativeIdeas && log.creativeIdeas.length > 0 && (
                          <div>
                            <h5 className="font-medium text-sm flex items-center gap-2 mb-2">
                              <Lightbulb className="h-4 w-4 text-yellow-500" />
                              Ideas ({log.creativeIdeas.length})
                            </h5>
                            <div className="flex flex-wrap gap-2">
                              {log.creativeIdeas.slice(0, 4).map((idea, i) => (
                                <Badge key={i} variant="outline" className="text-xs">
                                  {idea.idea}
                                </Badge>
                              ))}
                              {log.creativeIdeas.length > 4 && (
                                <Badge variant="secondary" className="text-xs">+{log.creativeIdeas.length - 4} more</Badge>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                <span>AI Meeting Analyzer</span>
                <Badge variant={completeness.color}>
                  {completeness.level} completeness
                </Badge>
              </CardTitle>
              <CardDescription>
                Paste meeting notes or transcripts (Gemini notes work best)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {metadata.hasGeminiNotes && (
                <div className="flex items-center gap-2 text-sm text-purple-600 dark:text-purple-400">
                  <Sparkles className="h-4 w-4" />
                  <span>Gemini notes imported from calendar</span>
                </div>
              )}
              
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="client">Client</Label>
                  <Select value={clientId} onValueChange={setClientId}>
                    <SelectTrigger id="client">
                      <SelectValue placeholder="Select client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="project">Target Project</Label>
                  <Select value={projectId} onValueChange={setProjectId}>
                    <SelectTrigger id="project">
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {clientId && priorMeetings.length > 0 && (
                <div className="border rounded-lg p-3 bg-muted/30">
                  <div className="flex items-center gap-2 text-sm font-medium mb-2">
                    <Calendar className="h-4 w-4" />
                    Prior Calls ({priorMeetings.length})
                  </div>
                  <div className="space-y-2">
                    {priorMeetings.map((meeting) => (
                      <div key={meeting.id} className="text-xs border-l-2 pl-2 py-1">
                        <div className="font-medium">{meeting.title}</div>
                        <div className="text-muted-foreground">
                          {format(new Date(meeting.datetime), "MMM d, yyyy")}
                        </div>
                        {meeting.executiveBrief && (
                          <p className="text-muted-foreground mt-1 line-clamp-2">
                            {meeting.executiveBrief.split('\n')[0]}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {clientId && loadingPriorMeetings && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading prior calls...
                </div>
              )}

              <div>
                <Textarea
                  placeholder="Paste your meeting notes here..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="min-h-[300px] font-mono text-sm"
                />
              </div>

              <Button
                onClick={handleAnalyze}
                disabled={!notes.trim() || analyzing}
                className="w-full"
                size="lg"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Analyze with AI Strategist
                  </>
                )}
              </Button>

              {error && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {output ? (
            <>
              <Card className="bg-muted/30">
                <CardContent className="py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="flex-1">
                      <Label htmlFor="meetingTitle" className="text-sm">Meeting Title (optional)</Label>
                      <Input
                        id="meetingTitle"
                        placeholder={output.meeting || "Enter a title for this meeting log"}
                        value={meetingTitle}
                        onChange={(e) => setMeetingTitle(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <Button
                      onClick={handleSaveToLogs}
                      disabled={saving || saved}
                      className="w-full sm:w-auto"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : saved ? (
                        <>
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Saved to Logs
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Save to Logs
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Tabs defaultValue="brief" className="w-full">
                <TabsList className="grid w-full grid-cols-5">
                  <TabsTrigger value="brief">Brief</TabsTrigger>
                  <TabsTrigger value="moves">Moves</TabsTrigger>
                  <TabsTrigger value="risks">Risks</TabsTrigger>
                  <TabsTrigger value="ideas">Ideas</TabsTrigger>
                  <TabsTrigger value="email">Email</TabsTrigger>
                </TabsList>

              <TabsContent value="brief" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Target className="h-5 w-5" />
                      Executive Brief
                    </CardTitle>
                    <CardDescription>
                      {output.client && <span className="mr-2">Client: {output.client}</span>}
                      {output.meeting && <span>Meeting: {output.meeting}</span>}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {output.executiveBrief.map((item, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <ArrowRight className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="moves" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <ListChecks className="h-5 w-5" />
                      What You Need Next (Ranked)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[400px] pr-4">
                      <div className="space-y-4">
                        {output.rankedMoves.map((move, i) => (
                          <div key={i} className="border rounded-lg p-4">
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="font-medium">{i + 1}. {move.title}</h4>
                              <div className="flex gap-1 flex-shrink-0">
                                <Badge variant="outline" className={impactColor(move.impact)}>
                                  Impact: {move.impact}
                                </Badge>
                                <Badge variant="outline">
                                  Effort: {move.effort}
                                </Badge>
                              </div>
                            </div>
                            <p className="text-sm text-muted-foreground mt-2">{move.why}</p>
                            <p className="text-xs text-muted-foreground mt-2 italic border-l-2 pl-2">
                              Evidence: {move.evidence}
                            </p>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="risks" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-yellow-500" />
                      Risks, Gaps & Contradictions
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[400px] pr-4">
                      <div className="space-y-4">
                        {output.risksGapsContradictions.length === 0 ? (
                          <p className="text-muted-foreground text-sm">No significant risks identified.</p>
                        ) : (
                          output.risksGapsContradictions.map((item, i) => (
                            <div key={i} className="border border-yellow-200 dark:border-yellow-900 rounded-lg p-4 bg-yellow-50 dark:bg-yellow-950/30">
                              <h4 className="font-medium text-yellow-700 dark:text-yellow-400">{item.risk}</h4>
                              <p className="text-sm mt-1">{item.why}</p>
                              <p className="text-sm text-muted-foreground mt-2">
                                <strong>Next step:</strong> {item.nextStep}
                              </p>
                              <p className="text-xs text-muted-foreground mt-2 italic border-l-2 border-yellow-300 pl-2">
                                Evidence: {item.evidence}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="ideas" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Lightbulb className="h-5 w-5 text-yellow-500" />
                      Creative & Strategic Ideas
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[400px] pr-4">
                      <div className="space-y-4">
                        {output.creativeIdeas.map((idea, i) => (
                          <div key={i} className="border rounded-lg p-4">
                            <h4 className="font-medium">{idea.idea}</h4>
                            <p className="text-sm mt-1">{idea.description}</p>
                            <div className="grid gap-1 mt-2 text-xs text-muted-foreground">
                              <p><strong>Fit:</strong> {idea.fit}</p>
                              <p><strong>Feasibility:</strong> {idea.feasibility}</p>
                              <p><strong>Measurement:</strong> {idea.measurement}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="email" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Mail className="h-5 w-5" />
                      Client Follow-up
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {output.followUpSubject && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Subject</Label>
                        <div className="flex items-center gap-2 mt-1">
                          <Input value={output.followUpSubject} readOnly className="font-medium" />
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => copyToClipboard(output.followUpSubject!, "subject")}
                          >
                            {copiedField === "subject" ? (
                              <Check className="h-4 w-4" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                    {output.followUpBody && (
                      <div>
                        <div className="flex items-center justify-between">
                          <Label className="text-xs text-muted-foreground">Email Body</Label>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(output.followUpBody!, "body")}
                          >
                            {copiedField === "body" ? (
                              <>
                                <Check className="h-3 w-3 mr-1" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3 mr-1" />
                                Copy
                              </>
                            )}
                          </Button>
                        </div>
                        <Textarea 
                          value={output.followUpBody} 
                          readOnly 
                          className="mt-1 min-h-[200px] text-sm"
                        />
                      </div>
                    )}
                    {output.nextMeetingAgenda && (
                      <div>
                        <div className="flex items-center justify-between">
                          <Label className="text-xs text-muted-foreground">Next Meeting Agenda</Label>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(output.nextMeetingAgenda!, "agenda")}
                          >
                            {copiedField === "agenda" ? (
                              <>
                                <Check className="h-3 w-3 mr-1" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3 mr-1" />
                                Copy
                              </>
                            )}
                          </Button>
                        </div>
                        <Textarea 
                          value={output.nextMeetingAgenda} 
                          readOnly 
                          className="mt-1 min-h-[100px] text-sm"
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
            </>
          ) : (
            <Card className="h-full flex items-center justify-center min-h-[400px]">
              <CardContent className="text-center text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Paste meeting notes and click analyze to see strategic insights</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {output && tasks.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ListChecks className="h-5 w-5" />
                  Tasks to Create ({tasks.filter((t) => t.selected).length} selected)
                </CardTitle>
                <CardDescription>
                  Review and create tasks in your project
                </CardDescription>
              </div>
              <Button
                onClick={handleCreateTasks}
                disabled={creating || !projectId || tasks.filter((t) => t.selected).length === 0}
                className="w-full sm:w-auto"
              >
                {creating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Create Selected Tasks
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {tasks.map((task, index) => (
                <div
                  key={index}
                  className={`border rounded-lg p-4 transition-colors ${
                    task.selected ? "bg-muted/50" : "opacity-60"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={task.selected}
                      onCheckedChange={() => toggleTask(index)}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{task.title}</span>
                        <Badge variant={priorityColor(task.priority) as any}>
                          {task.priority}
                        </Badge>
                        <Badge variant="outline">{task.category}</Badge>
                      </div>
                      {task.description && (
                        <p className="text-sm text-muted-foreground">{task.description}</p>
                      )}
                      {task.evidence && (
                        <p className="text-xs text-muted-foreground italic border-l-2 pl-2">
                          Evidence: {task.evidence}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <Select
                            value={task.overrideAssigneeId || "unassigned"}
                            onValueChange={(v) =>
                              updateAssignee(index, v === "unassigned" ? null : v)
                            }
                          >
                            <SelectTrigger className="h-8 w-[180px]">
                              <SelectValue placeholder="Assign to..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">Unassigned</SelectItem>
                              {people.map((person) => (
                                <SelectItem key={person.id} value={person.id}>
                                  {person.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {task.suggestedDueDate && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            <span>{task.suggestedDueDate}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
