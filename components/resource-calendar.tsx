"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar, Loader2 } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { OOOEvent, ProjectDateRange, CalendarData } from "@/app/(dashboard)/dashboard-calendar-actions"

function isSameDay(date1: Date, date2: Date): boolean {
  return date1.getFullYear() === date2.getFullYear() &&
         date1.getMonth() === date2.getMonth() &&
         date1.getDate() === date2.getDate()
}

function parseLocalDate(dateStr: string): Date {
  // For date-only strings like "2026-02-11", parse as local date to avoid UTC shift
  if (dateStr.length === 10 && dateStr.includes('-')) {
    const [year, month, day] = dateStr.split('-').map(Number)
    return new Date(year, month - 1, day)
  }
  // For datetime strings, extract just the date portion
  if (dateStr.includes('T')) {
    const datePart = dateStr.split('T')[0]
    const [year, month, day] = datePart.split('-').map(Number)
    return new Date(year, month - 1, day)
  }
  return new Date(dateStr)
}

function isDateInRange(date: Date, startStr: string, endStr: string): boolean {
  const start = parseLocalDate(startStr)
  const end = parseLocalDate(endStr)
  start.setHours(0, 0, 0, 0)
  end.setHours(23, 59, 59, 999)
  const checkDate = new Date(date)
  checkDate.setHours(12, 0, 0, 0)
  return checkDate >= start && checkDate <= end
}

interface DayInfo {
  oooEvents: OOOEvent[]
  projects: ProjectDateRange[]
}

function getDayInfo(date: Date, oooEvents: OOOEvent[], projects: ProjectDateRange[]): DayInfo {
  const dayOOO = oooEvents.filter(e => isDateInRange(date, e.startDate, e.endDate))
  const dayProjects = projects.filter(p => isDateInRange(date, p.startDate, p.endDate))
  return { oooEvents: dayOOO, projects: dayProjects }
}

function MiniMonth({ 
  year, 
  month, 
  oooEvents, 
  projects 
}: { 
  year: number
  month: number
  oooEvents: OOOEvent[]
  projects: ProjectDateRange[]
}) {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
  
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDayOfWeek = firstDay.getDay()
  const daysInMonth = lastDay.getDate()
  
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const weeks: (number | null)[][] = []
  let currentWeek: (number | null)[] = []
  
  for (let i = 0; i < startDayOfWeek; i++) {
    currentWeek.push(null)
  }
  
  for (let day = 1; day <= daysInMonth; day++) {
    currentWeek.push(day)
    if (currentWeek.length === 7) {
      weeks.push(currentWeek)
      currentWeek = []
    }
  }
  
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push(null)
    }
    weeks.push(currentWeek)
  }
  
  return (
    <div className="bg-muted/30 rounded-lg p-2">
      <div className="text-center font-semibold text-sm mb-1">
        {monthNames[month]} {year}
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-[10px]">
        {dayNames.map((d, i) => (
          <div key={i} className="text-center text-muted-foreground font-medium py-0.5">
            {d}
          </div>
        ))}
        {weeks.map((week, weekIdx) => (
          week.map((day, dayIdx) => {
            if (day === null) {
              return <div key={`${weekIdx}-${dayIdx}`} className="h-5" />
            }
            
            const date = new Date(year, month, day)
            const isToday = isSameDay(date, today)
            const dayInfo = getDayInfo(date, oooEvents, projects)
            const hasOOO = dayInfo.oooEvents.length > 0
            const hasProject = dayInfo.projects.length > 0
            const hasEvents = hasOOO || hasProject
            
            const dayContent = (
              <div
                className={`
                  h-5 flex items-center justify-center rounded text-[10px] relative
                  ${isToday ? 'bg-primary text-primary-foreground font-bold' : ''}
                  ${hasOOO && !isToday ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' : ''}
                  ${hasProject && !hasOOO && !isToday ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : ''}
                `}
              >
                {day}
                {hasOOO && (
                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
                )}
                {hasProject && !hasOOO && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 bg-blue-500 rounded-full" />
                )}
              </div>
            )
            
            if (hasEvents) {
              return (
                <Tooltip key={`${weekIdx}-${dayIdx}`}>
                  <TooltipTrigger asChild>
                    {dayContent}
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <div className="text-xs space-y-1">
                      {hasOOO && (
                        <div>
                          <div className="font-semibold text-red-600 dark:text-red-400">Out of Office:</div>
                          {dayInfo.oooEvents.map((e, i) => (
                            <div key={i} className="pl-2">
                              <span className="font-medium">{e.personName}</span>
                              {e.title && e.title.toLowerCase() !== 'ooo' && (
                                <span className="text-muted-foreground"> - {e.title}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {hasProject && (
                        <div>
                          <div className="font-semibold text-blue-600 dark:text-blue-400">Projects:</div>
                          {dayInfo.projects.map((p, i) => (
                            <div key={i} className="pl-2">
                              <span className="font-medium">{p.name}</span>
                              <span className="text-muted-foreground"> ({p.clientName})</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              )
            }
            
            return (
              <div key={`${weekIdx}-${dayIdx}`}>
                {dayContent}
              </div>
            )
          })
        ))}
      </div>
    </div>
  )
}

export function ResourceCalendar() {
  const [data, setData] = useState<CalendarData | null>(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch('/api/dashboard/resource-calendar')
        if (!response.ok) throw new Error('Failed to fetch calendar data')
        const result = await response.json()
        setData(result)
      } catch (error) {
        console.error('Failed to fetch calendar data:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])
  
  const now = new Date()
  const months = [
    { year: now.getFullYear(), month: now.getMonth() },
    { year: now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear(), month: (now.getMonth() + 1) % 12 },
    { year: now.getMonth() >= 10 ? now.getFullYear() + 1 : now.getFullYear(), month: (now.getMonth() + 2) % 12 },
    { year: now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear(), month: (now.getMonth() + 3) % 12 },
  ]
  
  return (
    <Card className="col-span-1 md:col-span-2 lg:col-span-3">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Team Availability & Project Timeline
        </CardTitle>
        <Calendar className="h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-4 mb-3 text-xs">
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 bg-red-500 rounded-full" />
                <span className="text-muted-foreground">Out of Office</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 bg-blue-500 rounded-full" />
                <span className="text-muted-foreground">Project Active</span>
              </div>
              {!data?.isGoogleConnected && (
                <div className="text-amber-600 dark:text-amber-400 ml-auto">
                  Connect Google Calendar to see OOO events
                </div>
              )}
            </div>
            <TooltipProvider delayDuration={100}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {months.map((m, i) => (
                  <MiniMonth
                    key={i}
                    year={m.year}
                    month={m.month}
                    oooEvents={data?.oooEvents || []}
                    projects={data?.projects || []}
                  />
                ))}
              </div>
            </TooltipProvider>
          </>
        )}
      </CardContent>
    </Card>
  )
}
