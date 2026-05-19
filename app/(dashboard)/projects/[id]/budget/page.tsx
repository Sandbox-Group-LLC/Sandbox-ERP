import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { BudgetTable } from "./budget-table"
import {
  getBudgetWithContext,
  getJurisdictions,
  getTaxCategories,
  getStaffingRoles,
  getVendorsForProject,
} from "./actions"

export const dynamic = "force-dynamic"

interface BudgetPageProps {
  params: Promise<{ id: string }>
}

export default async function BudgetPage({ params }: BudgetPageProps) {
  const { id } = await params
  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, name: true },
  })

  if (!project) {
    notFound()
  }

  const [budgetData, jurisdictions, taxCategories, staffingRoles, vendors] = await Promise.all([
    getBudgetWithContext(id),
    getJurisdictions(),
    getTaxCategories(),
    getStaffingRoles(),
    getVendorsForProject(id),
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
      />
    </div>
  )
}
