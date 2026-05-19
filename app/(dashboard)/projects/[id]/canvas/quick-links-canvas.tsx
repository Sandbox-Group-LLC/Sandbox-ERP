"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
  Link2,
  Type,
  Minus,
  CheckSquare,
  GripVertical,
  Trash2,
  ExternalLink,
  Plus,
  Pencil,
} from "lucide-react"
import { format } from "date-fns"
import {
  getCanvas,
  saveCanvas,
  getCanvasMeta,
  type CanvasBlock,
} from "./actions"

function generateId() {
  return Math.random().toString(36).substring(2, 10)
}

export function QuickLinksCanvas({ projectId, canvasType = "internal" }: { projectId: string; canvasType?: string }) {
  const [open, setOpen] = useState(false)
  const [blocks, setBlocks] = useState<CanvasBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [lastEdited, setLastEdited] = useState<{ by: string | null; at: string | null }>({ by: null, at: null })
  const [hasChanges, setHasChanges] = useState(false)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const loadCanvas = useCallback(async () => {
    setLoading(true)
    try {
      const [canvasBlocks, meta] = await Promise.all([
        getCanvas(projectId, canvasType),
        getCanvasMeta(projectId, canvasType),
      ])
      setBlocks(canvasBlocks)
      setLastEdited({ by: meta.lastEditedBy, at: meta.lastEditedAt })
    } catch (e) {
      console.error("Failed to load canvas:", e)
    } finally {
      setLoading(false)
    }
  }, [projectId, canvasType])

  useEffect(() => {
    if (open) loadCanvas()
  }, [open, loadCanvas])

  const triggerSave = useCallback((updatedBlocks: CanvasBlock[]) => {
    setHasChanges(true)
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(async () => {
      setSaving(true)
      try {
        await saveCanvas(projectId, updatedBlocks, canvasType)
        setHasChanges(false)
        const meta = await getCanvasMeta(projectId, canvasType)
        setLastEdited({ by: meta.lastEditedBy, at: meta.lastEditedAt })
      } catch (e) {
        console.error("Failed to save canvas:", e)
      } finally {
        setSaving(false)
      }
    }, 1000)
  }, [projectId, canvasType])

  const updateBlocks = useCallback((newBlocks: CanvasBlock[]) => {
    setBlocks(newBlocks)
    triggerSave(newBlocks)
  }, [triggerSave])

  const addBlock = (type: CanvasBlock["type"]) => {
    const newBlock: CanvasBlock = { id: generateId(), type }
    if (type === "link") {
      newBlock.title = ""
      newBlock.url = ""
      newBlock.description = ""
    } else if (type === "text") {
      newBlock.content = ""
    } else if (type === "checklist") {
      newBlock.items = [{ id: generateId(), text: "", checked: false }]
    }
    updateBlocks([...blocks, newBlock])
  }

  const updateBlock = (id: string, updates: Partial<CanvasBlock>) => {
    updateBlocks(blocks.map((b) => (b.id === id ? { ...b, ...updates } : b)))
  }

  const deleteBlock = (id: string) => {
    updateBlocks(blocks.filter((b) => b.id !== id))
  }

  const moveBlock = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= blocks.length) return
    const newBlocks = [...blocks]
    const temp = newBlocks[index]
    newBlocks[index] = newBlocks[newIndex]
    newBlocks[newIndex] = temp
    updateBlocks(newBlocks)
  }

  return (
    <>
      <Button variant="outline" size="sm" className="flex-1 sm:flex-none whitespace-nowrap" onClick={() => setOpen(true)}>
        <Link2 className="h-4 w-4 mr-2" />
        {canvasType === "client" ? "Client Quick Links" : "Quick Links"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              {canvasType === "client" ? "Client Quick Links" : "Quick Links"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-wrap gap-2 pb-3 border-b">
            <Button variant="outline" size="sm" onClick={() => addBlock("link")}>
              <ExternalLink className="h-4 w-4 mr-1" />
              Link
            </Button>
            <Button variant="outline" size="sm" onClick={() => addBlock("text")}>
              <Type className="h-4 w-4 mr-1" />
              Note
            </Button>
            <Button variant="outline" size="sm" onClick={() => addBlock("checklist")}>
              <CheckSquare className="h-4 w-4 mr-1" />
              Checklist
            </Button>
            <Button variant="outline" size="sm" onClick={() => addBlock("divider")}>
              <Minus className="h-4 w-4 mr-1" />
              Divider
            </Button>
          </div>

          {loading ? (
            <div className="py-8 text-center text-muted-foreground">Loading...</div>
          ) : blocks.length === 0 ? (
            <div className="py-12 text-center">
              <Link2 className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No quick links yet.</p>
              <p className="text-sm text-muted-foreground mt-1">Add links, notes, or checklists using the toolbar above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {blocks.map((block, index) => (
                <div key={block.id} className="group relative">
                  <div className="absolute -left-2 top-1 flex flex-col opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    {index > 0 && (
                      <button className="p-0.5 text-muted-foreground hover:text-foreground" onClick={() => moveBlock(index, "up")} title="Move up">
                        <GripVertical className="h-3 w-3 rotate-180" />
                      </button>
                    )}
                    {index < blocks.length - 1 && (
                      <button className="p-0.5 text-muted-foreground hover:text-foreground" onClick={() => moveBlock(index, "down")} title="Move down">
                        <GripVertical className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <div className="absolute -right-2 top-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <button className="p-1 text-muted-foreground hover:text-destructive rounded" onClick={() => deleteBlock(block.id)} title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {block.type === "link" && (
                    <LinkBlock block={block} onChange={(updates) => updateBlock(block.id, updates)} />
                  )}
                  {block.type === "text" && (
                    <TextBlock block={block} onChange={(updates) => updateBlock(block.id, updates)} />
                  )}
                  {block.type === "divider" && (
                    <hr className="my-2 border-border" />
                  )}
                  {block.type === "checklist" && (
                    <ChecklistBlock block={block} onChange={(updates) => updateBlock(block.id, updates)} />
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t text-xs text-muted-foreground">
            <span>
              {saving ? "Saving..." : hasChanges ? "Unsaved changes" : lastEdited.by ? `Last edited by ${lastEdited.by}${lastEdited.at ? ` \u00b7 ${format(new Date(lastEdited.at), "MMM d 'at' h:mm a")}` : ""}` : ""}
            </span>
            <span>{blocks.length} {blocks.length === 1 ? "item" : "items"}</span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function LinkBlock({ block, onChange }: { block: CanvasBlock; onChange: (u: Partial<CanvasBlock>) => void }) {
  const [editing, setEditing] = useState(!block.title && !block.url)

  if (editing) {
    return (
      <Card className="p-3 space-y-2">
        <Input
          value={block.title || ""}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Link title"
          className="font-medium"
          autoFocus
        />
        <Input
          value={block.url || ""}
          onChange={(e) => onChange({ url: e.target.value })}
          placeholder="https://..."
        />
        <Input
          value={block.description || ""}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Description (optional)"
        />
        <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
          Done
        </Button>
      </Card>
    )
  }

  return (
    <Card className="p-3 hover:bg-accent/50 transition-colors">
      <div className="flex items-start gap-3">
        <ExternalLink className="h-4 w-4 mt-0.5 text-blue-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {block.url ? (
              <a href={block.url} target="_blank" rel="noopener noreferrer" className="font-medium text-sm hover:underline text-blue-600 dark:text-blue-400 truncate">
                {block.title || block.url}
              </a>
            ) : (
              <span className="font-medium text-sm text-muted-foreground">Untitled link</span>
            )}
            <button onClick={() => setEditing(true)} className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground">
              <Pencil className="h-3 w-3" />
            </button>
          </div>
          {block.description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{block.description}</p>
          )}
        </div>
      </div>
    </Card>
  )
}

function TextBlock({ block, onChange }: { block: CanvasBlock; onChange: (u: Partial<CanvasBlock>) => void }) {
  const [editing, setEditing] = useState(!block.content)

  if (editing) {
    return (
      <div className="space-y-2">
        <textarea
          value={block.content || ""}
          onChange={(e) => onChange({ content: e.target.value })}
          placeholder="Write a note..."
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
          autoFocus
        />
        <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
          Done
        </Button>
      </div>
    )
  }

  return (
    <div
      className="px-3 py-2 rounded-md bg-muted/50 text-sm whitespace-pre-wrap cursor-pointer hover:bg-muted transition-colors min-h-[2rem] group/text"
      onClick={() => setEditing(true)}
    >
      {block.content || <span className="text-muted-foreground italic">Click to add a note...</span>}
      <Pencil className="h-3 w-3 text-muted-foreground inline-block ml-2 opacity-0 group-hover/text:opacity-100" />
    </div>
  )
}

function ChecklistBlock({ block, onChange }: { block: CanvasBlock; onChange: (u: Partial<CanvasBlock>) => void }) {
  const items = block.items || []

  const toggleItem = (itemId: string) => {
    onChange({ items: items.map((i) => (i.id === itemId ? { ...i, checked: !i.checked } : i)) })
  }

  const updateItemText = (itemId: string, text: string) => {
    onChange({ items: items.map((i) => (i.id === itemId ? { ...i, text } : i)) })
  }

  const addItem = () => {
    onChange({ items: [...items, { id: generateId(), text: "", checked: false }] })
  }

  const removeItem = (itemId: string) => {
    onChange({ items: items.filter((i) => i.id !== itemId) })
  }

  return (
    <Card className="p-3 space-y-1.5">
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-2 group/item">
          <input
            type="checkbox"
            checked={item.checked}
            onChange={() => toggleItem(item.id)}
            className="h-4 w-4 rounded border-input accent-primary shrink-0"
          />
          <input
            type="text"
            value={item.text}
            onChange={(e) => updateItemText(item.id, e.target.value)}
            placeholder="To-do item..."
            className={cn(
              "flex-1 bg-transparent text-sm border-none outline-none focus:ring-0 p-0",
              item.checked && "line-through text-muted-foreground"
            )}
          />
          <button
            onClick={() => removeItem(item.id)}
            className="opacity-0 group-hover/item:opacity-100 p-0.5 text-muted-foreground hover:text-destructive shrink-0"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
      <button
        onClick={addItem}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-1"
      >
        <Plus className="h-3 w-3" />
        Add item
      </button>
    </Card>
  )
}
