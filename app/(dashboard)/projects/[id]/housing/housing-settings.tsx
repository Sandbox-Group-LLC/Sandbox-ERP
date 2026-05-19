"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, Trash2, CalendarDays, X, ChevronDown, ChevronRight, Hotel, DollarSign, Percent } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
  getHousingHotels,
  createHousingHotel,
  updateHousingHotel,
  deleteHousingHotel,
  createRoomType,
  updateRoomType,
  deleteRoomType,
  createTaxFee,
  updateTaxFee,
  deleteTaxFee,
} from "./actions"

type RoomType = {
  id: string
  hotelId: string
  name: string
  minNightStay: number
  description: string
  inventory: Record<string, { rate: number; rooms: number }>
  sortOrder: number
}

type TaxFee = {
  id: string
  hotelId: string
  name: string
  type: string
  value: number
  sortOrder: number
}

type HotelWithRoomTypes = {
  id: string
  projectId: string
  name: string
  notes: string
  dates: string[]
  contractedAttrition: number | null
  roomTypes: RoomType[]
  taxFees: TaxFee[]
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00")
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  return `${days[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`
}

export function HousingSettings({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [hotels, setHotels] = useState<HotelWithRoomTypes[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedHotelId, setSelectedHotelId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const [datesDialogOpen, setDatesDialogOpen] = useState(false)
  const [newDate, setNewDate] = useState("")

  const [deleteHotelDialogOpen, setDeleteHotelDialogOpen] = useState(false)
  const [deletingHotelId, setDeletingHotelId] = useState<string | null>(null)

  const [deleteRoomTypeDialogOpen, setDeleteRoomTypeDialogOpen] = useState(false)
  const [deletingRoomTypeId, setDeletingRoomTypeId] = useState<string | null>(null)

  const [expandedRoomTypes, setExpandedRoomTypes] = useState<Set<string>>(new Set())

  const { toast } = useToast()

  const selectedHotel = hotels.find((h) => h.id === selectedHotelId) || null

  useEffect(() => {
    if (open) {
      loadHotels()
    }
  }, [open, projectId])

  async function loadHotels() {
    setLoading(true)
    try {
      const data = await getHousingHotels(projectId)
      const mapped = data.map((h: any) => ({
        ...h,
        dates: (h.dates as string[]) || [],
        roomTypes: (h.roomTypes || []).map((rt: any) => ({
          ...rt,
          inventory: (rt.inventory as Record<string, { rate: number; rooms: number }>) || {},
        })),
        taxFees: (h.taxFees || []).map((tf: any) => ({ ...tf })),
      }))
      setHotels(mapped)
      if (mapped.length > 0 && !selectedHotelId) {
        setTimeout(() => setSelectedHotelId(mapped[0].id), 0)
      }
    } catch {
      toast({ title: "Failed to load hotels", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateHotel() {
    setCreating(true)
    try {
      const hotel = await createHousingHotel(projectId, "New Hotel")
      const mapped: HotelWithRoomTypes = {
        ...hotel,
        dates: (hotel.dates as string[]) || [],
        roomTypes: [],
        taxFees: [],
      }
      setHotels((prev) => [...prev, mapped])
      setSelectedHotelId(hotel.id)
      toast({ title: "Hotel created" })
    } catch {
      toast({ title: "Failed to create hotel", variant: "destructive" })
    } finally {
      setCreating(false)
    }
  }

  async function handleUpdateHotel(data: { name?: string; notes?: string; dates?: string[]; contractedAttrition?: number | null }) {
    if (!selectedHotel) return
    try {
      const updated = await updateHousingHotel(projectId, selectedHotel.id, data)
      setHotels((prev) =>
        prev.map((h) =>
          h.id === selectedHotel.id
            ? {
                ...h,
                ...updated,
                dates: (updated.dates as string[]) || [],
                roomTypes: (updated.roomTypes || []).map((rt: any) => ({
                  ...rt,
                  inventory: (rt.inventory as Record<string, { rate: number; rooms: number }>) || {},
                })),
                taxFees: (updated.taxFees || []).map((tf: any) => ({ ...tf })),
              }
            : h
        )
      )
    } catch {
      toast({ title: "Failed to update hotel", variant: "destructive" })
    }
  }

  async function handleDeleteHotel() {
    if (!deletingHotelId) return
    try {
      await deleteHousingHotel(projectId, deletingHotelId)
      setHotels((prev) => prev.filter((h) => h.id !== deletingHotelId))
      if (selectedHotelId === deletingHotelId) {
        const remaining = hotels.filter((h) => h.id !== deletingHotelId)
        setSelectedHotelId(remaining.length > 0 ? remaining[0].id : null)
      }
      setDeleteHotelDialogOpen(false)
      setDeletingHotelId(null)
      toast({ title: "Hotel deleted" })
    } catch {
      toast({ title: "Failed to delete hotel", variant: "destructive" })
    }
  }

  async function handleAddDate() {
    if (!selectedHotel || !newDate) return
    const currentDates = selectedHotel.dates || []
    if (currentDates.includes(newDate)) {
      toast({ title: "Date already exists", variant: "destructive" })
      return
    }
    const updatedDates = [...currentDates, newDate].sort()
    await handleUpdateHotel({ dates: updatedDates })
    setNewDate("")
    toast({ title: "Date added" })
  }

  async function handleRemoveDate(dateStr: string) {
    if (!selectedHotel) return
    const updatedDates = (selectedHotel.dates || []).filter((d) => d !== dateStr)
    await handleUpdateHotel({ dates: updatedDates })
    toast({ title: "Date removed" })
  }

  async function handleAddRoomType() {
    if (!selectedHotel) return
    try {
      const rt = await createRoomType(projectId, selectedHotel.id, "New Room Type")
      const newRt: RoomType = { ...rt, inventory: {} }
      setHotels((prev) =>
        prev.map((h) =>
          h.id === selectedHotel.id ? { ...h, roomTypes: [...h.roomTypes, newRt] } : h
        )
      )
      setExpandedRoomTypes((prev) => new Set([...prev, rt.id]))
      toast({ title: "Room type added" })
    } catch {
      toast({ title: "Failed to add room type", variant: "destructive" })
    }
  }

  async function handleUpdateRoomType(
    roomTypeId: string,
    data: { name?: string; minNightStay?: number; description?: string; inventory?: Record<string, { rate: number; rooms: number }> }
  ) {
    if (!selectedHotel) return
    try {
      const updated = await updateRoomType(projectId, selectedHotel.id, roomTypeId, data)
      setHotels((prev) =>
        prev.map((h) =>
          h.id === selectedHotel.id
            ? {
                ...h,
                roomTypes: h.roomTypes.map((rt) =>
                  rt.id === roomTypeId
                    ? { ...rt, ...updated, inventory: (updated.inventory as Record<string, { rate: number; rooms: number }>) || {} }
                    : rt
                ),
              }
            : h
        )
      )
    } catch {
      toast({ title: "Failed to update room type", variant: "destructive" })
    }
  }

  async function handleDeleteRoomType() {
    if (!selectedHotel || !deletingRoomTypeId) return
    try {
      await deleteRoomType(projectId, selectedHotel.id, deletingRoomTypeId)
      setHotels((prev) =>
        prev.map((h) =>
          h.id === selectedHotel.id
            ? { ...h, roomTypes: h.roomTypes.filter((rt) => rt.id !== deletingRoomTypeId) }
            : h
        )
      )
      setDeleteRoomTypeDialogOpen(false)
      setDeletingRoomTypeId(null)
      toast({ title: "Room type deleted" })
    } catch {
      toast({ title: "Failed to delete room type", variant: "destructive" })
    }
  }

  async function handleAddTaxFee() {
    if (!selectedHotel) return
    try {
      const tf = await createTaxFee(projectId, selectedHotel.id, "New Tax/Fee")
      setHotels(prev => prev.map(h =>
        h.id === selectedHotel.id ? { ...h, taxFees: [...h.taxFees, tf] } : h
      ))
      toast({ title: "Tax/fee added" })
    } catch {
      toast({ title: "Failed to add tax/fee", variant: "destructive" })
    }
  }

  async function handleUpdateTaxFee(taxFeeId: string, data: { name?: string; type?: string; value?: number }) {
    if (!selectedHotel) return
    try {
      const updated = await updateTaxFee(projectId, selectedHotel.id, taxFeeId, data)
      setHotels(prev => prev.map(h =>
        h.id === selectedHotel.id
          ? { ...h, taxFees: h.taxFees.map(tf => tf.id === taxFeeId ? { ...tf, ...updated } : tf) }
          : h
      ))
    } catch {
      toast({ title: "Failed to update tax/fee", variant: "destructive" })
    }
  }

  async function handleDeleteTaxFee(taxFeeId: string) {
    if (!selectedHotel) return
    try {
      await deleteTaxFee(projectId, selectedHotel.id, taxFeeId)
      setHotels(prev => prev.map(h =>
        h.id === selectedHotel.id ? { ...h, taxFees: h.taxFees.filter(tf => tf.id !== taxFeeId) } : h
      ))
      toast({ title: "Tax/fee removed" })
    } catch {
      toast({ title: "Failed to remove tax/fee", variant: "destructive" })
    }
  }

  function toggleRoomTypeExpanded(id: string) {
    setExpandedRoomTypes((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const hotelDates = selectedHotel?.dates || []

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Housing Settings</DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="text-muted-foreground py-8 text-center">Loading...</div>
          ) : (
            <div className="flex flex-col md:flex-row gap-4 min-h-[400px]">
              <div className="w-full md:w-56 flex-shrink-0 space-y-2">
                <Button onClick={handleCreateHotel} disabled={creating} className="w-full" size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Hotel
                </Button>
                {hotels.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No hotels yet</p>
                )}
                {hotels.map((hotel) => (
                  <button
                    key={hotel.id}
                    onClick={() => setSelectedHotelId(hotel.id)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                      selectedHotelId === hotel.id
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    }`}
                  >
                    <div className="font-medium truncate">{hotel.name}</div>
                    <div className={`text-xs ${selectedHotelId === hotel.id ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      {hotel.roomTypes.length} room type{hotel.roomTypes.length !== 1 ? "s" : ""}
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex-1 min-w-0">
                {selectedHotel ? (
                  <div className="space-y-6">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 space-y-4">
                        <div>
                          <Label>Hotel Name</Label>
                          <Input
                            value={selectedHotel.name}
                            onChange={(e) => {
                              const name = e.target.value
                              setHotels((prev) =>
                                prev.map((h) => (h.id === selectedHotel.id ? { ...h, name } : h))
                              )
                            }}
                            onBlur={(e) => handleUpdateHotel({ name: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Notes</Label>
                          <Textarea
                            value={selectedHotel.notes}
                            onChange={(e) => {
                              const notes = e.target.value
                              setHotels((prev) =>
                                prev.map((h) => (h.id === selectedHotel.id ? { ...h, notes } : h))
                              )
                            }}
                            onBlur={(e) => handleUpdateHotel({ notes: e.target.value })}
                            rows={3}
                            placeholder="General info, address, contact..."
                          />
                        </div>
                        <div>
                          <Label>Contracted Attrition (%)</Label>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              step={1}
                              value={selectedHotel.contractedAttrition ?? ""}
                              onChange={(e) => {
                                const val = e.target.value === "" ? null : parseFloat(e.target.value)
                                setHotels((prev) =>
                                  prev.map((h) => (h.id === selectedHotel.id ? { ...h, contractedAttrition: val } : h))
                                )
                              }}
                              onBlur={(e) => {
                                const val = e.target.value === "" ? null : parseFloat(e.target.value)
                                handleUpdateHotel({ contractedAttrition: val })
                              }}
                              placeholder="e.g. 80"
                              className="max-w-[120px]"
                            />
                            <span className="text-sm text-muted-foreground">%</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Minimum room night pickup required (typically 80-90%)
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="flex-shrink-0"
                        onClick={() => {
                          setDeletingHotelId(selectedHotel.id)
                          setDeleteHotelDialogOpen(true)
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDatesDialogOpen(true)}
                        className="w-full sm:w-auto"
                      >
                        <CalendarDays className="h-4 w-4 mr-2" />
                        Manage Dates ({hotelDates.length})
                      </Button>
                      {hotelDates.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {hotelDates.map((d) => (
                            <Badge key={d} variant="secondary" className="text-xs">
                              {formatDateLabel(d)}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold">Room Types</h3>
                        <Button size="sm" variant="outline" onClick={handleAddRoomType}>
                          <Plus className="h-4 w-4 mr-2" />
                          Add Room Type
                        </Button>
                      </div>

                      {selectedHotel.roomTypes.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No room types yet. Add one to configure inventory.
                        </p>
                      )}

                      {selectedHotel.roomTypes.map((rt) => {
                        const isExpanded = expandedRoomTypes.has(rt.id)
                        return (
                          <Card key={rt.id}>
                            <div
                              className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                              onClick={() => toggleRoomTypeExpanded(rt.id)}
                            >
                              <div className="flex items-center gap-2">
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                )}
                                <span className="text-sm font-medium">{rt.name}</span>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setDeletingRoomTypeId(rt.id)
                                  setDeleteRoomTypeDialogOpen(true)
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            {isExpanded && (
                              <CardContent className="pt-0 space-y-4">
                                <div className="grid gap-4 sm:grid-cols-2">
                                  <div>
                                    <Label>Room Type Name</Label>
                                    <Input
                                      value={rt.name}
                                      onChange={(e) => {
                                        const name = e.target.value
                                        setHotels((prev) =>
                                          prev.map((h) =>
                                            h.id === selectedHotel.id
                                              ? {
                                                  ...h,
                                                  roomTypes: h.roomTypes.map((r) =>
                                                    r.id === rt.id ? { ...r, name } : r
                                                  ),
                                                }
                                              : h
                                          )
                                        )
                                      }}
                                      onBlur={(e) =>
                                        handleUpdateRoomType(rt.id, { name: e.target.value })
                                      }
                                    />
                                  </div>
                                  <div>
                                    <Label>Minimum Night Stay</Label>
                                    <Input
                                      type="number"
                                      min={1}
                                      value={rt.minNightStay}
                                      onChange={(e) => {
                                        const minNightStay = parseInt(e.target.value) || 1
                                        setHotels((prev) =>
                                          prev.map((h) =>
                                            h.id === selectedHotel.id
                                              ? {
                                                  ...h,
                                                  roomTypes: h.roomTypes.map((r) =>
                                                    r.id === rt.id ? { ...r, minNightStay } : r
                                                  ),
                                                }
                                              : h
                                          )
                                        )
                                      }}
                                      onBlur={(e) =>
                                        handleUpdateRoomType(rt.id, {
                                          minNightStay: parseInt(e.target.value) || 1,
                                        })
                                      }
                                    />
                                  </div>
                                </div>
                                <div>
                                  <Label>Description</Label>
                                  <Textarea
                                    value={rt.description}
                                    onChange={(e) => {
                                      const description = e.target.value
                                      setHotels((prev) =>
                                        prev.map((h) =>
                                          h.id === selectedHotel.id
                                            ? {
                                                ...h,
                                                roomTypes: h.roomTypes.map((r) =>
                                                  r.id === rt.id ? { ...r, description } : r
                                                ),
                                              }
                                            : h
                                        )
                                      )
                                    }}
                                    onBlur={(e) =>
                                      handleUpdateRoomType(rt.id, { description: e.target.value })
                                    }
                                    rows={2}
                                    placeholder="Room description..."
                                  />
                                </div>

                                {hotelDates.length > 0 && (
                                  <div>
                                    <Label className="mb-2 block">Inventory</Label>
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-sm border-collapse">
                                        <thead>
                                          <tr className="border-b bg-muted/50">
                                            <th className="py-2 px-2 text-left font-medium min-w-[120px]"></th>
                                            {hotelDates.map((d) => (
                                              <th key={d} className="py-2 px-1 text-center font-medium min-w-[80px]">
                                                <div className="text-xs leading-tight">{formatDateLabel(d)}</div>
                                              </th>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody>
                                          <tr className="border-b">
                                            <td className="py-1 px-2 font-medium text-xs">Rate ($)</td>
                                            {hotelDates.map((d) => {
                                              const inv = (rt.inventory || {})[d] || { rate: 0, rooms: 0 }
                                              return (
                                                <td key={d} className="py-1 px-1">
                                                  <Input
                                                    type="number"
                                                    min={0}
                                                    className="h-8 text-sm text-center w-full"
                                                    value={inv.rate || ""}
                                                    onChange={(e) => {
                                                      const rate = parseFloat(e.target.value) || 0
                                                      const newInventory = {
                                                        ...(rt.inventory || {}),
                                                        [d]: { ...inv, rate },
                                                      }
                                                      setHotels((prev) =>
                                                        prev.map((h) =>
                                                          h.id === selectedHotel.id
                                                            ? {
                                                                ...h,
                                                                roomTypes: h.roomTypes.map((r) =>
                                                                  r.id === rt.id
                                                                    ? { ...r, inventory: newInventory }
                                                                    : r
                                                                ),
                                                              }
                                                            : h
                                                        )
                                                      )
                                                    }}
                                                    onBlur={() => {
                                                      handleUpdateRoomType(rt.id, { inventory: rt.inventory })
                                                    }}
                                                  />
                                                </td>
                                              )
                                            })}
                                          </tr>
                                          <tr>
                                            <td className="py-1 px-2 font-medium text-xs">Contracted Inventory</td>
                                            {hotelDates.map((d) => {
                                              const inv = (rt.inventory || {})[d] || { rate: 0, rooms: 0 }
                                              return (
                                                <td key={d} className="py-1 px-1">
                                                  <Input
                                                    type="number"
                                                    min={0}
                                                    className="h-8 text-sm text-center w-full"
                                                    value={inv.rooms || ""}
                                                    onChange={(e) => {
                                                      const rooms = parseInt(e.target.value) || 0
                                                      const newInventory = {
                                                        ...(rt.inventory || {}),
                                                        [d]: { ...inv, rooms },
                                                      }
                                                      setHotels((prev) =>
                                                        prev.map((h) =>
                                                          h.id === selectedHotel.id
                                                            ? {
                                                                ...h,
                                                                roomTypes: h.roomTypes.map((r) =>
                                                                  r.id === rt.id
                                                                    ? { ...r, inventory: newInventory }
                                                                    : r
                                                                ),
                                                              }
                                                            : h
                                                        )
                                                      )
                                                    }}
                                                    onBlur={() => {
                                                      handleUpdateRoomType(rt.id, { inventory: rt.inventory })
                                                    }}
                                                  />
                                                </td>
                                              )
                                            })}
                                          </tr>
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}

                                {hotelDates.length === 0 && (
                                  <p className="text-xs text-muted-foreground">
                                    Add dates to this hotel to configure inventory per date.
                                  </p>
                                )}
                              </CardContent>
                            )}
                          </Card>
                        )
                      })}
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold">Taxes & Fees</h3>
                        <Button size="sm" variant="outline" onClick={handleAddTaxFee}>
                          <Plus className="h-4 w-4 mr-2" />
                          Add Tax/Fee
                        </Button>
                      </div>

                      {selectedHotel.taxFees.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No taxes or fees configured. Add percentage-based taxes or flat fees.
                        </p>
                      )}

                      {selectedHotel.taxFees.map((tf) => (
                        <Card key={tf.id}>
                          <CardContent className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="flex-1 min-w-0">
                                <Input
                                  value={tf.name}
                                  placeholder="Tax/fee name"
                                  className="h-8 text-sm"
                                  onChange={(e) => {
                                    const name = e.target.value
                                    setHotels(prev => prev.map(h =>
                                      h.id === selectedHotel.id
                                        ? { ...h, taxFees: h.taxFees.map(t => t.id === tf.id ? { ...t, name } : t) }
                                        : h
                                    ))
                                  }}
                                  onBlur={(e) => handleUpdateTaxFee(tf.id, { name: e.target.value })}
                                />
                              </div>
                              <Select
                                value={tf.type}
                                onValueChange={(val) => {
                                  setHotels(prev => prev.map(h =>
                                    h.id === selectedHotel.id
                                      ? { ...h, taxFees: h.taxFees.map(t => t.id === tf.id ? { ...t, type: val, value: 0 } : t) }
                                      : h
                                  ))
                                  handleUpdateTaxFee(tf.id, { type: val, value: 0 })
                                }}
                              >
                                <SelectTrigger className="w-[130px] h-8 text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="PERCENTAGE">
                                    <span className="flex items-center gap-1"><Percent className="h-3 w-3" /> Percentage</span>
                                  </SelectItem>
                                  <SelectItem value="FLAT">
                                    <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> Flat Fee</span>
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <div className="relative w-[100px]">
                                <Input
                                  type="number"
                                  min={0}
                                  step={tf.type === "PERCENTAGE" ? 0.01 : 1}
                                  value={tf.value || ""}
                                  placeholder={tf.type === "PERCENTAGE" ? "0.00" : "0.00"}
                                  className="h-8 text-sm pr-6"
                                  onChange={(e) => {
                                    const value = parseFloat(e.target.value) || 0
                                    setHotels(prev => prev.map(h =>
                                      h.id === selectedHotel.id
                                        ? { ...h, taxFees: h.taxFees.map(t => t.id === tf.id ? { ...t, value } : t) }
                                        : h
                                    ))
                                  }}
                                  onBlur={(e) => handleUpdateTaxFee(tf.id, { value: parseFloat(e.target.value) || 0 })}
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                  {tf.type === "PERCENTAGE" ? "%" : "$"}
                                </span>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
                                onClick={() => handleDeleteTaxFee(tf.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <div className="text-center">
                      <Hotel className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>Select a hotel or add one to get started.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={datesDialogOpen} onOpenChange={setDatesDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Hotel Dates</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddDate()
                }}
              />
              <Button onClick={handleAddDate} disabled={!newDate} className="w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                Add
              </Button>
            </div>
            {hotelDates.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {hotelDates.map((d) => (
                  <Badge key={d} variant="secondary" className="text-sm py-1 px-3 gap-1">
                    {formatDateLabel(d)}
                    <button
                      onClick={() => handleRemoveDate(d)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No dates set for this hotel.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteHotelDialogOpen} onOpenChange={setDeleteHotelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Hotel?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this hotel and all its room types. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteHotel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteRoomTypeDialogOpen} onOpenChange={setDeleteRoomTypeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Room Type?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this room type and its inventory data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteRoomType} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
