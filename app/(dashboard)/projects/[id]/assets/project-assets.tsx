"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
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
  DialogFooter,
} from "@/components/ui/dialog"
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
import { Plus, Trash2, FileSpreadsheet } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface Asset {
  id: string
  name: string
  category: string
  condition: string
  status: string
  quantity: number
  location: string | null
  imageUrl: string | null
}

interface Reservation {
  id: string
  quantity: number
  startDate: string
  endDate: string
  notes: string | null
  asset: {
    id: string
    name: string
    category: string
    condition: string
    status: string
    quantity: number
    location: string | null
    imageUrl: string | null
  }
  project: {
    id: string
    name: string
    startDate: string | null
    endDate: string | null
  }
}

interface ProjectAssetsProps {
  projectId: string
  organizationId: string
}

export function ProjectAssets({ projectId, organizationId }: ProjectAssetsProps) {
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [availableAssets, setAvailableAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [reservationToDelete, setReservationToDelete] = useState<Reservation | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [selectedAssetId, setSelectedAssetId] = useState<string>("")
  const [quantity, setQuantity] = useState<number>(1)
  const [startDate, setStartDate] = useState<string>("")
  const [endDate, setEndDate] = useState<string>("")
  const [notes, setNotes] = useState<string>("")
  const [availableForDates, setAvailableForDates] = useState<number | null>(null)
  const [checkingAvailability, setCheckingAvailability] = useState(false)
  const [exporting, setExporting] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    loadReservations()
  }, [projectId])

  async function loadReservations() {
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/assets`)
      if (!res.ok) throw new Error("Failed to fetch reservations")
      const data = await res.json()
      setReservations(data)
    } catch (error) {
      console.error("Failed to load reservations:", error)
      toast({
        title: "Error",
        description: "Failed to load asset reservations",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  async function loadAvailableAssets() {
    try {
      const res = await fetch(`/api/assets?status=Available`)
      if (!res.ok) throw new Error("Failed to fetch assets")
      const data = await res.json()
      setAvailableAssets(data.filter((a: Asset) => a.quantity > 0))
    } catch (error) {
      console.error("Failed to load available assets:", error)
      toast({
        title: "Error",
        description: "Failed to load available assets",
        variant: "destructive",
      })
    }
  }

  async function checkAvailability(assetId: string, start: string, end: string) {
    if (!assetId || !start || !end) {
      setAvailableForDates(null)
      return
    }
    setCheckingAvailability(true)
    try {
      const res = await fetch(`/api/assets/${assetId}/availability?startDate=${start}&endDate=${end}`)
      if (!res.ok) throw new Error("Failed to check availability")
      const data = await res.json()
      setAvailableForDates(data.availableQuantity)
    } catch (error) {
      console.error("Failed to check availability:", error)
      setAvailableForDates(null)
    } finally {
      setCheckingAvailability(false)
    }
  }

  async function handleExportLoadList() {
    setExporting(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/export-assets-sheet`, {
        method: "POST",
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to export load list")
      }
      const data = await res.json()
      window.open(data.url, "_blank")
      toast({
        title: "Success",
        description: "Load list exported to Google Sheets",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to export load list",
        variant: "destructive",
      })
    } finally {
      setExporting(false)
    }
  }

  function openReserveDialog() {
    loadAvailableAssets()
    setSelectedAssetId("")
    setQuantity(1)
    setStartDate("")
    setEndDate("")
    setNotes("")
    setAvailableForDates(null)
    setDialogOpen(true)
  }

  function handleAssetChange(assetId: string) {
    setSelectedAssetId(assetId)
    checkAvailability(assetId, startDate, endDate)
  }

  function handleStartDateChange(date: string) {
    setStartDate(date)
    checkAvailability(selectedAssetId, date, endDate)
  }

  function handleEndDateChange(date: string) {
    setEndDate(date)
    checkAvailability(selectedAssetId, startDate, date)
  }

  function getSelectedAsset(): Asset | undefined {
    return availableAssets.find((a) => a.id === selectedAssetId)
  }

  async function handleReserve(e: React.FormEvent) {
    e.preventDefault()

    if (!selectedAssetId) {
      toast({
        title: "Error",
        description: "Please select an asset",
        variant: "destructive",
      })
      return
    }

    if (!startDate || !endDate) {
      toast({
        title: "Error",
        description: "Please select start and end dates",
        variant: "destructive",
      })
      return
    }

    if (availableForDates !== null && quantity > availableForDates) {
      toast({
        title: "Error",
        description: `Only ${availableForDates} available for these dates`,
        variant: "destructive",
      })
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/assets/${selectedAssetId}/reservations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          quantity,
          startDate,
          endDate,
          notes: notes || null,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to create reservation")
      }

      toast({
        title: "Success",
        description: "Asset reserved successfully",
      })
      setDialogOpen(false)
      await loadReservations()
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to reserve asset",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  function openDeleteDialog(reservation: Reservation) {
    setReservationToDelete(reservation)
    setDeleteDialogOpen(true)
  }

  async function handleDelete() {
    if (!reservationToDelete) return

    setSubmitting(true)
    try {
      const res = await fetch(
        `/api/assets/${reservationToDelete.asset.id}/reservations/${reservationToDelete.id}`,
        { method: "DELETE" }
      )

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to delete reservation")
      }

      toast({
        title: "Success",
        description: "Reservation removed successfully",
      })
      setDeleteDialogOpen(false)
      setReservationToDelete(null)
      await loadReservations()
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete reservation",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return ""
    return new Date(dateStr).toLocaleDateString()
  }

  function getConditionBadgeVariant(condition: string) {
    switch (condition) {
      case "New":
        return "default"
      case "Good":
        return "secondary"
      case "Fair":
        return "outline"
      case "Poor":
        return "destructive"
      default:
        return "outline"
    }
  }

  if (loading) {
    return <div className="p-4">Loading asset reservations...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">Asset Reservations</h2>
        <div className="flex flex-wrap gap-2">
          <Button 
            variant="outline" 
            onClick={handleExportLoadList} 
            disabled={exporting || reservations.length === 0}
            className="w-full sm:w-auto"
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            {exporting ? "Exporting..." : "Export Load List"}
          </Button>
          <Button onClick={openReserveDialog} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Reserve Asset
          </Button>
        </div>
      </div>

      {reservations.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No assets reserved for this project yet.
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[150px]">Asset</TableHead>
                <TableHead className="min-w-[100px]">Category</TableHead>
                <TableHead className="min-w-[100px]">Condition</TableHead>
                <TableHead className="min-w-[80px]">Qty</TableHead>
                <TableHead className="min-w-[100px]">Start Date</TableHead>
                <TableHead className="min-w-[100px]">End Date</TableHead>
                <TableHead className="min-w-[150px]">Notes</TableHead>
                <TableHead className="min-w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reservations.map((reservation) => (
                <TableRow key={reservation.id}>
                  <TableCell className="font-medium">
                    {reservation.asset.name}
                  </TableCell>
                  <TableCell>{reservation.asset.category}</TableCell>
                  <TableCell>
                    <Badge variant={getConditionBadgeVariant(reservation.asset.condition)}>
                      {reservation.asset.condition}
                    </Badge>
                  </TableCell>
                  <TableCell>{reservation.quantity}</TableCell>
                  <TableCell>{formatDate(reservation.startDate)}</TableCell>
                  <TableCell>{formatDate(reservation.endDate)}</TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {reservation.notes || "-"}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openDeleteDialog(reservation)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reserve Asset</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleReserve} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="asset">Asset *</Label>
              <Select value={selectedAssetId} onValueChange={handleAssetChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an asset" />
                </SelectTrigger>
                <SelectContent>
                  {availableAssets.map((asset) => (
                    <SelectItem key={asset.id} value={asset.id}>
                      {asset.name} ({asset.quantity} total)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date *</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">End Date *</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => handleEndDateChange(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity *</Label>
              <Input
                id="quantity"
                type="number"
                min={1}
                max={availableForDates ?? getSelectedAsset()?.quantity ?? 1}
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
              />
              {selectedAssetId && startDate && endDate && (
                <p className={`text-sm ${checkingAvailability ? "text-muted-foreground" : availableForDates !== null && availableForDates > 0 ? "text-green-600" : "text-red-600"}`}>
                  {checkingAvailability 
                    ? "Checking availability..." 
                    : availableForDates !== null 
                      ? `${availableForDates} available for selected dates`
                      : "Select dates to check availability"
                  }
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes about this reservation"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Reserving..." : "Reserve"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Reservation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove the reservation for "{reservationToDelete?.asset.name}"?
              This will make the asset available for other projects.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={submitting}>
              {submitting ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
