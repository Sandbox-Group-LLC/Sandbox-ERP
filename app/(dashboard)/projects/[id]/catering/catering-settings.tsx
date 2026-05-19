"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { getCateringSettings, upsertCateringSettings } from "./actions"

type Settings = {
  vendorName: string
  menuLink: string
  minimumSpend: number
  serviceChargePct: number
  taxPct: number
  dietaryNotes: string
}

export function CateringSettings({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [settings, setSettings] = useState<Settings>({
    vendorName: "",
    menuLink: "",
    minimumSpend: 0,
    serviceChargePct: 0,
    taxPct: 0,
    dietaryNotes: "",
  })
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    if (open) {
      loadSettings()
    }
  }, [open, projectId])

  async function loadSettings() {
    setLoading(true)
    try {
      const data = await getCateringSettings(projectId)
      if (data) {
        setSettings({
          vendorName: data.vendorName || "",
          menuLink: data.menuLink || "",
          minimumSpend: data.minimumSpend ?? 0,
          serviceChargePct: data.serviceChargePct ?? 0,
          taxPct: data.taxPct ?? 0,
          dietaryNotes: data.dietaryNotes || "",
        })
      }
    } catch {
      toast({ title: "Failed to load settings", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  async function save(field: keyof Settings, value: string | number) {
    try {
      await upsertCateringSettings(projectId, { [field]: value })
    } catch {
      toast({ title: "Failed to save settings", variant: "destructive" })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Catering Settings</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="text-muted-foreground py-8 text-center">Loading...</div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label>Vendor Name</Label>
              <Input
                value={settings.vendorName}
                onChange={(e) => setSettings((s) => ({ ...s, vendorName: e.target.value }))}
                onBlur={(e) => save("vendorName", e.target.value)}
                placeholder="Catering vendor name"
              />
            </div>
            <div>
              <Label>Menu Link</Label>
              <Input
                type="url"
                value={settings.menuLink}
                onChange={(e) => setSettings((s) => ({ ...s, menuLink: e.target.value }))}
                onBlur={(e) => save("menuLink", e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div>
              <Label>Minimum Spend</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={settings.minimumSpend}
                onChange={(e) => setSettings((s) => ({ ...s, minimumSpend: parseFloat(e.target.value) || 0 }))}
                onBlur={(e) => save("minimumSpend", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label>Service Charge %</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={settings.serviceChargePct}
                onChange={(e) => setSettings((s) => ({ ...s, serviceChargePct: parseFloat(e.target.value) || 0 }))}
                onBlur={(e) => save("serviceChargePct", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label>Tax %</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={settings.taxPct}
                onChange={(e) => setSettings((s) => ({ ...s, taxPct: parseFloat(e.target.value) || 0 }))}
                onBlur={(e) => save("taxPct", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label>Dietary Notes</Label>
              <Textarea
                value={settings.dietaryNotes}
                onChange={(e) => setSettings((s) => ({ ...s, dietaryNotes: e.target.value }))}
                onBlur={(e) => save("dietaryNotes", e.target.value)}
                rows={3}
                placeholder="Allergies, dietary restrictions, special requests..."
              />
            </div>

            <DialogFooter className="pt-2">
              <p className="text-xs text-muted-foreground mr-auto hidden sm:block">Changes save automatically</p>
              <Button onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
                Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
