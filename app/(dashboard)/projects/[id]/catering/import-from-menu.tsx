"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  Download,
  UtensilsCrossed,
} from "lucide-react"
import { getMenuTemplates } from "./menu-analyzer-actions"
import { importMenuItemsToCategory } from "./actions"

type MenuTemplateItem = {
  id: string
  name: string
  description: string | null
  pricePerPerson: number | null
  additionalFee: number | null
  additionalFeeNote: string | null
  notes: string | null
}

type MenuTemplateCategory = {
  id: string
  name: string
  items: MenuTemplateItem[]
}

type MenuTemplate = {
  id: string
  name: string
  sourceFileName: string | null
  categories: MenuTemplateCategory[]
}

export function ImportFromMenu({
  projectId,
  categoryId,
  open,
  onOpenChange,
  onImported,
}: {
  projectId: string
  categoryId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: () => void
}) {
  const [templates, setTemplates] = useState<MenuTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedTemplates, setExpandedTemplates] = useState<Set<string>>(new Set())
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const { toast } = useToast()

  const allItems: Map<string, MenuTemplateItem> = new Map()
  templates.forEach((t) =>
    t.categories.forEach((c) =>
      c.items.forEach((item) => allItems.set(item.id, item))
    )
  )

  useEffect(() => {
    if (open) {
      loadTemplates()
      setSelectedItems(new Set())
    }
  }, [open, projectId])

  async function loadTemplates() {
    setLoading(true)
    try {
      const data = await getMenuTemplates(projectId)
      setTemplates(data as unknown as MenuTemplate[])
      if (data.length > 0) {
        setExpandedTemplates(new Set([data[0].id]))
      }
    } catch {
      toast({ title: "Failed to load menu templates", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  function toggleTemplate(id: string) {
    setExpandedTemplates((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleCategory(key: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleItem(itemId: string) {
    setSelectedItems((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  function toggleAllInCategory(cat: MenuTemplateCategory) {
    const allSelected = cat.items.every((item) => selectedItems.has(item.id))
    setSelectedItems((prev) => {
      const next = new Set(prev)
      cat.items.forEach((item) => {
        if (allSelected) next.delete(item.id)
        else next.add(item.id)
      })
      return next
    })
  }

  async function handleImport() {
    if (selectedItems.size === 0) return
    setImporting(true)
    try {
      const itemsToImport = Array.from(selectedItems)
        .map((id) => allItems.get(id))
        .filter(Boolean)
        .map((item) => {
          const parts = [item!.name]
          if (item!.description) parts.push(item!.description)
          const noteParts: string[] = []
          if (item!.additionalFeeNote) {
            noteParts.push(`+$${item!.additionalFee} ${item!.additionalFeeNote}`)
          }
          if (item!.notes) noteParts.push(item!.notes)
          return {
            menuDescription: parts.join(" - "),
            retailPrice: item!.pricePerPerson ?? 0,
            notes: noteParts.join("; "),
          }
        })

      await importMenuItemsToCategory(projectId, categoryId, itemsToImport)
      toast({ title: `${itemsToImport.length} item${itemsToImport.length !== 1 ? "s" : ""} imported!` })
      onImported()
      onOpenChange(false)
    } catch (error: any) {
      toast({ title: error.message || "Failed to import items", variant: "destructive" })
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import from Menu Library</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">
            <Loader2 className="h-6 w-6 mx-auto animate-spin mb-2" />
            Loading menus...
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12">
            <UtensilsCrossed className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No Saved Menus</p>
            <p className="text-muted-foreground mt-1">
              Upload and analyze a menu PDF in the Menu Library first.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select items from your saved menus to add to this category. The item name, description, and price will be imported.
            </p>

            <div className="space-y-2">
              {templates.map((template) => {
                const isExpanded = expandedTemplates.has(template.id)
                return (
                  <div key={template.id} className="border rounded-lg">
                    <button
                      className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/50"
                      onClick={() => toggleTemplate(template.id)}
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0" />
                        )}
                        <span className="font-medium text-sm">{template.name}</span>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="border-t px-3 pb-3">
                        {template.categories.map((cat) => {
                          const catKey = `${template.id}-${cat.id}`
                          const isCatExpanded = expandedCategories.has(catKey)
                          const allSelected = cat.items.length > 0 && cat.items.every((item) => selectedItems.has(item.id))
                          const someSelected = cat.items.some((item) => selectedItems.has(item.id))
                          return (
                            <div key={cat.id} className="mt-2">
                              <button
                                className="w-full flex items-center gap-2 py-1.5 text-left hover:bg-muted/30 rounded px-1"
                                onClick={() => toggleCategory(catKey)}
                              >
                                {isCatExpanded ? (
                                  <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                                )}
                                <Checkbox
                                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                                  onCheckedChange={() => toggleAllInCategory(cat)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="shrink-0"
                                />
                                <span className="text-sm font-medium">{cat.name}</span>
                                <Badge variant="secondary" className="text-xs ml-auto">
                                  {cat.items.length}
                                </Badge>
                              </button>
                              {isCatExpanded && (
                                <div className="ml-6 mt-1 space-y-1">
                                  {cat.items.map((item) => (
                                    <label
                                      key={item.id}
                                      className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-muted/30 cursor-pointer"
                                    >
                                      <Checkbox
                                        checked={selectedItems.has(item.id)}
                                        onCheckedChange={() => toggleItem(item.id)}
                                        className="mt-0.5 shrink-0"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-2">
                                          <p className="text-sm font-medium">{item.name}</p>
                                          {item.pricePerPerson != null && (
                                            <Badge variant="outline" className="shrink-0 text-xs">
                                              ${item.pricePerPerson}/pp
                                            </Badge>
                                          )}
                                        </div>
                                        {item.description && (
                                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                            {item.description}
                                          </p>
                                        )}
                                        {item.additionalFeeNote && item.additionalFee != null && (
                                          <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">
                                            +${item.additionalFee} {item.additionalFeeNote}
                                          </p>
                                        )}
                                      </div>
                                    </label>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-t pt-4">
              <p className="text-sm text-muted-foreground">
                {selectedItems.size} item{selectedItems.size !== 1 ? "s" : ""} selected
              </p>
              <Button
                onClick={handleImport}
                disabled={selectedItems.size === 0 || importing}
                className="w-full sm:w-auto"
              >
                {importing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Import {selectedItems.size > 0 ? `${selectedItems.size} Item${selectedItems.size !== 1 ? "s" : ""}` : "Selected"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
