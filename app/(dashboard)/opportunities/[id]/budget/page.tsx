import { requireAuth } from "@/lib/session"
import { notFound, redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { BudgetTable } from "@/app/(dashboard)/projects/[id]/budget/budget-table"
import {
  getOpportunityBudgetWithContext,
  getVendorsForOpportunity,
} from "./actions"
import {
  getJurisdictions,
  getTaxCategories,
  getStaffingRoles,
} from "@/app/(dashboard)/projects/[id]/budget/actions"

export const dynamic = "force-dynamic"

interface OpportunityBudgetPageProps {
  params: Promise<{ id: string }>
}

export default async function OpportunityBudgetPage({ params }: OpportunityBudgetPageProps) {
  const { id } = await params
  const user = await requireAuth()

  if (!user.organizationId) {
    redirect("/")
  }

  const opportunity = await prisma.opportunity.findFirst({
    where: { id, organizationId: user.organizationId },
    select: { id: true, client: { select: { name: true } }, eventType: true },
  })

  if (!opportunity) {
    notFound()
  }

  const [budgetData, jurisdictions, taxCategories, staffingRoles, vendors] = await Promise.all([
    getOpportunityBudgetWithContext(id),
    getJurisdictions(),
    getTaxCategories(),
    getStaffingRoles(),
    getVendorsForOpportunity(id),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Budget</h2>
        <p className="text-muted-foreground">
          Cost estimate for {opportunity.client.name} - {opportunity.eventType || "Opportunity"}
        </p>
      </div>

      <BudgetTable
        opportunityId={opportunity.id}
        budgetData={budgetData}
        jurisdictions={jurisdictions}
        taxCategories={taxCategories}
        staffingRoles={staffingRoles}
        vendors={vendors}
      />
    </div>
  )
}
