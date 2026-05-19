import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import { BudgetTable } from "./budget-table"
import {
  getBudgetWithContext,
  getJurisdictions,
  getTaxCategories,
  getStaffingRoles,
  getVendorsForProject,
} from "./actions"

interface ProjectBudgetProps {
  projectId: string
}

async function getStaffingPlanTotals(projectId: string) {
  const staffingPlan = await prisma.staffingPlan.findUnique({
    where: { projectId },
    include: {
      assignments: {
        include: {
          allocations: true,
        },
      },
    },
  })

  if (!staffingPlan) {
    return { staffingPlanRevenue: 0, staffingPlanCost: 0 }
  }

  let staffingPlanRevenue = 0
  let staffingPlanCost = 0

  for (const assignment of staffingPlan.assignments) {
    const totalHours = assignment.allocations.reduce(
      (sum, alloc) => sum + Number(alloc.plannedHours),
      0
    )
    const clientRate = Number(assignment.clientBillRate) || 0
    const internalBill = Number(assignment.billRate) || 0
    const internalCost = Number(assignment.costRate) || 0
    staffingPlanRevenue += clientRate * totalHours
    staffingPlanCost += internalBill > 0
      ? (clientRate * totalHours) * (internalCost / internalBill)
      : internalCost * totalHours
  }

  return { staffingPlanRevenue, staffingPlanCost }
}

export async function ProjectBudget({ projectId }: ProjectBudgetProps) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, budgetThreshold: true },
  })

  if (!project) {
    notFound()
  }

  const [budgetData, jurisdictions, taxCategories, staffingRoles, staffingTotals, vendors] = await Promise.all([
    getBudgetWithContext(projectId),
    getJurisdictions(),
    getTaxCategories(),
    getStaffingRoles(),
    getStaffingPlanTotals(projectId),
    getVendorsForProject(projectId),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Budget</h2>
        <p className="text-muted-foreground">Manage project budget and cost estimates</p>
      </div>

      <BudgetTable
        projectId={project.id}
        budgetData={budgetData}
        jurisdictions={jurisdictions}
        taxCategories={taxCategories}
        staffingRoles={staffingRoles}
        vendors={vendors}
        staffingPlanRevenue={staffingTotals.staffingPlanRevenue}
        staffingPlanCost={staffingTotals.staffingPlanCost}
        budgetThreshold={project.budgetThreshold}
      />
    </div>
  )
}
