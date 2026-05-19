import { prisma } from "@/lib/prisma"
import { unstable_noStore as noStore } from "next/cache"
import { getOrCreateStaffingPlan, getStaffingRoles, getProjectPeople } from "./actions"
import { StaffingPlanGrid } from "./staffing-grid"
import { requireAuth } from "@/lib/session"

interface ProjectStaffingPlanProps {
  projectId: string
}

export async function ProjectStaffingPlan({ projectId }: ProjectStaffingPlanProps) {
  noStore()
  const user = await requireAuth()
  const [staffingPlan, roles, people] = await Promise.all([
    getOrCreateStaffingPlan(projectId),
    getStaffingRoles(),
    getProjectPeople(projectId),
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
  
  const assignmentsKey = formattedAssignments.map(a => 
    `${a.id}:${a.costRate}:${a.allocations.map(al => `${al.id}:${al.plannedHours}`).join('|')}`
  ).join(',')
  
  return (
    <StaffingPlanGrid
      key={assignmentsKey}
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
      projectId={projectId}
      userRole={user.role}
    />
  )
}
