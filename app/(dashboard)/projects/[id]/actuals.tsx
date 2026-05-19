"use client"

import { useState } from "react"
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
} from "@/components/ui/dialog"
import { Plus, Trash2, Download } from "lucide-react"
import { createManualAdjustment, deleteManualAdjustment } from "./actions"

interface EstimateVersion {
  id: string
  versionNumber: number
  status: string
  lineItems: {
    category: string
    description: string
    qty: number
    unitCost: number
    revenue: number
  }[]
}

interface Purchase {
  amount: number
  status: string
  vendor: { name: string }
  description: string
}

interface ManualAdjustment {
  id: string
  description: string
  amount: number
  type: string
}

interface BudgetLine {
  id: string
  section: string
  lineType: string
  vendor: string | null
  internalCostInput: number | null
  units: number | null
}

interface ProjectActualsProps {
  project: {
    id: string
    name: string
    estimateVersions: EstimateVersion[]
    purchases: Purchase[]
    manualAdjustments: ManualAdjustment[]
  }
  staffingCostFromPlan?: number
  staffingRevenueFromPlan?: number
  budgetForecastCost?: number
  budgetForecastRevenue?: number
  budgetLines?: BudgetLine[]
  budgetLineClientEstimates?: Record<string, number>
}

export function ProjectActuals({ 
  project, 
  staffingCostFromPlan = 0, 
  staffingRevenueFromPlan = 0,
  budgetForecastCost = 0,
  budgetForecastRevenue = 0,
  budgetLines = [],
  budgetLineClientEstimates = {},
}: ProjectActualsProps) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const approvedEstimate = project.estimateVersions.find((v) => v.status === "Approved")

  // Use budget forecast cost (non-PASSTHROUGH lines) as the estimated cost
  // This matches the COGS Forecast calculation in the Budget tab
  const estimatedCost = budgetForecastCost

  // Use budget forecast revenue (non-PASSTHROUGH lines) as the estimated revenue
  const estimatedRevenue = budgetForecastRevenue

  const purchaseCost = project.purchases
    .filter((p) => p.status === "Approved" || p.status === "Paid")
    .reduce((sum, p) => sum + p.amount, 0)

  const staffingCost = staffingCostFromPlan
  const staffingRevenue = staffingRevenueFromPlan

  const manualCostAdjustments = project.manualAdjustments
    .filter((a) => a.type === "Cost")
    .reduce((sum, a) => sum + a.amount, 0)

  const manualRevenueAdjustments = project.manualAdjustments
    .filter((a) => a.type === "Revenue")
    .reduce((sum, a) => sum + a.amount, 0)

  const actualCost = purchaseCost + staffingCost + manualCostAdjustments
  // Actual Revenue = Estimated Revenue (from budget) + Staffing Revenue (from staffing plan)
  const actualRevenue = estimatedRevenue + staffingRevenue + manualRevenueAdjustments

  // Variance = Estimated Cost + Staffing Cost - Purchases
  // Positive = under budget (good), Negative = over budget (bad)
  const costVariance = estimatedCost + staffingCost - purchaseCost
  // Revenue variance only reflects manual adjustments (staffing is planned, not variance)
  const revenueVariance = manualRevenueAdjustments

  // Calculate budget allocation by vendor using Client Estimate (includes tax)
  // PASSTHROUGH lines with vendor -> group by vendor name
  // SANDBOX lines -> aggregate under "Sandbox" (includes staffing revenue)
  const vendorAllocation = new Map<string, number>()
  
  for (const line of budgetLines) {
    if (line.lineType !== "NORMAL") continue
    
    // Use clientEstimate from budget engine (includes markup and tax)
    const lineTotal = budgetLineClientEstimates[line.id] || 0
    
    if (line.section === "PASSTHROUGH" && line.vendor) {
      vendorAllocation.set(
        line.vendor,
        (vendorAllocation.get(line.vendor) || 0) + lineTotal
      )
    } else if (line.section === "SANDBOX") {
      vendorAllocation.set(
        "Sandbox",
        (vendorAllocation.get("Sandbox") || 0) + lineTotal
      )
    }
  }
  
  // Add staffing revenue to Sandbox allocation
  if (staffingRevenue > 0) {
    vendorAllocation.set(
      "Sandbox",
      (vendorAllocation.get("Sandbox") || 0) + staffingRevenue
    )
  }

  // Sort by amount descending
  const vendorAllocationArray = Array.from(vendorAllocation.entries())
    .sort((a, b) => b[1] - a[1])
  
  const totalAllocation = vendorAllocationArray.reduce((sum, [, amount]) => sum + amount, 0)

  async function handleCreateAdjustment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    try {
      await createManualAdjustment(project.id, formData)
      setDialogOpen(false)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteAdjustment(id: string) {
    await deleteManualAdjustment(id, project.id)
    router.refresh()
  }

  function downloadInvoiceCSV() {
    if (!approvedEstimate) return

    const byCategory = new Map<string, { items: typeof approvedEstimate.lineItems, total: number }>()

    approvedEstimate.lineItems.forEach((item) => {
      const cat = byCategory.get(item.category) || { items: [], total: 0 }
      cat.items.push(item)
      cat.total += item.revenue
      byCategory.set(item.category, cat)
    })

    let csv = "Category,Description,Qty,Unit Price,Total\n"

    byCategory.forEach((data, category) => {
      data.items.forEach((item) => {
        const unitPrice = item.qty > 0 ? item.revenue / item.qty : 0
        csv += `"${category}","${item.description}",${item.qty},${unitPrice.toFixed(2)},${item.revenue.toFixed(2)}\n`
      })
    })

    csv += `\n,,,,Total,${estimatedRevenue.toFixed(2)}\n`

    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${project.name.replace(/\s+/g, "_")}_invoice.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function downloadPayablesCSV() {
    const paidPurchases = project.purchases.filter(
      (p) => p.status === "Approved" || p.status === "Paid"
    )

    let csv = "Vendor,Description,Amount,Status\n"

    paidPurchases.forEach((p) => {
      csv += `"${p.vendor.name}","${p.description}",${p.amount.toFixed(2)},${p.status}\n`
    })

    csv += `\n,,Total,${purchaseCost.toFixed(2)}\n`

    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${project.name.replace(/\s+/g, "_")}_payables.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-4">
        <Button variant="outline" onClick={downloadInvoiceCSV} disabled={!approvedEstimate}>
          <Download className="h-4 w-4 mr-2" />
          Export Invoice CSV
        </Button>
        <Button variant="outline" onClick={downloadPayablesCSV}>
          <Download className="h-4 w-4 mr-2" />
          Export Payables CSV
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Cost Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Estimated Cost</TableCell>
                  <TableCell className="text-right">${estimatedCost.toLocaleString()}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Purchases (Approved/Paid)</TableCell>
                  <TableCell className="text-right">${purchaseCost.toLocaleString()}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Staffing Cost</TableCell>
                  <TableCell className="text-right">${staffingCost.toLocaleString()}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Manual Cost Adjustments</TableCell>
                  <TableCell className="text-right">${manualCostAdjustments.toLocaleString()}</TableCell>
                </TableRow>
                <TableRow className="border-t-2">
                  <TableCell className="font-bold">Actual Cost</TableCell>
                  <TableCell className="text-right font-bold">${actualCost.toLocaleString()}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Variance</TableCell>
                  <TableCell className={`text-right font-medium ${costVariance >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {costVariance > 0 ? "+" : ""}${costVariance.toLocaleString()}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revenue Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Estimated Revenue</TableCell>
                  <TableCell className="text-right">${estimatedRevenue.toLocaleString()}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Staffing Revenue</TableCell>
                  <TableCell className="text-right">${staffingRevenue.toLocaleString()}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Manual Revenue Adjustments</TableCell>
                  <TableCell className="text-right">${manualRevenueAdjustments.toLocaleString()}</TableCell>
                </TableRow>
                <TableRow className="border-t-2">
                  <TableCell className="font-bold">Actual Revenue</TableCell>
                  <TableCell className="text-right font-bold">${actualRevenue.toLocaleString()}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Variance</TableCell>
                  <TableCell className={`text-right font-medium ${revenueVariance < 0 ? "text-red-600" : "text-green-600"}`}>
                    {revenueVariance > 0 ? "+" : ""}${revenueVariance.toLocaleString()}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Budget Allocation</CardTitle>
          </CardHeader>
          <CardContent>
            {vendorAllocationArray.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No budget allocations.</p>
            ) : (
              <Table>
                <TableBody>
                  {vendorAllocationArray.map(([name, amount]) => (
                    <TableRow key={name}>
                      <TableCell className="font-medium">{name}</TableCell>
                      <TableCell className="text-right">${amount.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2">
                    <TableCell className="font-bold">Total</TableCell>
                    <TableCell className="text-right font-bold">${totalAllocation.toLocaleString()}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Manual Adjustments</CardTitle>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Adjustment
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Manual Adjustment</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateAdjustment} className="space-y-4">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select name="type" required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cost">Cost</SelectItem>
                      <SelectItem value="Revenue">Revenue</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input name="description" required />
                </div>
                <div className="space-y-2">
                  <Label>Amount</Label>
                  <Input name="amount" type="number" step="0.01" required />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading}>
                    Add
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-0">
          {project.manualAdjustments.length === 0 ? (
            <p className="p-6 text-gray-500 text-center">No manual adjustments.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {project.manualAdjustments.map((adj) => (
                  <TableRow key={adj.id}>
                    <TableCell>
                      <span className={`text-xs px-2 py-1 rounded-full ${adj.type === "Cost" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                        {adj.type}
                      </span>
                    </TableCell>
                    <TableCell>{adj.description}</TableCell>
                    <TableCell className="text-right">${adj.amount.toLocaleString()}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteAdjustment(adj.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
