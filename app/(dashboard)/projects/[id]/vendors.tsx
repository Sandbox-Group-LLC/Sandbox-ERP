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
import { Plus, Trash2, Pencil, AlertTriangle, CheckCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  createPurchase,
  updatePurchase,
  deletePurchase,
} from "./actions"

interface BudgetLine {
  id: string
  description: string | null
  category: string | null
  vendor: string | null
  processingFeeEnabled: boolean
  processingFeePercent: number
  internalCost: number
}

interface Purchase {
  id: string
  description: string
  amount: number
  status: string
  budgetLineId: string | null
  vendor: { id: string; name: string }
  purchaserId: string | null
  purchaser: { id: string; name: string } | null
  transactionType: string | null
}

interface ProjectVendorsProps {
  project: {
    id: string
    purchases: Purchase[]
  }
  vendors: { id: string; name: string }[]
  budgetLines: BudgetLine[]
  budgetLineClientEstimates: Record<string, number>
  people: { id: string; name: string }[]
}

const purchaseStatusColors: Record<string, string> = {
  Requested: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  Approved: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  Paid: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
}

const transactionTypeLabels: Record<string, string> = {
  CreditCard: "Credit Card",
  ACH: "ACH",
  Cash: "Cash",
}

export function ProjectVendors({ project, vendors, budgetLines, budgetLineClientEstimates, people }: ProjectVendorsProps) {
  const router = useRouter()
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null)
  const [loading, setLoading] = useState(false)
  
  const [newVendorId, setNewVendorId] = useState("")
  const [newBudgetLineId, setNewBudgetLineId] = useState("")
  const [newPurchaserId, setNewPurchaserId] = useState("")
  const [newTransactionType, setNewTransactionType] = useState("")
  const [editVendorId, setEditVendorId] = useState("")
  const [editBudgetLineId, setEditBudgetLineId] = useState("")
  const [editStatus, setEditStatus] = useState("")
  const [editPurchaserId, setEditPurchaserId] = useState("")
  const [editTransactionType, setEditTransactionType] = useState("")

  // Calculate Taylor Inc threshold tracking
  const taylorIncLines = budgetLines.filter(
    line => line.vendor === "Taylor Inc" && line.processingFeeEnabled
  )
  
  const taylorIncThreshold = taylorIncLines.reduce((sum, line) => {
    const clientEstimate = budgetLineClientEstimates[line.id] || 0
    const threshold = clientEstimate * (1 - line.processingFeePercent / 100)
    return sum + threshold
  }, 0)

  const taylorIncClientTotal = taylorIncLines.reduce((sum, line) => {
    return sum + (budgetLineClientEstimates[line.id] || 0)
  }, 0)

  // Calculate actual spend for Taylor Inc lines
  const taylorIncActualSpend = project.purchases
    .filter(p => p.budgetLineId && taylorIncLines.some(l => l.id === p.budgetLineId))
    .reduce((sum, p) => sum + p.amount, 0)

  const taylorIncRemaining = taylorIncThreshold - taylorIncActualSpend
  const taylorIncSpendPercent = taylorIncThreshold > 0 ? (taylorIncActualSpend / taylorIncThreshold) * 100 : 0
  const hasTaylorIncLines = taylorIncLines.length > 0

  // Calculate effective spend percentage (weighted average if multiple lines with different fee percents)
  const effectiveSpendPct = taylorIncClientTotal > 0 
    ? ((taylorIncThreshold / taylorIncClientTotal) * 100).toFixed(0)
    : "95"

  // Calculate budget line spending summary for all lines with purchases (excluding Taylor Inc processing fee lines)
  const budgetLineSpendSummary = budgetLines
    .filter(line => !(line.vendor === "Taylor Inc" && line.processingFeeEnabled))
    .map(line => {
      const spent = project.purchases
        .filter(p => p.budgetLineId === line.id)
        .reduce((sum, p) => sum + p.amount, 0)
      const remaining = line.internalCost - spent
      const spentPercent = line.internalCost > 0 ? (spent / line.internalCost) * 100 : 0
      return {
        id: line.id,
        description: line.description || "(No description)",
        internalCost: line.internalCost,
        spent,
        remaining,
        spentPercent,
        hasPurchases: spent > 0
      }
    })
    .filter(line => line.hasPurchases || line.internalCost > 0)
    .sort((a, b) => b.spentPercent - a.spentPercent)

  function getBudgetLineDescription(budgetLineId: string | null) {
    if (!budgetLineId) return "-"
    const line = budgetLines.find(l => l.id === budgetLineId)
    return line?.description || "-"
  }

  // Get spend stats for a budget line
  function getBudgetLineSpendStats(budgetLineId: string | null): { internalCost: number; spent: number; remaining: number } | null {
    if (!budgetLineId) return null
    const line = budgetLines.find(l => l.id === budgetLineId)
    if (!line) return null
    
    const internalCost = line.internalCost || 0
    const spent = project.purchases
      .filter(p => p.budgetLineId === line.id)
      .reduce((sum, p) => sum + p.amount, 0)
    
    return { internalCost, spent, remaining: internalCost - spent }
  }

  async function handleCreatePurchase(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    formData.set("vendorId", newVendorId)
    if (newBudgetLineId && newBudgetLineId !== "none") {
      formData.set("budgetLineId", newBudgetLineId)
    }
    if (newPurchaserId && newPurchaserId !== "none") {
      formData.set("purchaserId", newPurchaserId)
    }
    if (newTransactionType && newTransactionType !== "none") {
      formData.set("transactionType", newTransactionType)
    }
    try {
      await createPurchase(project.id, formData)
      setPurchaseDialogOpen(false)
      setNewVendorId("")
      setNewBudgetLineId("")
      setNewPurchaserId("")
      setNewTransactionType("")
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  function openEditDialog(purchase: Purchase) {
    setEditingPurchase(purchase)
    setEditVendorId(purchase.vendor.id)
    setEditBudgetLineId(purchase.budgetLineId || "none")
    setEditStatus(purchase.status)
    setEditPurchaserId(purchase.purchaserId || "none")
    setEditTransactionType(purchase.transactionType || "none")
    setEditDialogOpen(true)
  }

  async function handleUpdatePurchase(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editingPurchase) return
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    formData.set("vendorId", editVendorId)
    formData.set("status", editStatus)
    if (editBudgetLineId && editBudgetLineId !== "none") {
      formData.set("budgetLineId", editBudgetLineId)
    }
    if (editPurchaserId && editPurchaserId !== "none") {
      formData.set("purchaserId", editPurchaserId)
    }
    if (editTransactionType && editTransactionType !== "none") {
      formData.set("transactionType", editTransactionType)
    }
    try {
      await updatePurchase(editingPurchase.id, project.id, formData)
      setEditDialogOpen(false)
      setEditingPurchase(null)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function handlePurchaseStatusChange(purchaseId: string, status: string) {
    const purchase = project.purchases.find((p) => p.id === purchaseId)
    if (!purchase) return
    const formData = new FormData()
    formData.set("vendorId", purchase.vendor.id)
    formData.set("description", purchase.description)
    formData.set("amount", purchase.amount.toString())
    formData.set("status", status)
    if (purchase.budgetLineId) {
      formData.set("budgetLineId", purchase.budgetLineId)
    }
    if (purchase.purchaserId) {
      formData.set("purchaserId", purchase.purchaserId)
    }
    if (purchase.transactionType) {
      formData.set("transactionType", purchase.transactionType)
    }
    await updatePurchase(purchaseId, project.id, formData)
    router.refresh()
  }

  async function handleDeletePurchase(purchaseId: string) {
    await deletePurchase(purchaseId, project.id)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-lg font-semibold">Purchases</h3>
        <Dialog open={purchaseDialogOpen} onOpenChange={(open) => {
          setPurchaseDialogOpen(open)
          if (!open) {
            setNewVendorId("")
            setNewBudgetLineId("")
            setNewPurchaserId("")
            setNewTransactionType("")
          }
        }}>
          <DialogTrigger asChild>
            <Button size="sm" className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Add Purchase
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Purchase</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreatePurchase} className="space-y-4">
              <div className="space-y-2">
                <Label>Budget Line</Label>
                <Select value={newBudgetLineId} onValueChange={setNewBudgetLineId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select budget line (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {budgetLines.map((line) => (
                      <SelectItem key={line.id} value={line.id}>
                        {line.description || "(No description)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Vendor</Label>
                <Select value={newVendorId} onValueChange={setNewVendorId} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                      </SelectItem>
                    ))}
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
              <div className="space-y-2">
                <Label>Purchaser</Label>
                <Select value={newPurchaserId} onValueChange={setNewPurchaserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select purchaser (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {people.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Transaction Type</Label>
                <Select value={newTransactionType} onValueChange={setNewTransactionType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="CreditCard">Credit Card</SelectItem>
                    <SelectItem value="ACH">ACH</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setPurchaseDialogOpen(false)} className="flex-1 sm:flex-none">
                  Cancel
                </Button>
                <Button type="submit" disabled={loading || vendors.length === 0 || !newVendorId} className="flex-1 sm:flex-none">
                  Add
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {budgetLineSpendSummary.map(line => {
        const linePurchases = project.purchases.filter(p => p.budgetLineId === line.id)
        return (
          <Card key={line.id}>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <CardTitle className="text-base">{line.description}</CardTitle>
                <span className={`text-sm font-semibold whitespace-nowrap ${
                  line.remaining < 0 ? "text-red-600" :
                  line.spentPercent >= 90 ? "text-yellow-600" : "text-green-600"
                }`}>
                  ${line.remaining.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} remaining
                </span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Internal Cost: ${line.internalCost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                <span>Spent: ${line.spent.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ({line.spentPercent.toFixed(0)}%)</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    line.spentPercent >= 100 ? "bg-red-500" :
                    line.spentPercent >= 90 ? "bg-yellow-500" : "bg-green-500"
                  }`}
                  style={{ width: `${Math.min(line.spentPercent, 100)}%` }}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {linePurchases.length === 0 ? (
                <p className="p-6 text-muted-foreground text-center text-sm">No purchases yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="hidden md:table-cell">Purchaser</TableHead>
                        <TableHead className="hidden md:table-cell">Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {linePurchases.map(purchase => (
                        <TableRow key={purchase.id}>
                          <TableCell className="font-medium">{purchase.vendor.name}</TableCell>
                          <TableCell>{purchase.description}</TableCell>
                          <TableCell className="text-right">${purchase.amount.toLocaleString()}</TableCell>
                          <TableCell className="hidden md:table-cell">{purchase.purchaser?.name || "-"}</TableCell>
                          <TableCell className="hidden md:table-cell">{purchase.transactionType ? transactionTypeLabels[purchase.transactionType] : "-"}</TableCell>
                          <TableCell>
                            <Select
                              value={purchase.status}
                              onValueChange={(value) => handlePurchaseStatusChange(purchase.id, value)}
                            >
                              <SelectTrigger className="w-28 h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Requested">Requested</SelectItem>
                                <SelectItem value="Approved">Approved</SelectItem>
                                <SelectItem value="Paid">Paid</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEditDialog(purchase)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDeletePurchase(purchase.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}

      {project.purchases.filter(p => p.budgetLineId === null).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Unallocated Purchases</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="hidden md:table-cell">Purchaser</TableHead>
                    <TableHead className="hidden md:table-cell">Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {project.purchases.filter(p => p.budgetLineId === null).map(purchase => (
                    <TableRow key={purchase.id}>
                      <TableCell className="font-medium">{purchase.vendor.name}</TableCell>
                      <TableCell>{purchase.description}</TableCell>
                      <TableCell className="text-right">${purchase.amount.toLocaleString()}</TableCell>
                      <TableCell className="hidden md:table-cell">{purchase.purchaser?.name || "-"}</TableCell>
                      <TableCell className="hidden md:table-cell">{purchase.transactionType ? transactionTypeLabels[purchase.transactionType] : "-"}</TableCell>
                      <TableCell>
                        <Select
                          value={purchase.status}
                          onValueChange={(value) => handlePurchaseStatusChange(purchase.id, value)}
                        >
                          <SelectTrigger className="w-28 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Requested">Requested</SelectItem>
                            <SelectItem value="Approved">Approved</SelectItem>
                            <SelectItem value="Paid">Paid</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(purchase)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeletePurchase(purchase.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {hasTaylorIncLines && (
        <Card className={taylorIncSpendPercent >= 100 ? "border-red-500" : taylorIncSpendPercent >= 90 ? "border-yellow-500" : ""}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                Taylor Inc Spend Threshold
                {taylorIncSpendPercent >= 100 ? (
                  <Badge variant="destructive" className="flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Over Budget
                  </Badge>
                ) : taylorIncSpendPercent >= 90 ? (
                  <Badge variant="outline" className="border-yellow-500 text-yellow-600 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Near Limit
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-green-500 text-green-600 flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    On Track
                  </Badge>
                )}
              </CardTitle>
            </div>
            <div className="text-sm text-muted-foreground">
              <span>{taylorIncLines.length} line{taylorIncLines.length !== 1 ? "s" : ""} with processing fee tracking:</span>
              <ul className="mt-1 ml-4 list-disc">
                {taylorIncLines.map(line => (
                  <li key={line.id} className="text-xs">
                    {line.description || "(No description)"} ({line.processingFeePercent}% fee)
                  </li>
                ))}
              </ul>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Client Total</p>
                <p className="text-lg font-semibold">${taylorIncClientTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Spend Threshold ({effectiveSpendPct}%)</p>
                <p className="text-lg font-semibold">${taylorIncThreshold.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Actual Spend</p>
                <p className={`text-lg font-semibold ${taylorIncSpendPercent >= 100 ? "text-red-600" : taylorIncSpendPercent >= 90 ? "text-yellow-600" : ""}`}>
                  ${taylorIncActualSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Remaining</p>
                <p className={`text-lg font-semibold ${taylorIncRemaining < 0 ? "text-red-600" : ""}`}>
                  ${taylorIncRemaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Spend Progress</span>
                <span className={taylorIncSpendPercent >= 100 ? "text-red-600 font-medium" : taylorIncSpendPercent >= 90 ? "text-yellow-600 font-medium" : ""}>
                  {taylorIncSpendPercent.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all ${
                    taylorIncSpendPercent >= 100 ? "bg-red-500" : 
                    taylorIncSpendPercent >= 90 ? "bg-yellow-500" : "bg-green-500"
                  }`}
                  style={{ width: `${Math.min(taylorIncSpendPercent, 100)}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={editDialogOpen} onOpenChange={(open) => {
        setEditDialogOpen(open)
        if (!open) {
          setEditingPurchase(null)
        }
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Purchase</DialogTitle>
          </DialogHeader>
          {editingPurchase && (
            <form onSubmit={handleUpdatePurchase} className="space-y-4">
              <div className="space-y-2">
                <Label>Budget Line</Label>
                <Select value={editBudgetLineId} onValueChange={setEditBudgetLineId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select budget line (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {budgetLines.map((line) => (
                      <SelectItem key={line.id} value={line.id}>
                        {line.description || "(No description)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Vendor</Label>
                <Select value={editVendorId} onValueChange={setEditVendorId} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input name="description" defaultValue={editingPurchase.description} required />
              </div>
              <div className="space-y-2">
                <Label>Amount</Label>
                <Input name="amount" type="number" step="0.01" defaultValue={editingPurchase.amount} required />
              </div>
              <div className="space-y-2">
                <Label>Purchaser</Label>
                <Select value={editPurchaserId} onValueChange={setEditPurchaserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select purchaser (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {people.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Transaction Type</Label>
                <Select value={editTransactionType} onValueChange={setEditTransactionType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="CreditCard">Credit Card</SelectItem>
                    <SelectItem value="ACH">ACH</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Requested">Requested</SelectItem>
                    <SelectItem value="Approved">Approved</SelectItem>
                    <SelectItem value="Paid">Paid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)} className="flex-1 sm:flex-none">
                  Cancel
                </Button>
                <Button type="submit" disabled={loading || !editVendorId} className="flex-1 sm:flex-none">
                  Save
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
