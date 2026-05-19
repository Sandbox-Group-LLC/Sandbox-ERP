"use client"

import { useState, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { bulkUpsertStaffingAllocations, updateStaffingPlanDates, deleteStaffingAssignment } from "./actions"
import { ChevronLeft, ChevronRight, Save, RotateCcw, Plus, Trash2, Pencil } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { AddRoleDialog } from "./add-role-dialog"
import { EditRoleDialog } from "./edit-role-dialog"

interface StaffingAssignment {
  id: string
  roleId: string
  personId: string
  billRate: number
  costRate: number
  clientBillRate: number
  memo?: string | null
  startDate: Date
  endDate: Date
  role: { id: string; name: string }
  person: { id: string; name: string }
  allocations: {
    id: string
    weekStartDate: Date
    plannedHours: number
  }[]
}

interface StaffingPlanGridProps {
  staffingPlan: {
    id: string
    startDate: Date
    endDate: Date
  }
  assignments: StaffingAssignment[]
  roles: { id: string; name: string; billRate: number }[]
  people: { id: string; name: string; clientBillRate: number }[]
  projectId: string
  userRole: string
}

function normalizeToMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function addWeeksUTC(date: Date, weeks: number): Date {
  return new Date(date.getTime() + weeks * 7 * 24 * 60 * 60 * 1000)
}

function getWeeksBetween(start: Date, end: Date): Date[] {
  const weeks: Date[] = []
  let current = normalizeToMonday(start)
  const endNorm = normalizeToMonday(end)
  
  while (current.getTime() <= endNorm.getTime()) {
    weeks.push(new Date(current))
    current = addWeeksUTC(current, 1)
  }
  
  return weeks
}

function formatWeekHeader(date: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}`
}

export function StaffingPlanGrid({
  staffingPlan,
  assignments,
  roles,
  people,
  projectId,
  userRole,
}: StaffingPlanGridProps) {
  const isAdmin = userRole === "ADMIN"
  const router = useRouter()
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editingAssignment, setEditingAssignment] = useState<StaffingAssignment | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  
  const buildAllocationsMap = useCallback(() => {
    const map: Record<string, Record<string, number>> = {}
    for (const assignment of assignments) {
      if (!map[assignment.id]) {
        map[assignment.id] = {}
      }
      for (const alloc of assignment.allocations) {
        const weekKey = normalizeToMonday(alloc.weekStartDate).toISOString()
        map[assignment.id][weekKey] = Number(alloc.plannedHours)
      }
    }
    return map
  }, [assignments])

  const [savedAllocations, setSavedAllocations] = useState(() => buildAllocationsMap())
  const [localAllocations, setLocalAllocations] = useState(() => buildAllocationsMap())
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set())

  const hasDirtyChanges = dirtyKeys.size > 0

  const weeks = useMemo(
    () => getWeeksBetween(staffingPlan.startDate, staffingPlan.endDate),
    [staffingPlan.startDate, staffingPlan.endDate]
  )

  const handleHoursChange = useCallback(
    (assignmentId: string, weekStartDate: Date, hours: number) => {
      const weekKey = weekStartDate.toISOString()
      const dirtyKey = `${assignmentId}::${weekKey}`
      
      setLocalAllocations((prev) => ({
        ...prev,
        [assignmentId]: {
          ...(prev[assignmentId] || {}),
          [weekKey]: hours,
        },
      }))
      
      setDirtyKeys((prev) => new Set(prev).add(dirtyKey))
    },
    []
  )

  const handleSave = useCallback(async () => {
    if (dirtyKeys.size === 0) return
    
    setSaving(true)
    
    try {
      const allocationsToSave: Array<{
        assignmentId: string
        weekStartDate: Date
        plannedHours: number
      }> = []
      
      for (const dirtyKey of Array.from(dirtyKeys)) {
        const parts = dirtyKey.split("::")
        const assignmentId = parts[0]
        const weekKey = parts[1]
        const hours = localAllocations[assignmentId]?.[weekKey] || 0
        
        allocationsToSave.push({
          assignmentId,
          weekStartDate: new Date(weekKey),
          plannedHours: hours,
        })
      }

      await bulkUpsertStaffingAllocations({
        staffingPlanId: staffingPlan.id,
        allocations: allocationsToSave,
      })
      
      setSavedAllocations({ ...localAllocations })
      setDirtyKeys(new Set())
      
      toast({
        title: "Saved",
        description: "Changes saved successfully.",
      })
      
      router.refresh()
    } catch (error) {
      console.error("Failed to save:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save changes",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }, [dirtyKeys, localAllocations, staffingPlan.id, toast, router])

  const handleDiscard = useCallback(() => {
    setLocalAllocations({ ...savedAllocations })
    setDirtyKeys(new Set())
    toast({
      title: "Changes discarded",
      description: "Your unsaved changes have been discarded.",
    })
  }, [savedAllocations, toast])

  const handleDeleteAssignment = useCallback(async (assignmentId: string) => {
    if (!confirm("Are you sure you want to delete this assignment?")) return
    
    setDeleting(assignmentId)
    try {
      await deleteStaffingAssignment(assignmentId)
      toast({
        title: "Deleted",
        description: "Assignment deleted successfully.",
      })
      router.refresh()
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete assignment",
        variant: "destructive",
      })
    } finally {
      setDeleting(null)
    }
  }, [router, toast])

  const handleExtendWeeks = async (direction: "before" | "after") => {
    const newStart =
      direction === "before"
        ? addWeeksUTC(new Date(staffingPlan.startDate), -4)
        : new Date(staffingPlan.startDate)
    const newEnd =
      direction === "after"
        ? addWeeksUTC(new Date(staffingPlan.endDate), 4)
        : new Date(staffingPlan.endDate)
    
    await updateStaffingPlanDates(staffingPlan.id, newStart, newEnd)
    router.refresh()
  }

  const summary = useMemo(() => {
    let totalRevenue = 0
    let totalCost = 0
    
    for (const assignment of assignments) {
      const allocMap = localAllocations[assignment.id] || {}
      let totalHours = 0
      for (const hours of Object.values(allocMap)) {
        totalHours += hours
      }
      
      const clientRate = assignment.clientBillRate || 0
      const internalBill = assignment.billRate || 0
      
      totalRevenue += clientRate * totalHours
      totalCost += internalBill * totalHours
    }
    
    const margin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0
    
    return { totalRevenue, totalCost, margin }
  }, [assignments, localAllocations])

  if (roles.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-gray-500">
            No staffing roles have been configured for your organization.
          </p>
          <p className="text-sm text-gray-400 mt-2">
            Please contact an administrator to add staffing roles.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {userRole !== "MEMBER" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-green-600">
                  ${summary.totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
                <div className="text-sm text-gray-500">Client Revenue</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">
                  ${summary.totalCost.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
                <div className="text-sm text-gray-500">Internal Cost</div>
              </div>
              <div>
                <div className={`text-2xl font-bold ${summary.margin >= 0 ? "text-blue-600" : "text-red-600"}`}>
                  {summary.margin.toFixed(1)}%
                </div>
                <div className="text-sm text-gray-500">Margin</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg">Staffing Plan</CardTitle>
          <div className="flex items-center gap-2">
            {hasDirtyChanges && (
              <>
                <Button variant="outline" size="sm" onClick={handleDiscard}>
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Discard
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  <Save className="h-4 w-4 mr-1" />
                  {saving ? "Saving..." : "Save"}
                </Button>
              </>
            )}
            <Button onClick={() => setAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Role
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-20">
                <tr className="border-b bg-muted">
                  <th className="py-2 px-3 text-left font-semibold sticky left-0 bg-muted z-30 min-w-[120px]">
                    Role
                  </th>
                  <th className="py-2 px-3 text-left font-semibold sticky left-[120px] bg-muted z-30 min-w-[120px]">
                    Person
                  </th>
                  {isAdmin && (
                    <>
                      <th className="py-2 px-1 text-center font-semibold min-w-[80px]">
                        Client Rate
                      </th>
                      <th className="py-2 px-1 text-center font-semibold min-w-[90px]">
                        Client Total
                      </th>
                    </>
                  )}
                  <th className="py-2 px-1 text-center font-semibold">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleExtendWeeks("before")}
                      className="h-6 w-6 p-0"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                  </th>
                  {weeks.map((week) => (
                    <th key={week.toISOString()} className="py-2 px-1 text-center font-semibold min-w-[64px]">
                      {formatWeekHeader(week)}
                    </th>
                  ))}
                  <th className="py-2 px-1 text-center font-semibold">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleExtendWeeks("after")}
                      className="h-6 w-6 p-0"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </th>
                  <th className="py-2 px-3 text-right font-semibold sticky right-[100px] bg-muted z-30 min-w-[60px]">
                    Hours
                  </th>
                  <th className="py-2 px-3 text-center font-semibold sticky right-0 bg-muted z-30 min-w-[100px]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {assignments.length === 0 ? (
                  <tr>
                    <td colSpan={weeks.length + (isAdmin ? 6 : 5)} className="py-8 text-center text-gray-500">
                      No assignments yet. Click &quot;Add Role&quot; to add one.
                    </td>
                  </tr>
                ) : (
                  assignments.map((assignment) => {
                    const allocMap = localAllocations[assignment.id] || {}
                    let totalHours = 0
                    for (const hours of Object.values(allocMap)) {
                      totalHours += hours
                    }
                    
                    return (
                      <tr key={assignment.id} className="border-b hover:bg-muted/50">
                        <td className="py-2 px-3 font-medium sticky left-0 bg-background z-10 min-w-[120px]">
                          <div>{assignment.role.name}</div>
                          {assignment.memo && (
                            <div className="text-xs text-muted-foreground font-normal">{assignment.memo}</div>
                          )}
                        </td>
                        <td className="py-2 px-3 sticky left-[120px] bg-background z-10 min-w-[120px]">
                          {assignment.person.name}
                        </td>
                        {isAdmin && (
                          <>
                            <td className="py-2 px-1 text-center text-sm text-muted-foreground">
                              ${assignment.clientBillRate.toFixed(0)}/hr
                            </td>
                            <td className="py-2 px-1 text-center text-sm font-medium">
                              ${(assignment.clientBillRate * totalHours).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </td>
                          </>
                        )}
                        <td className="py-1 px-1"></td>
                        {weeks.map((week) => {
                          const weekKey = week.toISOString()
                          const hours = allocMap[weekKey] || 0
                          const dirtyKey = `${assignment.id}::${weekKey}`
                          const isDirty = dirtyKeys.has(dirtyKey)
                          
                          return (
                            <td key={weekKey} className="py-1 px-1">
                              <Input
                                type="number"
                                min={0}
                                step={0.5}
                                value={hours || ""}
                                placeholder="0"
                                className={`w-16 text-center text-sm h-8 ${
                                  isDirty ? "bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-600" : ""
                                }`}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0
                                  handleHoursChange(assignment.id, week, val)
                                }}
                              />
                            </td>
                          )
                        })}
                        <td className="py-1 px-1"></td>
                        <td className="py-2 px-3 text-right font-medium sticky right-[100px] bg-background z-10">
                          {totalHours.toFixed(1)}
                        </td>
                        <td className="py-2 px-3 text-center sticky right-0 bg-background z-10">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                              onClick={() => setEditingAssignment(assignment)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => handleDeleteAssignment(assignment.id)}
                              disabled={deleting === assignment.id}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <AddRoleDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        staffingPlanId={staffingPlan.id}
        roles={roles}
        people={people}
        defaultStartDate={staffingPlan.startDate}
        defaultEndDate={staffingPlan.endDate}
      />

      {editingAssignment && (
        <EditRoleDialog
          open={!!editingAssignment}
          onOpenChange={(open) => !open && setEditingAssignment(null)}
          assignment={editingAssignment}
          roles={roles}
          people={people}
        />
      )}
    </div>
  )
}
