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
import { Plus, Trash2, Pencil, RefreshCw, Search, PackagePlus } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
  getShippingItems,
  getPeopleForDropdown,
  getVendorsForDropdown,
  createShippingItem,
  updateShippingItem,
  deleteShippingItem,
  lookupTrackingInfo,
  refreshAllTrackingForProject,
  type PersonOption,
  type VendorOption,
} from "./actions"
import { ShippingItemType, ShippingStatus, ShippingCarrier } from "@prisma/client"

interface ShippingItem {
  id: string
  item: string
  type: ShippingItemType | null
  vendor: string | null
  quantity: number
  purchaserId: string | null
  purchaser: { id: string; name: string } | null
  orderNumber: string | null
  status: ShippingStatus
  deliveringToVendorId: string | null
  deliveringToVendor: { id: string; name: string } | null
  estimatedDeliveryDate: Date | null
  carrier: ShippingCarrier | null
  trackingNumber: string | null
  postEvent: string | null
  notes: string | null
}

interface ProjectShippingProps {
  projectId: string
  organizationId: string
}

const ITEM_TYPES: { value: ShippingItemType; label: string }[] = [
  { value: "Decor", label: "Decor" },
  { value: "Furniture", label: "Furniture" },
  { value: "Merch", label: "Merch" },
  { value: "Supplies", label: "Supplies" },
]

const STATUS_OPTIONS: { value: ShippingStatus; label: string }[] = [
  { value: "Ordered", label: "Ordered" },
  { value: "Shipped", label: "Shipped" },
  { value: "Delivered", label: "Delivered" },
]

const CARRIER_OPTIONS: { value: ShippingCarrier; label: string }[] = [
  { value: "USPS", label: "USPS" },
  { value: "FedEx", label: "FedEx" },
  { value: "UPS", label: "UPS" },
  { value: "DHL", label: "DHL" },
  { value: "Amazon", label: "Amazon" },
  { value: "Other", label: "Other" },
]

export function ProjectShipping({ projectId, organizationId }: ProjectShippingProps) {
  const [items, setItems] = useState<ShippingItem[]>([])
  const [people, setPeople] = useState<PersonOption[]>([])
  const [vendors, setVendors] = useState<VendorOption[]>([])
  const [loading, setLoading] = useState(true)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<ShippingItem | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [trackingItemId, setTrackingItemId] = useState<string | null>(null)
  const [refreshingAll, setRefreshingAll] = useState(false)
  const [addingToInventory, setAddingToInventory] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    loadData()
  }, [projectId, organizationId])

  async function loadData() {
    setLoading(true)
    try {
      const [itemsData, peopleData, vendorsData] = await Promise.all([
        getShippingItems(projectId),
        getPeopleForDropdown(organizationId),
        getVendorsForDropdown(organizationId),
      ])
      setItems(itemsData as ShippingItem[])
      setPeople(peopleData)
      setVendors(vendorsData)
    } catch (error) {
      console.error("Failed to load shipping data:", error)
    } finally {
      setLoading(false)
    }
  }

  async function handleTrackItem(itemId: string) {
    setTrackingItemId(itemId)
    try {
      const result = await lookupTrackingInfo(itemId)
      if (result.success) {
        if (result.updated) {
          toast({
            title: "Tracking Updated",
            description: result.estimatedDelivery 
              ? `Delivery date updated. Status: ${result.status || "Unknown"}`
              : `Status: ${result.status || "Unknown"}`,
          })
          await loadData()
        } else {
          toast({
            title: "Tracking Info",
            description: `Status: ${result.status || "No updates available"}`,
          })
        }
      } else {
        toast({
          title: "Tracking Lookup Failed",
          description: result.error || "Unable to retrieve tracking information",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to lookup tracking information",
        variant: "destructive",
      })
    } finally {
      setTrackingItemId(null)
    }
  }

  async function handleRefreshAllTracking() {
    setRefreshingAll(true)
    try {
      const result = await refreshAllTrackingForProject(projectId)
      if (result.success) {
        toast({
          title: "Tracking Refreshed",
          description: `Updated ${result.updated} items. ${result.failed > 0 ? `${result.failed} failed.` : ""}`,
        })
        if (result.updated > 0) {
          await loadData()
        }
      } else {
        toast({
          title: "Refresh Failed",
          description: result.errors[0] || "Unable to refresh tracking",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to refresh tracking information",
        variant: "destructive",
      })
    } finally {
      setRefreshingAll(false)
    }
  }

  async function handleAddItem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    const formData = new FormData(e.currentTarget)

    try {
      const estDelivery = formData.get("estimatedDeliveryDate") as string
      const typeVal = formData.get("type") as string
      const purchaserVal = formData.get("purchaserId") as string
      const deliveringToVal = formData.get("deliveringToVendorId") as string
      const carrierVal = formData.get("carrier") as string
      await createShippingItem(projectId, {
        item: formData.get("item") as string,
        type: typeVal && typeVal !== "none" ? (typeVal as ShippingItemType) : null,
        vendor: formData.get("vendor") as string || null,
        quantity: parseInt(formData.get("quantity") as string) || 1,
        purchaserId: purchaserVal && purchaserVal !== "none" ? purchaserVal : null,
        orderNumber: formData.get("orderNumber") as string || null,
        status: (formData.get("status") as ShippingStatus) || "Ordered",
        deliveringToVendorId: deliveringToVal && deliveringToVal !== "none" ? deliveringToVal : null,
        estimatedDeliveryDate: estDelivery ? new Date(estDelivery) : null,
        carrier: carrierVal && carrierVal !== "none" ? (carrierVal as ShippingCarrier) : null,
        trackingNumber: formData.get("trackingNumber") as string || null,
        postEvent: formData.get("postEvent") as string || null,
        notes: formData.get("notes") as string || null,
      })
      setAddDialogOpen(false)
      await loadData()
    } catch (error) {
      console.error("Failed to create shipping item:", error)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleEditItem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editingItem) return
    setSubmitting(true)
    const formData = new FormData(e.currentTarget)

    try {
      const estDelivery = formData.get("estimatedDeliveryDate") as string
      const typeVal = formData.get("type") as string
      const purchaserVal = formData.get("purchaserId") as string
      const deliveringToVal = formData.get("deliveringToVendorId") as string
      const carrierVal = formData.get("carrier") as string
      await updateShippingItem(editingItem.id, {
        item: formData.get("item") as string,
        type: typeVal && typeVal !== "none" ? (typeVal as ShippingItemType) : null,
        vendor: formData.get("vendor") as string || null,
        quantity: parseInt(formData.get("quantity") as string) || 1,
        purchaserId: purchaserVal && purchaserVal !== "none" ? purchaserVal : null,
        orderNumber: formData.get("orderNumber") as string || null,
        status: (formData.get("status") as ShippingStatus) || "Ordered",
        deliveringToVendorId: deliveringToVal && deliveringToVal !== "none" ? deliveringToVal : null,
        estimatedDeliveryDate: estDelivery ? new Date(estDelivery) : null,
        carrier: carrierVal && carrierVal !== "none" ? (carrierVal as ShippingCarrier) : null,
        trackingNumber: formData.get("trackingNumber") as string || null,
        postEvent: formData.get("postEvent") as string || null,
        notes: formData.get("notes") as string || null,
      })
      setEditDialogOpen(false)
      setEditingItem(null)
      await loadData()
    } catch (error) {
      console.error("Failed to update shipping item:", error)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeleteItem(id: string) {
    if (!confirm("Are you sure you want to delete this shipping item?")) return

    try {
      await deleteShippingItem(id)
      await loadData()
    } catch (error) {
      console.error("Failed to delete shipping item:", error)
    }
  }

  function openEditDialog(item: ShippingItem) {
    setEditingItem(item)
    setEditDialogOpen(true)
  }

  async function handleAddToInventory(item: ShippingItem) {
    setAddingToInventory(item.id)
    try {
      const categoryMap: Record<string, string> = {
        Decor: "Decor",
        Furniture: "Furniture",
        Merch: "Merch",
        Supplies: "Supplies",
      }
      const assetData = {
        name: item.item,
        description: `From shipping: ${item.orderNumber || "N/A"}`,
        category: item.type ? categoryMap[item.type] || "Other" : "Other",
        condition: "Good",
        status: "Available",
        quantity: item.quantity,
        quantityAvailable: item.quantity,
        location: item.deliveringToVendor?.name || undefined,
        sourceShippingId: item.id,
      }
      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(assetData),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to add to inventory")
      }
      toast({
        title: "Added to Inventory",
        description: `"${item.item}" has been added to your inventory.`,
      })
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add to inventory",
        variant: "destructive",
      })
    } finally {
      setAddingToInventory(null)
    }
  }

  function formatDate(date: Date | null): string {
    if (!date) return ""
    return new Date(date).toLocaleDateString()
  }

  function formatDateForInput(date: Date | null): string {
    if (!date) return ""
    return new Date(date).toISOString().split("T")[0]
  }

  function ShippingItemForm({ 
    onSubmit, 
    defaultValues,
    submitLabel 
  }: { 
    onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
    defaultValues?: ShippingItem | null
    submitLabel: string
  }) {
    return (
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="item">Item *</Label>
            <Input 
              id="item" 
              name="item" 
              required 
              defaultValue={defaultValues?.item || ""} 
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Type</Label>
            <Select name="type" defaultValue={defaultValues?.type || "none"}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {ITEM_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="vendor">Vendor</Label>
            <Input 
              id="vendor" 
              name="vendor" 
              defaultValue={defaultValues?.vendor || ""} 
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity</Label>
            <Input 
              id="quantity" 
              name="quantity" 
              type="number" 
              min="1"
              defaultValue={defaultValues?.quantity || 1} 
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="purchaserId">Purchaser</Label>
            <Select name="purchaserId" defaultValue={defaultValues?.purchaserId || "none"}>
              <SelectTrigger>
                <SelectValue placeholder="Select purchaser" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {people.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="orderNumber">Order #</Label>
            <Input 
              id="orderNumber" 
              name="orderNumber" 
              defaultValue={defaultValues?.orderNumber || ""} 
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select name="status" defaultValue={defaultValues?.status || "Ordered"}>
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="deliveringToVendorId">Delivering To</Label>
            <Select name="deliveringToVendorId" defaultValue={defaultValues?.deliveringToVendorId || "none"}>
              <SelectTrigger>
                <SelectValue placeholder="Select vendor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {vendors.map((vendor) => (
                  <SelectItem key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="estimatedDeliveryDate">Est. Delivery Date</Label>
            <Input 
              id="estimatedDeliveryDate" 
              name="estimatedDeliveryDate" 
              type="date"
              defaultValue={formatDateForInput(defaultValues?.estimatedDeliveryDate || null)} 
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="carrier">Carrier</Label>
            <Select name="carrier" defaultValue={defaultValues?.carrier || "none"}>
              <SelectTrigger>
                <SelectValue placeholder="Select carrier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {CARRIER_OPTIONS.map((carrier) => (
                  <SelectItem key={carrier.value} value={carrier.value}>
                    {carrier.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="trackingNumber">Tracking #</Label>
            <Input 
              id="trackingNumber" 
              name="trackingNumber" 
              defaultValue={defaultValues?.trackingNumber || ""} 
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="postEvent">Post Event</Label>
            <Input 
              id="postEvent" 
              name="postEvent" 
              defaultValue={defaultValues?.postEvent || ""} 
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea 
            id="notes" 
            name="notes" 
            rows={3}
            defaultValue={defaultValues?.notes || ""} 
          />
        </div>

        <DialogFooter>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving..." : submitLabel}
          </Button>
        </DialogFooter>
      </form>
    )
  }

  if (loading) {
    return <div className="p-4">Loading shipping data...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">Shipping Tracking</h2>
        <div className="flex flex-wrap gap-2">
          <Button 
            variant="outline" 
            onClick={handleRefreshAllTracking}
            disabled={refreshingAll || items.filter(i => i.trackingNumber && i.status !== "Delivered").length === 0}
            className="w-full sm:w-auto"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshingAll ? "animate-spin" : ""}`} />
            {refreshingAll ? "Refreshing..." : "Refresh All Tracking"}
          </Button>
          <Button onClick={() => setAddDialogOpen(true)} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Add Item
          </Button>
        </div>
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[150px]">Item</TableHead>
              <TableHead className="min-w-[100px]">Type</TableHead>
              <TableHead className="min-w-[120px]">Vendor</TableHead>
              <TableHead className="min-w-[60px]">Qty</TableHead>
              <TableHead className="min-w-[120px]">Purchaser</TableHead>
              <TableHead className="min-w-[100px]">Order #</TableHead>
              <TableHead className="min-w-[100px]">Status</TableHead>
              <TableHead className="min-w-[120px]">Delivering To</TableHead>
              <TableHead className="min-w-[120px]">Est. Delivery</TableHead>
              <TableHead className="min-w-[100px]">Carrier</TableHead>
              <TableHead className="min-w-[120px]">Tracking #</TableHead>
              <TableHead className="min-w-[100px]">Post Event</TableHead>
              <TableHead className="min-w-[150px]">Notes</TableHead>
              <TableHead className="min-w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={14} className="text-center text-muted-foreground py-8">
                  No shipping items yet. Click "Add Item" to create one.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.item}</TableCell>
                  <TableCell>{item.type || "-"}</TableCell>
                  <TableCell>{item.vendor || "-"}</TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>{item.purchaser?.name || "-"}</TableCell>
                  <TableCell>{item.orderNumber || "-"}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      item.status === "Delivered" 
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        : item.status === "Shipped"
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                        : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                    }`}>
                      {item.status}
                    </span>
                  </TableCell>
                  <TableCell>{item.deliveringToVendor?.name || "-"}</TableCell>
                  <TableCell>{formatDate(item.estimatedDeliveryDate)}</TableCell>
                  <TableCell>{item.carrier || "-"}</TableCell>
                  <TableCell>{item.trackingNumber || "-"}</TableCell>
                  <TableCell>{item.postEvent || "-"}</TableCell>
                  <TableCell className="max-w-[150px] truncate" title={item.notes || ""}>
                    {item.notes || "-"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {item.trackingNumber && item.status !== "Delivered" && (
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleTrackItem(item.id)}
                          disabled={trackingItemId === item.id}
                          title="Lookup tracking info"
                        >
                          <Search className={`h-4 w-4 ${trackingItemId === item.id ? "animate-pulse" : ""}`} />
                        </Button>
                      )}
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => openEditDialog(item)}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => handleAddToInventory(item)}
                        disabled={addingToInventory === item.id}
                        title="Add to Inventory"
                      >
                        <PackagePlus className={`h-4 w-4 ${addingToInventory === item.id ? "animate-pulse" : ""}`} />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => handleDeleteItem(item.id)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Shipping Item</DialogTitle>
          </DialogHeader>
          <ShippingItemForm 
            onSubmit={handleAddItem} 
            submitLabel="Add Item" 
          />
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={(open) => {
        setEditDialogOpen(open)
        if (!open) setEditingItem(null)
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Shipping Item</DialogTitle>
          </DialogHeader>
          <ShippingItemForm 
            onSubmit={handleEditItem} 
            defaultValues={editingItem}
            submitLabel="Save Changes" 
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
