"use server"

import { prisma } from "@/lib/prisma"
import { google } from "googleapis"
import { refreshAccessToken, getGoogleOAuth2Client } from "@/lib/google-oauth"
import { getGoogleCalendarClient, isCalendarConnected } from "@/lib/google-calendar"
import { getOrgAccessToken } from "@/lib/google-drive"

async function getUserGoogleTokens(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      googleAccessToken: true,
      googleRefreshToken: true,
      googleTokenExpiry: true,
    },
  })

  if (!user?.googleAccessToken) return null

  const isExpired =
    user.googleTokenExpiry &&
    new Date(user.googleTokenExpiry).getTime() < Date.now() + 5 * 60 * 1000

  if (isExpired && user.googleRefreshToken) {
    try {
      const newTokens = await refreshAccessToken(user.googleRefreshToken)
      await prisma.user.update({
        where: { id: userId },
        data: {
          googleAccessToken: newTokens.access_token,
          googleTokenExpiry: newTokens.expiry_date
            ? new Date(newTokens.expiry_date)
            : null,
        },
      })
      return newTokens.access_token
    } catch (err) {
      console.error("[MyDashboard] Token refresh failed:", err)
      return null
    }
  }

  return user.googleAccessToken
}

export interface MyProject {
  id: string
  name: string
  status: string
  clientName: string
}

export async function getMyProjects(
  userId: string,
  organizationId: string,
  userRole?: string,
  userEmail?: string
): Promise<MyProject[]> {
  if (userRole === "CLIENT" && userEmail) {
    const now = new Date()
    const portalAccess = await prisma.clientPortalAccess.findMany({
      where: {
        email: { equals: userEmail, mode: "insensitive" },
        expiresAt: { gt: now },
        project: { organizationId },
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            status: true,
            client: { select: { name: true } },
          },
        },
      },
    })

    const seen = new Set<string>()
    const projects: MyProject[] = []
    for (const access of portalAccess) {
      if (!seen.has(access.project.id)) {
        seen.add(access.project.id)
        projects.push({
          id: access.project.id,
          name: access.project.name,
          status: access.project.status,
          clientName: access.project.client.name,
        })
      }
    }
    return projects
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  })

  const seen = new Set<string>()
  const projects: MyProject[] = []

  const ownedProjects = await prisma.project.findMany({
    where: {
      ownerUserId: userId,
      organizationId,
    },
    select: {
      id: true,
      name: true,
      status: true,
      client: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  for (const p of ownedProjects) {
    seen.add(p.id)
    projects.push({
      id: p.id,
      name: p.name,
      status: p.status,
      clientName: p.client.name,
    })
  }

  if (user?.email) {
    const people = await prisma.person.findMany({
      where: {
        email: { equals: user.email, mode: "insensitive" },
        organizationId,
      },
      select: { id: true },
    })

    if (people.length > 0) {
      const assignments = await prisma.staffingAssignment.findMany({
        where: { personId: { in: people.map((p) => p.id) } },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              status: true,
              client: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      })

      for (const a of assignments) {
        if (!seen.has(a.project.id)) {
          seen.add(a.project.id)
          projects.push({
            id: a.project.id,
            name: a.project.name,
            status: a.project.status,
            clientName: a.project.client.name,
          })
        }
      }
    }
  }

  return projects
}

export interface MyTask {
  id: string
  title: string
  status: string
  dueDate: string | null
  projectId: string
  projectName: string
}

export async function getMyTasks(
  userId: string,
  organizationId: string,
  userRole?: string,
  userEmail?: string
): Promise<MyTask[]> {
  if (userRole === "CLIENT" && userEmail) {
    const now = new Date()
    const portalAccess = await prisma.clientPortalAccess.findMany({
      where: {
        email: { equals: userEmail, mode: "insensitive" },
        expiresAt: { gt: now },
        project: { organizationId },
      },
      select: { projectId: true },
    })

    const clientProjectIds = Array.from(new Set(portalAccess.map((a) => a.projectId)))
    if (clientProjectIds.length === 0) return []

    const tasks = await prisma.task.findMany({
      where: {
        projectId: { in: clientProjectIds },
        status: { not: "Done" },
        project: { organizationId },
      },
      include: {
        project: { select: { id: true, name: true } },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 20,
    })

    return tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      projectId: t.project.id,
      projectName: t.project.name,
    }))
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  })

  let personIds: string[] = []
  if (user?.email) {
    const people = await prisma.person.findMany({
      where: {
        email: { equals: user.email, mode: "insensitive" },
        organizationId,
      },
      select: { id: true },
    })
    personIds = people.map((p) => p.id)
  }

  const ownedProjectIds = (
    await prisma.project.findMany({
      where: { ownerUserId: userId, organizationId },
      select: { id: true },
    })
  ).map((p) => p.id)

  let staffedProjectIds: string[] = []
  if (personIds.length > 0) {
    staffedProjectIds = (
      await prisma.staffingAssignment.findMany({
        where: { personId: { in: personIds } },
        select: { projectId: true },
        distinct: ["projectId"],
      })
    ).map((a) => a.projectId)
  }

  const myProjectIds = Array.from(new Set(ownedProjectIds.concat(staffedProjectIds)))

  const conditions: any[] = [
    { ownerUserId: userId },
  ]
  if (personIds.length > 0) {
    conditions.push({ assigneePersonId: { in: personIds } })
  }
  if (myProjectIds.length > 0) {
    conditions.push({
      projectId: { in: myProjectIds },
      ownerUserId: null,
      assigneePersonId: null,
    })
  }

  const tasks = await prisma.task.findMany({
    where: {
      OR: conditions,
      status: { not: "Done" },
      project: { organizationId },
    },
    include: {
      project: { select: { id: true, name: true } },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    take: 20,
  })

  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    projectId: t.project.id,
    projectName: t.project.name,
  }))
}

export interface MyMeeting {
  id: string
  title: string
  start: string
  end: string
  meetLink: string | null
  htmlLink: string | null
}

export async function getMyMeetings(
  userId: string
): Promise<{ meetings: MyMeeting[]; isConnected: boolean }> {
  const userRecord = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, firstName: true, name: true, organizationId: true },
  })

  const connected = await isCalendarConnected(userRecord?.organizationId ?? undefined)
  if (!connected) {
    return { meetings: [], isConnected: false }
  }

  try {
    const user = userRecord

    const firstName = (user?.firstName || user?.name?.split(" ")[0] || "").toLowerCase()
    const userEmails = new Set<string>()
    if (user?.email) userEmails.add(user.email.toLowerCase())
    if (firstName) {
      userEmails.add(`${firstName}@sandbox-xm.com`)
      userEmails.add(`${firstName}@makemysandbox.com`)
    }

    if (userEmails.size === 0) {
      return { meetings: [], isConnected: true }
    }

    const calendar = await getGoogleCalendarClient(userRecord?.organizationId ?? undefined)

    const calendarList = await calendar.calendarList.list()
    const calendars = calendarList.data.items || []

    const now = new Date()
    const startOfToday = new Date(now)
    startOfToday.setHours(0, 0, 0, 0)

    const endOfRange = new Date(startOfToday)
    endOfRange.setDate(startOfToday.getDate() + 7)
    endOfRange.setHours(23, 59, 59, 999)

    const allMeetings: MyMeeting[] = []
    const seenIds = new Set<string>()

    for (const cal of calendars) {
      if (!cal.id) continue
      try {
        const response = await calendar.events.list({
          calendarId: cal.id,
          timeMin: startOfToday.toISOString(),
          timeMax: endOfRange.toISOString(),
          singleEvents: true,
          orderBy: "startTime",
          maxResults: 100,
        })

        const events = response.data.items || []

        for (const e of events) {
          if (!e.attendees || e.attendees.length === 0) continue
          if (seenIds.has(e.id || "")) continue

          const isAttendee = e.attendees.some(
            (a) => a.email && userEmails.has(a.email.toLowerCase())
          )

          if (isAttendee) {
            seenIds.add(e.id || "")
            let meetLink = e.hangoutLink || null
            if (!meetLink && e.description) {
              const teamsMatch = e.description.match(/https:\/\/teams\.microsoft\.com\/[^\s<"')]+/i)
              if (teamsMatch) meetLink = teamsMatch[0]
            }
            if (!meetLink && e.conferenceData?.entryPoints) {
              const videoEntry = e.conferenceData.entryPoints.find(
                (ep) => ep.entryPointType === "video" && ep.uri
              )
              if (videoEntry?.uri) meetLink = videoEntry.uri
            }
            allMeetings.push({
              id: e.id || "",
              title: e.summary || "Untitled",
              start: e.start?.dateTime || e.start?.date || "",
              end: e.end?.dateTime || e.end?.date || "",
              meetLink,
              htmlLink: e.htmlLink || null,
            })
          }
        }
      } catch (calErr) {
        console.error(`[MyDashboard] Error fetching calendar ${cal.id}:`, calErr)
      }
    }

    allMeetings.sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
    )

    return { meetings: allMeetings, isConnected: true }
  } catch (err: any) {
    console.error("[MyDashboard] Calendar fetch failed:", err?.message || err)
    return { meetings: [], isConnected: false }
  }
}

export interface MyMention {
  id: string
  source: "ERP" | "Google"
  text: string
  channelName?: string
  link?: string
  createdAt: string
}

export async function getMyMentions(
  userId: string,
  organizationId: string
): Promise<{ mentions: MyMention[]; isGoogleConnected: boolean }> {
  const erpMentions = await prisma.chatMention.findMany({
    where: {
      entityId: userId,
      mentionType: "USER",
      message: {
        channel: { organizationId },
      },
    },
    include: {
      message: {
        select: {
          content: true,
          createdAt: true,
          channel: { select: { name: true, projectId: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  })

  const mentions: MyMention[] = erpMentions.map((m) => ({
    id: m.id,
    source: "ERP" as const,
    text:
      m.message.content.length > 100
        ? m.message.content.slice(0, 100) + "..."
        : m.message.content,
    channelName: m.message.channel.name,
    link: m.message.channel.projectId
      ? `/projects/${m.message.channel.projectId}`
      : "/messages",
    createdAt: m.createdAt.toISOString(),
  }))

  let accessToken = await getUserGoogleTokens(userId)
  let useOrgToken = false

  if (!accessToken) {
    try {
      accessToken = await getOrgAccessToken(organizationId)
      useOrgToken = true
    } catch {
      accessToken = null
    }
  }

  let isGoogleConnected = !!accessToken

  if (accessToken) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, firstName: true, lastName: true, email: true },
      })

      const oauth2Client = getGoogleOAuth2Client()
      oauth2Client.setCredentials({ access_token: accessToken })
      const drive = google.drive({ version: "v3", auth: oauth2Client })

      const userEmail = user?.email?.toLowerCase() || ""
      const userName = user?.name || [user?.firstName, user?.lastName].filter(Boolean).join(" ") || ""

      const recentFiles = await drive.files.list({
        q: `(mimeType = 'application/vnd.google-apps.document' or mimeType = 'application/vnd.google-apps.spreadsheet' or mimeType = 'application/vnd.google-apps.presentation') and modifiedTime > '${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()}'`,
        fields: "files(id, name, webViewLink, mimeType)",
        orderBy: "modifiedTime desc",
        pageSize: 20,
      })

      const files = recentFiles.data.files || []
      const seenComments = new Set<string>()

      const mimeTypeToUrlBase: Record<string, string> = {
        "application/vnd.google-apps.document": "https://docs.google.com/document/d/",
        "application/vnd.google-apps.spreadsheet": "https://docs.google.com/spreadsheets/d/",
        "application/vnd.google-apps.presentation": "https://docs.google.com/presentation/d/",
      }

      for (const file of files) {
        if (!file.id) continue
        try {
          const commentsResponse = await drive.comments.list({
            fileId: file.id,
            fields: "comments(id,content,createdTime,author,quotedFileContent,replies)",
            pageSize: 50,
            includeDeleted: false,
          })

          const comments = commentsResponse.data.comments || []

          for (const comment of comments) {
            const content = (comment.content || "").toLowerCase()
            const authorEmail = comment.author?.emailAddress?.toLowerCase() || ""

            const isMentionedInComment =
              (userEmail && content.includes(userEmail)) ||
              (userName && content.toLowerCase().includes(userName.toLowerCase())) ||
              (userEmail && content.includes("+" + userEmail))

            const isMentionedInReplies = comment.replies?.some((reply) => {
              const replyContent = (reply.content || "").toLowerCase()
              const replyAuthorEmail = reply.author?.emailAddress?.toLowerCase() || ""
              return (
                replyAuthorEmail !== userEmail &&
                ((userEmail && replyContent.includes(userEmail)) ||
                  (userName && replyContent.toLowerCase().includes(userName.toLowerCase())) ||
                  (userEmail && replyContent.includes("+" + userEmail)))
              )
            })

            if ((isMentionedInComment && authorEmail !== userEmail) || isMentionedInReplies) {
              const commentKey = `${file.id}-${comment.id}`
              if (seenComments.has(commentKey)) continue
              seenComments.add(commentKey)

              const urlBase = mimeTypeToUrlBase[file.mimeType || ""] || ""
              const deepLink = urlBase
                ? `${urlBase}${file.id}/edit?disco=${comment.id}`
                : file.webViewLink || undefined

              const snippet = comment.content && comment.content.length > 80
                ? comment.content.slice(0, 80) + "..."
                : comment.content || ""

              mentions.push({
                id: `gcomment-${file.id}-${comment.id}`,
                source: "Google",
                text: `${file.name}: "${snippet}"`,
                link: deepLink,
                createdAt: comment.createdTime || new Date().toISOString(),
              })
            }
          }
        } catch (commentErr: any) {
          if (commentErr?.code !== 403) {
            console.error(`[MyDashboard] Comments fetch failed for ${file.id}:`, commentErr?.message)
          }
        }
      }
    } catch (err) {
      console.error("[MyDashboard] Drive mentions search failed:", err)
    }
  }

  mentions.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  return { mentions, isGoogleConnected }
}

export async function getMyDashboardUserInfo(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, name: true },
  })

  return {
    firstName: user?.firstName || user?.name?.split(" ")[0] || "there",
  }
}
