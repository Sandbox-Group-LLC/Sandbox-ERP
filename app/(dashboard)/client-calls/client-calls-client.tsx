"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { format, subMonths } from "date-fns"
import { Calendar, ExternalLink, Users, Video, Search, AlertCircle, FileText, Sparkles, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { searchClientCalls, fetchGeminiNotes, checkGoogleConnection, CalendarEvent } from "./actions"
import Link from "next/link"

interface Props {
  clients: { id: string; name: string }[]
  isCalendarConnected: boolean
  isGoogleConnected: boolean
}

export function ClientCallsClient({ clients, isCalendarConnected, isGoogleConnected: initialGoogleConnected }: Props) {
  const router = useRouter()
  const [selectedClient, setSelectedClient] = useState<string>("")
  const [startDate, setStartDate] = useState(format(subMonths(new Date(), 3), "yyyy-MM-dd"))
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"))
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [loadingNotesFor, setLoadingNotesFor] = useState<string | null>(null)
  const [isGoogleConnected, setIsGoogleConnected] = useState(initialGoogleConnected)
  const [showConnectPrompt, setShowConnectPrompt] = useState(false)

  const handleSearch = async () => {
    if (!selectedClient) return

    setIsSearching(true)
    setError(null)
    setHasSearched(true)

    const result = await searchClientCalls(selectedClient, startDate, endDate)

    if (result.success && result.events) {
      setEvents(result.events)
    } else {
      setError(result.error || "Failed to search calendar")
      setEvents([])
    }

    setIsSearching(false)
  }

  const handlePullNotes = async (event: CalendarEvent) => {
    const notesAttachment = event.attachments.find((a) => {
      const title = a.title.toLowerCase()
      return title.includes('meeting notes') || 
             title.includes('notes from') ||
             title.includes('meet notes') ||
             title.includes('gemini notes') ||
             title.includes('notes by gemini') ||
             (title.includes('notes') && title.includes('gemini')) ||
             (title.includes('notes') && title.includes('-'))
    })
    
    if (!notesAttachment) {
      setError("Could not find Gemini notes attachment. Please try opening the document directly.")
      return
    }

    setLoadingNotesFor(event.id)

    const result = await fetchGeminiNotes(notesAttachment.fileId)

    if (result.success && result.content) {
      try {
        sessionStorage.setItem('geminiNotes', result.content)
        sessionStorage.setItem('geminiNotesTitle', event.title)
        sessionStorage.setItem('geminiNotesClientId', selectedClient)
        sessionStorage.setItem('geminiNotesClientName', selectedClientName || '')
        sessionStorage.setItem('geminiNotesEventId', event.id)
        sessionStorage.setItem('geminiNotesDatetime', event.start)
        sessionStorage.setItem('geminiNotesAttendees', JSON.stringify(event.attendees))
        sessionStorage.setItem('geminiNotesMeetLink', event.meetLink || '')
        router.push('/meeting-notes?fromCalendar=true')
      } catch (storageError) {
        setError("Notes are too large to transfer. Please copy them manually from the Google Doc.")
      }
    } else if (result.needsConnection) {
      setShowConnectPrompt(true)
      setError(null)
    } else {
      setError(result.error || "Failed to fetch notes")
    }

    setLoadingNotesFor(null)
  }

  const selectedClientName = clients.find((c) => c.id === selectedClient)?.name

  if (!isCalendarConnected) {
    return (
      <div className="container mx-auto py-6 px-4 sm:px-6">
        <h1 className="text-2xl font-bold mb-6">Calendar Search</h1>
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Calendar Not Connected</AlertTitle>
          <AlertDescription>
            Please connect Google Calendar in your settings to use this feature.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-6 px-4 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Calendar Search</h1>
          <p className="text-muted-foreground">Find calendar events related to your clients</p>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Search Criteria</CardTitle>
          <CardDescription>Select a client and date range to find matching calendar events</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <Label htmlFor="client">Client</Label>
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger id="client">
                  <SelectValue placeholder="Select a client" />
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
              <Label htmlFor="startDate">From</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="endDate">To</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-4">
            <Button
              onClick={handleSearch}
              disabled={!selectedClient || isSearching}
              className="w-full sm:w-auto"
            >
              <Search className="mr-2 h-4 w-4" />
              {isSearching ? "Searching..." : "Search Calendar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {showConnectPrompt && (
        <Alert className="mb-6 border-purple-500">
          <Sparkles className="h-4 w-4 text-purple-500" />
          <AlertTitle>Connect Google Account</AlertTitle>
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center gap-3">
            <span>To access Gemini notes, please connect your Google account with the required permissions.</span>
            <Button
              size="sm"
              className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700"
              onClick={() => {
                window.location.href = '/api/auth/google?returnTo=/client-calls'
              }}
            >
              Connect Google
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!isGoogleConnected && !showConnectPrompt && (
        <Alert className="mb-6">
          <Sparkles className="h-4 w-4" />
          <AlertTitle>Gemini Notes Access</AlertTitle>
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center gap-3">
            <span>Connect your Google account to pull Gemini meeting notes directly into the Meeting Strategist.</span>
            <Button
              size="sm"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => {
                window.location.href = '/api/auth/google?returnTo=/client-calls'
              }}
            >
              Connect Google
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {hasSearched && !error && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {selectedClientName ? `Events for ${selectedClientName}` : "Search Results"}
            </CardTitle>
            <CardDescription>
              Found {events.length} event{events.length !== 1 ? "s" : ""} matching your search
            </CardDescription>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No calendar events found for this client in the selected date range.
              </p>
            ) : (
              <div className="space-y-4">
                {events.map((event) => (
                  <div
                    key={event.id}
                    className="border rounded-lg p-4 hover:bg-muted/50 transition-colors overflow-hidden"
                  >
                    <div className="flex flex-col gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium truncate">{event.title}</h3>
                          {event.hasGeminiNotes ? (
                            <Badge variant="default" className="bg-purple-600 hover:bg-purple-700 flex-shrink-0">
                              <Sparkles className="mr-1 h-3 w-3" />
                              Gemini Notes
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground flex-shrink-0">
                              No Notes
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                          <Calendar className="h-4 w-4 flex-shrink-0" />
                          <span>
                            {format(new Date(event.start), "MMM d, yyyy")} at{" "}
                            {format(new Date(event.start), "h:mm a")}
                          </span>
                        </div>
                        {event.attendees.length > 0 && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                            <Users className="h-4 w-4 flex-shrink-0" />
                            <span className="truncate">
                              {event.attendees.slice(0, 3).join(", ")}
                              {event.attendees.length > 3 && ` +${event.attendees.length - 3} more`}
                            </span>
                          </div>
                        )}
                        {event.description && (
                          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                            {event.description}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {event.hasGeminiNotes && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handlePullNotes(event)}
                            disabled={loadingNotesFor === event.id}
                          >
                            {loadingNotesFor === event.id ? (
                              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                            ) : (
                              <Sparkles className="mr-1 h-4 w-4" />
                            )}
                            Pull Notes
                          </Button>
                        )}
                        {event.meetLink && (
                          <Button variant="outline" size="sm" asChild>
                            <a href={event.meetLink} target="_blank" rel="noopener noreferrer">
                              <Video className="mr-1 h-4 w-4" />
                              Meet
                            </a>
                          </Button>
                        )}
                        <Button variant="outline" size="sm" asChild>
                          <a href={event.htmlLink} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="mr-1 h-4 w-4" />
                            Calendar
                          </a>
                        </Button>
                        {!event.hasGeminiNotes && (
                          <Button variant="outline" size="sm" asChild>
                            <Link href="/meeting-notes">
                              <FileText className="mr-1 h-4 w-4" />
                              Add Notes
                            </Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
