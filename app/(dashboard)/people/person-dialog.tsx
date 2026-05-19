"use client"

import { useState } from "react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createPerson, updatePerson, deletePerson } from "./actions"
import { Trash2 } from "lucide-react"

interface PersonDialogProps {
  children: React.ReactNode
  person?: {
    id: string
    name: string
    type: string
    email: string | null
    phone?: string | null
    defaultCostRate: number
    defaultBillRate: number
    clientBillRate: number
    portfolioUrl?: string | null
    emergencyContactName?: string | null
    emergencyContactPhone?: string | null
  }
}

export function PersonDialog({ children, person }: PersonDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)

    try {
      if (person) {
        await updatePerson(person.id, formData)
      } else {
        await createPerson(formData)
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
    if (!person) return
    setLoading(true)
    try {
      await deletePerson(person.id)
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
      <DialogTrigger asChild onClick={() => setOpen(true)}>{children}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{person ? "Edit Person" : "Add Person"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" defaultValue={person?.name} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="type">Type</Label>
            <Select name="type" defaultValue={person?.type || "Employee"}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Employee">Employee</SelectItem>
                <SelectItem value="Freelancer">Freelancer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={person?.email || ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={person?.phone || ""}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="defaultBillRate">Internal Bill Rate</Label>
              <Input
                id="defaultBillRate"
                name="defaultBillRate"
                type="number"
                step="0.01"
                defaultValue={person?.defaultBillRate || 0}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="defaultCostRate">Internal Cost Rate</Label>
              <Input
                id="defaultCostRate"
                name="defaultCostRate"
                type="number"
                step="0.01"
                defaultValue={person?.defaultCostRate || 0}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clientBillRate">Client Bill Rate</Label>
              <Input
                id="clientBillRate"
                name="clientBillRate"
                type="number"
                step="0.01"
                defaultValue={person?.clientBillRate || 0}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="portfolioUrl">Portfolio URL</Label>
            <Input
              id="portfolioUrl"
              name="portfolioUrl"
              type="url"
              placeholder="https://..."
              defaultValue={person?.portfolioUrl || ""}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="emergencyContactName">Emergency Contact Name</Label>
              <Input
                id="emergencyContactName"
                name="emergencyContactName"
                defaultValue={person?.emergencyContactName || ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emergencyContactPhone">Emergency Contact Phone</Label>
              <Input
                id="emergencyContactPhone"
                name="emergencyContactPhone"
                type="tel"
                defaultValue={person?.emergencyContactPhone || ""}
              />
            </div>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
            {person && (
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
                {loading ? "Saving..." : person ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
