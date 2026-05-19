"use server"

import { requireAuthWithOrg } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { getGoogleCalendarClient, isCalendarConnected } from "@/lib/google-calendar"
import { google } from "googleapis"
import { refreshAccessToken, getGoogleOAuth2Client } from "@/lib/google-oauth"

async function getUserGoogleTokens(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      googleAccessToken: true,
      googleRefreshToken: true,
      googleTokenExpiry: true,
    }
  })
  
  if (!user?.googleAccessToken) {
    return null
  }
  
  // Check if token is expired (with 5 minute buffer)
  const isExpired = user.googleTokenExpiry && 
    new Date(user.googleTokenExpiry).getTime() < Date.now() + 5 * 60 * 1000
  
  if (isExpired && user.googleRefreshToken) {
    console.log('[Google OAuth] Token expired, refreshing...')
    try {
      const newTokens = await refreshAccessToken(user.googleRefreshToken)
      
      await prisma.user.update({
        where: { id: userId },
        data: {
          googleAccessToken: newTokens.access_token,
          googleTokenExpiry: newTokens.expiry_date ? new Date(newTokens.expiry_date) : null,
        }
      })
      
      console.log('[Google OAuth] Token refreshed successfully')
      return newTokens.access_token
    } catch (err) {
      console.error('[Google OAuth] Token refresh failed:', err)
      return null
    }
  }
  
  return user.googleAccessToken
}

async function getGoogleDriveClientWithUserToken(accessToken: string) {
  const oauth2Client = getGoogleOAuth2Client()
  oauth2Client.setCredentials({ access_token: accessToken })
  return google.drive({ version: 'v3', auth: oauth2Client })
}

async function getGoogleDocsClientWithUserToken(accessToken: string) {
  const oauth2Client = getGoogleOAuth2Client()
  oauth2Client.setCredentials({ access_token: accessToken })
  return google.docs({ version: 'v1', auth: oauth2Client })
}

async function getDocumentTextFromGemini(docId: string, userId: string): Promise<string> {
  const accessToken = await getUserGoogleTokens(userId)
  
  if (!accessToken) {
    throw new Error('Google not connected. Please connect your Google account first.')
  }
  
  // Try Drive export first (more permissive for shared docs)
  try {
    const drive = await getGoogleDriveClientWithUserToken(accessToken)
    const response = await drive.files.export({
      fileId: docId,
      mimeType: 'text/plain'
    })
    console.log('[Gemini Notes] Successfully exported via Drive API')
    return response.data as string
  } catch (driveError: any) {
    console.log('[Gemini Notes] Drive export failed:', driveError?.message, '- trying Docs API')
  }
  
  // Fallback to Docs API
  try {
    const docs = await getGoogleDocsClientWithUserToken(accessToken)
    const doc = await docs.documents.get({ documentId: docId })
    
    let text = ''
    const content = doc.data.body?.content || []
    
    for (const element of content) {
      if (element.paragraph) {
        for (const paragraphElement of element.paragraph.elements || []) {
          if (paragraphElement.textRun?.content) {
            text += paragraphElement.textRun.content
          }
        }
      } else if (element.table) {
        for (const row of element.table.tableRows || []) {
          for (const cell of row.tableCells || []) {
            for (const cellContent of cell.content || []) {
              if (cellContent.paragraph) {
                for (const paragraphElement of cellContent.paragraph.elements || []) {
                  if (paragraphElement.textRun?.content) {
                    text += paragraphElement.textRun.content + '\t'
                  }
                }
              }
            }
          }
          text += '\n'
        }
      }
    }
    
    return text.trim()
  } catch (docsError: any) {
    console.error('[Gemini Notes] Docs API also failed:', docsError?.message)
    
    // Provide more helpful error messages based on the error
    const errorMsg = docsError?.message?.toLowerCase() || ''
    if (errorMsg.includes('not found') || errorMsg.includes('404')) {
      throw new Error('Gemini notes document not found. The notes may have been deleted or you may not have access. Gemini notes are stored in the meeting organizer\'s Drive.')
    } else if (errorMsg.includes('permission') || errorMsg.includes('403')) {
      throw new Error('You don\'t have permission to access these Gemini notes. Notes are only accessible if you organized the meeting or the organizer shared access. Try opening the notes directly from your Google Calendar event.')
    }
    throw new Error('Could not access Gemini notes. Please ensure your Google account has the necessary permissions.')
  }
}

export interface CalendarAttachment {
  fileId: string
  title: string
  mimeType: string
  fileUrl: string
}

export interface CalendarEvent {
  id: string
  title: string
  description: string | null
  start: string
  end: string
  attendees: string[]
  meetLink: string | null
  htmlLink: string
  attachments: CalendarAttachment[]
  hasGeminiNotes: boolean
}

export async function getClientsForSelect() {
  const user = await requireAuthWithOrg()

  const clients = await prisma.client.findMany({
    where: { organizationId: user.organizationId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  })

  return clients
}

export async function checkCalendarConnection(): Promise<boolean> {
  const user = await requireAuthWithOrg()
  return isCalendarConnected(user.organizationId)
}

export async function searchClientCalls(
  clientId: string,
  startDate: string,
  endDate: string
): Promise<{ success: boolean; events?: CalendarEvent[]; error?: string }> {
  const user = await requireAuthWithOrg()

  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId: user.organizationId },
  })

  if (!client) {
    return { success: false, error: "Client not found" }
  }

  try {
    const calendar = await getGoogleCalendarClient(user.organizationId)

    const calendarList = await calendar.calendarList.list()
    const calendars = calendarList.data.items || []

    const allEvents: CalendarEvent[] = []
    const searchTerms = [
      client.name.toLowerCase(),
      ...(client.name.split(" ").filter((w) => w.length > 2).map((w) => w.toLowerCase())),
    ]

    for (const cal of calendars) {
      if (!cal.id) continue

      try {
        const endDateTime = new Date(endDate)
        endDateTime.setDate(endDateTime.getDate() + 1)
        
        const eventsResponse = await calendar.events.list({
          calendarId: cal.id,
          timeMin: new Date(startDate).toISOString(),
          timeMax: endDateTime.toISOString(),
          singleEvents: true,
          orderBy: "startTime",
          maxResults: 250,
        })

        const events = eventsResponse.data.items || []

        for (const event of events) {
          const title = (event.summary || "").toLowerCase()
          const description = (event.description || "").toLowerCase()
          const attendeeEmails = (event.attendees || []).map((a) => (a.email || "").toLowerCase())

          const matchesClient = searchTerms.some(
            (term) =>
              title.includes(term) ||
              description.includes(term) ||
              attendeeEmails.some((email) => email.includes(term))
          )

          if (matchesClient) {
            const attachments: CalendarAttachment[] = (event.attachments || [])
              .filter((a: any) => a.fileId && a.mimeType === 'application/vnd.google-apps.document')
              .map((a: any) => ({
                fileId: a.fileId,
                title: a.title || 'Untitled',
                mimeType: a.mimeType,
                fileUrl: a.fileUrl || '',
              }))

            const hasGeminiNotes = attachments.some((a) => {
              const title = a.title.toLowerCase()
              return title.includes('meeting notes') || 
                     title.includes('notes from') ||
                     title.includes('meet notes') ||
                     title.includes('gemini notes') ||
                     title.includes('notes by gemini') ||
                     (title.includes('notes') && title.includes('gemini')) ||
                     (title.includes('notes') && title.includes('-'))
            })

            allEvents.push({
              id: event.id || "",
              title: event.summary || "No Title",
              description: event.description || null,
              start: event.start?.dateTime || event.start?.date || "",
              end: event.end?.dateTime || event.end?.date || "",
              attendees: (event.attendees || []).map((a) => a.email || "").filter(Boolean),
              meetLink: event.hangoutLink || null,
              htmlLink: event.htmlLink || "",
              attachments,
              hasGeminiNotes,
            })
          }
        }
      } catch (calError) {
        console.error(`Error fetching events from calendar ${cal.id}:`, calError)
      }
    }

    allEvents.sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())

    return { success: true, events: allEvents }
  } catch (error) {
    console.error("Error searching calendar:", error)
    return { success: false, error: "Failed to search calendar. Please check the connection." }
  }
}

export async function checkGoogleConnection(): Promise<{ connected: boolean }> {
  const user = await requireAuthWithOrg()
  
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { googleAccessToken: true }
  })
  
  return { connected: !!dbUser?.googleAccessToken }
}

export async function fetchGeminiNotes(
  fileId: string
): Promise<{ success: boolean; content?: string; error?: string; needsConnection?: boolean }> {
  const user = await requireAuthWithOrg()

  try {
    const content = await getDocumentTextFromGemini(fileId, user.id)
    return { success: true, content }
  } catch (error: any) {
    console.error("Error fetching Gemini notes:", error?.message || error)
    
    if (error?.message?.includes('not connected') || error?.message?.includes('Please connect')) {
      return { 
        success: false, 
        error: "Please connect your Google account to access Gemini notes.",
        needsConnection: true
      }
    }
    
    return { 
      success: false, 
      error: error?.message || "Failed to fetch meeting notes. Please check your Google account permissions." 
    }
  }
}
