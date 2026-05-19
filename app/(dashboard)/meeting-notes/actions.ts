"use server"

import { requireAuthWithOrg } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { getOpenAI, isAIConfigured } from "@/lib/openai"
import { TaskStatus, TaskWorkstream, TaskPhase, TaskPriority, ProjectStatus, MeetingTaskPriority, MeetingTaskCategory } from "@prisma/client"

export interface RankedMove {
  title: string
  impact: "High" | "Med" | "Low"
  effort: "High" | "Med" | "Low"
  why: string
  evidence: string
}

export interface RiskGapItem {
  risk: string
  why: string
  nextStep: string
  evidence: string
}

export interface CreativeIdea {
  idea: string
  description: string
  fit: string
  feasibility: string
  measurement: string
}

export interface ExtractedTask {
  title: string
  description: string | null
  evidence: string | null
  suggestedOwner: string | null
  matchedPersonId: string | null
  matchedPersonName: string | null
  priority: "P0" | "P1" | "P2"
  category: "STRATEGY" | "CREATIVE" | "OPS" | "TECH" | "MEASUREMENT" | "CLIENT"
  suggestedDueDate: string | null
}

export interface StrategistOutput {
  client: string | null
  meeting: string | null
  project: string | null
  sourceGeminiNotes: boolean
  notesCompleteness: "High" | "Med" | "Low"
  executiveBrief: string[]
  rankedMoves: RankedMove[]
  risksGapsContradictions: RiskGapItem[]
  creativeIdeas: CreativeIdea[]
  followUpSubject: string | null
  followUpBody: string | null
  nextMeetingAgenda: string | null
  tasks: ExtractedTask[]
}

function parseRankedMoves(data: unknown): RankedMove[] {
  if (!Array.isArray(data)) return []
  return data.map((item) => ({
    title: typeof item?.title === "string" ? item.title : "",
    impact: ["High", "Med", "Low"].includes(item?.impact) ? item.impact : "Med",
    effort: ["High", "Med", "Low"].includes(item?.effort) ? item.effort : "Med",
    why: typeof item?.why === "string" ? item.why : "",
    evidence: typeof item?.evidence === "string" ? item.evidence : "",
  }))
}

function parseRiskGapItems(data: unknown): RiskGapItem[] {
  if (!Array.isArray(data)) return []
  return data.map((item) => ({
    risk: typeof item?.risk === "string" ? item.risk : "",
    why: typeof item?.why === "string" ? item.why : "",
    nextStep: typeof item?.nextStep === "string" ? item.nextStep : "",
    evidence: typeof item?.evidence === "string" ? item.evidence : "",
  }))
}

function parseCreativeIdeas(data: unknown): CreativeIdea[] {
  if (!Array.isArray(data)) return []
  return data.map((item) => ({
    idea: typeof item?.idea === "string" ? item.idea : "",
    description: typeof item?.description === "string" ? item.description : "",
    fit: typeof item?.fit === "string" ? item.fit : "",
    feasibility: typeof item?.feasibility === "string" ? item.feasibility : "",
    measurement: typeof item?.measurement === "string" ? item.measurement : "",
  }))
}

export interface AnalysisResult {
  success: boolean
  output: StrategistOutput | null
  error?: string
}

const STRATEGIST_SYSTEM_PROMPT = `AI MEETING STRATEGIST — SANDBOX-XM (ERP WORKFLOW)

ROLE
You are the Sandbox-XM AI Meeting Strategist. Your job is to turn meeting notes into decisive, creative, and operationally useful next moves for Sandbox-XM's experiential and strategic corporate events work.

You are not a passive note taker. You are a strategist and operator:
- You prioritize.
- You identify risks and gaps.
- You propose smart, creative options.
- You recommend the most leverageable next actions.
- You produce outputs that can be turned into tasks and client follow-up communications.

BEHAVIOR: BE OPINIONATED BUT GROUNDED
You must be decisive and creative, but never untethered from evidence.
- Every recommendation must reference supporting evidence from the notes (quote or paraphrase + a short "Evidence:" line).
- Clearly separate facts from recommendations.
- Never invent commitments, owners, budgets, or timelines.
- If an owner/timeline is missing, label it as TBD and recommend how to resolve that ambiguity.

MEETING INTELLIGENCE YOU MUST PRODUCE
For every analyzed call, produce these sections:

1. EXECUTIVE BRIEF (5–10 bullets max)
- What happened (high level)
- Why it matters (strategic lens for Sandbox-XM)
- What is most urgent

2. WHAT YOU ACTUALLY NEED NEXT (3–7 moves, ranked)
This is the hero output. For each move include:
- Move title (imperative)
- Impact: High/Med/Low
- Effort: High/Med/Low
- Why this matters (1–2 lines)
- Evidence: short quote or paraphrase from notes

3. RISKS, GAPS, AND CONTRADICTIONS
- Assumptions not validated
- Missing inputs / unclear decisions
- Misalignment between stakeholders
For each item: risk + why + what to do next + evidence.

4. CREATIVE / STRATEGIC IDEAS (Sandbox-XM flavored)
Generate 5–10 ideas tailored to:
- experiential engagement
- original creative concepts
- operational feasibility
- measurement/ROI
Each idea must include:
- Concept name
- One-sentence description
- Why it fits (audience/client objective)
- Feasibility note (ops/tech)
- Measurement angle (how you'd prove it worked)

5. CLIENT-READY FOLLOW-UP DRAFTS
Provide:
- Follow-up email draft (professional, concise)
- Agenda for next meeting (if useful)

6. TASKS TO CREATE IN ERP (Structured)
Generate a structured task list for ERP task creation.
IMPORTANT: If the notes include a "Suggested next steps" section (e.g., from Notes by Gemini or similar AI-generated summaries), you MUST convert EVERY item in that section into a separate task — do not skip, merge, or limit them. Include all items verbatim as individual tasks.
For each task include:
- Task title
- Description (include context)
- Suggested owner (only if explicitly stated; otherwise "TBD")
- Due date (only if stated; otherwise null)
- Priority: P0 (critical/blocking), P1 (important/this week), P2 (nice to have)
- Category tag: STRATEGY / CREATIVE / OPS / TECH / MEASUREMENT / CLIENT
- Evidence: supporting quote from notes
Do not cap the number of tasks. If 12 next steps are listed, produce 12 tasks.

OUTPUT FORMAT (JSON)
Return a JSON object with this structure:
{
  "client": "Client name if known",
  "meeting": "Meeting title",
  "project": "Project name if provided",
  "sourceGeminiNotes": true/false,
  "notesCompleteness": "High" | "Med" | "Low",
  "executiveBrief": ["bullet 1", "bullet 2", ...],
  "rankedMoves": [
    {
      "title": "Action title (imperative)",
      "impact": "High" | "Med" | "Low",
      "effort": "High" | "Med" | "Low", 
      "why": "Why this matters",
      "evidence": "Quote or paraphrase from notes"
    }
  ],
  "risksGapsContradictions": [
    {
      "risk": "Risk description",
      "why": "Why this is concerning",
      "nextStep": "What to do about it",
      "evidence": "Supporting evidence"
    }
  ],
  "creativeIdeas": [
    {
      "idea": "Concept name",
      "description": "One-sentence description",
      "fit": "Why it fits the audience/objective",
      "feasibility": "Ops/tech feasibility note",
      "measurement": "How to prove it worked"
    }
  ],
  "followUpSubject": "Email subject line",
  "followUpBody": "Professional follow-up email body",
  "nextMeetingAgenda": "Suggested agenda for next meeting (or null)",
  "tasks": [
    {
      "title": "Task title",
      "description": "Context and details",
      "evidence": "Supporting quote",
      "suggestedOwner": "Name or TBD",
      "priority": "P0" | "P1" | "P2",
      "category": "STRATEGY" | "CREATIVE" | "OPS" | "TECH" | "MEASUREMENT" | "CLIENT",
      "suggestedDueDate": "YYYY-MM-DD or null"
    }
  ]
}

QUALITY BAR
- Be concise but substantial. Avoid fluff.
- Prefer ranked lists over long paragraphs.
- Always include evidence lines for recommendations.
- Use Sandbox-XM language: experience strategy, engagement, operational excellence, event technology, measurement, outcomes.

FAIL-SAFES
- If the notes are messy or partial: state "notesCompleteness: Low" and focus on extracting what's reliable + list the top missing info you need.
- If the meeting is clearly a sales / account call: include objection handling angles and next-step sequencing in creative ideas.
- If it's ops-heavy: include a risk register style section and a timeline checkpoint suggestion.
- If it's creative-heavy: include 2–3 "big swing" concepts plus 3–5 practical concepts.`

export interface MeetingMetadata {
  clientId?: string
  clientName?: string
  eventId?: string
  datetime?: string
  attendees?: string[]
  meetLink?: string
  hasGeminiNotes?: boolean
}

export async function analyzeMeetingNotes(
  notes: string,
  projectId: string | null,
  projectName: string | null,
  metadata: MeetingMetadata = {}
): Promise<AnalysisResult> {
  const user = await requireAuthWithOrg()

  if (!isAIConfigured()) {
    return {
      success: false,
      output: null,
      error: "AI is not configured. Please contact your administrator.",
    }
  }

  if (!notes.trim()) {
    return {
      success: false,
      output: null,
      error: "Please enter meeting notes to analyze.",
    }
  }

  const people = await prisma.person.findMany({
    where: { organizationId: user.organizationId },
    select: { id: true, firstName: true, lastName: true, email: true },
  })

  const peopleList = people
    .map((p) => `${p.firstName || ""} ${p.lastName || ""}`.trim() || p.email)
    .filter(Boolean)
    .join(", ")

  const contextInfo = `
CONTEXT:
- Client: ${metadata.clientName || "Unknown"}
- Meeting: ${metadata.eventId ? "From calendar" : "Manual entry"}
- Project: ${projectName || "Not specified"}
- Source: ${metadata.hasGeminiNotes ? "Notes by Gemini" : "Manual paste"}
- Available team members: ${peopleList || "No team members available"}
${metadata.attendees?.length ? `- Attendees: ${metadata.attendees.join(", ")}` : ""}
${metadata.datetime ? `- Date: ${metadata.datetime}` : ""}
${metadata.hasGeminiNotes ? `\nNOTE: These are Notes by Gemini. The notes likely contain a "Suggested next steps" section. You MUST extract EVERY item from that section as an individual task — do not skip any, do not merge them, and do not impose any limit on the number of tasks produced.` : ""}
`

  const openai = getOpenAI()

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: STRATEGIST_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: contextInfo + "\n\nMEETING NOTES:\n" + notes,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return {
        success: false,
        output: null,
        error: "No response from AI",
      }
    }

    const parsed = JSON.parse(content)
    
    const tasks: ExtractedTask[] = []
    for (const task of parsed.tasks || []) {
      let matchedPersonId: string | null = null
      let matchedPersonName: string | null = null

      if (task.suggestedOwner && task.suggestedOwner !== "TBD") {
        const ownerLower = task.suggestedOwner.toLowerCase()
        const match = people.find((p) => {
          const fullName = `${p.firstName || ""} ${p.lastName || ""}`.trim().toLowerCase()
          const firstName = (p.firstName || "").toLowerCase()
          const lastName = (p.lastName || "").toLowerCase()
          return (
            fullName === ownerLower ||
            firstName === ownerLower ||
            lastName === ownerLower ||
            fullName.includes(ownerLower) ||
            (p.email && p.email.toLowerCase().includes(ownerLower))
          )
        })
        if (match) {
          matchedPersonId = match.id
          matchedPersonName = `${match.firstName || ""} ${match.lastName || ""}`.trim() || match.email || null
        }
      }

      tasks.push({
        title: task.title || "Untitled Task",
        description: task.description || null,
        evidence: task.evidence || null,
        suggestedOwner: task.suggestedOwner || null,
        matchedPersonId,
        matchedPersonName,
        priority: task.priority || "P1",
        category: task.category || "OPS",
        suggestedDueDate: task.suggestedDueDate || null,
      })
    }

    const output: StrategistOutput = {
      client: parsed.client || metadata.clientName || null,
      meeting: parsed.meeting || null,
      project: parsed.project || projectName || null,
      sourceGeminiNotes: parsed.sourceGeminiNotes ?? metadata.hasGeminiNotes ?? false,
      notesCompleteness: parsed.notesCompleteness || "Med",
      executiveBrief: parsed.executiveBrief || [],
      rankedMoves: parsed.rankedMoves || [],
      risksGapsContradictions: parsed.risksGapsContradictions || [],
      creativeIdeas: parsed.creativeIdeas || [],
      followUpSubject: parsed.followUpSubject || null,
      followUpBody: parsed.followUpBody || null,
      nextMeetingAgenda: parsed.nextMeetingAgenda || null,
      tasks,
    }

    if (metadata.clientId) {
      try {
        let meeting = null
        let nextVersion = 1

        if (metadata.eventId) {
          meeting = await prisma.meeting.findFirst({
            where: {
              organizationId: user.organizationId,
              calendarEventId: metadata.eventId,
            },
            include: {
              versions: {
                orderBy: { versionNumber: "desc" },
                take: 1,
              },
            },
          })

          if (meeting) {
            nextVersion = (meeting.versions[0]?.versionNumber || 0) + 1
            await prisma.meeting.update({
              where: { id: meeting.id },
              data: {
                rawNotes: notes,
                notesCompleteness: output.notesCompleteness === "High" ? "HIGH" : output.notesCompleteness === "Med" ? "MEDIUM" : "LOW",
              },
            })
          }
        }

        if (!meeting) {
          meeting = await prisma.meeting.create({
            data: {
              organizationId: user.organizationId,
              clientId: metadata.clientId,
              projectId: projectId || undefined,
              calendarEventId: metadata.eventId,
              title: output.meeting || "Meeting",
              datetime: metadata.datetime ? new Date(metadata.datetime) : new Date(),
              attendees: metadata.attendees || [],
              meetingLink: metadata.meetLink,
              hasGeminiNotes: metadata.hasGeminiNotes || false,
              rawNotes: notes,
              notesCompleteness: output.notesCompleteness === "High" ? "HIGH" : output.notesCompleteness === "Med" ? "MEDIUM" : "LOW",
            },
          })
        }

        await prisma.meetingAnalysis.create({
          data: {
            meetingId: meeting.id,
            versionNumber: nextVersion,
            executiveBrief: output.executiveBrief.join("\n"),
            rankedMoves: JSON.parse(JSON.stringify(output.rankedMoves)),
            risksGapsContra: JSON.parse(JSON.stringify(output.risksGapsContradictions)),
            creativeIdeas: JSON.parse(JSON.stringify(output.creativeIdeas)),
            followUpDraft: output.followUpBody,
            followUpSubject: output.followUpSubject,
            nextMeetingAgenda: Array.isArray(output.nextMeetingAgenda) ? output.nextMeetingAgenda.join("\n") : output.nextMeetingAgenda,
          },
        })

        for (const task of output.tasks) {
          await prisma.meetingExtractedTask.create({
            data: {
              meetingId: meeting.id,
              analysisVersion: nextVersion,
              title: task.title,
              description: task.description,
              evidence: task.evidence,
              suggestedOwner: task.suggestedOwner,
              matchedPersonId: task.matchedPersonId,
              suggestedDue: task.suggestedDueDate,
              priority: task.priority === "P0" ? MeetingTaskPriority.P0 : task.priority === "P1" ? MeetingTaskPriority.P1 : MeetingTaskPriority.P2,
              category: task.category as MeetingTaskCategory,
            },
          })
        }
      } catch (err) {
        console.error("Error saving meeting to database:", err)
      }
    }

    return {
      success: true,
      output,
    }
  } catch (error) {
    console.error("Error analyzing meeting notes:", error)
    return {
      success: false,
      output: null,
      error: "Failed to analyze meeting notes. Please try again.",
    }
  }
}

export interface CreateTasksResult {
  success: boolean
  createdCount: number
  error?: string
}

function mapPriorityToEnum(priority: "P0" | "P1" | "P2"): TaskPriority {
  switch (priority) {
    case "P0":
      return TaskPriority.URGENT
    case "P1":
      return TaskPriority.HIGH
    case "P2":
      return TaskPriority.MEDIUM
    default:
      return TaskPriority.MEDIUM
  }
}

function mapCategoryToWorkstream(category: string): TaskWorkstream {
  switch (category) {
    case "STRATEGY":
      return TaskWorkstream.OTHER
    case "CREATIVE":
      return TaskWorkstream.CREATIVE
    case "OPS":
      return TaskWorkstream.OPERATIONS
    case "TECH":
      return TaskWorkstream.PRODUCTION
    case "MEASUREMENT":
      return TaskWorkstream.OTHER
    case "CLIENT":
      return TaskWorkstream.OTHER
    default:
      return TaskWorkstream.OTHER
  }
}

export async function createTasksFromAnalysis(
  projectId: string,
  tasks: Array<{
    title: string
    description: string | null
    evidence: string | null
    assigneePersonId: string | null
    priority: "P0" | "P1" | "P2"
    category: string
    dueDate: string | null
  }>,
  meetingId?: string
): Promise<CreateTasksResult> {
  const user = await requireAuthWithOrg()

  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: user.organizationId },
  })

  if (!project) {
    return { success: false, createdCount: 0, error: "Project not found" }
  }

  try {
    const assigneeIds = tasks.map((t) => t.assigneePersonId).filter(Boolean) as string[]
    const validPersonIds = new Set<string>()
    const userIdToPersonId = new Map<string, string>()

    if (assigneeIds.length > 0) {
      const [people, users] = await Promise.all([
        prisma.person.findMany({
          where: { id: { in: assigneeIds }, organizationId: user.organizationId },
          select: { id: true },
        }),
        prisma.user.findMany({
          where: { id: { in: assigneeIds }, organizationId: user.organizationId },
          select: { id: true, email: true },
        }),
      ])

      for (const p of people) validPersonIds.add(p.id)

      const userEmails = users
        .filter((u) => !validPersonIds.has(u.id) && u.email)
        .map((u) => u.email!.toLowerCase())

      if (userEmails.length > 0) {
        const matchedPeople = await prisma.person.findMany({
          where: {
            organizationId: user.organizationId,
            email: { in: userEmails, mode: "insensitive" },
          },
          select: { id: true, email: true },
        })
        const emailToPersonId = new Map(matchedPeople.map((p) => [p.email?.toLowerCase(), p.id]))
        for (const u of users) {
          if (!validPersonIds.has(u.id) && u.email) {
            const personId = emailToPersonId.get(u.email.toLowerCase())
            if (personId) userIdToPersonId.set(u.id, personId)
          }
        }
      }
    }

    const resolveAssignee = (id: string | null): string | null => {
      if (!id) return null
      if (validPersonIds.has(id)) return id
      return userIdToPersonId.get(id) || null
    }

    const createdTasks = await prisma.$transaction(
      tasks.map((task) =>
        prisma.task.create({
          data: {
            projectId,
            title: task.title,
            description: task.evidence 
              ? `${task.description || ""}\n\n---\nEvidence: ${task.evidence}`.trim()
              : task.description,
            assigneePersonId: resolveAssignee(task.assigneePersonId),
            status: TaskStatus.Todo,
            workstream: mapCategoryToWorkstream(task.category),
            phase: TaskPhase.PRE_PROGRAM,
            priority: mapPriorityToEnum(task.priority),
            dueDate: task.dueDate ? new Date(task.dueDate) : null,
          },
        })
      )
    )

    return { success: true, createdCount: createdTasks.length }
  } catch (error) {
    console.error("Error creating tasks:", error)
    return { success: false, createdCount: 0, error: "Failed to create tasks" }
  }
}

export async function getProjectsForSelect() {
  const user = await requireAuthWithOrg()

  const projects = await prisma.project.findMany({
    where: {
      organizationId: user.organizationId,
      status: { in: [ProjectStatus.Draft, ProjectStatus.Active, ProjectStatus.Onsite] },
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  })

  return projects
}

export async function getPeopleForSelect() {
  const user = await requireAuthWithOrg()

  const [people, orgUsers] = await Promise.all([
    prisma.person.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: { firstName: "asc" },
    }),
    prisma.user.findMany({
      where: {
        organizationId: user.organizationId,
        approvalStatus: "APPROVED",
        role: { in: ["ADMIN", "MEMBER"] },
      },
      select: { id: true, firstName: true, lastName: true, name: true, email: true },
      orderBy: { firstName: "asc" },
    }),
  ])

  const personEmails = new Set(people.map((p) => p.email?.toLowerCase()).filter(Boolean))

  const personList = people.map((p) => ({
    id: p.id,
    name: `${p.firstName || ""} ${p.lastName || ""}`.trim() || p.email || "Unknown",
  }))

  const unmatchedUsers = orgUsers
    .filter((u) => !personEmails.has(u.email?.toLowerCase()))
    .map((u) => {
      const fullName = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.name || u.email || "Unknown"
      return { id: u.id, name: fullName, isUser: true }
    })

  return [...personList, ...unmatchedUsers.map((u) => ({ id: u.id, name: u.name }))]
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

export async function getPriorMeetings(clientId: string, limit: number = 3) {
  const user = await requireAuthWithOrg()

  const meetings = await prisma.meeting.findMany({
    where: {
      organizationId: user.organizationId,
      clientId,
    },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
      },
    },
    orderBy: { datetime: "desc" },
    take: limit,
  })

  return meetings.map((m) => ({
    id: m.id,
    title: m.title,
    datetime: m.datetime.toISOString(),
    executiveBrief: m.versions[0]?.executiveBrief || null,
  }))
}

export interface SaveMeetingLogResult {
  success: boolean
  meetingId?: string
  error?: string
}

export async function saveMeetingLog(
  title: string,
  notes: string,
  output: StrategistOutput,
  clientId?: string,
  projectId?: string
): Promise<SaveMeetingLogResult> {
  const user = await requireAuthWithOrg()

  try {
    const meeting = await prisma.meeting.create({
      data: {
        organizationId: user.organizationId,
        clientId: clientId || null,
        projectId: projectId || null,
        title: title || output.meeting || "Untitled Meeting",
        datetime: new Date(),
        attendees: [],
        hasGeminiNotes: output.sourceGeminiNotes,
        rawNotes: notes,
        notesCompleteness: output.notesCompleteness === "High" ? "HIGH" : output.notesCompleteness === "Med" ? "MEDIUM" : "LOW",
      },
    })

    await prisma.meetingAnalysis.create({
      data: {
        meetingId: meeting.id,
        versionNumber: 1,
        executiveBrief: output.executiveBrief.join("\n"),
        rankedMoves: JSON.parse(JSON.stringify(output.rankedMoves)),
        risksGapsContra: JSON.parse(JSON.stringify(output.risksGapsContradictions)),
        creativeIdeas: JSON.parse(JSON.stringify(output.creativeIdeas)),
        followUpDraft: output.followUpBody,
        followUpSubject: output.followUpSubject,
        nextMeetingAgenda: Array.isArray(output.nextMeetingAgenda) ? output.nextMeetingAgenda.join("\n") : output.nextMeetingAgenda,
      },
    })

    return { success: true, meetingId: meeting.id }
  } catch (error) {
    console.error("Error saving meeting log:", error)
    return { success: false, error: "Failed to save meeting log" }
  }
}

export interface MeetingLogSummary {
  id: string
  title: string
  datetime: string
  clientName: string | null
  projectName: string | null
  executiveBrief: string | null
  rankedMoves: RankedMove[]
  risksGapsContradictions: RiskGapItem[]
  creativeIdeas: CreativeIdea[]
}

export async function getMeetingLogs(limit: number = 20): Promise<MeetingLogSummary[]> {
  const user = await requireAuthWithOrg()

  const meetings = await prisma.meeting.findMany({
    where: {
      organizationId: user.organizationId,
    },
    include: {
      client: { select: { name: true } },
      project: { select: { name: true } },
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
      },
    },
    orderBy: { datetime: "desc" },
    take: limit,
  })

  return meetings.map((m) => ({
    id: m.id,
    title: m.title,
    datetime: m.datetime.toISOString(),
    clientName: m.client?.name || null,
    projectName: m.project?.name || null,
    executiveBrief: m.versions[0]?.executiveBrief || null,
    rankedMoves: parseRankedMoves(m.versions[0]?.rankedMoves),
    risksGapsContradictions: parseRiskGapItems(m.versions[0]?.risksGapsContra),
    creativeIdeas: parseCreativeIdeas(m.versions[0]?.creativeIdeas),
  }))
}
