import { Suspense } from "react"
import { requireAuth } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ProjectTabs } from "./project-tabs"
import { ArrowLeft, Settings, ExternalLink } from "lucide-react"
import { format } from "date-fns"
import { ProjectOverview } from "./overview"
import { ProjectBudget } from "./budget/project-budget"
import { ProjectStaffingPlan } from "./staffing-plan/staffing-plan-tab"
import { ProjectPlan } from "./plan"
import { ProjectVendors } from "./vendors"
import { ProjectActuals } from "./actuals"
import { ProjectSettings } from "./settings"
import { ContractsTab } from "./contracts/contracts-tab"
import { ClientBudgetTab } from "./client-budget/client-budget-tab"
import { ClientAccessTab } from "./client-access/client-access-tab"
import { ProjectShipping } from "./shipping/project-shipping"
import { ProjectAssets } from "./assets/project-assets"
import { ProjectProofs } from "./proofs/project-proofs"
import { ClientProofApprovals } from "./proofs/client-proof-approvals"
import { DocumentsTab } from "./documents/documents-tab"
import { SpaceAllocationTab } from "./space-allocation/space-allocation-tab"
import { VenueSearchTab } from "./venue-search/venue-search-tab"
import { ExpenseReportsTab } from "./expense-reports/expense-reports-tab"
import { HousingTab } from "./housing/housing-tab"
import { CateringTab } from "./catering/catering-tab"
import { QuickLinksCanvas } from "./canvas/quick-links-canvas"
import { ProjectAlertsBanner } from "@/components/alerts/project-alerts-banner"
import {
  computeAllBudgetLines,
  calculateBudgetSummary,
  buildTaxCodeMap,
  buildExpenseMap,
  buildActualMap,
  buildExpenseByBudgetLineIdMap,
  buildActualByBudgetLineIdMap,
  buildStaffingRateMap,
  BudgetContext,
  BudgetLineInput,
} from "@/lib/budget-engine"

export const dynamic = "force-dynamic"

const externalAllowedTabs = ['plan', 'purchases', 'shipping', 'assets', 'proofs', 'space-allocation']

const statusColors: Record<string, string> = {
  Draft: "bg-gray-100 text-gray-700",
  Active: "bg-blue-100 text-blue-700",
  Onsite: "bg-green-100 text-green-700",
  Closed: "bg-purple-100 text-purple-700",
}

export default async function ProjectDetailPage({
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
    include: {
      client: true,
      owner: true,
      estimateVersions: {
        include: { lineItems: { include: { vendor: true } } },
        orderBy: { versionNumber: "desc" },
      },
      milestones: {
        include: { tasks: { include: { owner: true } } },
        orderBy: { sortOrder: "asc" },
      },
      tasks: {
        include: { 
          owner: { select: { id: true, name: true } },
          assigneePerson: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      vendorQuotes: { include: { vendor: true } },
      purchases: { include: { vendor: true, purchaser: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } },
      manualAdjustments: true,
    },
  })

  if (!project) {
    notFound()
  }

  const [templates, vendors, people, rawUsers, staffingPlan, budget, contracts, taxCodes, expenseEntries, actualCostEntries, purchases] = await Promise.all([
    prisma.template.findMany({
      where: { organizationId: user.organizationId },
      include: { tasks: true },
    }),
    prisma.vendor.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
    }),
    prisma.person.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
    }),
    prisma.staffingPlan.findUnique({
      where: { projectId: id },
      include: {
        assignments: {
          include: {
            allocations: true,
          },
        },
      },
    }),
    prisma.budget.findUnique({
      where: { projectId: id },
      include: {
        lines: {
          orderBy: { rowOrder: "asc" },
        },
      },
    }),
    prisma.contract.findMany({
      where: { projectId: id },
      select: { id: true, stage: true },
    }),
    prisma.taxCode.findMany(),
    prisma.expenseEntry.findMany({ where: { projectId: id } }),
    prisma.actualCostEntry.findMany({ where: { projectId: id } }),
    prisma.purchase.findMany({ where: { projectId: id } }),
  ])

  let staffingCostFromPlan = 0
  let staffingRevenueFromPlan = 0
  if (staffingPlan?.assignments) {
    for (const assignment of staffingPlan.assignments) {
      const totalHours = assignment.allocations.reduce(
        (sum, alloc) => sum + Number(alloc.plannedHours),
        0
      )
      const clientRate = Number(assignment.clientBillRate) || 0
      const internalBill = Number(assignment.billRate) || 0
      const internalCost = Number(assignment.costRate) || 0
      staffingRevenueFromPlan += clientRate * totalHours
      staffingCostFromPlan += internalBill > 0
        ? (clientRate * totalHours) * (internalCost / internalBill)
        : internalCost * totalHours
    }
  }

  // Calculate budget forecast cost (non-PASSTHROUGH lines) using budget engine
  let budgetForecastCost = 0
  let budgetForecastRevenue = 0
  // Map for Budget Allocation totals with tax
  const budgetLineClientEstimates = new Map<string, number>()
  // Store computed lines for purchases tracking
  let computedBudgetLines: { id: string; description: string | null; category: string | null; vendor: string | null; processingFeeEnabled: boolean; processingFeePercent: number; internalCost: number }[] = []
  
  if (budget?.lines) {
    const taxCodeMap = buildTaxCodeMap(taxCodes)
    const expenseMap = buildExpenseMap(expenseEntries.map(e => ({ description: e.description || '', amount: Number(e.amount) })))
    const actualMap = buildActualMap(actualCostEntries.map(e => ({ description: e.description || '', amount: Number(e.amount) })))
    const expenseByBudgetLineIdMap = buildExpenseByBudgetLineIdMap(expenseEntries.map(e => ({ budgetLineId: e.budgetLineId, amount: Number(e.amount) })))
    const actualByBudgetLineIdMap = buildActualByBudgetLineIdMap(actualCostEntries.map(e => ({ budgetLineId: e.budgetLineId, amount: Number(e.amount) })))
    const purchaseMap = new Map<string, number>()
    for (const purchase of purchases) {
      if (purchase.budgetLineId) {
        purchaseMap.set(purchase.budgetLineId, (purchaseMap.get(purchase.budgetLineId) || 0) + Number(purchase.amount))
      }
    }

    const context: BudgetContext = {
      jurisdiction: budget.jurisdiction,
      baseMarkup: budget.baseMarkup ?? 1.0,
      taxCodes: taxCodeMap,
      staffingRates: new Map(),
      expensesByDescription: expenseMap,
      actualsByDescription: actualMap,
      expensesByBudgetLineId: expenseByBudgetLineIdMap,
      actualsByBudgetLineId: actualByBudgetLineIdMap,
      purchasesByBudgetLineId: purchaseMap,
      roleAllocationsByBudgetLineId: new Map(),
    }

    const budgetLines: BudgetLineInput[] = budget.lines.map(line => ({
      id: line.id,
      rowOrder: line.rowOrder,
      section: line.section as "PASSTHROUGH" | "SANDBOX" | "STAFFING" | "SUMMARY",
      lineType: line.lineType as "NORMAL" | "SUBTOTAL",
      category: line.category,
      taxCategory: line.taxCategory,
      description: line.description,
      ovh: line.ovh,
      vendor: line.vendor,
      units: line.units,
      internalCostInput: line.internalCostInput,
      markupOverride: line.markupOverride,
      internalNotes: line.internalNotes,
      clientNotes: line.clientNotes,
      processingFeeEnabled: line.processingFeeEnabled,
      processingFeePercent: line.processingFeePercent,
    }))

    const computedLines = computeAllBudgetLines(budgetLines, context)
    const summary = calculateBudgetSummary(computedLines)
    budgetForecastCost = summary.cogsForecast
    budgetForecastRevenue = summary.revenue
    
    // Build map of lineId -> clientEstimate for Budget Allocation
    for (const line of computedLines) {
      budgetLineClientEstimates.set(line.id, line.clientEstimate)
    }
    
    // Store computed lines with internalCost for purchases tracking
    computedBudgetLines = computedLines.map(line => ({
      id: line.id,
      description: line.description ?? null,
      category: null,
      vendor: line.vendor ?? null,
      processingFeeEnabled: line.processingFeeEnabled ?? false,
      processingFeePercent: Number(line.processingFeePercent ?? 0),
      internalCost: line.internalCost,
    }))
  }

  const users = rawUsers.map(u => ({
    id: u.id,
    name: u.name || u.email || "Unknown User",
  }))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link href="/projects">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{project.name}</h1>
            <span
              className={`text-xs px-2 py-1 rounded-full ${
                statusColors[project.status] || "bg-gray-100 dark:bg-gray-700"
              }`}
            >
              {project.status}
            </span>
          </div>
          <p className="text-gray-500 dark:text-gray-400">{project.client.name}</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <QuickLinksCanvas projectId={project.id} canvasType={user.role === 'CLIENT' ? 'client' : 'internal'} />
          {project.masterProductionDocUrl && (
            <a
              href={project.masterProductionDocUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 sm:flex-none"
            >
              <Button variant="outline" size="sm" className="w-full whitespace-nowrap">
                <ExternalLink className="h-4 w-4 mr-2" />
                Master Production Doc
              </Button>
            </a>
          )}
        </div>
      </div>

      {user.role !== 'EXTERNAL' && user.role !== 'CLIENT' && (
        <ProjectAlertsBanner projectId={project.id} />
      )}

      <ProjectTabs defaultTab={user.role === 'EXTERNAL' ? 'plan' : user.role === 'CLIENT' ? 'client-budget' : 'overview'}>
        <TabsList className="h-auto flex flex-wrap gap-1">
          {user.role !== 'EXTERNAL' && user.role !== 'CLIENT' && <TabsTrigger value="overview">Overview</TabsTrigger>}
          {user.role !== 'EXTERNAL' && user.role !== 'CLIENT' && <TabsTrigger value="budget">Budget</TabsTrigger>}
          {user.role !== 'EXTERNAL' && <TabsTrigger value="client-budget">Client Budget</TabsTrigger>}
          {user.role !== 'EXTERNAL' && user.role !== 'CLIENT' && <TabsTrigger value="staffing-plan">Staffing Plan</TabsTrigger>}
          <TabsTrigger value="plan">Project Plan</TabsTrigger>
          {user.role !== 'CLIENT' && <TabsTrigger value="purchases">Purchases</TabsTrigger>}
          {user.role !== 'CLIENT' && <TabsTrigger value="shipping">Shipping</TabsTrigger>}
          {user.role !== 'CLIENT' && <TabsTrigger value="housing">Housing</TabsTrigger>}
          {user.role !== 'CLIENT' && <TabsTrigger value="catering">Catering</TabsTrigger>}
          <TabsTrigger value="assets">Assets</TabsTrigger>
          {user.role !== 'EXTERNAL' && user.role !== 'CLIENT' && user.role !== 'MEMBER' && <TabsTrigger value="contracts">Contracts</TabsTrigger>}
          {user.role !== 'CLIENT' && <TabsTrigger value="proofs">Proofs</TabsTrigger>}
          {user.role === 'CLIENT' && <TabsTrigger value="proof-approvals">Proof Approvals</TabsTrigger>}
          {user.role !== 'EXTERNAL' && user.role !== 'CLIENT' && <TabsTrigger value="expense-reports">Expense Reports</TabsTrigger>}
          {user.role !== 'EXTERNAL' && user.role !== 'CLIENT' && <TabsTrigger value="documents">Documents</TabsTrigger>}
          <TabsTrigger value="space-allocation">Space Allocation</TabsTrigger>
          <TabsTrigger value="venue-search">Venue Search</TabsTrigger>
          {user.role !== 'EXTERNAL' && user.role !== 'CLIENT' && user.role !== 'MEMBER' && <TabsTrigger value="actuals">Actuals</TabsTrigger>}
          {user.role !== 'EXTERNAL' && user.role !== 'CLIENT' && <TabsTrigger value="client-access">Client Access</TabsTrigger>}
          {user.role !== 'EXTERNAL' && user.role !== 'CLIENT' && <TabsTrigger value="settings">Settings</TabsTrigger>}
        </TabsList>

        {user.role !== 'EXTERNAL' && user.role !== 'CLIENT' && (
          <TabsContent value="overview">
            <ProjectOverview 
              project={project} 
              budgetForecastCost={budgetForecastCost}
              budgetForecastRevenue={budgetForecastRevenue}
              contracts={contracts}
            />
          </TabsContent>
        )}

        {user.role !== 'EXTERNAL' && user.role !== 'CLIENT' && (
          <TabsContent value="budget">
            <Suspense fallback={<div className="text-muted-foreground">Loading budget...</div>}>
              <ProjectBudget projectId={project.id} />
            </Suspense>
          </TabsContent>
        )}

        {user.role !== 'EXTERNAL' && (
          <TabsContent value="client-budget">
            <Suspense fallback={<div className="text-muted-foreground">Loading client budget...</div>}>
              <ClientBudgetTab projectId={project.id} />
            </Suspense>
          </TabsContent>
        )}

        <TabsContent value="plan">
          <ProjectPlan
            project={{ id: project.id, tasks: project.tasks as any }}
            people={[
              ...people.map(p => ({ id: p.id, name: p.name })),
              ...users.filter(u => !people.some(p => p.name === u.name)).map(u => ({ id: u.id, name: u.name })),
            ]}
          />
        </TabsContent>

        {user.role !== 'CLIENT' && (
          <TabsContent value="purchases">
            <ProjectVendors
              project={project}
              vendors={vendors}
              budgetLines={computedBudgetLines}
              budgetLineClientEstimates={Object.fromEntries(budgetLineClientEstimates)}
              people={people.map(p => ({ id: p.id, name: p.name }))}
            />
          </TabsContent>
        )}

        {user.role !== 'CLIENT' && (
          <TabsContent value="shipping">
            <Suspense fallback={<div className="text-muted-foreground">Loading shipping...</div>}>
              <ProjectShipping projectId={project.id} organizationId={project.organizationId} />
            </Suspense>
          </TabsContent>
        )}

        {user.role !== 'CLIENT' && (
          <TabsContent value="housing">
            <Suspense fallback={<div className="text-muted-foreground">Loading housing...</div>}>
              <HousingTab projectId={project.id} />
            </Suspense>
          </TabsContent>
        )}

        {user.role !== 'CLIENT' && (
          <TabsContent value="catering">
            <Suspense fallback={<div className="text-muted-foreground">Loading catering...</div>}>
              <CateringTab projectId={project.id} />
            </Suspense>
          </TabsContent>
        )}

        <TabsContent value="assets">
          <Suspense fallback={<div className="text-muted-foreground">Loading assets...</div>}>
            <ProjectAssets projectId={project.id} organizationId={project.organizationId} />
          </Suspense>
        </TabsContent>

        {user.role !== 'EXTERNAL' && user.role !== 'CLIENT' && (
          <TabsContent value="staffing-plan">
            <Suspense fallback={<div className="text-muted-foreground">Loading staffing plan...</div>}>
              <ProjectStaffingPlan projectId={project.id} />
            </Suspense>
          </TabsContent>
        )}

        {user.role !== 'EXTERNAL' && user.role !== 'CLIENT' && user.role !== 'MEMBER' && (
          <TabsContent value="contracts">
            <Suspense fallback={<div className="text-muted-foreground">Loading contracts...</div>}>
              <ContractsTab projectId={project.id} />
            </Suspense>
          </TabsContent>
        )}

        {user.role !== 'CLIENT' && (
          <TabsContent value="proofs">
            <Suspense fallback={<div className="text-muted-foreground">Loading proofs...</div>}>
              <ProjectProofs projectId={project.id} userRole={user.role} />
            </Suspense>
          </TabsContent>
        )}

        {user.role === 'CLIENT' && (
          <TabsContent value="proof-approvals">
            <Suspense fallback={<div className="text-muted-foreground">Loading proof approvals...</div>}>
              <ClientProofApprovals projectId={project.id} />
            </Suspense>
          </TabsContent>
        )}

        {user.role !== 'EXTERNAL' && user.role !== 'CLIENT' && (
          <TabsContent value="expense-reports">
            <Suspense fallback={<div className="text-muted-foreground">Loading expense reports...</div>}>
              <ExpenseReportsTab projectId={project.id} />
            </Suspense>
          </TabsContent>
        )}

        {user.role !== 'EXTERNAL' && user.role !== 'CLIENT' && (
          <TabsContent value="documents">
            <Suspense fallback={<div className="text-muted-foreground">Loading documents...</div>}>
              <DocumentsTab projectId={project.id} />
            </Suspense>
          </TabsContent>
        )}

        <TabsContent value="space-allocation">
          <Suspense fallback={<div className="text-muted-foreground">Loading space allocation...</div>}>
            <SpaceAllocationTab projectId={project.id} projectName={project.name} />
          </Suspense>
        </TabsContent>

        <TabsContent value="venue-search">
          <Suspense fallback={<div className="text-muted-foreground">Loading venue search...</div>}>
            <VenueSearchTab projectId={project.id} />
          </Suspense>
        </TabsContent>

        {user.role !== 'EXTERNAL' && user.role !== 'CLIENT' && user.role !== 'MEMBER' && (
          <TabsContent value="actuals">
            <ProjectActuals 
              project={project} 
              staffingCostFromPlan={staffingCostFromPlan}
              staffingRevenueFromPlan={staffingRevenueFromPlan}
              budgetForecastCost={budgetForecastCost}
              budgetForecastRevenue={budgetForecastRevenue}
              budgetLines={budget?.lines || []}
              budgetLineClientEstimates={Object.fromEntries(budgetLineClientEstimates)}
            />
          </TabsContent>
        )}

        {user.role !== 'EXTERNAL' && user.role !== 'CLIENT' && (
          <TabsContent value="client-access">
            <ClientAccessTab projectId={project.id} />
          </TabsContent>
        )}

        {user.role !== 'EXTERNAL' && user.role !== 'CLIENT' && (
          <TabsContent value="settings">
            <ProjectSettings project={{...project, clientTeamMembers: (project.clientTeamMembers as any) || []}} users={users} />
          </TabsContent>
        )}
      </ProjectTabs>
    </div>
  )
}
