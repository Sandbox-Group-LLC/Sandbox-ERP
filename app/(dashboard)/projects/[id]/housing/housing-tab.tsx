"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
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
import { Plus, LayoutDashboard, Trash2, Hotel, Pencil, CalendarDays, X, UserPlus, Settings, FileSpreadsheet } from "lucide-react"
import { HousingSettings } from "./housing-settings"
import { useToast } from "@/hooks/use-toast"
import {
  getRoomingLists,
  getRoomingListWithGuests,
  createRoomingList,
  deleteRoomingList,
  renameRoomingList,
  updateRoomingListDates,
  addGuest,
  updateGuest,
  deleteGuest,
  getHousingOverview,
  getHousingHotels,
  importGuestsFromSheet,
} from "./actions"

type RoomingListSummary = {
  id: string
  projectId: string
  name: string
  dates: string[]
  createdAt: Date
  updatedAt: Date
}

type Guest = {
  id: string
  roomingListId: string
  firstName: string
  lastName: string
  email: string
  wwid: string
  company: string
  role: string
  hotelId: string | null
  rate: string
  nights: Record<string, boolean>
  sortOrder: number
}

type HotelOption = {
  id: string
  name: string
  roomTypes: { id: string; name: string }[]
}

type RoomingListDetail = RoomingListSummary & { guests: Guest[] }

type OverviewData = {
  listCount: number
  totalGuests: number
  totalRoomNights: number
  totalAmount: number
  totalContractedRoomNights: number
  attritionPercent: number | null
  contractedAttritionThreshold: number | null
  dateBreakdown: Record<string, number>
  lists: { id: string; name: string; guestCount: number; roomNights: number; totalAmount: number }[]
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00")
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  return `${days[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`
}

function InlineCell({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (v: string) => void
  className?: string
}) {
  const [local, setLocal] = useState(value)
  useEffect(() => {
    setLocal(value)
  }, [value])
  return (
    <Input
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local !== value) onChange(local)
      }}
      className={`h-8 text-sm border-transparent hover:border-border focus:border-border ${className || ""}`}
    />
  )
}

export function HousingTab({ projectId }: { projectId: string }) {
  const [lists, setLists] = useState<RoomingListSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [activeView, setActiveView] = useState<string>("overview")

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newListName, setNewListName] = useState("")
  const [creating, setCreating] = useState(false)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingListId, setDeletingListId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [renamingListId, setRenamingListId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [renaming, setRenaming] = useState(false)

  const [detail, setDetail] = useState<RoomingListDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [datesDialogOpen, setDatesDialogOpen] = useState(false)
  const [newDate, setNewDate] = useState("")

  const [deleteGuestDialogOpen, setDeleteGuestDialogOpen] = useState(false)
  const [deletingGuestId, setDeletingGuestId] = useState<string | null>(null)

  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [hotels, setHotels] = useState<HotelOption[]>([])

  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importUrl, setImportUrl] = useState("")
  const [importLoading, setImportLoading] = useState(false)
  const [importPreview, setImportPreview] = useState<{ firstName: string; lastName: string; email: string; company: string; role: string; wwid: string; hotel: string; roomType: string; checkIn: string; checkOut: string }[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [importMode, setImportMode] = useState<"replace" | "merge">("merge")

  const { toast } = useToast()

  useEffect(() => {
    loadLists()
    loadHotels()
  }, [projectId])

  useEffect(() => {
    if (activeView === "overview") {
      loadOverview()
    } else {
      loadDetail(activeView)
    }
  }, [activeView])

  async function loadLists() {
    try {
      const data = await getRoomingLists(projectId)
      setLists(data as RoomingListSummary[])
    } catch (error) {
      console.error("Failed to load rooming lists:", error)
    } finally {
      setLoading(false)
    }
  }

  async function loadHotels() {
    try {
      const data = await getHousingHotels(projectId)
      setHotels(
        data.map((h: any) => ({
          id: h.id,
          name: h.name,
          roomTypes: (h.roomTypes || []).map((rt: any) => ({ id: rt.id, name: rt.name })),
        }))
      )
    } catch (error) {
      console.error("Failed to load hotels:", error)
    }
  }

  async function loadOverview() {
    setOverviewLoading(true)
    try {
      const data = await getHousingOverview(projectId)
      setOverview(data)
    } catch (error) {
      console.error("Failed to load overview:", error)
    } finally {
      setOverviewLoading(false)
    }
  }

  async function loadDetail(listId: string) {
    setDetailLoading(true)
    try {
      const data = await getRoomingListWithGuests(projectId, listId)
      setDetail(data as RoomingListDetail)
    } catch (error) {
      console.error("Failed to load rooming list:", error)
      toast({ title: "Failed to load rooming list", variant: "destructive" })
    } finally {
      setDetailLoading(false)
    }
  }

  async function handleCreate() {
    setCreating(true)
    try {
      const list = await createRoomingList(projectId, newListName)
      setLists((prev) => [...prev, list as RoomingListSummary])
      setActiveView(list.id)
      setCreateDialogOpen(false)
      setNewListName("")
      toast({ title: "Rooming list created" })
    } catch (error) {
      toast({ title: "Failed to create rooming list", variant: "destructive" })
    } finally {
      setCreating(false)
    }
  }

  async function handleDeleteList() {
    if (!deletingListId) return
    setDeleting(true)
    try {
      await deleteRoomingList(projectId, deletingListId)
      setLists((prev) => prev.filter((l) => l.id !== deletingListId))
      setActiveView("overview")
      setDeleteDialogOpen(false)
      setDeletingListId(null)
      toast({ title: "Rooming list deleted" })
    } catch (error) {
      toast({ title: "Failed to delete rooming list", variant: "destructive" })
    } finally {
      setDeleting(false)
    }
  }

  async function handleRename(listId: string) {
    setRenaming(true)
    try {
      const updated = await renameRoomingList(projectId, listId, renameValue)
      setLists((prev) =>
        prev.map((l) => (l.id === listId ? { ...l, name: updated.name } : l))
      )
      if (detail?.id === listId)
        setDetail((d) => (d ? { ...d, name: updated.name } : d))
      setRenamingListId(null)
      setRenameValue("")
      toast({ title: "Rooming list renamed" })
    } catch (error) {
      toast({ title: "Failed to rename", variant: "destructive" })
    } finally {
      setRenaming(false)
    }
  }

  async function handleAddDate() {
    if (!detail || !newDate) return
    const currentDates = (detail.dates as string[]) || []
    if (currentDates.includes(newDate)) {
      toast({ title: "Date already exists", variant: "destructive" })
      return
    }
    const updatedDates = [...currentDates, newDate].sort()
    try {
      await updateRoomingListDates(projectId, detail.id, updatedDates)
      setDetail((d) => (d ? { ...d, dates: updatedDates } : d))
      setNewDate("")
      toast({ title: "Date added" })
    } catch (error) {
      toast({ title: "Failed to add date", variant: "destructive" })
    }
  }

  async function handleRemoveDate(dateStr: string) {
    if (!detail) return
    const currentDates = (detail.dates as string[]) || []
    const updatedDates = currentDates.filter((d) => d !== dateStr)
    try {
      await updateRoomingListDates(projectId, detail.id, updatedDates)
      setDetail((d) => (d ? { ...d, dates: updatedDates } : d))
      toast({ title: "Date removed" })
    } catch (error) {
      toast({ title: "Failed to remove date", variant: "destructive" })
    }
  }

  async function handleAddGuest() {
    if (!detail) return
    try {
      const guest = await addGuest(projectId, detail.id)
      setDetail((d) =>
        d ? { ...d, guests: [...d.guests, guest as Guest] } : d
      )
      toast({ title: "Guest added" })
    } catch (error) {
      toast({ title: "Failed to add guest", variant: "destructive" })
    }
  }

  async function handleUpdateGuest(
    guestId: string,
    field: string,
    value: string | Record<string, boolean>
  ) {
    if (!detail) return
    try {
      const updated = await updateGuest(projectId, detail.id, guestId, {
        [field]: value,
      })
      setDetail((d) =>
        d
          ? {
              ...d,
              guests: d.guests.map((g) =>
                g.id === guestId ? ({ ...g, ...updated } as Guest) : g
              ),
            }
          : d
      )
    } catch (error) {
      toast({ title: "Failed to update guest", variant: "destructive" })
    }
  }

  async function handleToggleNight(
    guestId: string,
    dateStr: string,
    currentNights: Record<string, boolean>
  ) {
    const newNights = { ...currentNights, [dateStr]: !currentNights[dateStr] }
    setDetail((d) =>
      d
        ? {
            ...d,
            guests: d.guests.map((g) =>
              g.id === guestId ? { ...g, nights: newNights } : g
            ),
          }
        : d
    )
    try {
      await updateGuest(projectId, detail!.id, guestId, { nights: newNights })
    } catch (error) {
      setDetail((d) =>
        d
          ? {
              ...d,
              guests: d.guests.map((g) =>
                g.id === guestId ? { ...g, nights: currentNights } : g
              ),
            }
          : d
      )
      toast({ title: "Failed to update", variant: "destructive" })
    }
  }

  async function handleDeleteGuest() {
    if (!detail || !deletingGuestId) return
    try {
      await deleteGuest(projectId, detail.id, deletingGuestId)
      setDetail((d) =>
        d
          ? { ...d, guests: d.guests.filter((g) => g.id !== deletingGuestId) }
          : d
      )
      setDeleteGuestDialogOpen(false)
      setDeletingGuestId(null)
      toast({ title: "Guest removed" })
    } catch (error) {
      toast({ title: "Failed to remove guest", variant: "destructive" })
    }
  }

  async function handleFetchPreview() {
    if (!importUrl) return
    setImportLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/housing/import-sheet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetUrl: importUrl }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to fetch sheet")
      setImportPreview(data)
    } catch (error: any) {
      toast({ title: error.message || "Failed to fetch sheet", variant: "destructive" })
    } finally {
      setImportLoading(false)
    }
  }

  async function handleImport() {
    if (!detail || !importPreview) return
    setImporting(true)
    try {
      const result = await importGuestsFromSheet(projectId, detail.id, importPreview, importMode)
      await loadDetail(detail.id)
      setImportDialogOpen(false)
      setImportUrl("")
      setImportPreview(null)
      if (importMode === "merge") {
        toast({ title: `Updated ${result.updated} guests, added ${result.added} new` })
      } else {
        toast({ title: `Imported ${result.count} guests` })
      }
    } catch (error: any) {
      toast({ title: error.message || "Failed to import guests", variant: "destructive" })
    } finally {
      setImporting(false)
    }
  }

  function getDateTotal(guests: Guest[], dateStr: string): number {
    return guests.reduce((sum, g) => {
      const nights = (g.nights as Record<string, boolean>) || {}
      return sum + (nights[dateStr] ? 1 : 0)
    }, 0)
  }

  function getGuestTotal(guest: Guest): number {
    const nights = (guest.nights as Record<string, boolean>) || {}
    return Object.values(nights).filter(Boolean).length
  }

  function getGrandTotal(guests: Guest[]): number {
    return guests.reduce((sum, g) => sum + getGuestTotal(g), 0)
  }

  if (loading)
    return <div className="text-muted-foreground">Loading housing...</div>

  const dates = detail ? ((detail.dates as string[]) || []) : []

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
          {lists.length > 0 && (
            <Select
              value={activeView !== "overview" ? activeView : ""}
              onValueChange={(val) => setActiveView(val)}
            >
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue placeholder="Select rooming list" />
              </SelectTrigger>
              <SelectContent>
                {lists.map((list) => (
                  <SelectItem key={list.id} value={list.id}>
                    {list.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button variant="outline" onClick={() => setSettingsOpen(true)} className="w-full sm:w-auto">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
          <Button
            onClick={() => setCreateDialogOpen(true)}
            className="w-full sm:w-auto"
          >
            <Plus className="h-4 w-4 mr-2" />
            Rooming List
          </Button>
        </div>
      </div>

      {activeView === "overview" &&
        (overviewLoading ? (
          <div className="text-muted-foreground">Loading overview...</div>
        ) : overview ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{overview.listCount}</div>
                  <p className="text-sm text-muted-foreground">Rooming Lists</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">
                    {overview.totalGuests}
                  </div>
                  <p className="text-sm text-muted-foreground">Total Guests</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">
                    {overview.totalRoomNights}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Total Room Nights
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">
                    {overview.totalContractedRoomNights}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Contracted Room Nights
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  {overview.attritionPercent != null ? (
                    <>
                      <div className={`text-2xl font-bold ${
                        overview.contractedAttritionThreshold != null
                          ? overview.attritionPercent >= overview.contractedAttritionThreshold
                            ? "text-green-600"
                            : "text-red-600"
                          : ""
                      }`}>
                        {overview.attritionPercent.toFixed(1)}%
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Attrition
                        {overview.contractedAttritionThreshold != null && (
                          <span className="ml-1 text-xs">
                            (target: {overview.contractedAttritionThreshold}%)
                          </span>
                        )}
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="text-2xl font-bold text-muted-foreground">—</div>
                      <p className="text-sm text-muted-foreground">Attrition</p>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {overview.lists.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Lists Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-3 font-medium">
                            List Name
                          </th>
                          <th className="text-right py-2 px-3 font-medium">
                            Guests
                          </th>
                          <th className="text-right py-2 px-3 font-medium">
                            Room Nights
                          </th>
                          <th className="text-right py-2 px-3 font-medium">
                            Total Amount
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.lists.map((l) => (
                          <tr
                            key={l.id}
                            className="border-b last:border-0 hover:bg-muted/50 cursor-pointer"
                            onClick={() => setActiveView(l.id)}
                          >
                            <td className="py-2 px-3">{l.name}</td>
                            <td className="py-2 px-3 text-right">
                              {l.guestCount}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {l.roomNights}
                            </td>
                            <td className="py-2 px-3 text-right font-medium">
                              {l.totalAmount > 0 ? `$${l.totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                            </td>
                          </tr>
                        ))}
                        {overview.lists.length > 1 && (
                          <tr className="border-t-2 font-semibold">
                            <td className="py-2 px-3">Total</td>
                            <td className="py-2 px-3 text-right">{overview.totalGuests}</td>
                            <td className="py-2 px-3 text-right">{overview.totalRoomNights}</td>
                            <td className="py-2 px-3 text-right">
                              {overview.totalAmount > 0 ? `$${overview.totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {Object.keys(overview.dateBreakdown).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Room Nights by Date
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-3 font-medium">
                            Date
                          </th>
                          <th className="text-right py-2 px-3 font-medium">
                            Rooms Needed
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(overview.dateBreakdown)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([date, count]) => (
                            <tr key={date} className="border-b last:border-0">
                              <td className="py-2 px-3">
                                {formatDateLabel(date)}
                              </td>
                              <td className="py-2 px-3 text-right">{count}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {overview.listCount === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <Hotel className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">No Rooming Lists Yet</p>
                  <p className="text-muted-foreground mt-1">
                    Create a rooming list to start tracking hotel rooms.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        ) : null)}

      {activeView !== "overview" &&
        (detailLoading ? (
          <div className="text-muted-foreground">Loading rooming list...</div>
        ) : detail ? (
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  {renamingListId === detail.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename(detail.id)
                          if (e.key === "Escape") setRenamingListId(null)
                        }}
                        autoFocus
                        className="h-8 w-[200px]"
                      />
                      <Button
                        size="sm"
                        onClick={() => handleRename(detail.id)}
                        disabled={renaming}
                      >
                        {renaming ? "Saving..." : "Save"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRenamingListId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">
                        {detail.name}
                      </CardTitle>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => {
                          setRenamingListId(detail.id)
                          setRenameValue(detail.name)
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground mt-1">
                    {detail.guests.length} guests ·{" "}
                    {getGrandTotal(detail.guests)} room nights
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDatesDialogOpen(true)}
                    className="w-full sm:w-auto"
                  >
                    <CalendarDays className="h-4 w-4 mr-2" />
                    Manage Dates
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddGuest}
                    className="w-full sm:w-auto"
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add Guest
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setImportDialogOpen(true)} className="w-full sm:w-auto">
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Import
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      setDeletingListId(detail.id)
                      setDeleteDialogOpen(true)
                    }}
                    className="w-full sm:w-auto"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete List
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {detail.guests.length === 0 && dates.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Hotel className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p>Add dates and guests to build your rooming list.</p>
                  <p className="text-sm mt-1">
                    Use &quot;Manage Dates&quot; to set up the stay dates, then
                    &quot;Add Guest&quot; to add people.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="py-2 px-2 text-left font-medium w-8">
                          #
                        </th>
                        <th className="py-2 px-1 text-left font-medium min-w-[100px]">
                          First Name
                        </th>
                        <th className="py-2 px-1 text-left font-medium min-w-[100px]">
                          Last Name
                        </th>
                        <th className="py-2 px-1 text-left font-medium min-w-[160px] hidden md:table-cell">
                          Email
                        </th>
                        <th className="py-2 px-1 text-left font-medium min-w-[80px] hidden lg:table-cell">
                          WWID
                        </th>
                        <th className="py-2 px-1 text-left font-medium min-w-[100px] hidden md:table-cell">
                          Company
                        </th>
                        <th className="py-2 px-1 text-left font-medium min-w-[80px] hidden lg:table-cell">
                          Role
                        </th>
                        <th className="py-2 px-1 text-left font-medium min-w-[120px] hidden md:table-cell">
                          Hotel
                        </th>
                        <th className="py-2 px-1 text-left font-medium min-w-[120px] hidden lg:table-cell">
                          Rate
                        </th>
                        {dates.map((d) => (
                          <th
                            key={d}
                            className="py-2 px-1 text-center font-medium min-w-[60px]"
                          >
                            <div className="text-xs leading-tight">
                              {formatDateLabel(d)}
                            </div>
                          </th>
                        ))}
                        <th className="py-2 px-2 text-center font-medium min-w-[50px]">
                          Total
                        </th>
                        <th className="py-2 px-1 w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.guests.map((guest, idx) => {
                        const nights =
                          (guest.nights as Record<string, boolean>) || {}
                        return (
                          <tr
                            key={guest.id}
                            className="border-b last:border-0 hover:bg-muted/30"
                          >
                            <td className="py-1 px-2 text-muted-foreground text-xs">
                              {idx + 1}
                            </td>
                            <td className="py-1 px-1">
                              <InlineCell
                                value={guest.firstName}
                                onChange={(v) =>
                                  handleUpdateGuest(guest.id, "firstName", v)
                                }
                                className="min-w-[90px]"
                              />
                            </td>
                            <td className="py-1 px-1">
                              <InlineCell
                                value={guest.lastName}
                                onChange={(v) =>
                                  handleUpdateGuest(guest.id, "lastName", v)
                                }
                                className="min-w-[90px]"
                              />
                            </td>
                            <td className="py-1 px-1 hidden md:table-cell">
                              <InlineCell
                                value={guest.email}
                                onChange={(v) =>
                                  handleUpdateGuest(guest.id, "email", v)
                                }
                                className="min-w-[150px]"
                              />
                            </td>
                            <td className="py-1 px-1 hidden lg:table-cell">
                              <InlineCell
                                value={guest.wwid}
                                onChange={(v) =>
                                  handleUpdateGuest(guest.id, "wwid", v)
                                }
                                className="min-w-[70px]"
                              />
                            </td>
                            <td className="py-1 px-1 hidden md:table-cell">
                              <InlineCell
                                value={guest.company}
                                onChange={(v) =>
                                  handleUpdateGuest(guest.id, "company", v)
                                }
                                className="min-w-[90px]"
                              />
                            </td>
                            <td className="py-1 px-1 hidden lg:table-cell">
                              <InlineCell
                                value={guest.role}
                                onChange={(v) =>
                                  handleUpdateGuest(guest.id, "role", v)
                                }
                                className="min-w-[70px]"
                              />
                            </td>
                            <td className="py-1 px-1 hidden md:table-cell">
                              <Select
                                value={guest.hotelId || ""}
                                onValueChange={(v) => {
                                  handleUpdateGuest(guest.id, "hotelId", v || "")
                                  if (guest.rate) {
                                    handleUpdateGuest(guest.id, "rate", "")
                                  }
                                }}
                              >
                                <SelectTrigger className="h-8 text-sm min-w-[110px] border-transparent hover:border-border">
                                  <SelectValue placeholder="Select hotel" />
                                </SelectTrigger>
                                <SelectContent>
                                  {hotels.map((h) => (
                                    <SelectItem key={h.id} value={h.id}>
                                      {h.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="py-1 px-1 hidden lg:table-cell">
                              {(() => {
                                const selectedHotel = hotels.find((h) => h.id === guest.hotelId)
                                const roomTypes = selectedHotel?.roomTypes || []
                                if (roomTypes.length === 0) {
                                  return (
                                    <InlineCell
                                      value={guest.rate}
                                      onChange={(v) =>
                                        handleUpdateGuest(guest.id, "rate", v)
                                      }
                                      className="min-w-[100px]"
                                    />
                                  )
                                }
                                return (
                                  <Select
                                    value={guest.rate || ""}
                                    onValueChange={(v) =>
                                      handleUpdateGuest(guest.id, "rate", v)
                                    }
                                  >
                                    <SelectTrigger className="h-8 text-sm min-w-[100px] border-transparent hover:border-border">
                                      <SelectValue placeholder="Select rate" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {roomTypes.map((rt) => (
                                        <SelectItem key={rt.id} value={rt.name}>
                                          {rt.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )
                              })()}
                            </td>
                            {dates.map((d) => (
                              <td key={d} className="py-1 px-1 text-center">
                                <button
                                  onClick={() =>
                                    handleToggleNight(guest.id, d, nights)
                                  }
                                  className={`w-7 h-7 rounded text-xs font-medium transition-colors ${
                                    nights[d]
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-muted hover:bg-muted/80 text-muted-foreground"
                                  }`}
                                >
                                  {nights[d] ? "1" : "0"}
                                </button>
                              </td>
                            ))}
                            <td className="py-1 px-2 text-center font-medium">
                              {getGuestTotal(guest)}
                            </td>
                            <td className="py-1 px-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                onClick={() => {
                                  setDeletingGuestId(guest.id)
                                  setDeleteGuestDialogOpen(true)
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    {detail.guests.length > 0 && (
                      <tfoot>
                        <tr className="border-t-2 bg-muted/50 font-medium">
                          <td
                            className="py-2 px-2 text-right"
                            colSpan={9}
                          >
                            Total Room Nights
                          </td>
                          {dates.map((d) => (
                            <td
                              key={d}
                              className="py-2 px-1 text-center"
                            >
                              {getDateTotal(detail.guests, d)}
                            </td>
                          ))}
                          <td className="py-2 px-2 text-center font-bold">
                            {getGrandTotal(detail.guests)}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        ) : null)}

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Rooming List</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Rooming list name"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate()
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={datesDialogOpen} onOpenChange={setDatesDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Stay Dates</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {dates.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No dates added yet.
                </p>
              )}
              {dates.map((d) => (
                <Badge key={d} variant="secondary" className="gap-1 pr-1">
                  {formatDateLabel(d)}
                  <button
                    onClick={() => handleRemoveDate(d)}
                    className="ml-1 rounded-full hover:bg-muted p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="flex-1"
              />
              <Button onClick={handleAddDate} disabled={!newDate} size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDatesDialogOpen(false)}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Rooming List</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this rooming list and all its
              guests? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteList}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteGuestDialogOpen}
        onOpenChange={setDeleteGuestDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Guest</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this guest from the rooming list?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteGuest}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <HousingSettings
        projectId={projectId}
        open={settingsOpen}
        onOpenChange={(open) => {
          setSettingsOpen(open)
          if (!open) loadHotels()
        }}
      />

      <Dialog open={importDialogOpen} onOpenChange={(open) => {
        setImportDialogOpen(open)
        if (!open) { setImportUrl(""); setImportPreview(null) }
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Import Guests from Google Sheets</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Paste the public link to a Google Sheet with columns: First Name, Last Name, Email, Company, Role, WWID, Hotel, Room Type, Check In, Check Out
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                className="flex-1"
              />
              <Button onClick={handleFetchPreview} disabled={importLoading || !importUrl} size="sm">
                {importLoading ? "Loading..." : "Preview"}
              </Button>
            </div>

            {importPreview && (
              <div>
                <p className="text-sm font-medium mb-2">{importPreview.length} guests found</p>
                {importPreview.length > 0 && (
                  <div className="overflow-x-auto max-h-[300px] overflow-y-auto border rounded">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-muted">
                        <tr className="border-b">
                          <th className="py-2 px-3 text-left font-medium">First Name</th>
                          <th className="py-2 px-3 text-left font-medium">Last Name</th>
                          <th className="py-2 px-3 text-left font-medium">Email</th>
                          <th className="py-2 px-3 text-left font-medium hidden sm:table-cell">Company</th>
                          <th className="py-2 px-3 text-left font-medium hidden sm:table-cell">Role</th>
                          <th className="py-2 px-3 text-left font-medium hidden sm:table-cell">WWID</th>
                          {importPreview.some((g) => g.hotel) && (
                            <th className="py-2 px-3 text-left font-medium hidden md:table-cell">Hotel</th>
                          )}
                          {importPreview.some((g) => g.roomType) && (
                            <th className="py-2 px-3 text-left font-medium hidden md:table-cell">Room Type</th>
                          )}
                          {importPreview.some((g) => g.checkIn) && (
                            <th className="py-2 px-3 text-left font-medium hidden md:table-cell">Check In</th>
                          )}
                          {importPreview.some((g) => g.checkOut) && (
                            <th className="py-2 px-3 text-left font-medium hidden md:table-cell">Check Out</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.map((g, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="py-1.5 px-3">{g.firstName}</td>
                            <td className="py-1.5 px-3">{g.lastName}</td>
                            <td className="py-1.5 px-3">{g.email}</td>
                            <td className="py-1.5 px-3 hidden sm:table-cell">{g.company}</td>
                            <td className="py-1.5 px-3 hidden sm:table-cell">{g.role}</td>
                            <td className="py-1.5 px-3 hidden sm:table-cell">{g.wwid}</td>
                            {importPreview.some((gg) => gg.hotel) && (
                              <td className="py-1.5 px-3 hidden md:table-cell">{g.hotel}</td>
                            )}
                            {importPreview.some((gg) => gg.roomType) && (
                              <td className="py-1.5 px-3 hidden md:table-cell">{g.roomType}</td>
                            )}
                            {importPreview.some((gg) => gg.checkIn) && (
                              <td className="py-1.5 px-3 hidden md:table-cell">{g.checkIn}</td>
                            )}
                            {importPreview.some((gg) => gg.checkOut) && (
                              <td className="py-1.5 px-3 hidden md:table-cell">{g.checkOut}</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
          {importPreview && importPreview.length > 0 && (
            <div className="flex items-center gap-4 pt-2 border-t">
              <span className="text-sm font-medium">Import Mode:</span>
              <div className="flex gap-2">
                <Button
                  variant={importMode === "merge" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setImportMode("merge")}
                  type="button"
                >
                  Update & Add
                </Button>
                <Button
                  variant={importMode === "replace" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setImportMode("replace")}
                  type="button"
                >
                  Replace All
                </Button>
              </div>
              <p className="text-xs text-muted-foreground flex-1">
                {importMode === "merge"
                  ? "Matches guests by email or name. Updates existing fields and adds new guests."
                  : "Removes all existing guests and replaces with imported data."}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setImportDialogOpen(false); setImportUrl(""); setImportPreview(null) }}>
              Cancel
            </Button>
            {importPreview && importPreview.length > 0 && (
              <Button onClick={handleImport} disabled={importing}>
                {importing ? "Importing..." : importMode === "merge" ? `Update / Add ${importPreview.length} Guests` : `Replace with ${importPreview.length} Guests`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
