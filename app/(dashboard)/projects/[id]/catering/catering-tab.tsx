"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Plus, LayoutDashboard, Trash2, Pencil, Settings, UtensilsCrossed, BookOpen, Download, FileSpreadsheet } from "lucide-react"
import { CateringSettings } from "./catering-settings"
import { MenuAnalyzer } from "./menu-analyzer"
import { ImportFromMenu } from "./import-from-menu"
import { useToast } from "@/hooks/use-toast"
import {
  getCateringCategories,
  getCateringCategoryWithItems,
  createCateringCategory,
  renameCateringCategory,
  deleteCateringCategory,
  addCateringItem,
  updateCateringItem,
  deleteCateringItem,
  getCateringOverview,
  getCateringSettings,
} from "./actions"

type CategorySummary = {
  id: string
  projectId: string
  name: string
  sortOrder: number
}

type CateringItem = {
  id: string
  categoryId: string
  beoNumber: string
  date: string
  functionName: string
  startTime: string
  endTime: string
  room: string
  menuDescription: string
  pax: number
  retailPrice: number
  discountedPrice: number | null
  banquetCheck: number | null
  notes: string
  sortOrder: number
}

type CategoryDetail = CategorySummary & { items: CateringItem[] }

type OverviewData = {
  categories: {
    id: string
    name: string
    exclusiveTotal: number
    serviceChargeTotal: number
    taxTotal: number
    inclusiveTotal: number
    banquetCheckTotal: number
    itemCount: number
  }[]
  grandTotals: {
    exclusiveTotal: number
    serviceChargeTotal: number
    taxTotal: number
    inclusiveTotal: number
    banquetCheckTotal: number
    itemCount: number
  }
  settings: {
    serviceChargePct: number
    taxPct: number
  }
}

function fmt(n: number): string {
  return "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

function InlineCell({
  value,
  onChange,
  className,
  type,
}: {
  value: string
  onChange: (v: string) => void
  className?: string
  type?: string
}) {
  const [local, setLocal] = useState(value)
  useEffect(() => {
    setLocal(value)
  }, [value])
  return (
    <Input
      type={type}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local !== value) onChange(local)
      }}
      className={`h-8 text-sm border-transparent hover:border-border focus:border-border ${className || ""}`}
    />
  )
}

export function CateringTab({ projectId }: { projectId: string }) {
  const [categories, setCategories] = useState<CategorySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [activeView, setActiveView] = useState<string>("overview")

  const [detail, setDetail] = useState<CategoryDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(false)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [menuAnalyzerOpen, setMenuAnalyzerOpen] = useState(false)
  const [importMenuOpen, setImportMenuOpen] = useState(false)
  const [settings, setSettings] = useState<{ serviceChargePct: number; taxPct: number }>({ serviceChargePct: 0, taxPct: 0 })

  const [renamingCategoryId, setRenamingCategoryId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [renaming, setRenaming] = useState(false)

  const [deleteCategoryDialogOpen, setDeleteCategoryDialogOpen] = useState(false)
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [deleteItemDialogOpen, setDeleteItemDialogOpen] = useState(false)
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null)
  const [exportingSheet, setExportingSheet] = useState(false)

  const { toast } = useToast()

  useEffect(() => {
    loadCategories()
    loadSettings()
  }, [projectId])

  useEffect(() => {
    if (activeView === "overview") {
      loadOverview()
    } else {
      loadDetail(activeView)
    }
  }, [activeView])

  async function loadCategories() {
    try {
      const data = await getCateringCategories(projectId)
      setCategories(data as CategorySummary[])
    } catch (error) {
      console.error("Failed to load catering categories:", error)
    } finally {
      setLoading(false)
    }
  }

  async function loadSettings() {
    try {
      const data = await getCateringSettings(projectId)
      if (data) {
        setSettings({
          serviceChargePct: data.serviceChargePct ?? 0,
          taxPct: data.taxPct ?? 0,
        })
      }
    } catch (error) {
      console.error("Failed to load catering settings:", error)
    }
  }

  async function loadOverview() {
    setOverviewLoading(true)
    try {
      const data = await getCateringOverview(projectId)
      setOverview(data)
    } catch (error) {
      console.error("Failed to load overview:", error)
    } finally {
      setOverviewLoading(false)
    }
  }

  async function loadDetail(categoryId: string) {
    setDetailLoading(true)
    try {
      const data = await getCateringCategoryWithItems(projectId, categoryId)
      setDetail(data as CategoryDetail)
    } catch (error) {
      console.error("Failed to load category:", error)
      toast({ title: "Failed to load category", variant: "destructive" })
    } finally {
      setDetailLoading(false)
    }
  }

  async function handleCreateCategory() {
    try {
      const cat = await createCateringCategory(projectId, "New Category")
      setCategories((prev) => [...prev, cat as CategorySummary])
      setActiveView(cat.id)
      toast({ title: "Category created" })
    } catch (error) {
      toast({ title: "Failed to create category", variant: "destructive" })
    }
  }

  async function handleRenameCategory(categoryId: string) {
    setRenaming(true)
    try {
      const updated = await renameCateringCategory(projectId, categoryId, renameValue)
      setCategories((prev) =>
        prev.map((c) => (c.id === categoryId ? { ...c, name: updated.name } : c))
      )
      if (detail?.id === categoryId)
        setDetail((d) => (d ? { ...d, name: updated.name } : d))
      setRenamingCategoryId(null)
      setRenameValue("")
      toast({ title: "Category renamed" })
    } catch (error) {
      toast({ title: "Failed to rename", variant: "destructive" })
    } finally {
      setRenaming(false)
    }
  }

  async function handleDeleteCategory() {
    if (!deletingCategoryId) return
    setDeleting(true)
    try {
      await deleteCateringCategory(projectId, deletingCategoryId)
      setCategories((prev) => prev.filter((c) => c.id !== deletingCategoryId))
      setActiveView("overview")
      setDeleteCategoryDialogOpen(false)
      setDeletingCategoryId(null)
      toast({ title: "Category deleted" })
    } catch (error) {
      toast({ title: "Failed to delete category", variant: "destructive" })
    } finally {
      setDeleting(false)
    }
  }

  async function handleAddItem() {
    if (!detail) return
    try {
      const item = await addCateringItem(projectId, detail.id)
      setDetail((d) =>
        d ? { ...d, items: [...d.items, item as CateringItem] } : d
      )
      toast({ title: "Item added" })
    } catch (error) {
      toast({ title: "Failed to add item", variant: "destructive" })
    }
  }

  async function handleUpdateItem(
    itemId: string,
    field: string,
    value: string | number | null
  ) {
    if (!detail) return
    try {
      const updated = await updateCateringItem(projectId, detail.id, itemId, {
        [field]: value,
      })
      setDetail((d) =>
        d
          ? {
              ...d,
              items: d.items.map((item) =>
                item.id === itemId ? ({ ...item, ...updated } as CateringItem) : item
              ),
            }
          : d
      )
    } catch (error) {
      toast({ title: "Failed to update item", variant: "destructive" })
    }
  }

  async function handleExportSheet() {
    setExportingSheet(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/export-catering-sheet`, { method: "POST" })
      const result = await res.json()
      if (result.success && result.sheetUrl) {
        window.open(result.sheetUrl, "_blank")
        toast({ title: "Exported to Google Sheet", description: "The catering data has been exported and the sheet is now open" })
      } else {
        toast({ title: "Export Failed", description: result.error || "Could not export to Google Sheet", variant: "destructive" })
      }
    } catch (e) {
      toast({ title: "Export Failed", description: "An error occurred while exporting", variant: "destructive" })
    } finally {
      setExportingSheet(false)
    }
  }

  async function handleDeleteItem() {
    if (!detail || !deletingItemId) return
    try {
      await deleteCateringItem(projectId, detail.id, deletingItemId)
      setDetail((d) =>
        d ? { ...d, items: d.items.filter((item) => item.id !== deletingItemId) } : d
      )
      setDeleteItemDialogOpen(false)
      setDeletingItemId(null)
      toast({ title: "Item removed" })
    } catch (error) {
      toast({ title: "Failed to remove item", variant: "destructive" })
    }
  }

  if (loading)
    return <div className="text-muted-foreground">Loading catering...</div>

  const detailItems = detail?.items || []
  const exclusiveTotal = detailItems.reduce(
    (sum, item) => sum + (item.discountedPrice ?? item.retailPrice ?? 0) * (item.pax ?? 0),
    0
  )
  const serviceCharge = exclusiveTotal * (settings.serviceChargePct / 100)
  const tax = (exclusiveTotal + serviceCharge) * (settings.taxPct / 100)
  const inclusiveTotal = exclusiveTotal + serviceCharge + tax

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <Button
            variant={activeView === "overview" ? "default" : "outline"}
            onClick={() => setActiveView("overview")}
            className="w-full sm:w-auto"
          >
            <LayoutDashboard className="h-4 w-4 mr-2" />
            Overview
          </Button>
          {categories.length > 0 && (
            <Select
              value={activeView !== "overview" ? activeView : ""}
              onValueChange={(val) => setActiveView(val)}
            >
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button variant="outline" onClick={() => setMenuAnalyzerOpen(true)} className="w-full sm:w-auto">
            <BookOpen className="h-4 w-4 mr-2" />
            Menu Library
          </Button>
          <Button variant="outline" onClick={handleExportSheet} disabled={exportingSheet} className="w-full sm:w-auto">
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            {exportingSheet ? "Exporting..." : "Export to Sheet"}
          </Button>
          <Button variant="outline" onClick={() => setSettingsOpen(true)} className="w-full sm:w-auto">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
          <Button onClick={handleCreateCategory} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Category
          </Button>
        </div>
      </div>

      {activeView === "overview" &&
        (overviewLoading ? (
          <div className="text-muted-foreground">Loading overview...</div>
        ) : overview ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{overview.categories.length}</div>
                  <p className="text-sm text-muted-foreground">Total Categories</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{overview.grandTotals.itemCount}</div>
                  <p className="text-sm text-muted-foreground">Total Items</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{fmt(overview.grandTotals.exclusiveTotal)}</div>
                  <p className="text-sm text-muted-foreground">Grand Exclusive Total</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{fmt(overview.grandTotals.inclusiveTotal)}</div>
                  <p className="text-sm text-muted-foreground">Grand Inclusive Total</p>
                </CardContent>
              </Card>
            </div>

            {overview.categories.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Categories Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-3 font-medium">Name</th>
                          <th className="text-right py-2 px-3 font-medium">Items</th>
                          <th className="text-right py-2 px-3 font-medium">Exclusive Total</th>
                          <th className="text-right py-2 px-3 font-medium">Service Charge</th>
                          <th className="text-right py-2 px-3 font-medium">Tax</th>
                          <th className="text-right py-2 px-3 font-medium">Inclusive Total</th>
                          <th className="text-right py-2 px-3 font-medium">Banquet Check</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.categories.map((cat) => (
                          <tr
                            key={cat.id}
                            className="border-b last:border-0 hover:bg-muted/50 cursor-pointer"
                            onClick={() => setActiveView(cat.id)}
                          >
                            <td className="py-2 px-3">{cat.name}</td>
                            <td className="py-2 px-3 text-right">{cat.itemCount}</td>
                            <td className="py-2 px-3 text-right">{fmt(cat.exclusiveTotal)}</td>
                            <td className="py-2 px-3 text-right">{fmt(cat.serviceChargeTotal)}</td>
                            <td className="py-2 px-3 text-right">{fmt(cat.taxTotal)}</td>
                            <td className="py-2 px-3 text-right">{fmt(cat.inclusiveTotal)}</td>
                            <td className="py-2 px-3 text-right">{fmt(cat.banquetCheckTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {overview.categories.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <UtensilsCrossed className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">No Catering Categories Yet</p>
                  <p className="text-muted-foreground mt-1">
                    Create a category to start tracking catering items.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        ) : null)}

      {activeView !== "overview" &&
        (detailLoading ? (
          <div className="text-muted-foreground">Loading category...</div>
        ) : detail ? (
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  {renamingCategoryId === detail.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameCategory(detail.id)
                          if (e.key === "Escape") setRenamingCategoryId(null)
                        }}
                        autoFocus
                        className="h-8 w-[200px]"
                      />
                      <Button
                        size="sm"
                        onClick={() => handleRenameCategory(detail.id)}
                        disabled={renaming}
                      >
                        {renaming ? "Saving..." : "Save"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRenamingCategoryId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{detail.name}</CardTitle>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => {
                          setRenamingCategoryId(detail.id)
                          setRenameValue(detail.name)
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground mt-1">
                    {detail.items.length} item{detail.items.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button size="sm" variant="outline" onClick={() => setImportMenuOpen(true)} className="w-full sm:w-auto">
                    <Download className="h-4 w-4 mr-2" />
                    Import from Menu
                  </Button>
                  <Button size="sm" onClick={handleAddItem} className="w-full sm:w-auto">
                    <Plus className="h-4 w-4 mr-2" />
                    Item
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="w-full sm:w-auto"
                    onClick={() => {
                      setDeletingCategoryId(detail.id)
                      setDeleteCategoryDialogOpen(true)
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Category
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {detail.items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No items yet. Click &quot;+ Item&quot; to add one.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="py-2 px-1 text-left font-medium min-w-[80px]">BEO #</th>
                        <th className="py-2 px-1 text-left font-medium min-w-[100px]">Date</th>
                        <th className="py-2 px-1 text-left font-medium min-w-[120px]">Function</th>
                        <th className="py-2 px-1 text-left font-medium min-w-[80px]">Start</th>
                        <th className="py-2 px-1 text-left font-medium min-w-[80px]">End</th>
                        <th className="py-2 px-1 text-left font-medium min-w-[100px]">Room</th>
                        <th className="py-2 px-1 text-left font-medium min-w-[160px]">Menu Description</th>
                        <th className="py-2 px-1 text-right font-medium min-w-[70px]">PAX</th>
                        <th className="py-2 px-1 text-right font-medium min-w-[100px]">Retail Price</th>
                        <th className="py-2 px-1 text-right font-medium min-w-[100px]">Disc. Price</th>
                        <th className="py-2 px-1 text-right font-medium min-w-[100px]">Banquet Check</th>
                        <th className="py-2 px-1 text-left font-medium min-w-[120px]">Notes</th>
                        <th className="py-2 px-1 text-center font-medium w-[40px]"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.items.map((item) => (
                        <tr key={item.id} className="border-b last:border-0">
                          <td className="py-1 px-1">
                            <InlineCell
                              value={item.beoNumber || ""}
                              onChange={(v) => handleUpdateItem(item.id, "beoNumber", v)}
                            />
                          </td>
                          <td className="py-1 px-1">
                            <InlineCell
                              value={item.date || ""}
                              onChange={(v) => handleUpdateItem(item.id, "date", v)}
                            />
                          </td>
                          <td className="py-1 px-1">
                            <InlineCell
                              value={item.functionName || ""}
                              onChange={(v) => handleUpdateItem(item.id, "functionName", v)}
                            />
                          </td>
                          <td className="py-1 px-1">
                            <InlineCell
                              value={item.startTime || ""}
                              onChange={(v) => handleUpdateItem(item.id, "startTime", v)}
                            />
                          </td>
                          <td className="py-1 px-1">
                            <InlineCell
                              value={item.endTime || ""}
                              onChange={(v) => handleUpdateItem(item.id, "endTime", v)}
                            />
                          </td>
                          <td className="py-1 px-1">
                            <InlineCell
                              value={item.room || ""}
                              onChange={(v) => handleUpdateItem(item.id, "room", v)}
                            />
                          </td>
                          <td className="py-1 px-1">
                            <InlineCell
                              value={item.menuDescription || ""}
                              onChange={(v) => handleUpdateItem(item.id, "menuDescription", v)}
                            />
                          </td>
                          <td className="py-1 px-1">
                            <InlineCell
                              type="number"
                              value={String(item.pax || 0)}
                              onChange={(v) => handleUpdateItem(item.id, "pax", parseInt(v) || 0)}
                              className="text-right"
                            />
                          </td>
                          <td className="py-1 px-1">
                            <InlineCell
                              type="number"
                              value={String(item.retailPrice || 0)}
                              onChange={(v) => handleUpdateItem(item.id, "retailPrice", parseFloat(v) || 0)}
                              className="text-right"
                            />
                          </td>
                          <td className="py-1 px-1">
                            <InlineCell
                              type="number"
                              value={item.discountedPrice != null ? String(item.discountedPrice) : ""}
                              onChange={(v) => handleUpdateItem(item.id, "discountedPrice", v ? parseFloat(v) : null)}
                              className="text-right"
                            />
                          </td>
                          <td className="py-1 px-1">
                            <InlineCell
                              type="number"
                              value={item.banquetCheck != null ? String(item.banquetCheck) : ""}
                              onChange={(v) => handleUpdateItem(item.id, "banquetCheck", v ? parseFloat(v) : null)}
                              className="text-right"
                            />
                          </td>
                          <td className="py-1 px-1">
                            <InlineCell
                              value={item.notes || ""}
                              onChange={(v) => handleUpdateItem(item.id, "notes", v)}
                            />
                          </td>
                          <td className="py-1 px-1 text-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => {
                                setDeletingItemId(item.id)
                                setDeleteItemDialogOpen(true)
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {detail.items.length > 0 && (
                <div className="mt-4 border-t pt-4 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Exclusive Total</span>
                    <span className="font-medium">{fmt(exclusiveTotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Service Charge ({settings.serviceChargePct}%)</span>
                    <span className="font-medium">{fmt(serviceCharge)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tax ({settings.taxPct}%)</span>
                    <span className="font-medium">{fmt(tax)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1">
                    <span className="font-semibold">Inclusive Total</span>
                    <span className="font-semibold">{fmt(inclusiveTotal)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : null)}

      <MenuAnalyzer
        projectId={projectId}
        open={menuAnalyzerOpen}
        onOpenChange={setMenuAnalyzerOpen}
      />

      {detail && (
        <ImportFromMenu
          projectId={projectId}
          categoryId={detail.id}
          open={importMenuOpen}
          onOpenChange={setImportMenuOpen}
          onImported={() => loadDetail(detail.id)}
        />
      )}

      <CateringSettings
        projectId={projectId}
        open={settingsOpen}
        onOpenChange={(open) => {
          setSettingsOpen(open)
          if (!open) {
            loadSettings()
            if (activeView === "overview") loadOverview()
          }
        }}
      />

      <AlertDialog open={deleteCategoryDialogOpen} onOpenChange={setDeleteCategoryDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this category and all its items. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCategory}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteItemDialogOpen} onOpenChange={setDeleteItemDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Item</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this catering item. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteItem}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
