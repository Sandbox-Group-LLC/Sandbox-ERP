"use client"

import { useState, useMemo, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import { Plus, Trash2, Settings, ChevronDown, ChevronRight, Pencil, MessageSquare, History, Save, Eye, EyeOff, StickyNote } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import {
  createBudgetVersion,
  getBudgetVersions,
  toggleVersionClientVisibility,
  deleteBudgetVersion,
  BudgetVersionSummary,
} from "./version-actions"
import { CommentDialog } from "./comment-dialog"
import { InternalCommentsSection, getLineCommentCount } from "./internal-comments"
import { getInternalComments, InternalCommentWithDetails } from "./internal-comment-actions"
import {
  createBudget,
  addBudgetLine,
  updateBudgetLine,
  deleteBudgetLine,
  updateBudgetSettings,
  updateBudgetNotes,
} from "./actions"
import { createOpportunityBudget } from "@/app/(dashboard)/opportunities/[id]/budget/actions"
import {
  computeAllBudgetLines,
  calculateBudgetSummary,
  buildTaxCodeMap,
  buildStaffingRateMap,
  buildExpenseMap,
  buildActualMap,
  buildExpenseByBudgetLineIdMap,
  buildActualByBudgetLineIdMap,
  buildRoleAllocationsByBudgetLineIdMap,
  formatCurrency,
  formatPercent,
  BudgetContext,
  ComputedBudgetLine,
  BudgetSection,
  RoleAllocationEntry,
} from "@/lib/budget-engine"

const BUDGET_CATEGORIES = {
  VENUE_SERVICES: "Venue Services",
  GUEST_SERVICES: "Guest Services",
  ONSITE_SUPPORT: "Onsite Staffing",
  AUDIO_VISUAL: "Audio Visual",
  CATERING: "Catering",
  ENVIRONMENTAL: "Environmental",
  CONTENT_DEVELOPMENT: "Content Development",
  DIGITAL_SERVICES: "Digital Services",
  MERCHANDISE: "Merchandise",
  INSURANCE: "Insurance",
  HEALTH_SAFETY: "Production Costs",
  TRAVEL_EXPENSES: "Travel & Expenses",
  PRODUCTION_COSTS: "Production Costs",
} as const

type BudgetCategoryKey = keyof typeof BUDGET_CATEGORIES

interface BudgetLine {
  id: string
  rowOrder: number
  section: string
  lineType: string
  category: string | null
  taxCategory: string | null
  description: string | null
  ovh: boolean
  vendor: string | null
  units: number
  internalCostInput: number | null
  markupOverride: number | null
  internalNotes: string | null
  clientNotes: string | null
  processingFeeEnabled: boolean
  processingFeePercent: number
}

interface Budget {
  id: string
  projectId?: string | null
  opportunityId?: string | null
  jurisdiction: string
  baseMarkup: number
  notes?: string | null
  lines: BudgetLine[]
}

interface TaxCode {
  categoryCode: string
  jurisdiction: string
  taxRate: number
  defaultMarkup: number
  isTaxable: boolean
}

interface StaffingRate {
  roleName: string
  internalRate: number
}

interface ExpenseEntry {
  description: string
  amount: number
  budgetLineId: string | null
}

interface ActualCostEntry {
  description: string
  amount: number
  budgetLineId: string | null
}

interface Purchase {
  description: string
  amount: number
  budgetLineId: string | null
}

interface BudgetData {
  budget: Budget | null
  taxCodes: TaxCode[]
  staffingRates: StaffingRate[]
  expenseEntries: ExpenseEntry[]
  actualCostEntries: ActualCostEntry[]
  purchases: Purchase[]
  roleAllocationEntries: RoleAllocationEntry[]
}

interface Vendor {
  id: string
  name: string
}

interface BudgetTableProps {
  projectId?: string
  opportunityId?: string
  budgetData: BudgetData
  jurisdictions: string[]
  taxCategories: string[]
  staffingRoles: string[]
  vendors?: Vendor[]
  staffingPlanRevenue?: number
  staffingPlanCost?: number
  budgetThreshold?: number | null
}

interface CategoryGroup {
  categoryKey: string | null
  displayName: string
  lines: ComputedBudgetLine[]
  subtotals: {
    internalCost: number
    clientEstimate: number
    forecast: number
    actual: number
  }
}

export function BudgetTable({
  projectId,
  opportunityId,
  budgetData,
  jurisdictions,
  taxCategories,
  staffingRoles,
  vendors = [],
  staffingPlanRevenue = 0,
  staffingPlanCost = 0,
  budgetThreshold,
}: BudgetTableProps) {
  const isOpportunity = !!opportunityId
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [addLineDialogOpen, setAddLineDialogOpen] = useState(false)
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [notesDialogOpen, setNotesDialogOpen] = useState(false)
  const [notesValue, setNotesValue] = useState("")
  const [editLineDialogOpen, setEditLineDialogOpen] = useState(false)
  const [editingLine, setEditingLine] = useState<ComputedBudgetLine | null>(null)
  const [newLineSection, setNewLineSection] = useState<BudgetSection>("PASSTHROUGH")
  const [newLineCategory, setNewLineCategory] = useState<string>("")
  const [newLineVendor, setNewLineVendor] = useState<string>("")
  const [editLineVendor, setEditLineVendor] = useState<string>("")
  const [editProcessingFeeEnabled, setEditProcessingFeeEnabled] = useState<boolean>(false)
  const [editProcessingFeePercent, setEditProcessingFeePercent] = useState<number>(5)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [commentDialogOpen, setCommentDialogOpen] = useState(false)
  const [commentLineId, setCommentLineId] = useState<string>("")
  const [commentLineDescription, setCommentLineDescription] = useState<string | null>(null)
  const [commentLineCategory, setCommentLineCategory] = useState<string | null>(null)
  const [internalComments, setInternalComments] = useState<InternalCommentWithDetails[]>([])
  const [commentsRefreshTrigger, setCommentsRefreshTrigger] = useState(0)
  const [saveVersionDialogOpen, setSaveVersionDialogOpen] = useState(false)
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false)
  const [versions, setVersions] = useState<BudgetVersionSummary[]>([])
  const [versionTitle, setVersionTitle] = useState("")
  const [versionNotes, setVersionNotes] = useState("")
  const [deleteVersionId, setDeleteVersionId] = useState<string | null>(null)
  const { toast } = useToast()

  const budget = budgetData.budget

  const context: BudgetContext | null = useMemo(() => {
    if (!budget) return null
    const allActuals = [
      ...budgetData.actualCostEntries,
      ...(budgetData.purchases || []),
    ]
    const purchaseMap = new Map<string, number>()
    for (const purchase of budgetData.purchases || []) {
      if (purchase.budgetLineId) {
        purchaseMap.set(purchase.budgetLineId, (purchaseMap.get(purchase.budgetLineId) || 0) + Number(purchase.amount))
      }
    }
    return {
      jurisdiction: budget.jurisdiction,
      baseMarkup: budget.baseMarkup,
      taxCodes: buildTaxCodeMap(budgetData.taxCodes),
      staffingRates: buildStaffingRateMap(budgetData.staffingRates),
      expensesByDescription: buildExpenseMap(budgetData.expenseEntries),
      actualsByDescription: buildActualMap(allActuals),
      expensesByBudgetLineId: buildExpenseByBudgetLineIdMap(budgetData.expenseEntries),
      actualsByBudgetLineId: buildActualByBudgetLineIdMap(allActuals),
      purchasesByBudgetLineId: purchaseMap,
      roleAllocationsByBudgetLineId: buildRoleAllocationsByBudgetLineIdMap(budgetData.roleAllocationEntries || []),
    }
  }, [budget, budgetData])

  const computedLines: ComputedBudgetLine[] = useMemo(() => {
    if (!budget || !context) return []
    const lines = budget.lines.map((line) => ({
      ...line,
      section: line.section as BudgetSection,
      lineType: line.lineType as "NORMAL" | "STAFFING" | "SUBTOTAL",
    }))
    return computeAllBudgetLines(lines, context)
  }, [budget, context])

  const categoryGroups: CategoryGroup[] = useMemo(() => {
    const staffingLines = computedLines.filter(line => line.section === "STAFFING")
    const nonStaffingLines = computedLines.filter(line => line.section !== "STAFFING")

    const groupMap = new Map<string | null, ComputedBudgetLine[]>()
    
    for (const line of nonStaffingLines) {
      const cat = (line as any).category as string | null
      if (!groupMap.has(cat)) {
        groupMap.set(cat, [])
      }
      groupMap.get(cat)!.push(line)
    }

    const groups: CategoryGroup[] = []

    const categoryOrder = Object.keys(BUDGET_CATEGORIES) as BudgetCategoryKey[]
    for (const catKey of categoryOrder) {
      const lines = groupMap.get(catKey)
      if (lines && lines.length > 0) {
        groups.push({
          categoryKey: catKey,
          displayName: BUDGET_CATEGORIES[catKey],
          lines,
          subtotals: calculateGroupSubtotals(lines),
        })
        groupMap.delete(catKey)
      }
    }

    const uncategorizedLines = groupMap.get(null)
    if (uncategorizedLines && uncategorizedLines.length > 0) {
      groups.push({
        categoryKey: null,
        displayName: "Uncategorized",
        lines: uncategorizedLines,
        subtotals: calculateGroupSubtotals(uncategorizedLines),
      })
    }

    if (staffingLines.length > 0) {
      groups.push({
        categoryKey: "STAFFING",
        displayName: "Staffing",
        lines: staffingLines,
        subtotals: calculateGroupSubtotals(staffingLines),
      })
    }

    return groups
  }, [computedLines])

  useEffect(() => {
    const allCategories = new Set(categoryGroups.map(g => g.categoryKey ?? "UNCATEGORIZED"))
    setExpandedCategories(allCategories)
  }, [])

  useEffect(() => {
    if (projectId) {
      getInternalComments(projectId).then(setInternalComments)
    }
  }, [projectId, commentsRefreshTrigger])

  useEffect(() => {
    if (projectId && !isOpportunity) {
      getBudgetVersions(projectId).then(setVersions)
    }
  }, [projectId, isOpportunity])

  function handleOpenCommentDialog(lineId: string, description: string | null, category: string | null) {
    setCommentLineId(lineId)
    setCommentLineDescription(description)
    setCommentLineCategory(category)
    setCommentDialogOpen(true)
  }

  function handleCommentAdded() {
    setCommentsRefreshTrigger((prev) => prev + 1)
  }

  async function handleSaveVersion(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!projectId || !versionTitle.trim()) return
    setLoading(true)
    try {
      await createBudgetVersion(projectId, versionTitle.trim(), versionNotes.trim() || undefined)
      toast({
        title: "Version saved",
        description: `Budget version "${versionTitle}" has been saved.`,
      })
      setSaveVersionDialogOpen(false)
      setVersionTitle("")
      setVersionNotes("")
      const updatedVersions = await getBudgetVersions(projectId)
      setVersions(updatedVersions)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save version. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleToggleClientVisibility(versionId: string, currentValue: boolean) {
    setLoading(true)
    try {
      await toggleVersionClientVisibility(versionId, !currentValue)
      if (projectId) {
        const updatedVersions = await getBudgetVersions(projectId)
        setVersions(updatedVersions)
      }
      toast({
        title: currentValue ? "Hidden from client" : "Visible to client",
        description: `Version is now ${currentValue ? "hidden from" : "visible to"} the client.`,
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update visibility. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteVersion() {
    if (!deleteVersionId || !projectId) return
    setLoading(true)
    try {
      await deleteBudgetVersion(deleteVersionId)
      const updatedVersions = await getBudgetVersions(projectId)
      setVersions(updatedVersions)
      toast({
        title: "Version deleted",
        description: "Budget version has been deleted.",
      })
      setDeleteVersionId(null)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete version. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  function calculateGroupSubtotals(lines: ComputedBudgetLine[]) {
    return lines.reduce(
      (acc, line) => ({
        internalCost: acc.internalCost + line.internalCost,
        clientEstimate: acc.clientEstimate + line.clientEstimate,
        forecast: acc.forecast + line.forecast,
        actual: acc.actual + line.actual,
      }),
      { internalCost: 0, clientEstimate: 0, forecast: 0, actual: 0 }
    )
  }

  function toggleCategory(categoryKey: string | null) {
    const key = categoryKey ?? "UNCATEGORIZED"
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  function isCategoryExpanded(categoryKey: string | null): boolean {
    const key = categoryKey ?? "UNCATEGORIZED"
    return expandedCategories.has(key)
  }

  const summary = useMemo(() => {
    return calculateBudgetSummary(computedLines)
  }, [computedLines])

  async function handleCreateBudget() {
    setLoading(true)
    try {
      if (isOpportunity && opportunityId) {
        await createOpportunityBudget(opportunityId)
      } else if (projectId) {
        await createBudget(projectId)
      }
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function handleAddLine(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!budget) return
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    const isStaffing = newLineSection === "STAFFING"

    try {
      await addBudgetLine(budget.id, {
        section: newLineSection,
        lineType: isStaffing ? "STAFFING" : "NORMAL",
        category: newLineCategory as any || undefined,
        taxCategory: formData.get("taxCategory") as string || undefined,
        description: formData.get("description") as string || undefined,
        ovh: formData.get("ovh") === "on",
        vendor: newLineVendor || undefined,
        units: parseFloat(formData.get("units") as string) || 1,
        internalCostInput: isStaffing ? undefined : parseFloat(formData.get("internalCostInput") as string) || undefined,
        markupOverride: parseFloat(formData.get("markupOverride") as string) || undefined,
        internalNotes: formData.get("internalNotes") as string || undefined,
        clientNotes: formData.get("clientNotes") as string || undefined,
      })
      setAddLineDialogOpen(false)
      setNewLineCategory("")
      setNewLineVendor("")
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function handleUpdateLine(lineId: string, field: string, value: string | boolean | number | null) {
    setLoading(true)
    try {
      await updateBudgetLine(lineId, { [field]: value })
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteLine(lineId: string) {
    setLoading(true)
    try {
      await deleteBudgetLine(lineId)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  function handleOpenEditDialog(line: ComputedBudgetLine) {
    setEditingLine(line)
    setEditLineVendor(line.vendor || "")
    setEditProcessingFeeEnabled(line.processingFeeEnabled ?? false)
    setEditProcessingFeePercent(line.processingFeePercent ?? 5)
    setEditLineDialogOpen(true)
  }

  async function handleSaveEditLine(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editingLine) return
    setLoading(true)
    const formData = new FormData(e.currentTarget)

    try {
      const section = formData.get("section") as BudgetSection
      const isStaffing = section === "STAFFING"
      await updateBudgetLine(editingLine.id, {
        section,
        category: formData.get("category") as any || null,
        taxCategory: formData.get("taxCategory") as string || null,
        description: formData.get("description") as string || null,
        ovh: formData.get("ovh") === "on",
        vendor: editLineVendor || null,
        units: parseFloat(formData.get("units") as string) || 1,
        internalCostInput: isStaffing ? null : parseFloat(formData.get("internalCostInput") as string) || null,
        markupOverride: parseFloat(formData.get("markupOverride") as string) || null,
        internalNotes: formData.get("internalNotes") as string || null,
        clientNotes: formData.get("clientNotes") as string || null,
        processingFeeEnabled: editProcessingFeeEnabled,
        processingFeePercent: editProcessingFeePercent,
      })
      setEditLineDialogOpen(false)
      setEditingLine(null)
      setEditLineVendor("")
      setEditProcessingFeeEnabled(false)
      setEditProcessingFeePercent(5)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function handleUpdateSettings(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!budget) return
    setLoading(true)
    const formData = new FormData(e.currentTarget)

    try {
      await updateBudgetSettings(budget.id, {
        jurisdiction: formData.get("jurisdiction") as string,
        baseMarkup: parseFloat(formData.get("baseMarkup") as string) || 1.0,
      })
      setSettingsDialogOpen(false)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  if (!budget) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground mb-4">No budget created yet.</p>
          <Button onClick={handleCreateBudget} disabled={loading}>
            <Plus className="h-4 w-4 mr-2" />
            Create Budget
          </Button>
        </CardContent>
      </Card>
    )
  }

  const totalRevenue = summary.revenue + staffingPlanRevenue
  const totalCogsForecast = summary.cogsForecast + staffingPlanCost
  const totalCogsActual = summary.cogsActual + staffingPlanCost // Use staffing plan cost until time cards provide actuals
  const totalForecastMarginPercent = totalRevenue > 0 ? ((totalRevenue - totalCogsForecast) / totalRevenue) * 100 : 0
  const actualMarginPercent = totalRevenue > 0 ? ((totalRevenue - totalCogsActual) / totalRevenue) * 100 : 0

  const columnCount = isOpportunity ? 11 : 15
  
  const budgetTotal = summary.subtotalSum + staffingPlanRevenue
  const salesTaxTotal = summary.taxAmountSum
  const grandTotal = budgetTotal + salesTaxTotal
  
  const thresholdVariance = budgetThreshold != null ? grandTotal - budgetThreshold : null
  const isOverThreshold = thresholdVariance != null && thresholdVariance > 0
  const isUnderThreshold = thresholdVariance != null && thresholdVariance < 0

  return (
    <div className="space-y-6">
      {budgetThreshold != null && (
        <Card className={isOverThreshold ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950" : isUnderThreshold ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950" : ""}>
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Budget Threshold</p>
                <p className="text-2xl font-bold">{formatCurrency(budgetThreshold)}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Current Budget</p>
                <p className="text-2xl font-bold">{formatCurrency(grandTotal)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Variance</p>
                <p className={`text-2xl font-bold ${isOverThreshold ? "text-red-600 dark:text-red-400" : isUnderThreshold ? "text-green-600 dark:text-green-400" : ""}`}>
                  {thresholdVariance != null ? (
                    <>
                      {thresholdVariance > 0 ? "+" : ""}
                      {formatCurrency(thresholdVariance)}
                    </>
                  ) : (
                    "—"
                  )}
                </p>
                <p className={`text-xs ${isOverThreshold ? "text-red-600 dark:text-red-400" : isUnderThreshold ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                  {isOverThreshold ? "Over budget" : isUnderThreshold ? "Under budget" : "On target"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      <div className={`grid gap-4 ${isOpportunity ? "md:grid-cols-4" : "md:grid-cols-6"}`}>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Budget Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(budgetTotal)}</p>
            <div className="text-xs text-muted-foreground mt-2 space-y-1">
              <p>Sales Tax: {formatCurrency(salesTaxTotal)}</p>
              <p className="font-medium text-foreground">Grand Total: {formatCurrency(grandTotal)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(totalRevenue)}</p>
            {staffingPlanRevenue > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Budget: {formatCurrency(summary.revenue)} + Staffing: {formatCurrency(staffingPlanRevenue)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">COGS Forecast</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(totalCogsForecast)}</p>
            {staffingPlanCost > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Budget: {formatCurrency(summary.cogsForecast)} + Staffing: {formatCurrency(staffingPlanCost)}
              </p>
            )}
          </CardContent>
        </Card>
        {!isOpportunity && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">COGS Actual</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatCurrency(totalCogsActual)}</p>
              {staffingPlanCost > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Budget: {formatCurrency(summary.cogsActual)} + Staffing: {formatCurrency(staffingPlanCost)}
                </p>
              )}
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Forecast Margin</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${totalForecastMarginPercent < 0 ? "text-red-600" : ""}`}>
              {formatPercent(totalForecastMarginPercent)}
            </p>
          </CardContent>
        </Card>
        {!isOpportunity && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Actual Margin</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${actualMarginPercent < 0 ? "text-red-600" : ""}`}>
                {formatPercent(actualMarginPercent)}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle>Budget Lines</CardTitle>
          <div className="flex gap-2 flex-wrap">
            <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Budget Settings</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleUpdateSettings} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Jurisdiction</Label>
                    <Select name="jurisdiction" defaultValue={budget.jurisdiction}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select jurisdiction" />
                      </SelectTrigger>
                      <SelectContent>
                        {jurisdictions.map((j) => (
                          <SelectItem key={j} value={j}>
                            {j}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Base Markup</Label>
                    <Input
                      name="baseMarkup"
                      type="number"
                      step="0.01"
                      defaultValue={budget.baseMarkup}
                    />
                  </div>
                  <DialogFooter className="flex-col sm:flex-row gap-2">
                    <Button type="button" variant="outline" onClick={() => setSettingsDialogOpen(false)} className="w-full sm:w-auto">
                      Cancel
                    </Button>
                    <Button type="submit" disabled={loading} className="w-full sm:w-auto">
                      Save
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={notesDialogOpen} onOpenChange={(open) => {
              setNotesDialogOpen(open)
              if (open) setNotesValue(budget.notes || "")
            }}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <StickyNote className="h-4 w-4 mr-2" />
                  Budget Notes
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Budget Notes</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>Internal Notes</Label>
                    <Textarea
                      placeholder="Add internal notes about this budget..."
                      value={notesValue}
                      onChange={(e) => setNotesValue(e.target.value)}
                      rows={8}
                      className="resize-none"
                    />
                    <p className="text-xs text-muted-foreground">
                      These notes are for internal use only and will not be visible to clients.
                    </p>
                  </div>
                </div>
                <DialogFooter className="flex-col sm:flex-row gap-2">
                  <Button type="button" variant="outline" onClick={() => setNotesDialogOpen(false)} className="w-full sm:w-auto">
                    Cancel
                  </Button>
                  <Button
                    onClick={async () => {
                      setLoading(true)
                      try {
                        await updateBudgetNotes(budget.id, notesValue)
                        toast({ title: "Budget notes saved" })
                        setNotesDialogOpen(false)
                        router.refresh()
                      } catch (error) {
                        toast({ title: "Failed to save notes", variant: "destructive" })
                      } finally {
                        setLoading(false)
                      }
                    }}
                    disabled={loading}
                    className="w-full sm:w-auto"
                  >
                    Save Notes
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={addLineDialogOpen} onOpenChange={setAddLineDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Line
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Add Budget Line</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddLine} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={newLineCategory} onValueChange={setNewLineCategory} required>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(BUDGET_CATEGORIES) as BudgetCategoryKey[]).map((key) => (
                          <SelectItem key={key} value={key}>
                            {BUDGET_CATEGORIES[key]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={newLineSection} onValueChange={(v) => setNewLineSection(v as BudgetSection)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PASSTHROUGH">Passthrough</SelectItem>
                        <SelectItem value="SANDBOX">Sandbox</SelectItem>
                        <SelectItem value="STAFFING">Staffing</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Tax Category</Label>
                      <Select name="taxCategory">
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {taxCategories.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      {newLineSection === "STAFFING" ? (
                        <Select name="description">
                          <SelectTrigger>
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                          <SelectContent>
                            {staffingRoles.map((role) => (
                              <SelectItem key={role} value={role}>
                                {role}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input name="description" />
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label>Units</Label>
                      <Input name="units" type="number" step="0.01" defaultValue="1" />
                    </div>
                    {newLineSection !== "STAFFING" && (
                      <div className="space-y-2">
                        <Label>Internal Cost</Label>
                        <Input name="internalCostInput" type="number" step="0.01" />
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label>Markup Override</Label>
                      <Input name="markupOverride" type="number" step="0.01" />
                    </div>
                    <div className="space-y-2">
                      <Label>Vendor</Label>
                      <Select value={newLineVendor} onValueChange={setNewLineVendor}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select vendor..." />
                        </SelectTrigger>
                        <SelectContent>
                          {vendors.map((v) => (
                            <SelectItem key={v.id} value={v.name}>
                              {v.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex gap-6">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name="ovh" className="h-4 w-4 rounded border-gray-300" />
                      <span className="text-sm">OVH</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Internal Notes</Label>
                      <Input name="internalNotes" />
                    </div>
                    <div className="space-y-2">
                      <Label>Client Notes</Label>
                      <Input name="clientNotes" />
                    </div>
                  </div>

                  <DialogFooter className="flex-col sm:flex-row gap-2">
                    <Button type="button" variant="outline" onClick={() => setAddLineDialogOpen(false)} className="w-full sm:w-auto">
                      Cancel
                    </Button>
                    <Button type="submit" disabled={loading || !newLineCategory} className="w-full sm:w-auto">
                      Add Line
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            {!isOpportunity && (
              <>
                <Dialog open={saveVersionDialogOpen} onOpenChange={setSaveVersionDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Save className="h-4 w-4 mr-2" />
                      Save Version
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Save Budget Version</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSaveVersion} className="space-y-4">
                      <div className="space-y-2">
                        <Label>Version Title *</Label>
                        <Input
                          value={versionTitle}
                          onChange={(e) => setVersionTitle(e.target.value)}
                          placeholder="e.g., v1 - Initial estimate"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Notes (optional)</Label>
                        <Textarea
                          value={versionNotes}
                          onChange={(e) => setVersionNotes(e.target.value)}
                          placeholder="Any notes about this version..."
                          rows={3}
                        />
                      </div>
                      <DialogFooter className="flex-col sm:flex-row gap-2">
                        <Button type="button" variant="outline" onClick={() => setSaveVersionDialogOpen(false)} className="w-full sm:w-auto">
                          Cancel
                        </Button>
                        <Button type="submit" disabled={loading || !versionTitle.trim()} className="w-full sm:w-auto">
                          Save Version
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>

                <Dialog open={versionHistoryOpen} onOpenChange={setVersionHistoryOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <History className="h-4 w-4 mr-2" />
                      History
                      {versions.length > 0 && (
                        <span className="ml-1 text-xs bg-muted rounded-full px-1.5">{versions.length}</span>
                      )}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Budget Version History</DialogTitle>
                    </DialogHeader>
                    {versions.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">
                        No versions saved yet. Click "Save Version" to create a snapshot.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {versions.map((version) => (
                          <div key={version.id} className="border rounded-lg p-4 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">v{version.versionNumber}</span>
                                  <span className="text-muted-foreground">-</span>
                                  <span className="font-medium">{version.title}</span>
                                </div>
                                {version.notes && (
                                  <p className="text-sm text-muted-foreground mt-1">{version.notes}</p>
                                )}
                                <div className="text-xs text-muted-foreground mt-2">
                                  <span>Created {new Date(version.createdAt).toLocaleDateString()}</span>
                                  {version.createdBy && (
                                    <span> by {version.createdBy.name || version.createdBy.email}</span>
                                  )}
                                  <span className="mx-1">•</span>
                                  <span>{version.lineCount} lines</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleToggleClientVisibility(version.id, version.isClientVisible)}
                                  disabled={loading}
                                  title={version.isClientVisible ? "Hide from client" : "Show to client"}
                                >
                                  {version.isClientVisible ? (
                                    <Eye className="h-4 w-4 text-green-600" />
                                  ) : (
                                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setDeleteVersionId(version.id)}
                                  disabled={loading}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {computedLines.length === 0 ? (
            <p className="p-6 text-muted-foreground text-center">No budget lines yet. Add your first line to get started.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[100px]">Type</TableHead>
                    <TableHead className="min-w-[120px]">Tax Category</TableHead>
                    <TableHead className="min-w-[150px]">Description</TableHead>
                    <TableHead className="text-center min-w-[60px]">OVH</TableHead>
                    <TableHead className="min-w-[100px]">Vendor</TableHead>
                    <TableHead className="text-right min-w-[80px]">Units</TableHead>
                    <TableHead className="text-right min-w-[100px]">Internal Cost</TableHead>
                    <TableHead className="text-right min-w-[80px]">Tax Rate</TableHead>
                    <TableHead className="text-right min-w-[80px]">Markup</TableHead>
                    <TableHead className="text-right min-w-[120px]">Client Est.</TableHead>
                    {!isOpportunity && (
                      <>
                        <TableHead className="text-right min-w-[100px]">Forecast</TableHead>
                        <TableHead className="text-right min-w-[100px]">Variance</TableHead>
                        <TableHead className="text-right min-w-[100px]">Actual</TableHead>
                        <TableHead className="text-right min-w-[100px]">Remaining</TableHead>
                      </>
                    )}
                    <TableHead className="min-w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categoryGroups.map((group) => (
                    <CategoryGroupRows
                      key={group.categoryKey ?? "UNCATEGORIZED"}
                      group={group}
                      isExpanded={isCategoryExpanded(group.categoryKey)}
                      onToggle={() => toggleCategory(group.categoryKey)}
                      taxCategories={taxCategories}
                      staffingRoles={staffingRoles}
                      onUpdate={handleUpdateLine}
                      onDelete={handleDeleteLine}
                      onEdit={handleOpenEditDialog}
                      onComment={handleOpenCommentDialog}
                      loading={loading}
                      isOpportunity={isOpportunity}
                      columnCount={columnCount}
                      internalComments={internalComments}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editLineDialogOpen} onOpenChange={(open) => {
        setEditLineDialogOpen(open)
        if (!open) setEditingLine(null)
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Budget Line</DialogTitle>
          </DialogHeader>
          {editingLine && (
            <form onSubmit={handleSaveEditLine} className="space-y-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select name="category" defaultValue={(editingLine as any).category || ""}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(BUDGET_CATEGORIES) as BudgetCategoryKey[]).map((key) => (
                      <SelectItem key={key} value={key}>
                        {BUDGET_CATEGORIES[key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Type</Label>
                <Select name="section" defaultValue={editingLine.section}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PASSTHROUGH">Passthrough</SelectItem>
                    <SelectItem value="SANDBOX">Sandbox</SelectItem>
                    <SelectItem value="STAFFING">Staffing</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tax Category</Label>
                  <Select name="taxCategory" defaultValue={editingLine.taxCategory || ""}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {taxCategories.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input name="description" defaultValue={editingLine.description || ""} />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Units</Label>
                  <Input name="units" type="number" step="0.01" defaultValue={editingLine.units} />
                </div>
                <div className="space-y-2">
                  <Label>Internal Cost</Label>
                  <Input name="internalCostInput" type="number" step="0.01" defaultValue={editingLine.internalCostInput ?? ""} />
                </div>
                <div className="space-y-2">
                  <Label>Markup Override</Label>
                  <Input name="markupOverride" type="number" step="0.01" defaultValue={editingLine.markupOverride ?? ""} />
                </div>
                <div className="space-y-2">
                  <Label>Vendor</Label>
                  <Select value={editLineVendor} onValueChange={setEditLineVendor}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select vendor..." />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors.map((v) => (
                        <SelectItem key={v.id} value={v.name}>
                          {v.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-6">
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="ovh" defaultChecked={editingLine.ovh} className="h-4 w-4 rounded border-gray-300" />
                  <span className="text-sm">OVH</span>
                </label>
              </div>

              {editLineVendor === "Taylor Inc" && (
                <div className="p-4 border rounded-lg bg-muted/50 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base font-medium">Processing Fee Tracking</Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        Enable to track spend threshold for Taylor Inc (95% of client estimate)
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={editProcessingFeeEnabled}
                      onChange={(e) => setEditProcessingFeeEnabled(e.target.checked)}
                      className="h-5 w-5 rounded border-gray-300"
                    />
                  </div>
                  {editProcessingFeeEnabled && (
                    <div className="space-y-2">
                      <Label>Processing Fee Percentage</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          value={editProcessingFeePercent}
                          onChange={(e) => setEditProcessingFeePercent(parseFloat(e.target.value) || 5)}
                          className="w-24"
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                        <span className="text-sm text-muted-foreground ml-4">
                          (Spend threshold: {100 - editProcessingFeePercent}% of client estimate)
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Internal Notes</Label>
                  <Input name="internalNotes" defaultValue={editingLine.internalNotes || ""} />
                </div>
                <div className="space-y-2">
                  <Label>Client Notes</Label>
                  <Input name="clientNotes" defaultValue={editingLine.clientNotes || ""} />
                </div>
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button type="button" variant="outline" onClick={() => {
                  setEditLineDialogOpen(false)
                  setEditingLine(null)
                }} className="w-full sm:w-auto">
                  Cancel
                </Button>
                <Button type="submit" disabled={loading} className="w-full sm:w-auto">
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {projectId && (
        <CommentDialog
          projectId={projectId}
          open={commentDialogOpen}
          onOpenChange={setCommentDialogOpen}
          budgetLineId={commentLineId}
          lineDescription={commentLineDescription}
          category={commentLineCategory}
          onCommentAdded={handleCommentAdded}
        />
      )}

      {projectId && (
        <InternalCommentsSection
          projectId={projectId}
          refreshTrigger={commentsRefreshTrigger}
        />
      )}

      <Dialog open={!!deleteVersionId} onOpenChange={(open) => !open && setDeleteVersionId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Version</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Are you sure you want to delete this budget version? This action cannot be undone.
          </p>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setDeleteVersionId(null)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteVersion} disabled={loading} className="w-full sm:w-auto">
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface CategoryGroupRowsProps {
  group: CategoryGroup
  isExpanded: boolean
  onToggle: () => void
  taxCategories: string[]
  staffingRoles: string[]
  onUpdate: (lineId: string, field: string, value: string | boolean | number | null) => void
  onDelete: (lineId: string) => void
  onEdit: (line: ComputedBudgetLine) => void
  onComment: (lineId: string, description: string | null, category: string | null) => void
  loading: boolean
  isOpportunity: boolean
  columnCount: number
  internalComments: InternalCommentWithDetails[]
}

function CategoryGroupRows({
  group,
  isExpanded,
  onToggle,
  taxCategories,
  staffingRoles,
  onUpdate,
  onDelete,
  onEdit,
  onComment,
  loading,
  isOpportunity,
  columnCount,
  internalComments,
}: CategoryGroupRowsProps) {
  return (
    <>
      <TableRow
        className="bg-muted cursor-pointer hover:bg-muted/80"
        onClick={onToggle}
      >
        <TableCell colSpan={columnCount} className="font-semibold">
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            {group.displayName}
            <span className="text-muted-foreground font-normal text-sm">
              ({group.lines.length} {group.lines.length === 1 ? "line" : "lines"})
            </span>
          </div>
        </TableCell>
      </TableRow>

      {isExpanded && (
        <>
          {group.lines.map((line) => (
            <BudgetLineRow
              key={line.id}
              line={line}
              taxCategories={taxCategories}
              staffingRoles={staffingRoles}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onEdit={onEdit}
              onComment={onComment}
              loading={loading}
              isOpportunity={isOpportunity}
              internalComments={internalComments}
            />
          ))}

          <TableRow className="bg-muted/50">
            <TableCell className="font-medium italic">Subtotal</TableCell>
            <TableCell></TableCell>
            <TableCell></TableCell>
            <TableCell></TableCell>
            <TableCell></TableCell>
            <TableCell></TableCell>
            <TableCell className="text-right font-medium italic">
              {formatCurrency(group.subtotals.internalCost)}
            </TableCell>
            <TableCell></TableCell>
            <TableCell></TableCell>
            <TableCell className="text-right font-medium italic">
              {formatCurrency(group.subtotals.clientEstimate)}
            </TableCell>
            {!isOpportunity && (
              <>
                <TableCell className="text-right font-medium italic">
                  {formatCurrency(group.subtotals.forecast)}
                </TableCell>
                <TableCell></TableCell>
                <TableCell className="text-right font-medium italic">
                  {formatCurrency(group.subtotals.actual)}
                </TableCell>
                <TableCell></TableCell>
              </>
            )}
            <TableCell></TableCell>
          </TableRow>
        </>
      )}
    </>
  )
}

interface DebouncedInputProps {
  value: string | number | null
  onDebouncedChange: (value: string | number | null) => void
  type?: "text" | "number"
  step?: string
  placeholder?: string
  className?: string
  disabled?: boolean
  debounceMs?: number
}

function DebouncedInput({
  value,
  onDebouncedChange,
  type = "text",
  step,
  placeholder,
  className,
  disabled,
  debounceMs = 5000,
}: DebouncedInputProps) {
  const [localValue, setLocalValue] = useState<string>(
    value === null || value === undefined ? "" : String(value)
  )
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const lastSavedValue = useRef<string>(localValue)

  useEffect(() => {
    const newValue = value === null || value === undefined ? "" : String(value)
    if (newValue !== lastSavedValue.current) {
      setLocalValue(newValue)
      lastSavedValue.current = newValue
    }
  }, [value])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value
      setLocalValue(newValue)

      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }

      timerRef.current = setTimeout(() => {
        let parsedValue: string | number | null
        if (type === "number") {
          parsedValue = newValue === "" ? null : parseFloat(newValue)
          if (parsedValue !== null && isNaN(parsedValue)) parsedValue = null
        } else {
          parsedValue = newValue === "" ? null : newValue
        }
        lastSavedValue.current = newValue
        onDebouncedChange(parsedValue)
      }, debounceMs)
    },
    [onDebouncedChange, type, debounceMs]
  )

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  return (
    <Input
      className={className}
      type={type}
      step={step}
      value={localValue}
      onChange={handleChange}
      placeholder={placeholder}
      disabled={disabled}
    />
  )
}

interface BudgetLineRowProps {
  line: ComputedBudgetLine
  taxCategories: string[]
  staffingRoles: string[]
  onUpdate: (lineId: string, field: string, value: string | boolean | number | null) => void
  onDelete: (lineId: string) => void
  onEdit: (line: ComputedBudgetLine) => void
  onComment: (lineId: string, description: string | null, category: string | null) => void
  loading: boolean
  isOpportunity?: boolean
  internalComments: InternalCommentWithDetails[]
}

function BudgetLineRow({
  line,
  taxCategories,
  staffingRoles,
  onUpdate,
  onDelete,
  onEdit,
  onComment,
  loading,
  isOpportunity,
  internalComments,
}: BudgetLineRowProps) {
  const isStaffing = line.lineType === "STAFFING"
  const commentCount = getLineCommentCount(internalComments, line.id)
  const hasUnresolvedComments = commentCount.unresolved > 0

  return (
    <TableRow>
      <TableCell className="font-medium">{line.section}</TableCell>
      <TableCell>
        <Select
          value={line.taxCategory || ""}
          onValueChange={(v) => onUpdate(line.id, "taxCategory", v || null)}
          disabled={loading}
        >
          <SelectTrigger className="h-8 w-full">
            <SelectValue placeholder="-" />
          </SelectTrigger>
          <SelectContent>
            {taxCategories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          {isStaffing ? (
            <Select
              value={line.description || ""}
              onValueChange={(v) => onUpdate(line.id, "description", v || null)}
              disabled={loading}
            >
              <SelectTrigger className="h-8 w-full">
                <SelectValue placeholder="-" />
              </SelectTrigger>
              <SelectContent>
                {staffingRoles.map((role) => (
                  <SelectItem key={role} value={role}>
                    {role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <DebouncedInput
              className="h-8 flex-1"
              value={line.description}
              onDebouncedChange={(v) => onUpdate(line.id, "description", v)}
              disabled={loading}
            />
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 relative"
            onClick={() => onComment(line.id, line.description, (line as any).category)}
            disabled={loading}
            title="Add comment"
          >
            <MessageSquare className="h-4 w-4" />
            {hasUnresolvedComments && (
              <span className="absolute -top-1 -right-1 h-2 w-2 bg-orange-500 rounded-full" />
            )}
          </Button>
        </div>
      </TableCell>
      <TableCell className="text-center">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300"
          checked={line.ovh}
          onChange={(e) => onUpdate(line.id, "ovh", e.target.checked)}
          disabled={loading}
        />
      </TableCell>
      <TableCell>
        <span className="text-sm text-muted-foreground">
          {line.vendor || "-"}
        </span>
      </TableCell>
      <TableCell>
        <DebouncedInput
          className="h-8 text-right"
          type="number"
          step="0.01"
          value={line.units}
          onDebouncedChange={(v) => onUpdate(line.id, "units", v ?? 0)}
          disabled={loading}
        />
      </TableCell>
      <TableCell>
        <DebouncedInput
          className="h-8 text-right"
          type="number"
          step="0.01"
          value={line.internalCostInput}
          onDebouncedChange={(v) => onUpdate(line.id, "internalCostInput", v)}
          disabled={loading || isStaffing}
        />
      </TableCell>
      <TableCell className="text-right">{formatPercent(line.taxRate * 100)}</TableCell>
      <TableCell>
        <DebouncedInput
          className="h-8 text-right"
          type="number"
          step="0.01"
          value={line.markupOverride}
          onDebouncedChange={(v) => onUpdate(line.id, "markupOverride", v)}
          disabled={loading}
          placeholder={line.markup.toFixed(2)}
        />
      </TableCell>
      <TableCell className="text-right font-medium">{formatCurrency(line.clientEstimate)}</TableCell>
      {!isOpportunity && (
        <>
          <TableCell className="text-right">{formatCurrency(line.forecast)}</TableCell>
          <TableCell className={`text-right ${line.variance < 0 ? "text-red-600" : ""}`}>
            {formatCurrency(line.variance)}
          </TableCell>
          <TableCell className="text-right">{formatCurrency(line.actual)}</TableCell>
          <TableCell className={`text-right ${line.remaining < 0 ? "text-red-600" : ""}`}>
            {formatCurrency(line.remaining)}
          </TableCell>
        </>
      )}
      <TableCell>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onEdit(line)}
            disabled={loading}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(line.id)}
            disabled={loading}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}
