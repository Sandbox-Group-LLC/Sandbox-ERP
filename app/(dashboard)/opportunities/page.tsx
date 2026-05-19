import { requireAuth } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Plus, Pencil } from "lucide-react"
import { OpportunityDialog } from "./opportunity-dialog"
import { format } from "date-fns"

export const dynamic = "force-dynamic"

const stageColors: Record<string, string> = {
  Lead: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  Qualified: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  Proposal: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  Won: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  Lost: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
}

export default async function OpportunitiesPage() {
  const user = await requireAuth()

  if (!user.organizationId) {
    redirect("/")
  }

  if (user.role === "MEMBER") {
    redirect("/")
  }

  const [opportunities, clients] = await Promise.all([
    prisma.opportunity.findMany({
      where: { organizationId: user.organizationId },
      include: { client: true, project: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.client.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
    }),
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Opportunities</h1>
          <p className="text-gray-500 dark:text-gray-400">Track and convert sales opportunities</p>
        </div>
        <OpportunityDialog clients={clients}>
          <Button className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Add Opportunity
          </Button>
        </OpportunityDialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {opportunities.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              No opportunities yet. Add your first opportunity to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Opportunity Name</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead className="hidden md:table-cell">Budget</TableHead>
                    <TableHead className="hidden lg:table-cell">Target Date</TableHead>
                    <TableHead className="hidden sm:table-cell">Status</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {opportunities.map((opp) => (
                    <TableRow key={opp.id}>
                      <TableCell>
                        {opp.client.name}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/opportunities/${opp.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {opp.eventType || "-"}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            stageColors[opp.stage] || "bg-gray-100 dark:bg-gray-700"
                          }`}
                        >
                          {opp.stage}
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{opp.budgetRange || "-"}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {opp.targetStartDate
                          ? format(new Date(opp.targetStartDate), "MMM d, yyyy")
                          : "-"}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {opp.project ? (
                          <Link
                            href={`/projects/${opp.project.id}`}
                            className="text-sm text-green-600 dark:text-green-400 hover:underline"
                          >
                            Converted
                          </Link>
                        ) : (
                          <span className="text-sm text-gray-500 dark:text-gray-400">Open</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <OpportunityDialog clients={clients} opportunity={opp}>
                          <Button variant="ghost" size="icon">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </OpportunityDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
