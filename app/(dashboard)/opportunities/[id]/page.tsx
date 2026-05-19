import { requireAuth } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Pencil, Trash2, ArrowRight, DollarSign } from "lucide-react"
import { OpportunityDialog } from "../opportunity-dialog"
import { DeleteOpportunityButton } from "./delete-button"
import { ConvertDialog } from "./convert-dialog"
import { format } from "date-fns"

export const dynamic = "force-dynamic"

const stageColors: Record<string, string> = {
  Lead: "bg-gray-100 text-gray-700",
  Qualified: "bg-blue-100 text-blue-700",
  Proposal: "bg-yellow-100 text-yellow-700",
  Won: "bg-green-100 text-green-700",
  Lost: "bg-red-100 text-red-700",
}

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await requireAuth()

  if (!user.organizationId) {
    redirect("/")
  }

  const [opportunity, clients] = await Promise.all([
    prisma.opportunity.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { client: true, project: true },
    }),
    prisma.client.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
    }),
  ])

  if (!opportunity) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Link href="/opportunities">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
              {opportunity.client.name}
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              {opportunity.eventType || "Opportunity"}
            </p>
          </div>
        </div>
        {!opportunity.project && (
          <div className="flex flex-wrap gap-2 sm:ml-12">
            <OpportunityDialog clients={clients} opportunity={opportunity}>
              <Button variant="outline" size="sm" className="flex-1 sm:flex-none">
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Button>
            </OpportunityDialog>
            <Link href={`/opportunities/${opportunity.id}/budget`}>
              <Button variant="outline" size="sm" className="w-full sm:w-auto">
                <DollarSign className="h-4 w-4 mr-2" />
                Budget
              </Button>
            </Link>
            {opportunity.stage === "Won" && (
              <ConvertDialog opportunity={opportunity}>
                <Button size="sm" className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700">
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Convert to Project
                </Button>
              </ConvertDialog>
            )}
            <DeleteOpportunityButton opportunityId={opportunity.id} />
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-gray-500">Stage</p>
              <span
                className={`inline-block mt-1 text-sm px-2 py-1 rounded-full ${
                  stageColors[opportunity.stage] || "bg-gray-100"
                }`}
              >
                {opportunity.stage}
              </span>
            </div>
            <div>
              <p className="text-sm text-gray-500">Client</p>
              <Link
                href={`/clients/${opportunity.clientId}`}
                className="text-primary hover:underline"
              >
                {opportunity.client.name}
              </Link>
            </div>
            <div>
              <p className="text-sm text-gray-500">Event Type</p>
              <p>{opportunity.eventType || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Budget Range</p>
              <p>{opportunity.budgetRange || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Pre-Production Start</p>
              <p>
                {opportunity.targetStartDate
                  ? format(new Date(opportunity.targetStartDate), "MMMM d, yyyy")
                  : "-"}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Event Dates</p>
              <p>
                {opportunity.eventStartDate
                  ? format(new Date(opportunity.eventStartDate), "MMMM d, yyyy")
                  : "-"}
                {opportunity.eventEndDate && (
                  <> to {format(new Date(opportunity.eventEndDate), "MMMM d, yyyy")}</>
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 whitespace-pre-wrap">
              {opportunity.notes || "No notes yet."}
            </p>
          </CardContent>
        </Card>

        {opportunity.project && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Converted Project</CardTitle>
            </CardHeader>
            <CardContent>
              <Link
                href={`/projects/${opportunity.project.id}`}
                className="flex items-center justify-between p-4 rounded-lg border hover:bg-gray-50"
              >
                <div>
                  <p className="font-medium">{opportunity.project.name}</p>
                  <p className="text-sm text-gray-500">
                    Status: {opportunity.project.status}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-gray-400" />
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
