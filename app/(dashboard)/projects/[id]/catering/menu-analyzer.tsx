"use client"

import { useState, useEffect, useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/use-toast"
import {
  Upload,
  FileText,
  Loader2,
  Save,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Users,
  Percent,
} from "lucide-react"
import {
  getMenuTemplates,
  saveMenuTemplate,
  deleteMenuTemplate,
  type ParsedMenuData,
} from "./menu-analyzer-actions"

type MenuTemplateWithRelations = {
  id: string
  name: string
  sourceFileName: string | null
  serviceChargePct: number
  taxPct: number
  minimumGuests: number | null
  notes: string | null
  createdAt: Date
  categories: {
    id: string
    name: string
    sortOrder: number
    items: {
      id: string
      name: string
      description: string | null
      pricePerPerson: number | null
      additionalFee: number | null
      additionalFeeNote: string | null
      notes: string | null
      sortOrder: number
    }[]
  }[]
}

export function MenuAnalyzer({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [parsedData, setParsedData] = useState<ParsedMenuData | null>(null)
  const [fileName, setFileName] = useState("")
  const [menuName, setMenuName] = useState("")
  const [saving, setSaving] = useState(false)
  const [templates, setTemplates] = useState<MenuTemplateWithRelations[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(true)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [expandedTemplates, setExpandedTemplates] = useState<Set<string>>(new Set())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  useEffect(() => {
    if (open) {
      loadTemplates()
    }
  }, [open, projectId])

  async function loadTemplates() {
    setLoadingTemplates(true)
    try {
      const data = await getMenuTemplates(projectId)
      setTemplates(data as unknown as MenuTemplateWithRelations[])
    } catch {
      toast({ title: "Failed to load menu templates", variant: "destructive" })
    } finally {
      setLoadingTemplates(false)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0]
    if (selected) {
      if (!selected.type.includes("pdf")) {
        toast({ title: "Please select a PDF file", variant: "destructive" })
        return
      }
      if (selected.size > 10 * 1024 * 1024) {
        toast({ title: "File must be less than 10MB", variant: "destructive" })
        return
      }
      setFile(selected)
      setParsedData(null)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const dropped = e.dataTransfer.files[0]
    if (dropped) {
      if (!dropped.type.includes("pdf")) {
        toast({ title: "Please drop a PDF file", variant: "destructive" })
        return
      }
      if (dropped.size > 10 * 1024 * 1024) {
        toast({ title: "File must be less than 10MB", variant: "destructive" })
        return
      }
      setFile(dropped)
      setParsedData(null)
    }
  }

  async function handleAnalyze() {
    if (!file) return
    setParsing(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("projectId", projectId)

      const res = await fetch("/api/catering/parse-menu", {
        method: "POST",
        body: formData,
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error || "Failed to parse menu")
      }

      setParsedData(result.data)
      setFileName(result.fileName)
      setMenuName(result.data.name || "Catering Menu")
      setExpandedCategories(new Set(result.data.categories.map((_: any, i: number) => String(i))))
      toast({ title: "Menu parsed successfully!" })
    } catch (error: any) {
      toast({ title: error.message || "Failed to analyze menu", variant: "destructive" })
    } finally {
      setParsing(false)
    }
  }

  async function handleSave() {
    if (!parsedData) return
    setSaving(true)
    try {
      const dataToSave = { ...parsedData, name: menuName || parsedData.name }
      await saveMenuTemplate(projectId, dataToSave, fileName)
      toast({ title: "Menu saved to library!" })
      setParsedData(null)
      setFile(null)
      setFileName("")
      setMenuName("")
      if (fileInputRef.current) fileInputRef.current.value = ""
      await loadTemplates()
    } catch (error: any) {
      toast({ title: error.message || "Failed to save menu", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(templateId: string) {
    try {
      await deleteMenuTemplate(projectId, templateId)
      setTemplates((prev) => prev.filter((t) => t.id !== templateId))
      toast({ title: "Menu template deleted" })
    } catch {
      toast({ title: "Failed to delete template", variant: "destructive" })
    }
  }

  function handleReanalyze() {
    setParsedData(null)
    setMenuName("")
    setFileName("")
  }

  function toggleCategory(key: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleTemplate(id: string) {
    setExpandedTemplates((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const totalItems = parsedData?.categories.reduce((sum, cat) => sum + cat.items.length, 0) || 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Menu Library</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {!parsedData && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Upload & Analyze Menu PDF</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {file ? (
                    <div className="flex flex-col items-center gap-2">
                      <FileText className="h-10 w-10 text-primary" />
                      <p className="font-medium">{file.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-10 w-10 text-muted-foreground" />
                      <p className="font-medium">Drop a PDF menu here or click to browse</p>
                      <p className="text-sm text-muted-foreground">PDF files up to 10MB</p>
                    </div>
                  )}
                </div>

                <Button
                  onClick={handleAnalyze}
                  disabled={!file || parsing}
                  className="w-full sm:w-auto"
                >
                  {parsing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Analyzing Menu...
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4 mr-2" />
                      Analyze Menu
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {parsedData && (
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-base">Parsed Menu Preview</CardTitle>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleReanalyze}
                      className="w-full sm:w-auto"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Re-analyze
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={saving}
                      className="w-full sm:w-auto"
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      Save to Library
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Menu Name</label>
                  <Input
                    value={menuName}
                    onChange={(e) => setMenuName(e.target.value)}
                    placeholder="Menu name"
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Percent className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-muted-foreground">Service Charge</p>
                      <p className="font-medium">{parsedData.serviceChargePct}%</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Percent className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-muted-foreground">Tax</p>
                      <p className="font-medium">{parsedData.taxPct}%</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-muted-foreground">Min Guests</p>
                      <p className="font-medium">{parsedData.minimumGuests ?? "N/A"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-muted-foreground">Total Items</p>
                      <p className="font-medium">{totalItems}</p>
                    </div>
                  </div>
                </div>

                {parsedData.notes && (
                  <div className="text-sm bg-muted/50 rounded-lg p-3">
                    <p className="font-medium mb-1">Notes</p>
                    <p className="text-muted-foreground">{parsedData.notes}</p>
                  </div>
                )}

                <div className="space-y-2">
                  {parsedData.categories.map((cat, catIdx) => {
                    const key = String(catIdx)
                    const isExpanded = expandedCategories.has(key)
                    return (
                      <div key={catIdx} className="border rounded-lg">
                        <button
                          className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/50"
                          onClick={() => toggleCategory(key)}
                        >
                          <div className="flex items-center gap-2">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                            <span className="font-medium">{cat.name}</span>
                            <Badge variant="secondary" className="text-xs">
                              {cat.items.length} item{cat.items.length !== 1 ? "s" : ""}
                            </Badge>
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="border-t px-3 pb-3">
                            {cat.items.map((item, itemIdx) => (
                              <div
                                key={itemIdx}
                                className="py-3 border-b last:border-0"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm">{item.name}</p>
                                    {item.description && (
                                      <p className="text-sm text-muted-foreground mt-0.5">
                                        {item.description}
                                      </p>
                                    )}
                                    {item.additionalFeeNote && (
                                      <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                                        + ${item.additionalFee} {item.additionalFeeNote}
                                      </p>
                                    )}
                                    {item.notes && (
                                      <p className="text-xs text-muted-foreground mt-1 italic">
                                        {item.notes}
                                      </p>
                                    )}
                                  </div>
                                  {item.pricePerPerson != null && (
                                    <Badge variant="outline" className="shrink-0">
                                      ${item.pricePerPerson}/pp
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Saved Menu Templates</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingTemplates ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Loader2 className="h-6 w-6 mx-auto animate-spin mb-2" />
                  Loading templates...
                </div>
              ) : templates.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No saved menu templates yet. Upload and analyze a menu PDF to get started.
                </p>
              ) : (
                <div className="space-y-2">
                  {templates.map((template) => {
                    const isExpanded = expandedTemplates.has(template.id)
                    const itemCount = template.categories.reduce(
                      (sum, cat) => sum + cat.items.length,
                      0
                    )
                    return (
                      <div key={template.id} className="border rounded-lg">
                        <div className="flex items-center justify-between p-3">
                          <button
                            className="flex items-center gap-2 text-left flex-1 min-w-0"
                            onClick={() => toggleTemplate(template.id)}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 shrink-0" />
                            ) : (
                              <ChevronRight className="h-4 w-4 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{template.name}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>
                                  {template.categories.length} categories, {itemCount} items
                                </span>
                                {template.sourceFileName && (
                                  <>
                                    <span>·</span>
                                    <span className="truncate">{template.sourceFileName}</span>
                                  </>
                                )}
                                <span>·</span>
                                <span>
                                  {new Date(template.createdAt).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                          </button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(template.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        {isExpanded && (
                          <div className="border-t px-3 pb-3">
                            <div className="flex flex-wrap gap-3 py-2 text-xs text-muted-foreground">
                              <span>Service: {template.serviceChargePct}%</span>
                              <span>Tax: {template.taxPct}%</span>
                              {template.minimumGuests && (
                                <span>Min Guests: {template.minimumGuests}</span>
                              )}
                            </div>
                            {template.notes && (
                              <p className="text-xs text-muted-foreground mb-2 italic">
                                {template.notes}
                              </p>
                            )}
                            {template.categories.map((cat) => (
                              <div key={cat.id} className="mt-2">
                                <p className="text-sm font-medium mb-1">{cat.name}</p>
                                {cat.items.map((item) => (
                                  <div
                                    key={item.id}
                                    className="flex items-start justify-between py-1.5 border-b last:border-0 text-sm"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium text-sm">{item.name}</p>
                                      {item.description && (
                                        <p className="text-xs text-muted-foreground">
                                          {item.description}
                                        </p>
                                      )}
                                    </div>
                                    {item.pricePerPerson != null && (
                                      <span className="text-xs font-medium shrink-0 ml-2">
                                        ${item.pricePerPerson}/pp
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  )
}
