"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createOpportunity, updateOpportunity } from "./actions"

const JURISDICTIONS = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California",
  "California - Mountain View", "California - San Francisco",
  "California - Los Angeles (County)", "California - Los Angeles (City)",
  "California - Anaheim", "California - Indio", "Colorado", "Colorado - Aspen",
  "Connecticut", "Delaware", "District Of Columbia", "Florida",
  "Florida - Miami-Dade County", "Georgia", "Hawaii", "Idaho", "Illinois",
  "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland",
  "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri",
  "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico",
  "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon",
  "Pennsylvania", "Puerto Rico", "Rhode Island", "South Carolina",
  "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virgin Islands",
  "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"
]

interface OpportunityDialogProps {
  children: React.ReactNode
  clients: { id: string; name: string }[]
  opportunity?: {
    id: string
    clientId: string
    stage: string
    budgetRange: string | null
    eventType: string | null
    activationState: string | null
    targetStartDate: Date | null
    eventStartDate: Date | null
    eventEndDate: Date | null
    notes: string | null
  }
}

export function OpportunityDialog({
  children,
  clients,
  opportunity,
}: OpportunityDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)

    try {
      if (opportunity) {
        await updateOpportunity(opportunity.id, formData)
      } else {
        await createOpportunity(formData)
      }
      setOpen(false)
      router.refresh()
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {opportunity ? "Edit Opportunity" : "Add Opportunity"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="clientId">Client</Label>
            <Select name="clientId" defaultValue={opportunity?.clientId} required>
              <SelectTrigger>
                <SelectValue placeholder="Select a client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="stage">Stage</Label>
            <Select name="stage" defaultValue={opportunity?.stage || "Lead"}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Lead">Lead</SelectItem>
                <SelectItem value="Qualified">Qualified</SelectItem>
                <SelectItem value="Proposal">Proposal</SelectItem>
                <SelectItem value="Won">Won</SelectItem>
                <SelectItem value="Lost">Lost</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="eventType">Event Type</Label>
            <Input
              id="eventType"
              name="eventType"
              placeholder="e.g., Conference, Gala, Brand Activation"
              defaultValue={opportunity?.eventType || ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="budgetRange">Budget Range</Label>
            <Input
              id="budgetRange"
              name="budgetRange"
              placeholder="e.g., $50k-100k"
              defaultValue={opportunity?.budgetRange || ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="activationState">Activation State (For Tax Estimate)</Label>
            <Select name="activationState" defaultValue={opportunity?.activationState || ""}>
              <SelectTrigger>
                <SelectValue placeholder="Select state/location" />
              </SelectTrigger>
              <SelectContent>
                {JURISDICTIONS.map((jurisdiction) => (
                  <SelectItem key={jurisdiction} value={jurisdiction}>
                    {jurisdiction}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Used to determine tax rates for budget estimates</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="targetStartDate">Pre-Production Start Date</Label>
            <Input
              id="targetStartDate"
              name="targetStartDate"
              type="date"
              defaultValue={
                opportunity?.targetStartDate
                  ? new Date(opportunity.targetStartDate).toISOString().split("T")[0]
                  : ""
              }
            />
            <p className="text-xs text-muted-foreground">When planning/pre-production begins</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="eventStartDate">Event Start Date</Label>
              <Input
                id="eventStartDate"
                name="eventStartDate"
                type="date"
                defaultValue={
                  opportunity?.eventStartDate
                    ? new Date(opportunity.eventStartDate).toISOString().split("T")[0]
                    : ""
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eventEndDate">Event End Date</Label>
              <Input
                id="eventEndDate"
                name="eventEndDate"
                type="date"
                defaultValue={
                  opportunity?.eventEndDate
                    ? new Date(opportunity.eventEndDate).toISOString().split("T")[0]
                    : ""
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={opportunity?.notes || ""}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : opportunity ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
