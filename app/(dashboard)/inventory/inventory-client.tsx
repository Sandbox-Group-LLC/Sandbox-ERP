"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, Search, Pencil, Trash2, Loader2, Eye } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AssetDialog } from "./asset-dialog"
import { useToast } from "@/hooks/use-toast"
import { StorageImage } from "@/components/storage-image"

const CATEGORIES = ["Decor", "Furniture", "AV", "Merch", "Supplies", "Signage", "Fabricated", "Other"] as const
const STATUSES = ["Available", "Reserved", "InUse", "InTransit", "Retired"] as const
const CONDITIONS = ["Excellent", "Good", "Fair", "Poor", "Damaged"] as const

type Asset = {
  id: string
  assetCode: string | null
  name: string
  description: string | null
  category: string
  condition: string
  status: string
  quantity: number
  location: string | null
  barcode: string | null
  purchaseDate: string | null
  purchaseCost: number | null
  currentValue: number | null
  imageUrl: string | null
  purchaseUrl: string | null
  notes: string | null
}

const statusColors: Record<string, string> = {
  Available: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  Reserved: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  InUse: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  InTransit: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  Retired: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
}

const conditionColors: Record<string, string> = {
  Excellent: "text-green-600 dark:text-green-400",
  Good: "text-blue-600 dark:text-blue-400",
  Fair: "text-yellow-600 dark:text-yellow-400",
  Poor: "text-orange-600 dark:text-orange-400",
  Damaged: "text-red-600 dark:text-red-400",
}

export function InventoryClient() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null)
  const { toast } = useToast()

  const fetchAssets = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set("search", search)
      if (categoryFilter !== "all") params.set("category", categoryFilter)
      if (statusFilter !== "all") params.set("status", statusFilter)

      const response = await fetch(`/api/assets?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setAssets(data)
      }
    } catch (error) {
      console.error("Failed to fetch assets:", error)
    } finally {
      setLoading(false)
    }
  }, [search, categoryFilter, statusFilter])

  useEffect(() => {
    fetchAssets()
  }, [fetchAssets])

  function handleEdit(asset: Asset) {
    setEditingAsset(asset)
    setDialogOpen(true)
  }

  function handleAddNew() {
    setEditingAsset(null)
    setDialogOpen(true)
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const response = await fetch(`/api/assets/${id}`, { method: "DELETE" })
      if (response.ok) {
        toast({ title: "Asset deleted", description: "The asset has been removed." })
        fetchAssets()
      } else {
        const data = await response.json()
        toast({ title: "Error", description: data.error || "Failed to delete asset", variant: "destructive" })
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete asset", variant: "destructive" })
    } finally {
      setDeletingId(null)
    }
  }

  function handleDialogClose() {
    setDialogOpen(false)
    setEditingAsset(null)
  }

  function handleSaveSuccess() {
    handleDialogClose()
    fetchAssets()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Inventory</h1>
          <p className="text-gray-500 dark:text-gray-400">Manage your assets and equipment</p>
        </div>
        <Button className="w-full sm:w-auto" onClick={handleAddNew}>
          <Plus className="h-4 w-4 mr-2" />
          Add Asset
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search assets..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status === "InUse" ? "In Use" : status === "InTransit" ? "In Transit" : status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-gray-400" />
            </div>
          ) : assets.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              No assets found. Add your first asset to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Asset ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden sm:table-cell">Category</TableHead>
                    <TableHead className="hidden md:table-cell">Condition</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden lg:table-cell">Qty</TableHead>
                    <TableHead className="hidden lg:table-cell">Location</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assets.map((asset) => (
                    <TableRow key={asset.id}>
                      <TableCell>
                        <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{asset.assetCode || "—"}</code>
                      </TableCell>
                      <TableCell>
                        <div>
                          <span className="font-medium">{asset.name}</span>
                          <div className="sm:hidden text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {asset.category}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{asset.category}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className={conditionColors[asset.condition] || ""}>{asset.condition}</span>
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${statusColors[asset.status] || ""}`}>
                          {asset.status === "InUse" ? "In Use" : asset.status === "InTransit" ? "In Transit" : asset.status}
                        </span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {asset.quantity}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">{asset.location || "-"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {asset.imageUrl && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setPreviewAsset(asset)}
                              title="View image"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(asset)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(asset.id)}
                            disabled={deletingId === asset.id}
                          >
                            {deletingId === asset.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4 text-destructive" />
                            )}
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

      <AssetDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        asset={editingAsset}
        onSuccess={handleSaveSuccess}
      />

      {/* Image Preview Dialog */}
      <Dialog open={!!previewAsset} onOpenChange={(open) => !open && setPreviewAsset(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{previewAsset?.name}</DialogTitle>
          </DialogHeader>
          {previewAsset?.imageUrl && (
            <div className="flex justify-center">
              <StorageImage
                src={previewAsset.imageUrl}
                alt={previewAsset.name}
                className="max-h-[70vh] object-contain rounded-lg"
                fallbackClassName="w-32 h-32 bg-muted rounded flex items-center justify-center"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
