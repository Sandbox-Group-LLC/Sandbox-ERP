import { requireAuth } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import { StaffingPlanGrid } from "./staffing-grid"
import { getOrCreateStaffingPlan, getStaffingRoles, getProjectPeople } from "./actions"

export const dynamic = "force-dynamic"

export default async function StaffingPlanPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await requireAuth()

  if (!user.organizationId) {
    redirect("/")
  }

  const project = await prisma.project.findFirst({
    where: { id, organizationId: user.organizationId },
  })

  if (!project) {
    notFound()
  }

  const [staffingPlan, roles, people] = await Promise.all([
    getOrCreateStaffingPlan(id),
    getStaffingRoles(),
    getProjectPeople(id),
  ])

  const assignments = await prisma.staffingAssignment.findMany({
    where: { staffingPlanId: staffingPlan.id },
    include: {
      person: true,
      staffingRole: { include: { roleRate: true } },
      allocations: true,
    },
    orderBy: { createdAt: "asc" },
  })

  const formattedAssignments = assignments.map((a) => ({
    id: a.id,
    roleId: a.roleId,
    personId: a.personId,
    billRate: Number(a.billRate),
    costRate: Number(a.costRate),
    clientBillRate: Number(a.clientBillRate),
    startDate: a.startDate,
    endDate: a.endDate,
    role: { id: a.staffingRole.id, name: a.staffingRole.name },
    person: { id: a.person.id, name: a.person.name },
    allocations: a.allocations.map((alloc) => ({
      id: alloc.id,
      weekStartDate: alloc.weekStartDate,
      plannedHours: Number(alloc.plannedHours),
    })),
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/projects/${id}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Staffing Plan
          </h1>
          <p className="text-gray-500 dark:text-gray-400">{project.name}</p>
        </div>
      </div>

      <StaffingPlanGrid
        staffingPlan={{
          id: staffingPlan.id,
          startDate: staffingPlan.startDate,
          endDate: staffingPlan.endDate,
        }}
        assignments={formattedAssignments}
        roles={roles.map((r) => ({
          id: r.id,
          name: r.name,
          billRate: r.roleRate ? Number(r.roleRate.billRate ?? r.roleRate.internalRate) : 0,
        }))}
        people={people.map((p) => ({ id: p.id, name: p.name, clientBillRate: p.clientBillRate }))}
        projectId={id}
        userRole={user.role}
      />
    </div>
  )
}
