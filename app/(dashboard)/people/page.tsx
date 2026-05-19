import { requireAuth } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, CheckCircle, Circle, AlertCircle } from "lucide-react"
import { PersonDialog } from "./person-dialog"
import { WeeklyHoursGridWrapper } from "./weekly-hours-grid-wrapper"
import { startOfWeek, addMonths } from "date-fns"

export const dynamic = "force-dynamic"

function OnboardingProgress({ documents }: { documents: Array<{ status: string }> }) {
  const total = documents.length
  if (total === 0) {
    return <span className="text-gray-400 text-sm">No docs</span>
  }
  
  const verified = documents.filter(d => d.status === "VERIFIED").length
  const received = documents.filter(d => d.status === "RECEIVED").length
  const expired = documents.filter(d => d.status === "EXPIRED").length
  const completed = verified + received
  const percentage = Math.round((verified / total) * 100)
  
  if (verified === total) {
    return (
      <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
        <CheckCircle className="h-4 w-4" />
        <span className="text-sm font-medium">Complete</span>
      </div>
    )
  }
  
  if (expired > 0) {
    return (
      <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
        <AlertCircle className="h-4 w-4" />
        <span className="text-sm">{expired} expired</span>
      </div>
    )
  }
  
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div 
          className="h-full bg-primary rounded-full transition-all" 
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 dark:text-gray-400">
        {verified}/{total}
      </span>
    </div>
  )
}

export default async function PeoplePage() {
  const user = await requireAuth()

  if (!user.organizationId) {
    redirect("/")
  }

  const now = new Date()
  await prisma.onboardingDocument.updateMany({
    where: {
      person: { organizationId: user.organizationId },
      documentType: "COI",
      expirationDate: { lt: now },
      status: { not: "EXPIRED" },
    },
    data: {
      status: "EXPIRED",
    },
  })

  const people = await prisma.person.findMany({
    where: { organizationId: user.organizationId },
    include: {
      _count: {
        select: { assignments: true },
      },
      onboardingDocuments: {
        select: { status: true },
      },
    },
    orderBy: { name: "asc" },
  })

  const periodStart = startOfWeek(now, { weekStartsOn: 1 })
  const periodEnd = addMonths(periodStart, 12)

  const allocations = await prisma.staffingAllocation.findMany({
    where: {
      staffingPlan: {
        project: { organizationId: user.organizationId },
      },
      assignmentId: { not: null },
      weekStartDate: {
        gte: periodStart,
        lte: periodEnd,
      },
      plannedHours: { gt: 0 },
    },
    include: {
      staffingPlan: {
        include: {
          project: {
            select: { name: true },
          },
        },
      },
      assignment: {
        select: { personId: true },
      },
    },
  })

  const allocationData = allocations.map(a => {
    const personId = a.assignment?.personId || a.personId || ""
    return {
      personId,
      weekStartDate: a.weekStartDate.toISOString(),
      plannedHours: Number(a.plannedHours),
      projectName: a.staffingPlan?.project?.name || "Unknown",
    }
  }).filter(a => a.personId)

  const isMember = user.role === "MEMBER"

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">People</h1>
          <p className="text-gray-500 dark:text-gray-400">{isMember ? "Weekly hours overview" : "Manage your team and freelancers"}</p>
        </div>
        {!isMember && (
          <PersonDialog>
            <Button className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Add Person
            </Button>
          </PersonDialog>
        )}
      </div>

      {!isMember && (
        <Card>
          <CardContent className="p-0">
            {people.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                No people yet. Add your first team member or freelancer.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="hidden sm:table-cell">Onboarding</TableHead>
                      <TableHead className="hidden md:table-cell">Email</TableHead>
                      <TableHead className="hidden lg:table-cell text-right">Internal Bill</TableHead>
                      <TableHead className="hidden lg:table-cell text-right">Cost Rate</TableHead>
                      <TableHead className="hidden lg:table-cell text-right">Client Rate</TableHead>
                      <TableHead className="hidden md:table-cell">Assignments</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {people.map((person) => (
                      <TableRow key={person.id}>
                        <TableCell>
                          <Link 
                            href={`/people/${person.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {person.name}
                          </Link>
                          <div className="sm:hidden text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {person.email || "No email"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-1 rounded-full ${person.type === "Employee" ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" : "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300"}`}>
                            {person.type}
                          </span>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <OnboardingProgress documents={person.onboardingDocuments} />
                        </TableCell>
                        <TableCell className="hidden md:table-cell">{person.email || "-"}</TableCell>
                        <TableCell className="hidden lg:table-cell text-right">${person.defaultBillRate.toLocaleString()}</TableCell>
                        <TableCell className="hidden lg:table-cell text-right">${person.defaultCostRate.toLocaleString()}</TableCell>
                        <TableCell className="hidden lg:table-cell text-right">${(person as any).clientBillRate?.toLocaleString() ?? "0"}</TableCell>
                        <TableCell className="hidden md:table-cell">{person._count.assignments}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <WeeklyHoursGridWrapper 
        people={people.map(p => ({ id: p.id, name: p.name, type: p.type }))} 
        allocations={allocationData}
      />
    </div>
  )
}
