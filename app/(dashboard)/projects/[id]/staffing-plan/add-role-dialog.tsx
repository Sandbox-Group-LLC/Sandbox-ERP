"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createStaffingAssignment } from "./actions"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"

interface AddRoleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  staffingPlanId: string
  roles: { id: string; name: string; billRate: number }[]
  people: { id: string; name: string; clientBillRate: number }[]
  defaultStartDate: Date
  defaultEndDate: Date
}

export function AddRoleDialog({
  open,
  onOpenChange,
  staffingPlanId,
  roles,
  people,
  defaultStartDate,
  defaultEndDate,
}: AddRoleDialogProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [roleId, setRoleId] = useState("")
  const [personId, setPersonId] = useState("")
  const [memo, setMemo] = useState("")
  const [startDate, setStartDate] = useState(defaultStartDate.toISOString().split("T")[0])
  const [endDate, setEndDate] = useState(defaultEndDate.toISOString().split("T")[0])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!roleId || !personId) {
      toast({
        title: "Missing fields",
        description: "Please select both a role and a person",
        variant: "destructive",
      })
      return
    }

    setSaving(true)
    try {
      await createStaffingAssignment({
        staffingPlanId,
        roleId,
        personId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        memo: memo.trim() || undefined,
      })
      
      toast({
        title: "Assignment created",
        description: "Successfully added new staffing assignment",
      })
      
      setRoleId("")
      setPersonId("")
      setMemo("")
      onOpenChange(false)
      router.refresh()
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create assignment",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Role Assignment</DialogTitle>
          <DialogDescription>
            Assign a person to a role for this project&apos;s staffing plan.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name} (${role.billRate}/hr)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="person">Person</Label>
            <Select value={personId} onValueChange={setPersonId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a person" />
              </SelectTrigger>
              <SelectContent>
                {people.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="memo">Memo (optional)</Label>
            <Input
              id="memo"
              placeholder="e.g., Lead Designer, On-site Coordinator"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                type="date"
                id="startDate"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End Date</Label>
              <Input
                type="date"
                id="endDate"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Adding..." : "Add Assignment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
