"use server"

import { requireAuthWithOrg } from "@/lib/session"
import { prisma } from "@/lib/prisma"

export interface OOOEvent {
  id: string
  title: string
  personName: string
  startDate: string
  endDate: string
  isAllDay: boolean
}

export interface ProjectDateRange {
  id: string
  name: string
  clientName: string
  startDate: string
  endDate: string
  status: string
}

export interface CalendarData {
  oooEvents: OOOEvent[]
  projects: ProjectDateRange[]
  isGoogleConnected: boolean
}

const OOO_CALENDAR_ID = "c_ce5b53e82c665f61ebe3ed60b8586fd34579bad215e74c7943fdafcd4a147795@group.calendar.google.com"

interface GoogleCalendarEvent {
  id: string
  summary?: string
  start?: { date?: string; dateTime?: string }
  end?: { date?: string; dateTime?: string }
}

interface GoogleCalendarResponse {
  items?: GoogleCalendarEvent[]
  error?: { message: string }
}

export async function getResourceCalendarData(): Promise<CalendarData> {
  const user = await requireAuthWithOrg()
  
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endDate = new Date(now.getFullYear(), now.getMonth() + 4, 0)
  
  const oooEvents: OOOEvent[] = []
  let isGoogleConnected = true
  
  const apiKey = process.env.GOOGLE_API_KEY
  
  if (apiKey) {
    try {
      const calendarUrl = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(OOO_CALENDAR_ID)}/events`)
      calendarUrl.searchParams.set('key', apiKey)
      calendarUrl.searchParams.set('timeMin', startOfMonth.toISOString())
      calendarUrl.searchParams.set('timeMax', endDate.toISOString())
      calendarUrl.searchParams.set('singleEvents', 'true')
      calendarUrl.searchParams.set('orderBy', 'startTime')
      calendarUrl.searchParams.set('maxResults', '500')
      
      const response = await fetch(calendarUrl.toString())
      const data: GoogleCalendarResponse = await response.json()
      
      if (data.error) {
        console.error('[Dashboard Calendar] API error:', data.error.message)
      } else {
        const events = data.items || []
        
        for (const event of events) {
          const title = event.summary || ""
          const isAllDay = !!event.start?.date
          const startStr = event.start?.date || event.start?.dateTime || ""
          let endStr = event.end?.date || event.end?.dateTime || ""
          
          // Google Calendar all-day events use exclusive end date, so subtract 1 day
          if (isAllDay && event.end?.date) {
            const endDateObj = new Date(event.end.date)
            endDateObj.setDate(endDateObj.getDate() - 1)
            endStr = endDateObj.toISOString().split('T')[0]
          }
          
          // Use the event title as the person name
          // The title format is typically "Person Name - OOO" or just "Person Name"
          let personName = title.split(' - ')[0].split(' OOO')[0].split(' PTO')[0].trim() || "Unknown"
          
          oooEvents.push({
            id: event.id || `ooo-${Date.now()}-${Math.random()}`,
            title,
            personName,
            startDate: startStr,
            endDate: endStr,
            isAllDay,
          })
        }
      }
    } catch (error: any) {
      console.error('[Dashboard Calendar] Error fetching calendar events:', error?.message || error)
    }
  } else {
    console.log('[Dashboard Calendar] No GOOGLE_API_KEY configured')
    isGoogleConnected = false
  }
  
  const projects = await prisma.project.findMany({
    where: {
      organizationId: user.organizationId,
      status: { in: ['Active', 'Onsite', 'Draft'] },
      startDate: { not: null },
      endDate: { not: null },
    },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      status: true,
      client: {
        select: { name: true }
      }
    },
    orderBy: { startDate: 'asc' }
  })
  
  const projectRanges: ProjectDateRange[] = projects
    .filter(p => p.startDate && p.endDate)
    .map(p => ({
      id: p.id,
      name: p.name,
      clientName: p.client.name,
      startDate: p.startDate!.toISOString(),
      endDate: p.endDate!.toISOString(),
      status: p.status,
    }))
  
  return {
    oooEvents,
    projects: projectRanges,
    isGoogleConnected,
  }
}
