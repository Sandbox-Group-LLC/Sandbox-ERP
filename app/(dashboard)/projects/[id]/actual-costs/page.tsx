"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { Plus, Upload, Trash2, Pencil } from "lucide-react"
import {
  getActualCostEntries,
  getBudgetLines,
  createActualCostEntry,
  updateActualCostEntry,
  deleteActualCostEntry,
  importActualCostEntriesFromCSV,
  type BudgetLineOption,
  type CSVRow,
  type ImportResult,
} from "./actions"

export const dynamic = "force-dynamic"

interface ActualCostEntry {
  id: string
  date: Date
  description: string
  vendor: string | null
  amount: number
  notes: string | null
  budgetLineId: string | null
  budgetLine: {
    id: string
    description: string | null
    section: string
  } | null
}

export default function ActualCostsPage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string

  const [entries, setEntries] = useState<ActualCostEntry[]>([])
  const [budgetLines, setBudgetLines] = useState<BudgetLineOption[]>([])
  const [loading, setLoading] = useState(true)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<ActualCostEntry | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [csvData, setCsvData] = useState<CSVRow[]>([])
  const [csvFileName, setCsvFileName] = useState<string>("")
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadData()
  }, [projectId])

  async function loadData() {
    setLoading(true)
    try {
      const [entriesData, budgetLinesData] = await Promise.all([
        getActualCostEntries(projectId),
        getBudgetLines(projectId),
      ])
      setEntries(entriesData)
      setBudgetLines(budgetLinesData)
    } catch (error) {
      console.error("Failed to load actual cost data:", error)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddActualCost(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    const formData = new FormData(e.currentTarget)

    try {
      await createActualCostEntry(projectId, {
        date: new Date(formData.get("date") as string),
        description: formData.get("description") as string,
        vendor: formData.get("vendor") as string || null,
        amount: parseFloat(formData.get("amount") as string),
        notes: formData.get("notes") as string || null,
        budgetLineId: formData.get("budgetLineId") as string || null,
      })
      setAddDialogOpen(false)
      await loadData()
    } catch (error) {
      console.error("Failed to create actual cost:", error)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleEditActualCost(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editingEntry) return
    setSubmitting(true)
    const formData = new FormData(e.currentTarget)

    try {
      await updateActualCostEntry(editingEntry.id, {
        date: new Date(formData.get("date") as string),
        description: formData.get("description") as string,
        vendor: formData.get("vendor") as string || null,
        amount: parseFloat(formData.get("amount") as string),
        notes: formData.get("notes") as string || null,
        budgetLineId: formData.get("budgetLineId") as string || null,
      })
      setEditDialogOpen(false)
      setEditingEntry(null)
      await loadData()
    } catch (error) {
      console.error("Failed to update actual cost:", error)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeleteActualCost(id: string) {
    if (!confirm("Are you sure you want to delete this actual cost entry?")) return

    try {
      await deleteActualCostEntry(id)
      await loadData()
    } catch (error) {
      console.error("Failed to delete actual cost:", error)
    }
  }

  function openEditDialog(entry: ActualCostEntry) {
    setEditingEntry(entry)
    setEditDialogOpen(true)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setCsvFileName(file.name)
    setImportResult(null)

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      const parsed = parseCSV(text)
      setCsvData(parsed)
    }
    reader.readAsText(file)
  }

  function parseCSV(text: string): CSVRow[] {
    const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "")
    if (lines.length < 2) return []

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase())
    const dateIdx = headers.indexOf("date")
    const descIdx = headers.indexOf("description")
    const vendorIdx = headers.indexOf("vendor")
    const amountIdx = headers.indexOf("amount")
    const notesIdx = headers.indexOf("notes")

    if (dateIdx === -1 || descIdx === -1 || amountIdx === -1) {
      return []
    }

    const rows: CSVRow[] = []
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i])
      rows.push({
        date: values[dateIdx] || "",
        description: values[descIdx] || "",
        vendor: vendorIdx >= 0 ? values[vendorIdx] || "" : "",
        amount: values[amountIdx] || "",
        notes: notesIdx >= 0 ? values[notesIdx] || "" : "",
      })
    }

    return rows
  }

  function parseCSVLine(line: string): string[] {
    const values: string[] = []
    let current = ""
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === "," && !inQuotes) {
        values.push(current.trim())
        current = ""
      } else {
        current += char
      }
    }
    values.push(current.trim())

    return values
  }

  async function handleImport() {
    if (csvData.length === 0) return
    setSubmitting(true)

    try {
      const result = await importActualCostEntriesFromCSV(projectId, csvData)
      setImportResult(result)
      if (result.successCount > 0) {
        await loadData()
      }
    } catch (error) {
      console.error("Failed to import CSV:", error)
    } finally {
      setSubmitting(false)
    }
  }

  function resetImportDialog() {
    setCsvData([])
    setCsvFileName("")
    setImportResult(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  function formatDate(date: Date | string) {
    const d = new Date(date)
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount)
  }

  function formatDateForInput(date: Date | string) {
    const d = new Date(date)
    return d.toISOString().split("T")[0]
  }

  const totalActualCosts = entries.reduce((sum, e) => sum + e.amount, 0)

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Actual Costs</h2>
            <p className="text-muted-foreground">Loading actual costs...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Actual Costs</h2>
          <p className="text-muted-foreground">
            Track and manage project actual costs
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                Add Actual Cost
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-hidden flex flex-col">
              <DialogHeader>
                <DialogTitle>Add Actual Cost</DialogTitle>
              </DialogHeader>
              <ScrollArea className="flex-1 pr-4">
                <form id="add-actual-cost-form" onSubmit={handleAddActualCost} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="date">Date *</Label>
                    <Input
                      id="date"
                      name="date"
                      type="date"
                      required
                      className="text-base"
                      defaultValue={new Date().toISOString().split("T")[0]}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description *</Label>
                    <Input
                      id="description"
                      name="description"
                      required
                      className="text-base"
                      placeholder="Enter cost description"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vendor">Vendor</Label>
                    <Input
                      id="vendor"
                      name="vendor"
                      className="text-base"
                      placeholder="Enter vendor name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount *</Label>
                    <Input
                      id="amount"
                      name="amount"
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      className="text-base"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      name="notes"
                      className="text-base"
                      placeholder="Additional notes"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="budgetLineId">Budget Line</Label>
                    <Select name="budgetLineId">
                      <SelectTrigger className="text-base">
                        <SelectValue placeholder="Select budget line (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {budgetLines.map((line) => (
                          <SelectItem key={line.id} value={line.id}>
                            {line.description || `${line.section} - Unnamed`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </form>
              </ScrollArea>
              <DialogFooter className="pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAddDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" form="add-actual-cost-form" disabled={submitting}>
                  {submitting ? "Adding..." : "Add Actual Cost"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog
            open={importDialogOpen}
            onOpenChange={(open) => {
              setImportDialogOpen(open)
              if (!open) resetImportDialog()
            }}
          >
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto">
                <Upload className="h-4 w-4 mr-2" />
                Import CSV
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-hidden flex flex-col max-w-2xl">
              <DialogHeader>
                <DialogTitle>Import Actual Costs from CSV</DialogTitle>
              </DialogHeader>
              <ScrollArea className="flex-1 pr-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>CSV File</Label>
                    <p className="text-sm text-muted-foreground">
                      Expected columns: date, description, vendor, amount, notes
                    </p>
                    <Input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      onChange={handleFileChange}
                      className="text-base"
                    />
                    {csvFileName && (
                      <p className="text-sm text-muted-foreground">
                        Selected: {csvFileName}
                      </p>
                    )}
                  </div>

                  {csvData.length > 0 && !importResult && (
                    <div className="space-y-2">
                      <Label>Preview ({csvData.length} rows)</Label>
                      <div className="overflow-x-auto border rounded-md">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Description</TableHead>
                              <TableHead>Vendor</TableHead>
                              <TableHead>Amount</TableHead>
                              <TableHead>Notes</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {csvData.slice(0, 5).map((row, idx) => (
                              <TableRow key={idx}>
                                <TableCell>{row.date}</TableCell>
                                <TableCell>{row.description}</TableCell>
                                <TableCell>{row.vendor}</TableCell>
                                <TableCell>{row.amount}</TableCell>
                                <TableCell className="max-w-32 truncate">
                                  {row.notes}
                                </TableCell>
                              </TableRow>
                            ))}
                            {csvData.length > 5 && (
                              <TableRow>
                                <TableCell colSpan={5} className="text-center text-muted-foreground">
                                  ... and {csvData.length - 5} more rows
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}

                  {importResult && (
                    <div className="space-y-2">
                      <div className="p-4 rounded-md bg-muted">
                        <p className="font-medium">Import Complete</p>
                        <p className="text-sm text-green-600">
                          ✓ {importResult.successCount} actual costs imported successfully
                        </p>
                        {importResult.errorCount > 0 && (
                          <p className="text-sm text-red-600">
                            ✗ {importResult.errorCount} rows failed
                          </p>
                        )}
                      </div>
                      {importResult.errors.length > 0 && (
                        <div className="space-y-1">
                          <Label>Errors:</Label>
                          <div className="max-h-32 overflow-y-auto text-sm text-red-600 bg-red-50 p-2 rounded-md">
                            {importResult.errors.map((err, idx) => (
                              <p key={idx}>{err}</p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </ScrollArea>
              <DialogFooter className="pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setImportDialogOpen(false)
                    resetImportDialog()
                  }}
                >
                  {importResult ? "Close" : "Cancel"}
                </Button>
                {!importResult && csvData.length > 0 && (
                  <Button onClick={handleImport} disabled={submitting}>
                    {submitting ? "Importing..." : `Import ${csvData.length} Rows`}
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">
            Total Actual Costs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{formatCurrency(totalActualCosts)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Actual Costs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {entries.length === 0 ? (
            <p className="p-6 text-gray-500 text-center">
              No actual costs recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Budget Line</TableHead>
                    <TableHead className="w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(entry.date)}
                      </TableCell>
                      <TableCell>{entry.description}</TableCell>
                      <TableCell>{entry.vendor || "-"}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {formatCurrency(entry.amount)}
                      </TableCell>
                      <TableCell className="max-w-48 truncate">
                        {entry.notes || "-"}
                      </TableCell>
                      <TableCell>
                        {entry.budgetLine
                          ? entry.budgetLine.description || entry.budgetLine.section
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(entry)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteActualCost(entry.id)}
                          >
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

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit Actual Cost</DialogTitle>
          </DialogHeader>
          {editingEntry && (
            <ScrollArea className="flex-1 pr-4">
              <form id="edit-actual-cost-form" onSubmit={handleEditActualCost} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-date">Date *</Label>
                  <Input
                    id="edit-date"
                    name="date"
                    type="date"
                    required
                    className="text-base"
                    defaultValue={formatDateForInput(editingEntry.date)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-description">Description *</Label>
                  <Input
                    id="edit-description"
                    name="description"
                    required
                    className="text-base"
                    defaultValue={editingEntry.description}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-vendor">Vendor</Label>
                  <Input
                    id="edit-vendor"
                    name="vendor"
                    className="text-base"
                    defaultValue={editingEntry.vendor || ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-amount">Amount *</Label>
                  <Input
                    id="edit-amount"
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    className="text-base"
                    defaultValue={editingEntry.amount}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-notes">Notes</Label>
                  <Textarea
                    id="edit-notes"
                    name="notes"
                    className="text-base"
                    defaultValue={editingEntry.notes || ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-budgetLineId">Budget Line</Label>
                  <Select name="budgetLineId" defaultValue={editingEntry.budgetLineId || undefined}>
                    <SelectTrigger className="text-base">
                      <SelectValue placeholder="Select budget line (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {budgetLines.map((line) => (
                        <SelectItem key={line.id} value={line.id}>
                          {line.description || `${line.section} - Unnamed`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </form>
            </ScrollArea>
          )}
          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditDialogOpen(false)
                setEditingEntry(null)
              }}
            >
              Cancel
            </Button>
            <Button type="submit" form="edit-actual-cost-form" disabled={submitting}>
              {submitting ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
