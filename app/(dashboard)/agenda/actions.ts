"use server"

import { requireAuthWithOrg } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { getGoogleDocsClient } from "@/lib/google-drive"
import { ProjectStatus, TaskStatus } from "@prisma/client"
import { format } from "date-fns"

const AGENDA_DOC_ID = "1PMEG40-A5LbhRueLKDTk91Q2VXs9tIWGP4R5UxfgrqQ"

export async function getProjectsForAgenda() {
  const user = await requireAuthWithOrg()

  const projects = await prisma.project.findMany({
    where: {
      organizationId: user.organizationId,
      status: { in: [ProjectStatus.Active, ProjectStatus.Onsite] },
    },
    select: {
      id: true,
      name: true,
      client: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  })

  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    clientName: p.client.name,
  }))
}

function normalizeForMatch(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim()
}

function extractKeywords(name: string): string[] {
  const stopWords = new Set(["the", "a", "an", "and", "or", "for", "of", "in", "on", "at", "to", "is", "it", "by"])
  return normalizeForMatch(name)
    .split(" ")
    .filter((w) => w.length > 1 && !stopWords.has(w))
}

function scoreMeetingRelevance(
  meetingTitle: string,
  meetingAttendees: string[],
  projectName: string,
  clientName: string,
  clientTeamEmails: string[]
): number {
  let score = 0
  const normalizedTitle = normalizeForMatch(meetingTitle)
  const projectKeywords = extractKeywords(projectName)
  const clientKeywords = extractKeywords(clientName)

  const matchedProjectKw = projectKeywords.filter((kw) => normalizedTitle.includes(kw))
  score += matchedProjectKw.length * 3

  const matchedClientKw = clientKeywords.filter((kw) => normalizedTitle.includes(kw))
  score += matchedClientKw.length * 2

  if (clientTeamEmails.length > 0 && meetingAttendees.length > 0) {
    const attendeeSet = new Set(meetingAttendees.map((a) => a.toLowerCase()))
    const matchedEmails = clientTeamEmails.filter((e) => attendeeSet.has(e.toLowerCase()))
    score += matchedEmails.length * 4
  }

  return score
}

export async function getAgendaData(projectId: string) {
  const user = await requireAuthWithOrg()

  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: user.organizationId },
    select: {
      id: true,
      name: true,
      clientTeamMembers: true,
      client: { select: { name: true } },
    },
  })

  if (!project) {
    throw new Error("Project not found")
  }

  const clientTeamEmails: string[] = []
  if (project.clientTeamMembers && Array.isArray(project.clientTeamMembers)) {
    for (const m of project.clientTeamMembers as Array<{ name?: string; email?: string }>) {
      if (m.email) clientTeamEmails.push(m.email)
    }
  }

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const sevenDaysFromNow = new Date(today)
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)

  const tasks = await prisma.task.findMany({
    where: {
      projectId,
      status: { not: TaskStatus.Done },
      dueDate: { not: null },
      OR: [
        { dueDate: { lt: today } },
        { dueDate: { gte: today, lte: sevenDaysFromNow } },
      ],
    },
    select: {
      id: true,
      title: true,
      status: true,
      dueDate: true,
      priority: true,
      workstream: true,
      assigneePerson: { select: { name: true } },
    },
    orderBy: { dueDate: "asc" },
  })

  const allAnalyses = await prisma.meetingAnalysis.findMany({
    where: {
      meeting: {
        projectId,
        organizationId: user.organizationId,
      },
      nextMeetingAgenda: { not: null },
    },
    orderBy: { meeting: { datetime: "desc" } },
    take: 30,
    select: {
      nextMeetingAgenda: true,
      meeting: {
        select: {
          title: true,
          datetime: true,
          attendees: true,
        },
      },
    },
  })

  let nextMeetingAgenda: string | null = null
  let agendaSource: string | null = null

  if (allAnalyses.length > 0) {
    const nowMs = Date.now()
    const dayMs = 86400000

    const scored = allAnalyses.map((a) => {
      const relevance = scoreMeetingRelevance(
        a.meeting.title,
        a.meeting.attendees,
        project.name,
        project.client.name,
        clientTeamEmails
      )
      const meetingMs = a.meeting.datetime.getTime()
      const daysAgo = Math.max(0, (nowMs - meetingMs) / dayMs)
      const recencyBoost = Math.max(0, 5 - Math.floor(daysAgo))
      return {
        analysis: a,
        totalScore: relevance + recencyBoost,
        datetime: meetingMs,
      }
    })

    scored.sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore
      return b.datetime - a.datetime
    })

    const best = scored[0]
    nextMeetingAgenda = best.analysis.nextMeetingAgenda
    agendaSource = best.analysis.meeting.title
      ? `${best.analysis.meeting.title} (${format(best.analysis.meeting.datetime, "MMM d, yyyy")})`
      : null
  }

  return {
    project: {
      name: project.name,
      clientName: project.client.name,
    },
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      dueDate: t.dueDate?.toISOString() || null,
      assigneeName: t.assigneePerson?.name || null,
      priority: t.priority,
      workstream: t.workstream,
    })),
    nextMeetingAgenda,
    agendaSource,
  }
}

export async function pushAgendaToGoogleDoc(projectId: string, content: string) {
  const user = await requireAuthWithOrg()

  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: user.organizationId },
    select: { name: true },
  })

  if (!project) {
    throw new Error("Project not found")
  }

  const docs = await getGoogleDocsClient(user.organizationId!)
  const doc = await docs.documents.get({ documentId: AGENDA_DOC_ID })

  const body = doc.data.body?.content || []
  let insertIndex: number | null = null

  for (const element of body) {
    if (element.paragraph) {
      const text = element.paragraph.elements
        ?.map((e: any) => e.textRun?.content || "")
        .join("")
        .trim()

      if (text?.startsWith("Attendees:")) {
        insertIndex = element.endIndex! - 1
        break
      }
    }
  }

  if (insertIndex === null) {
    for (const element of body) {
      if (element.paragraph) {
        const style = element.paragraph.paragraphStyle?.namedStyleType
        const text = element.paragraph.elements
          ?.map((e: any) => e.textRun?.content || "")
          .join("")
          .trim()

        if (style === "HEADING_1" && text?.trim() === "Next Meeting") {
          insertIndex = element.endIndex! - 1
          break
        }
      }
    }
  }

  if (insertIndex === null) {
    insertIndex = (doc.data.body?.content?.[doc.data.body.content.length - 1]?.endIndex || 2) - 1
  }

  const dateStr = format(new Date(), "MM/dd/yyyy")
  const separator = "───────────────────"
  const header = `${project.name} — Agenda ${dateStr}`

  const fullText = `\n${separator}\n${header}\n\n${content}\n\n`

  const insertAt = insertIndex + 1

  await docs.documents.batchUpdate({
    documentId: AGENDA_DOC_ID,
    requestBody: {
      requests: [
        {
          insertText: {
            location: { index: insertAt },
            text: fullText,
          },
        },
        {
          updateParagraphStyle: {
            range: {
              startIndex: insertAt + separator.length + 2,
              endIndex: insertAt + separator.length + 2 + header.length + 1,
            },
            paragraphStyle: { namedStyleType: "HEADING_2" },
            fields: "namedStyleType",
          },
        },
      ],
    },
  })

  return { success: true }
}
