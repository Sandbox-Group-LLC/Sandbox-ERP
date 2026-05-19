"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  DialogFooter,
} from "@/components/ui/dialog"
import { Plus, Trash2, Pencil } from "lucide-react"
import { createReceivable, updateReceivable, deleteReceivable, type ReceivableData } from "./actions"
import type { Decimal } from "@prisma/client/runtime/library"

interface Project {
  id: string
  name: string
}

interface Receivable {
  id: string
  projectId: string | null
  project: { id: string; name: string } | null
  poNumber: string | null
  poAmount: Decimal
  invoiced: Decimal
  uninvoiced: Decimal
  paid: Decimal
}

interface ClientReceivablesProps {
  clientId: string
  receivables: Receivable[]
  projects: Project[]
}

export function ClientReceivables({ clientId, receivables, projects }: ClientReceivablesProps) {
  const router = useRouter()
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Receivable | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function formatCurrency(value: Decimal | number): string {
    const num = typeof value === "number" ? value : Number(value)
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(num)
  }

  async function handleAddItem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    const formData = new FormData(e.currentTarget)

    try {
      const projectId = formData.get("projectId") as string
      await createReceivable(clientId, {
        projectId: projectId === "none" ? null : projectId || null,
        poNumber: formData.get("poNumber") as string || null,
        poAmount: parseFloat(formData.get("poAmount") as string) || 0,
        invoiced: parseFloat(formData.get("invoiced") as string) || 0,
        uninvoiced: parseFloat(formData.get("uninvoiced") as string) || 0,
        paid: parseFloat(formData.get("paid") as string) || 0,
      })
      setAddDialogOpen(false)
      router.refresh()
    } catch (error) {
      console.error("Failed to create receivable:", error)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleEditItem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editingItem) return
    setSubmitting(true)
    const formData = new FormData(e.currentTarget)

    try {
      const projectId = formData.get("projectId") as string
      await updateReceivable(editingItem.id, {
        projectId: projectId === "none" ? null : projectId || null,
        poNumber: formData.get("poNumber") as string || null,
        poAmount: parseFloat(formData.get("poAmount") as string) || 0,
        invoiced: parseFloat(formData.get("invoiced") as string) || 0,
        uninvoiced: parseFloat(formData.get("uninvoiced") as string) || 0,
        paid: parseFloat(formData.get("paid") as string) || 0,
      })
      setEditDialogOpen(false)
      setEditingItem(null)
      router.refresh()
    } catch (error) {
      console.error("Failed to update receivable:", error)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeleteItem(id: string) {
    if (!confirm("Are you sure you want to delete this receivable?")) return

    try {
      await deleteReceivable(id)
      router.refresh()
    } catch (error) {
      console.error("Failed to delete receivable:", error)
    }
  }

  function openEditDialog(item: Receivable) {
    setEditingItem(item)
    setEditDialogOpen(true)
  }

  function ReceivableForm({
    onSubmit,
    defaultValues,
    submitLabel,
  }: {
    onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
    defaultValues?: Receivable | null
    submitLabel: string
  }) {
    return (
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="projectId">Project</Label>
          <Select name="projectId" defaultValue={defaultValues?.projectId || "none"}>
            <SelectTrigger>
              <SelectValue placeholder="Select project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="poNumber">PO#</Label>
          <Input
            id="poNumber"
            name="poNumber"
            defaultValue={defaultValues?.poNumber || ""}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="poAmount">PO Amount ($)</Label>
            <Input
              id="poAmount"
              name="poAmount"
              type="number"
              step="0.01"
              min="0"
              defaultValue={defaultValues ? Number(defaultValues.poAmount) : ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="invoiced">Invoiced ($)</Label>
            <Input
              id="invoiced"
              name="invoiced"
              type="number"
              step="0.01"
              min="0"
              defaultValue={defaultValues ? Number(defaultValues.invoiced) : ""}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="uninvoiced">Uninvoiced ($)</Label>
            <Input
              id="uninvoiced"
              name="uninvoiced"
              type="number"
              step="0.01"
              min="0"
              defaultValue={defaultValues ? Number(defaultValues.uninvoiced) : ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="paid">Paid ($)</Label>
            <Input
              id="paid"
              name="paid"
              type="number"
              step="0.01"
              min="0"
              defaultValue={defaultValues ? Number(defaultValues.paid) : ""}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving..." : submitLabel}
          </Button>
        </DialogFooter>
      </form>
    )
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Receivables</CardTitle>
          <Button size="sm" onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add
          </Button>
        </CardHeader>
        <CardContent>
          {receivables.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">No receivables yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead>PO#</TableHead>
                    <TableHead className="text-right">PO Amount</TableHead>
                    <TableHead className="text-right">Invoiced</TableHead>
                    <TableHead className="text-right">Uninvoiced</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receivables.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.project?.name || "-"}</TableCell>
                      <TableCell>{item.poNumber || "-"}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.poAmount)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.invoiced)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.uninvoiced)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.paid)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(item)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteItem(item.id)}
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

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Receivable</DialogTitle>
          </DialogHeader>
          <ReceivableForm onSubmit={handleAddItem} submitLabel="Create" />
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Receivable</DialogTitle>
          </DialogHeader>
          <ReceivableForm
            onSubmit={handleEditItem}
            defaultValues={editingItem}
            submitLabel="Update"
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
