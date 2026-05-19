"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Upload, X, ExternalLink, Loader2, ImageIcon } from "lucide-react"
import { useStorageUrl } from "@/hooks/use-storage-url"

const CATEGORIES = ["Decor", "Furniture", "AV", "Merch", "Supplies", "Signage", "Fabricated", "Other"] as const
const CONDITIONS = ["Excellent", "Good", "Fair", "Poor", "Damaged"] as const
const STATUSES = ["Available", "Reserved", "InUse", "InTransit", "Retired"] as const

const assetSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  category: z.enum(CATEGORIES),
  condition: z.enum(CONDITIONS),
  status: z.enum(STATUSES),
  quantity: z.coerce.number().int().min(0).default(1),
  location: z.string().optional(),
  barcode: z.string().optional(),
  purchaseDate: z.string().optional(),
  purchaseCost: z.coerce.number().min(0).optional().or(z.literal("")),
  currentValue: z.coerce.number().min(0).optional().or(z.literal("")),
  purchaseUrl: z.string().url().optional().or(z.literal("")),
  notes: z.string().optional(),
})

type AssetFormData = z.infer<typeof assetSchema>

type Asset = {
  id: string
  assetCode?: string | null
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

interface AssetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  asset: Asset | null
  onSuccess: () => void
}

export function AssetDialog({ open, onOpenChange, asset, onSuccess }: AssetDialogProps) {
  const { toast } = useToast()
  const isEditing = !!asset
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [fetchingImage, setFetchingImage] = useState(false)
  const [directImageUrl, setDirectImageUrl] = useState("")
  const [importingDirectUrl, setImportingDirectUrl] = useState(false)
  
  // Resolve storage URLs to signed URLs for display
  const displayImageUrl = useStorageUrl(imageUrl)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AssetFormData>({
    resolver: zodResolver(assetSchema),
    defaultValues: {
      name: "",
      description: "",
      category: "Other",
      condition: "Good",
      status: "Available",
      quantity: 1,
      location: "",
      barcode: "",
      purchaseDate: "",
      purchaseCost: "",
      currentValue: "",
      purchaseUrl: "",
      notes: "",
    },
  })

  const category = watch("category")
  const condition = watch("condition")
  const status = watch("status")

  // Reset form when dialog opens or asset changes
  useEffect(() => {
    if (open) {
      if (asset) {
        reset({
          name: asset.name,
          description: asset.description || "",
          category: asset.category as typeof CATEGORIES[number],
          condition: asset.condition as typeof CONDITIONS[number],
          status: asset.status as typeof STATUSES[number],
          quantity: asset.quantity,
          location: asset.location || "",
          barcode: asset.barcode || "",
          purchaseDate: asset.purchaseDate ? asset.purchaseDate.split("T")[0] : "",
          purchaseCost: asset.purchaseCost ?? "",
          currentValue: asset.currentValue ?? "",
          purchaseUrl: asset.purchaseUrl || "",
          notes: asset.notes || "",
        })
        setImageUrl(asset.imageUrl || null)
        setDirectImageUrl("")
      } else {
        reset({
          name: "",
          description: "",
          category: "Other",
          condition: "Good",
          status: "Available",
          quantity: 1,
          location: "",
          barcode: "",
          purchaseDate: "",
          purchaseCost: "",
          currentValue: "",
          purchaseUrl: "",
          notes: "",
        })
        setImageUrl(null)
        setDirectImageUrl("")
      }
    }
  }, [open, asset, reset])

  function handleOpenChange(newOpen: boolean) {
    if (newOpen) {
      if (asset) {
        reset({
          name: asset.name,
          description: asset.description || "",
          category: asset.category as typeof CATEGORIES[number],
          condition: asset.condition as typeof CONDITIONS[number],
          status: asset.status as typeof STATUSES[number],
          quantity: asset.quantity,
          location: asset.location || "",
          barcode: asset.barcode || "",
          purchaseDate: asset.purchaseDate ? asset.purchaseDate.split("T")[0] : "",
          purchaseCost: asset.purchaseCost ?? "",
          currentValue: asset.currentValue ?? "",
          purchaseUrl: asset.purchaseUrl || "",
          notes: asset.notes || "",
        })
        setImageUrl(asset.imageUrl || null)
        setDirectImageUrl("")
      } else {
        reset({
          name: "",
          description: "",
          category: "Other",
          condition: "Good",
          status: "Available",
          quantity: 1,
          location: "",
          barcode: "",
          purchaseDate: "",
          purchaseCost: "",
          currentValue: "",
          purchaseUrl: "",
          notes: "",
        })
        setImageUrl(null)
        setDirectImageUrl("")
      }
    }
    onOpenChange(newOpen)
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file", variant: "destructive" })
      return
    }

    setUploading(true)
    try {
      const response = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type,
          uploadType: "asset-photo",
        }),
      })

      if (!response.ok) throw new Error("Failed to get upload URL")

      const { uploadUrl, fileUrl } = await response.json()

      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      })

      if (!uploadResponse.ok) throw new Error("Failed to upload file")

      setImageUrl(fileUrl)
      toast({ title: "Photo uploaded", description: "Asset photo uploaded successfully" })
    } catch (error) {
      toast({ title: "Upload failed", description: "Failed to upload photo", variant: "destructive" })
    } finally {
      setUploading(false)
      e.target.value = ""
    }
  }

  async function handleFetchImage() {
    const purchaseUrl = watch("purchaseUrl")
    if (!purchaseUrl) {
      toast({ title: "No URL", description: "Enter a purchase link first", variant: "destructive" })
      return
    }

    setFetchingImage(true)
    try {
      // The API handles everything: fetch page, extract OG image, download, and save to Object Storage
      const response = await fetch("/api/fetch-og-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: purchaseUrl }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to fetch image")
      }

      const { imageUrl: savedImageUrl } = await response.json()
      setImageUrl(savedImageUrl)
      toast({ title: "Image fetched", description: "Product image imported successfully" })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch image"
      toast({ title: "Fetch failed", description: message, variant: "destructive" })
    } finally {
      setFetchingImage(false)
    }
  }

  async function handleImportDirectUrl() {
    if (!directImageUrl.trim()) {
      toast({ title: "No URL", description: "Paste an image URL first", variant: "destructive" })
      return
    }

    // Basic validation - must look like an image URL
    const url = directImageUrl.trim()
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      toast({ title: "Invalid URL", description: "URL must start with http:// or https://", variant: "destructive" })
      return
    }

    setImportingDirectUrl(true)
    try {
      const response = await fetch("/api/import-image-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: url }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to import image")
      }

      const { imageUrl: savedImageUrl } = await response.json()
      setImageUrl(savedImageUrl)
      setDirectImageUrl("")
      toast({ title: "Image imported", description: "Photo imported successfully" })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to import image"
      toast({ title: "Import failed", description: message, variant: "destructive" })
    } finally {
      setImportingDirectUrl(false)
    }
  }

  async function onSubmit(data: AssetFormData) {
    try {
      const payload = {
        name: data.name,
        description: data.description || null,
        category: data.category,
        condition: data.condition,
        status: data.status,
        quantity: data.quantity,
        location: data.location || null,
        barcode: data.barcode || null,
        purchaseDate: data.purchaseDate || null,
        purchaseCost: data.purchaseCost === "" ? null : Number(data.purchaseCost),
        currentValue: data.currentValue === "" ? null : Number(data.currentValue),
        imageUrl: imageUrl,
        purchaseUrl: data.purchaseUrl || null,
        notes: data.notes || null,
      }

      const url = isEditing ? `/api/assets/${asset.id}` : "/api/assets"
      const method = isEditing ? "PATCH" : "POST"

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        toast({
          title: isEditing ? "Asset updated" : "Asset created",
          description: isEditing ? "The asset has been updated." : "The asset has been added to inventory.",
        })
        onSuccess()
      } else {
        const errorData = await response.json()
        toast({
          title: "Error",
          description: errorData.error || "Failed to save asset",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save asset",
        variant: "destructive",
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Asset" : "Add Asset"}</DialogTitle>
          {isEditing && asset?.assetCode && (
            <p className="text-sm text-muted-foreground">
              Asset ID: <code className="font-mono bg-muted px-1.5 py-0.5 rounded">{asset.assetCode}</code>
            </p>
          )}
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input id="name" {...register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" {...register("description")} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setValue("category", v as typeof CATEGORIES[number])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Condition</Label>
              <Select value={condition} onValueChange={(v) => setValue("condition", v as typeof CONDITIONS[number])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONDITIONS.map((cond) => (
                    <SelectItem key={cond} value={cond}>{cond}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setValue("status", v as typeof STATUSES[number])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s === "InUse" ? "In Use" : s === "InTransit" ? "In Transit" : s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input id="quantity" type="number" min="0" {...register("quantity")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input id="location" {...register("location")} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="barcode">Barcode</Label>
            <Input id="barcode" {...register("barcode")} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="purchaseDate">Purchase Date</Label>
              <Input id="purchaseDate" type="date" {...register("purchaseDate")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchaseCost">Purchase Cost</Label>
              <Input id="purchaseCost" type="number" step="0.01" min="0" {...register("purchaseCost")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currentValue">Current Value</Label>
              <Input id="currentValue" type="number" step="0.01" min="0" {...register("currentValue")} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="purchaseUrl">Purchase Link</Label>
            <div className="flex gap-2">
              <Input 
                id="purchaseUrl" 
                type="url" 
                placeholder="https://example.com/product"
                {...register("purchaseUrl")} 
              />
              {watch("purchaseUrl") && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => window.open(watch("purchaseUrl"), "_blank")}
                    title="Open link"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleFetchImage}
                    disabled={fetchingImage || !!imageUrl}
                    title="Fetch product image"
                  >
                    {fetchingImage ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ImageIcon className="h-4 w-4" />
                    )}
                  </Button>
                </>
              )}
            </div>
            {watch("purchaseUrl") && !imageUrl && (
              <p className="text-xs text-muted-foreground">
                Click the image icon to import the product photo from the retailer
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Asset Photo</Label>
            <div className="flex items-start gap-4">
              {imageUrl ? (
                <div className="relative">
                  {displayImageUrl ? (
                    <img
                      src={displayImageUrl}
                      alt="Asset"
                      className="w-24 h-24 object-cover rounded-lg border"
                    />
                  ) : (
                    <div className="w-24 h-24 border rounded-lg bg-muted flex items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute -top-2 -right-2 h-6 w-6"
                    onClick={() => setImageUrl(null)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="w-24 h-24 border-2 border-dashed rounded-lg flex items-center justify-center bg-muted">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 space-y-3">
                <div>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    disabled={uploading}
                    className="cursor-pointer"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {uploading ? "Uploading..." : "Upload a photo of the asset"}
                  </p>
                </div>
                {!imageUrl && (
                  <div>
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        placeholder="Or paste image URL..."
                        value={directImageUrl}
                        onChange={(e) => setDirectImageUrl(e.target.value)}
                        disabled={importingDirectUrl}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleImportDirectUrl}
                        disabled={importingDirectUrl || !directImageUrl.trim()}
                      >
                        {importingDirectUrl ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Import"
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Right-click an image and copy the image URL
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" {...register("notes")} />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
