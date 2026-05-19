"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { updateStaffingAssignment } from "./actions"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"

interface EditRoleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  assignment: {
    id: string
    roleId: string
    personId: string
    memo?: string | null
    role: { id: string; name: string }
    person: { id: string; name: string }
  }
  roles: { id: string; name: string; billRate: number }[]
  people: { id: string; name: string; clientBillRate: number }[]
}

export function EditRoleDialog({
  open,
  onOpenChange,
  assignment,
  roles,
  people,
}: EditRoleDialogProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [roleId, setRoleId] = useState(assignment.roleId)
  const [personId, setPersonId] = useState(assignment.personId)
  const [memo, setMemo] = useState(assignment.memo || "")

  useEffect(() => {
    setRoleId(assignment.roleId)
    setPersonId(assignment.personId)
    setMemo(assignment.memo || "")
  }, [assignment])

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
      await updateStaffingAssignment({
        assignmentId: assignment.id,
        roleId,
        personId,
        memo: memo.trim() || undefined,
      })
      
      toast({
        title: "Assignment updated",
        description: "Successfully updated staffing assignment",
      })
      
      onOpenChange(false)
      router.refresh()
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update assignment",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Role Assignment</DialogTitle>
          <DialogDescription>
            Change the role or person for this assignment.
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

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
