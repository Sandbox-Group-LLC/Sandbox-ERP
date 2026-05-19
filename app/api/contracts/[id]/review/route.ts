import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getUserWithOrganization } from "@/lib/replit-auth"
import { getDocumentText } from "@/lib/google-drive"
import { getOpenAI, isAIConfigured } from "@/lib/openai"

interface ContractReviewResult {
  summary: string
  riskLevel: "low" | "medium" | "high"
  issues: {
    severity: "info" | "warning" | "critical"
    category: string
    description: string
    suggestion: string
    originalText?: string
  }[]
  recommendations: string[]
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserWithOrganization()
  if (!user || user.approvalStatus !== "APPROVED" || !user.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!isAIConfigured()) {
    return NextResponse.json({ error: "AI not configured" }, { status: 500 })
  }

  const { id } = await params

  try {
    const contract = await prisma.contract.findFirst({
      where: {
        id,
        project: {
          organizationId: user.organizationId,
        },
      },
      include: {
        vendor: true,
      },
    })

    if (!contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 })
    }

    if (!contract.googleDocId) {
      return NextResponse.json({ error: "Contract has no Google Doc linked" }, { status: 400 })
    }

    const contractText = await getDocumentText(contract.googleDocId, user.organizationId)

    if (!contractText || contractText.length < 50) {
      return NextResponse.json({ error: "Contract document is empty or too short to analyze" }, { status: 400 })
    }

    const templates = await prisma.documentTemplate.findMany({
      where: {
        organizationId: user.organizationId,
        templateType: "Contract",
      },
      select: {
        id: true,
        name: true,
        googleDocUrl: true,
      },
    })

    let templateText = ""
    if (templates.length > 0 && templates[0].googleDocUrl) {
      try {
        const docIdMatch = templates[0].googleDocUrl.match(/\/d\/([a-zA-Z0-9-_]+)/)
        if (docIdMatch) {
          templateText = await getDocumentText(docIdMatch[1], user.organizationId)
        }
      } catch (e) {
        console.log("Could not fetch template text:", e)
      }
    }

    const openai = getOpenAI()

    const systemPrompt = `You are an expert contract analyst for an event agency. Your job is to review vendor contracts and identify potential risks, missing clauses, and deviations from standard terms.

Focus on these key areas:
1. Payment Terms - Net 30 is standard, flag anything shorter
2. Cancellation Policies - Look for excessive fees or restrictive terms
3. Liability & Indemnification - Flag unlimited liability or one-sided indemnification
4. Insurance Requirements - Standard is $1M general liability
5. Intellectual Property - Ensure work product ownership is clear
6. Force Majeure - Check for reasonable event cancellation coverage
7. Termination Clauses - Look for hidden auto-renewal or difficult exit terms
8. Service Level Agreements - Ensure deliverables and timelines are clear

${templateText ? `\nThe agency's standard contract template includes these terms for comparison:\n${templateText.substring(0, 3000)}...\n\nCompare the vendor contract against these standard terms.` : ""}

Respond with a JSON object matching this structure:
{
  "summary": "Brief 2-3 sentence overview of the contract",
  "riskLevel": "low" | "medium" | "high",
  "issues": [
    {
      "severity": "info" | "warning" | "critical",
      "category": "Payment Terms" | "Cancellation" | "Liability" | "Insurance" | "IP" | "Force Majeure" | "Termination" | "SLA" | "Other",
      "description": "What the issue is",
      "suggestion": "What to negotiate or change",
      "originalText": "The exact clause text if applicable"
    }
  ],
  "recommendations": ["List of specific negotiation points or actions to take"]
}`

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Please review this vendor contract:\n\n${contractText.substring(0, 15000)}` },
      ],
      response_format: { type: "json_object" },
      max_tokens: 2000,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return NextResponse.json({ error: "AI returned empty response" }, { status: 500 })
    }

    const review: ContractReviewResult = JSON.parse(content)

    return NextResponse.json({ success: true, review })
  } catch (error) {
    console.error("Contract review error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to review contract" },
      { status: 500 }
    )
  }
}
