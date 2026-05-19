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
import { Plus, Copy, Check, Trash2 } from "lucide-react"
import {
  createEstimateVersion,
  duplicateEstimateVersion,
  approveEstimateVersion,
  createEstimateLineItem,
  deleteEstimateLineItem,
} from "./actions"

interface EstimateVersion {
  id: string
  versionNumber: number
  status: string
  lineItems: {
    id: string
    category: string
    description: string
    qty: number
    unitCost: number
    pricingMode: string
    markupPercent: number | null
    revenue: number
    vendor: { name: string } | null
  }[]
}

interface ProjectEstimatesProps {
  project: {
    id: string
    estimateVersions: EstimateVersion[]
  }
  vendors: { id: string; name: string }[]
}

export function ProjectEstimates({ project, vendors }: ProjectEstimatesProps) {
  const router = useRouter()
  const [selectedVersionId, setSelectedVersionId] = useState<string>(
    project.estimateVersions[0]?.id || ""
  )
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const selectedVersion = project.estimateVersions.find(
    (v) => v.id === selectedVersionId
  )

  const totals = selectedVersion?.lineItems.reduce(
    (acc, item) => ({
      cost: acc.cost + item.qty * item.unitCost,
      revenue: acc.revenue + item.revenue,
    }),
    { cost: 0, revenue: 0 }
  ) || { cost: 0, revenue: 0 }

  const margin = totals.revenue - totals.cost
  const marginPercent = totals.revenue > 0 ? (margin / totals.revenue) * 100 : 0

  async function handleCreateVersion() {
    setLoading(true)
    try {
      const version = await createEstimateVersion(project.id)
      setSelectedVersionId(version.id)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function handleDuplicate() {
    if (!selectedVersionId) return
    setLoading(true)
    try {
      const version = await duplicateEstimateVersion(selectedVersionId, project.id)
      setSelectedVersionId(version.id)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function handleApprove() {
    if (!selectedVersionId) return
    setLoading(true)
    try {
      await approveEstimateVersion(selectedVersionId, project.id)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function handleAddItem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!selectedVersionId) return
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    formData.set("versionId", selectedVersionId)
    formData.set("projectId", project.id)
    try {
      await createEstimateLineItem(formData)
      setDialogOpen(false)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteItem(itemId: string) {
    await deleteEstimateLineItem(itemId, project.id)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Select value={selectedVersionId} onValueChange={setSelectedVersionId}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select version" />
          </SelectTrigger>
          <SelectContent>
            {project.estimateVersions.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                Version {v.versionNumber} ({v.status})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={handleCreateVersion} disabled={loading} variant="outline">
          <Plus className="h-4 w-4 mr-2" />
          New Version
        </Button>

        {selectedVersion && (
          <>
            <Button onClick={handleDuplicate} disabled={loading} variant="outline">
              <Copy className="h-4 w-4 mr-2" />
              Duplicate
            </Button>

            {selectedVersion.status === "Draft" && (
              <Button onClick={handleApprove} disabled={loading}>
                <Check className="h-4 w-4 mr-2" />
                Approve
              </Button>
            )}
          </>
        )}
      </div>

      {selectedVersion && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-500">Total Cost</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">${totals.cost.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-500">Total Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">${totals.revenue.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-500">Margin $</CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold ${margin < 0 ? "text-red-600" : ""}`}>
                  ${margin.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-500">Margin %</CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold ${marginPercent < 0 ? "text-red-600" : ""}`}>
                  {marginPercent.toFixed(1)}%
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Line Items</CardTitle>
              {selectedVersion.status === "Draft" && (
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Item
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Line Item</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleAddItem} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Category</Label>
                          <Input name="category" required />
                        </div>
                        <div className="space-y-2">
                          <Label>Description</Label>
                          <Input name="description" required />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label>Qty</Label>
                          <Input name="qty" type="number" step="0.01" defaultValue="1" />
                        </div>
                        <div className="space-y-2">
                          <Label>Unit Cost</Label>
                          <Input name="unitCost" type="number" step="0.01" defaultValue="0" />
                        </div>
                        <div className="space-y-2">
                          <Label>Pricing Mode</Label>
                          <Select name="pricingMode" defaultValue="PassThrough">
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="PassThrough">Pass Through</SelectItem>
                              <SelectItem value="Markup">Markup</SelectItem>
                              <SelectItem value="Fixed">Fixed</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Markup % (if applicable)</Label>
                          <Input name="markupPercent" type="number" step="0.1" />
                        </div>
                        <div className="space-y-2">
                          <Label>Fixed Revenue (if applicable)</Label>
                          <Input name="revenue" type="number" step="0.01" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Vendor (optional)</Label>
                        <Select name="vendorId">
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
              )}
            </CardHeader>
            <CardContent className="p-0">
              {selectedVersion.lineItems.length === 0 ? (
                <p className="p-6 text-gray-500 text-center">No line items yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit Cost</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead>Vendor</TableHead>
                      {selectedVersion.status === "Draft" && <TableHead></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedVersion.lineItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.category}</TableCell>
                        <TableCell>{item.description}</TableCell>
                        <TableCell className="text-right">{item.qty}</TableCell>
                        <TableCell className="text-right">${item.unitCost.toLocaleString()}</TableCell>
                        <TableCell>
                          {item.pricingMode}
                          {item.markupPercent && ` (${item.markupPercent}%)`}
                        </TableCell>
                        <TableCell className="text-right">${item.revenue.toLocaleString()}</TableCell>
                        <TableCell>{item.vendor?.name || "-"}</TableCell>
                        {selectedVersion.status === "Draft" && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteItem(item.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {!selectedVersion && project.estimateVersions.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-gray-500">
            No estimate versions yet. Create your first version to start estimating.
          </CardContent>
        </Card>
      )}
    </div>
  )
}
