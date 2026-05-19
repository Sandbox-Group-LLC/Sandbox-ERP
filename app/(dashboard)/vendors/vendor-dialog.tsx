"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { createVendor, updateVendor, deleteVendor, setupVendorStripeRecipient, refreshVendorStripeStatus, checkStripeConfigured } from "./actions"
import { Trash2, CreditCard, ExternalLink, RefreshCw, CheckCircle, AlertCircle, Clock, Copy } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

type StripePayoutStatus = "NOT_SETUP" | "PENDING" | "ACTIVE" | "RESTRICTED"

const payoutStatusConfig: Record<StripePayoutStatus, { label: string; color: string; icon: typeof CheckCircle }> = {
  NOT_SETUP: { label: "Not Set Up", color: "text-gray-500", icon: CreditCard },
  PENDING: { label: "Pending", color: "text-yellow-600", icon: Clock },
  ACTIVE: { label: "Active", color: "text-green-600", icon: CheckCircle },
  RESTRICTED: { label: "Restricted", color: "text-red-600", icon: AlertCircle },
}

interface VendorDialogProps {
  children: React.ReactNode
  vendor?: {
    id: string
    name: string
    email: string | null
    phone: string | null
    categories: string | null
    contactName: string | null
    website: string | null
    billingAddress: string | null
    billingCity: string | null
    billingState: string | null
    billingZip: string | null
    billingCountry: string | null
    shippingAddress: string | null
    shippingCity: string | null
    shippingState: string | null
    shippingZip: string | null
    shippingCountry: string | null
    taxId: string | null
    notes: string | null
    paymentTerms: string | null
    stripeAccountId: string | null
    stripePayoutStatus: StripePayoutStatus
  }
}

export function VendorDialog({ children, vendor }: VendorDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [stripeLoading, setStripeLoading] = useState(false)
  const [stripeConfigured, setStripeConfigured] = useState<boolean | null>(null)
  const [payoutStatus, setPayoutStatus] = useState<StripePayoutStatus>(vendor?.stripePayoutStatus || "NOT_SETUP")
  const [onboardingUrl, setOnboardingUrl] = useState<string | null>(null)
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    if (open && vendor) {
      checkStripeConfigured().then(setStripeConfigured)
    }
  }, [open, vendor])

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)

    try {
      if (vendor) {
        await updateVendor(vendor.id, formData)
      } else {
        await createVendor(formData)
      }
      setOpen(false)
      router.refresh()
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!vendor) return
    setLoading(true)
    try {
      await deleteVendor(vendor.id)
      setOpen(false)
      router.refresh()
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  async function handleSetupPayout() {
    if (!vendor) return
    setStripeLoading(true)
    try {
      const result = await setupVendorStripeRecipient(vendor.id)
      if (result.success && result.onboardingUrl) {
        setOnboardingUrl(result.onboardingUrl)
        window.open(result.onboardingUrl, "_blank")
        setPayoutStatus("PENDING")
        toast({ title: "Onboarding link ready", description: "Link opened in new tab. Use Copy Link if popup was blocked." })
      } else {
        toast({ title: "Setup failed", description: result.error, variant: "destructive" })
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to start payout setup", variant: "destructive" })
    } finally {
      setStripeLoading(false)
    }
  }

  async function handleCopyLink() {
    if (!onboardingUrl) return
    try {
      await navigator.clipboard.writeText(onboardingUrl)
      toast({ title: "Link copied!", description: "Send this link to the vendor to complete their payout setup." })
    } catch {
      toast({ title: "Copy failed", description: "Please copy manually from the text field.", variant: "destructive" })
    }
  }

  async function handleRefreshStatus() {
    if (!vendor) return
    setStripeLoading(true)
    try {
      const result = await refreshVendorStripeStatus(vendor.id)
      if (result.success && result.status) {
        setPayoutStatus(result.status)
        toast({ title: "Status refreshed", description: `Payout status: ${payoutStatusConfig[result.status].label}` })
      } else {
        toast({ title: "Refresh failed", description: result.error, variant: "destructive" })
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to refresh status", variant: "destructive" })
    } finally {
      setStripeLoading(false)
    }
  }

  const statusConfig = payoutStatusConfig[payoutStatus]
  const StatusIcon = statusConfig.icon

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{vendor ? "Edit Vendor" : "Add Vendor"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" defaultValue={vendor?.name} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={vendor?.email || ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              name="phone"
              defaultValue={vendor?.phone || ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="categories">Categories</Label>
            <Input
              id="categories"
              name="categories"
              placeholder="e.g., AV, Catering, Decor"
              defaultValue={vendor?.categories || ""}
            />
          </div>

          <Separator />
          <p className="text-sm font-medium text-muted-foreground">Contact</p>
          <div className="space-y-2">
            <Label htmlFor="contactName">Contact Name</Label>
            <Input id="contactName" name="contactName" defaultValue={vendor?.contactName || ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input id="website" name="website" type="url" defaultValue={vendor?.website || ""} />
          </div>

          <Separator />
          <p className="text-sm font-medium text-muted-foreground">Billing Address</p>
          <div className="space-y-2">
            <Label htmlFor="billingAddress">Address</Label>
            <Input id="billingAddress" name="billingAddress" defaultValue={vendor?.billingAddress || ""} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-2">
              <Label htmlFor="billingCity">City</Label>
              <Input id="billingCity" name="billingCity" defaultValue={vendor?.billingCity || ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="billingState">State</Label>
              <Input id="billingState" name="billingState" defaultValue={vendor?.billingState || ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="billingZip">Zip</Label>
              <Input id="billingZip" name="billingZip" defaultValue={vendor?.billingZip || ""} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="billingCountry">Country</Label>
            <Input id="billingCountry" name="billingCountry" defaultValue={vendor?.billingCountry || ""} />
          </div>

          <Separator />
          <p className="text-sm font-medium text-muted-foreground">Shipping Address</p>
          <div className="space-y-2">
            <Label htmlFor="shippingAddress">Address</Label>
            <Input id="shippingAddress" name="shippingAddress" defaultValue={vendor?.shippingAddress || ""} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-2">
              <Label htmlFor="shippingCity">City</Label>
              <Input id="shippingCity" name="shippingCity" defaultValue={vendor?.shippingCity || ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shippingState">State</Label>
              <Input id="shippingState" name="shippingState" defaultValue={vendor?.shippingState || ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shippingZip">Zip</Label>
              <Input id="shippingZip" name="shippingZip" defaultValue={vendor?.shippingZip || ""} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="shippingCountry">Country</Label>
            <Input id="shippingCountry" name="shippingCountry" defaultValue={vendor?.shippingCountry || ""} />
          </div>

          <Separator />
          <p className="text-sm font-medium text-muted-foreground">Additional Details</p>
          <div className="space-y-2">
            <Label htmlFor="paymentTerms">Payment Terms</Label>
            <Input id="paymentTerms" name="paymentTerms" placeholder="e.g., Net 30, Net 60" defaultValue={vendor?.paymentTerms || ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="taxId">Tax ID / EIN</Label>
            <Input id="taxId" name="taxId" defaultValue={vendor?.taxId || ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={3} defaultValue={vendor?.notes || ""} />
          </div>

          {vendor && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  <Label>Payout Setup</Label>
                </div>
                {stripeConfigured === false ? (
                  <p className="text-sm text-yellow-600">
                    Stripe is not configured. Add STRIPE_SECRET_KEY in Settings.
                  </p>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <StatusIcon className={`h-4 w-4 ${statusConfig.color}`} />
                      <span className={`text-sm ${statusConfig.color}`}>{statusConfig.label}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {payoutStatus === "NOT_SETUP" && (
                        <Button type="button" size="sm" onClick={handleSetupPayout} disabled={stripeLoading || !vendor.email}>
                          {stripeLoading ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <ExternalLink className="h-4 w-4 mr-1" />}
                          Setup
                        </Button>
                      )}
                      {payoutStatus === "PENDING" && (
                        <>
                          <Button type="button" size="sm" variant="outline" onClick={handleSetupPayout} disabled={stripeLoading}>
                            <ExternalLink className="h-4 w-4 mr-1" />
                            Get Link
                          </Button>
                          {onboardingUrl && (
                            <Button type="button" size="sm" variant="secondary" onClick={handleCopyLink}>
                              <Copy className="h-4 w-4 mr-1" />
                              Copy Link
                            </Button>
                          )}
                          <Button type="button" size="sm" variant="ghost" onClick={handleRefreshStatus} disabled={stripeLoading}>
                            <RefreshCw className={`h-4 w-4 ${stripeLoading ? "animate-spin" : ""}`} />
                          </Button>
                        </>
                      )}
                      {(payoutStatus === "ACTIVE" || payoutStatus === "RESTRICTED") && (
                        <Button type="button" size="sm" variant="ghost" onClick={handleRefreshStatus} disabled={stripeLoading}>
                          <RefreshCw className={`h-4 w-4 ${stripeLoading ? "animate-spin" : ""}`} />
                        </Button>
                      )}
                    </div>
                  </div>
                )}
                {!vendor.email && payoutStatus === "NOT_SETUP" && (
                  <p className="text-xs text-gray-500">Add an email to enable payout setup.</p>
                )}
              </div>
            </>
          )}

          <div className="flex justify-between pt-2">
            {vendor && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={loading}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : vendor ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
