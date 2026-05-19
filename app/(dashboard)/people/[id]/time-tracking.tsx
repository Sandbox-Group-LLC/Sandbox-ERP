"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChevronLeft, ChevronRight, Download, ChevronDown, ChevronUp, Clock, Check, Save } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

const LABOR_TYPES = [
  { key: "BILLABLE", label: "Billable Hours", rate: 100 },
  { key: "BUSINESS_DEV", label: "Business Development", rate: 60 },
  { key: "OPS_ADMIN", label: "Ops & Admin", rate: 40 },
  { key: "SYSTEMS_IP", label: "Systems / IP", rate: 65 },
]

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const

interface TimeEntry {
  laborType: string
  monday: number
  tuesday: number
  wednesday: number
  thursday: number
  friday: number
  submittedAt: string | null
}

interface SubmittedWeek {
  weekStart: string
  entries: TimeEntry[]
  submittedAt: string
}

function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0]
}

function formatWeekRange(weekStart: Date): string {
  const friday = new Date(weekStart)
  friday.setDate(friday.getDate() + 4)
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }
  return `${weekStart.toLocaleDateString("en-US", options)} - ${friday.toLocaleDateString("en-US", options)}, ${weekStart.getFullYear()}`
}

export function TimeTracking({ personId }: { personId: string }) {
  const { toast } = useToast()
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()))
  const [entries, setEntries] = useState<Record<string, Record<string, number>>>({})
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [submittedWeeks, setSubmittedWeeks] = useState<SubmittedWeek[]>([])
  const [isLogOpen, setIsLogOpen] = useState(false)

  const initializeEntries = useCallback(() => {
    const initial: Record<string, Record<string, number>> = {}
    LABOR_TYPES.forEach(({ key }) => {
      initial[key] = { monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0 }
    })
    return initial
  }, [])

  const fetchEntries = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch(
        `/api/time-entries?personId=${personId}&weekStart=${formatDate(weekStart)}`
      )
      if (response.ok) {
        const data = await response.json()
        const newEntries = initializeEntries()
        let submitted = false
        data.forEach((entry: TimeEntry) => {
          newEntries[entry.laborType] = {
            monday: entry.monday,
            tuesday: entry.tuesday,
            wednesday: entry.wednesday,
            thursday: entry.thursday,
            friday: entry.friday,
          }
          if (entry.submittedAt) submitted = true
        })
        setEntries(newEntries)
        setIsSubmitted(submitted)
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to load time entries", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }, [personId, weekStart, initializeEntries, toast])

  const fetchSubmittedWeeks = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/time-entries?personId=${personId}&submittedOnly=true`
      )
      if (response.ok) {
        const data = await response.json()
        const grouped: Record<string, { entries: TimeEntry[]; submittedAt: string }> = {}
        data.forEach((entry: TimeEntry & { weekStart: string }) => {
          const key = entry.weekStart.split("T")[0]
          if (!grouped[key]) {
            grouped[key] = { entries: [], submittedAt: entry.submittedAt! }
          }
          grouped[key].entries.push(entry)
        })
        const weeks = Object.entries(grouped)
          .map(([weekStart, { entries, submittedAt }]) => ({
            weekStart,
            entries,
            submittedAt,
          }))
          .sort((a, b) => new Date(b.weekStart).getTime() - new Date(a.weekStart).getTime())
        setSubmittedWeeks(weeks)
      }
    } catch (error) {
      console.error("Failed to fetch submitted weeks:", error)
    }
  }, [personId])

  useEffect(() => {
    setEntries(initializeEntries())
    fetchEntries()
  }, [weekStart, fetchEntries, initializeEntries])

  useEffect(() => {
    fetchSubmittedWeeks()
  }, [fetchSubmittedWeeks])

  const handleChange = (laborType: string, day: string, value: string) => {
    const numValue = parseFloat(value) || 0
    setEntries((prev) => ({
      ...prev,
      [laborType]: {
        ...prev[laborType],
        [day]: Math.max(0, Math.min(24, numValue)),
      },
    }))
  }

  const handleSave = async (submit = false) => {
    setIsSaving(true)
    try {
      const entryData = LABOR_TYPES.map(({ key }) => ({
        laborType: key,
        ...entries[key],
      }))
      const response = await fetch("/api/time-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personId,
          weekStart: formatDate(weekStart),
          entries: entryData,
          submit,
        }),
      })
      if (response.ok) {
        toast({
          title: submit ? "Hours submitted" : "Hours saved",
          description: submit
            ? `Week of ${formatWeekRange(weekStart)} has been submitted.`
            : "Your hours have been saved as a draft.",
        })
        if (submit) {
          setIsSubmitted(true)
          fetchSubmittedWeeks()
        }
      } else {
        throw new Error("Failed to save")
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to save time entries", variant: "destructive" })
    } finally {
      setIsSaving(false)
    }
  }

  const handleUnsubmit = async () => {
    setIsSaving(true)
    try {
      const entryData = LABOR_TYPES.map(({ key }) => ({
        laborType: key,
        ...entries[key],
      }))
      const response = await fetch("/api/time-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personId,
          weekStart: formatDate(weekStart),
          entries: entryData,
          submit: false,
          unsubmit: true,
        }),
      })
      if (response.ok) {
        toast({
          title: "Week unlocked",
          description: "You can now edit this week's entries.",
        })
        setIsSubmitted(false)
        fetchSubmittedWeeks()
      } else {
        throw new Error("Failed to unsubmit")
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to unlock week", variant: "destructive" })
    } finally {
      setIsSaving(false)
    }
  }

  const handleExport = () => {
    window.open(`/api/time-entries/export?personId=${personId}`, "_blank")
  }

  const navigateWeek = (direction: number) => {
    const newDate = new Date(weekStart)
    newDate.setDate(newDate.getDate() + direction * 7)
    setWeekStart(newDate)
  }

  const getRowTotal = (laborType: string) => {
    if (!entries[laborType]) return 0
    return DAYS.reduce((sum, day) => sum + (entries[laborType][day] || 0), 0)
  }

  const getDayTotal = (day: string) => {
    return LABOR_TYPES.reduce(
      (sum, { key }) => sum + (entries[key]?.[day] || 0),
      0
    )
  }

  const getGrandTotal = () => {
    return LABOR_TYPES.reduce((sum, { key }) => sum + getRowTotal(key), 0)
  }

  const getRowEarnings = (laborType: string) => {
    const type = LABOR_TYPES.find((t) => t.key === laborType)
    if (!type) return 0
    return getRowTotal(laborType) * type.rate
  }

  const getWeeklyPay = () => {
    return LABOR_TYPES.reduce((sum, { key }) => sum + getRowEarnings(key), 0)
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Weekly Time Entry
            </CardTitle>
            <CardDescription>Track hours by labor type for each day of the week</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => navigateWeek(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[180px] text-center">
              {formatWeekRange(weekStart)}
            </span>
            <Button variant="outline" size="icon" onClick={() => navigateWeek(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-2 font-medium">Labor Type</th>
                      <th className="text-center py-2 px-1 font-medium w-16">Rate</th>
                      <th className="text-center py-2 px-2 font-medium w-16">Mon</th>
                      <th className="text-center py-2 px-2 font-medium w-16">Tue</th>
                      <th className="text-center py-2 px-2 font-medium w-16">Wed</th>
                      <th className="text-center py-2 px-2 font-medium w-16">Thu</th>
                      <th className="text-center py-2 px-2 font-medium w-16">Fri</th>
                      <th className="text-center py-2 px-1 font-medium w-16">Hours</th>
                      <th className="text-right py-2 pl-2 font-medium w-24">Earnings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {LABOR_TYPES.map(({ key, label, rate }) => (
                      <tr key={key} className="border-b">
                        <td className="py-2 pr-2 font-medium">{label}</td>
                        <td className="py-2 px-1 text-center text-muted-foreground">
                          ${rate}
                        </td>
                        {DAYS.map((day) => (
                          <td key={day} className="py-2 px-1">
                            <Input
                              type="number"
                              min="0"
                              max="24"
                              step="0.5"
                              value={entries[key]?.[day] || ""}
                              onChange={(e) => handleChange(key, day, e.target.value)}
                              disabled={isSubmitted}
                              className="w-full text-center h-8"
                              placeholder="0"
                            />
                          </td>
                        ))}
                        <td className="py-2 px-1 text-center font-medium">
                          {getRowTotal(key).toFixed(1)}
                        </td>
                        <td className="py-2 pl-2 text-right font-medium">
                          ${getRowEarnings(key).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-muted/50">
                      <td className="py-2 pr-2 font-semibold">Daily Total</td>
                      <td className="py-2 px-1"></td>
                      {DAYS.map((day) => (
                        <td key={day} className="py-2 px-1 text-center font-semibold">
                          {getDayTotal(day).toFixed(1)}
                        </td>
                      ))}
                      <td className="py-2 px-1 text-center font-bold text-primary">
                        {getGrandTotal().toFixed(1)}
                      </td>
                      <td className="py-2 pl-2 text-right font-bold text-green-600 dark:text-green-400">
                        ${getWeeklyPay().toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap gap-2 mt-4 justify-end">
                {isSubmitted ? (
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                      <Check className="h-4 w-4" />
                      <span className="text-sm font-medium">Week submitted</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUnsubmit()}
                      disabled={isSaving}
                    >
                      Edit Week
                    </Button>
                  </div>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => handleSave(false)}
                      disabled={isSaving}
                    >
                      <Save className="h-4 w-4 mr-2" />
                      Save Draft
                    </Button>
                    <Button onClick={() => handleSave(true)} disabled={isSaving}>
                      <Check className="h-4 w-4 mr-2" />
                      Submit Week
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Collapsible open={isLogOpen} onOpenChange={setIsLogOpen}>
        <Card>
          <CardHeader className="py-3">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent">
                <CardTitle className="text-base flex items-center gap-2">
                  Submitted Weeks Log ({submittedWeeks.length})
                </CardTitle>
                {isLogOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="pt-0">
              {submittedWeeks.length > 0 ? (
                <>
                  <div className="flex justify-end mb-3">
                    <Button variant="outline" size="sm" onClick={handleExport}>
                      <Download className="h-4 w-4 mr-2" />
                      Export to Excel
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {submittedWeeks.map((week) => {
                      const weekDate = new Date(week.weekStart)
                      let weekTotal = 0
                      let weekEarnings = 0
                      week.entries.forEach((entry) => {
                        const type = LABOR_TYPES.find((t) => t.key === entry.laborType)
                        const hours = entry.monday + entry.tuesday + entry.wednesday + entry.thursday + entry.friday
                        weekTotal += hours
                        weekEarnings += hours * (type?.rate || 0)
                      })
                      return (
                        <div
                          key={week.weekStart}
                          className="p-3 rounded-lg bg-muted/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                        >
                          <div>
                            <p className="font-medium">{formatWeekRange(weekDate)}</p>
                            <p className="text-xs text-muted-foreground">
                              Submitted:{" "}
                              {new Date(week.submittedAt).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-green-600 dark:text-green-400">
                              ${weekEarnings.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                            <p className="text-sm text-muted-foreground">{weekTotal.toFixed(1)} hours</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No submitted time entries yet
                </p>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  )
}
