"use client"

import { useState, useEffect } from "react"
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Plus, Pencil, Trash2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { getStaffingRoles, createStaffingRole, updateStaffingRole, deleteStaffingRole } from "./actions"

interface StaffingRole {
  id: string
  name: string
  roleRate: {
    internalRate: number | string
  } | null
  _count: {
    allocations: number
    budgetLineLinks: number
  }
}

export function StaffingRolesForm() {
  const [roles, setRoles] = useState<StaffingRole[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<StaffingRole | null>(null)
  const [deletingRole, setDeletingRole] = useState<StaffingRole | null>(null)
  const [roleName, setRoleName] = useState("")
  const [internalRate, setInternalRate] = useState("")
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const loadRoles = async () => {
    setLoading(true)
    try {
      const data = await getStaffingRoles()
      setRoles(data as StaffingRole[])
    } catch {
      toast({
        title: "Error",
        description: "Failed to load staffing roles",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRoles()
  }, [])

  const handleOpenDialog = (role?: StaffingRole) => {
    if (role) {
      setEditingRole(role)
      setRoleName(role.name)
      setInternalRate(role.roleRate ? String(role.roleRate.internalRate) : "0")
    } else {
      setEditingRole(null)
      setRoleName("")
      setInternalRate("0")
    }
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!roleName.trim()) {
      toast({
        title: "Error",
        description: "Role name is required",
        variant: "destructive",
      })
      return
    }

    const rate = parseFloat(internalRate) || 0
    if (rate < 0) {
      toast({
        title: "Error",
        description: "Rate cannot be negative",
        variant: "destructive",
      })
      return
    }

    setSaving(true)
    try {
      let result
      if (editingRole) {
        result = await updateStaffingRole(editingRole.id, roleName.trim(), rate)
      } else {
        result = await createStaffingRole(roleName.trim(), rate)
      }

      if (result.success) {
        toast({
          title: "Success",
          description: editingRole ? "Role updated successfully" : "Role created successfully",
        })
        setDialogOpen(false)
        loadRoles()
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to save role",
          variant: "destructive",
        })
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to save role",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingRole) return

    setSaving(true)
    try {
      const result = await deleteStaffingRole(deletingRole.id)
      if (result.success) {
        toast({
          title: "Success",
          description: "Role deleted successfully",
        })
        setDeleteDialogOpen(false)
        setDeletingRole(null)
        loadRoles()
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to delete role",
          variant: "destructive",
        })
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete role",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const formatCurrency = (value: number | string) => {
    const num = typeof value === "string" ? parseFloat(value) : value
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold dark:text-white">Staffing Roles</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage role types and hourly rates for staffing plans
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()} className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Add Role
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingRole ? "Edit Role" : "Add Role"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="roleName">Role Name</Label>
                <Input
                  id="roleName"
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  placeholder="e.g., Senior Producer"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="internalRate">Internal Rate ($/hr)</Label>
                <Input
                  id="internalRate"
                  type="number"
                  min="0"
                  step="1"
                  value={internalRate}
                  onChange={(e) => setInternalRate(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading...</div>
      ) : roles.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          No staffing roles configured. Click "Add Role" to create one.
        </div>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role Name</TableHead>
                <TableHead className="text-right">Bill Rate</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Usage</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((role) => (
                <TableRow key={role.id}>
                  <TableCell className="font-medium">{role.name}</TableCell>
                  <TableCell className="text-right">
                    {role.roleRate ? formatCurrency(role.roleRate.internalRate) : "$0"}/hr
                  </TableCell>
                  <TableCell className="text-right hidden sm:table-cell">
                    <span className="text-sm text-gray-500">
                      {role._count.allocations} alloc, {role._count.budgetLineLinks} links
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenDialog(role)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setDeletingRole(role)
                          setDeleteDialogOpen(true)
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Role</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingRole?.name}"? This action cannot be undone.
              {deletingRole && (deletingRole._count.allocations > 0 || deletingRole._count.budgetLineLinks > 0) && (
                <span className="block mt-2 text-amber-600 dark:text-amber-400">
                  Warning: This role has {deletingRole._count.allocations} allocation(s) and{" "}
                  {deletingRole._count.budgetLineLinks} budget link(s). You'll need to remove them first.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={saving}>
              {saving ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
