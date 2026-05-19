"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { updateProject, updateClientTeamMembers } from "./actions"
import { Plus, Trash2 } from "lucide-react"

type ClientTeamMember = { name: string; email: string }

interface ProjectSettingsProps {
  project: {
    id: string
    name: string
    eventType: string | null
    city: string | null
    venue: string | null
    startDate: Date | null
    endDate: Date | null
    status: string
    ownerUserId: string | null
    budgetThreshold: number | null
    masterProductionDocUrl: string | null
    proofSheetFolderId: string | null
    assetSheetFolderId: string | null
    budgetSheetFolderId: string | null
    clientTeamMembers: ClientTeamMember[] | null
  }
  users: { id: string; name: string }[]
}

export function ProjectSettings({ project, users }: ProjectSettingsProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [teamMembers, setTeamMembers] = useState<ClientTeamMember[]>(
    (project.clientTeamMembers as ClientTeamMember[]) || []
  )
  const [teamSaving, setTeamSaving] = useState(false)
  const [teamSaved, setTeamSaved] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setSaved(false)

    const formData = new FormData(e.currentTarget)

    try {
      await updateProject(project.id, formData)
      setSaved(true)
      router.refresh()
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setLoading(false)
    }
  }

  function addTeamMember() {
    setTeamMembers([...teamMembers, { name: "", email: "" }])
  }

  function removeTeamMember(index: number) {
    const updated = teamMembers.filter((_, i) => i !== index)
    setTeamMembers(updated)
    saveTeamMembers(updated)
  }

  function updateTeamMember(index: number, field: "name" | "email", value: string) {
    const updated = teamMembers.map((m, i) => i === index ? { ...m, [field]: value } : m)
    setTeamMembers(updated)
  }

  async function saveTeamMembers(members?: ClientTeamMember[]) {
    setTeamSaving(true)
    setTeamSaved(false)
    try {
      await updateClientTeamMembers(project.id, members || teamMembers)
      setTeamSaved(true)
      router.refresh()
      setTimeout(() => setTeamSaved(false), 3000)
    } finally {
      setTeamSaving(false)
    }
  }

  return (
    <div className="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle>Project Settings</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-6 max-w-xl">
          <div className="space-y-2">
            <Label htmlFor="name">Project Name</Label>
            <Input id="name" name="name" defaultValue={project.name} required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="eventType">Event Type</Label>
              <Input
                id="eventType"
                name="eventType"
                defaultValue={project.eventType || ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select name="status" defaultValue={project.status}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Draft">Draft</SelectItem>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Onsite">Onsite</SelectItem>
                  <SelectItem value="Closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" name="city" defaultValue={project.city || ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="venue">Venue</Label>
              <Input id="venue" name="venue" defaultValue={project.venue || ""} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                name="startDate"
                type="date"
                defaultValue={
                  project.startDate
                    ? new Date(project.startDate).toISOString().split("T")[0]
                    : ""
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                name="endDate"
                type="date"
                defaultValue={
                  project.endDate
                    ? new Date(project.endDate).toISOString().split("T")[0]
                    : ""
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ownerUserId">Project Owner</Label>
            <Select name="ownerUserId" defaultValue={project.ownerUserId || ""}>
              <SelectTrigger>
                <SelectValue placeholder="Select owner" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="budgetThreshold">Budget Threshold</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                id="budgetThreshold"
                name="budgetThreshold"
                type="number"
                step="0.01"
                min="0"
                className="pl-7"
                placeholder="Enter budget threshold"
                defaultValue={project.budgetThreshold?.toString() || ""}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Target budget amount to compare against the current budget total
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="masterProductionDocUrl">Master Production Doc URL</Label>
            <Input
              id="masterProductionDocUrl"
              name="masterProductionDocUrl"
              type="url"
              placeholder="https://docs.google.com/spreadsheets/d/..."
              defaultValue={project.masterProductionDocUrl || ""}
            />
            <p className="text-xs text-muted-foreground">
              Link to a Google Sheet used as the master production document
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="proofSheetFolderId">Proof Sheet Drive Folder</Label>
            <Input
              id="proofSheetFolderId"
              name="proofSheetFolderId"
              placeholder="Paste folder URL or ID"
              defaultValue={project.proofSheetFolderId || ""}
            />
            <p className="text-xs text-muted-foreground">
              Paste the Google Drive folder URL or ID where the proof tracking sheet will be created
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="assetSheetFolderId">Asset Load List Drive Folder</Label>
            <Input
              id="assetSheetFolderId"
              name="assetSheetFolderId"
              placeholder="Paste folder URL or ID"
              defaultValue={project.assetSheetFolderId || ""}
            />
            <p className="text-xs text-muted-foreground">
              Paste the Google Drive folder URL or ID where the asset load list sheet will be created
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="budgetSheetFolderId">Budget Sheet Drive Folder</Label>
            <Input
              id="budgetSheetFolderId"
              name="budgetSheetFolderId"
              placeholder="Paste folder URL or ID"
              defaultValue={project.budgetSheetFolderId || ""}
            />
            <p className="text-xs text-muted-foreground">
              Paste the Google Drive folder URL or ID where the client budget sheet will be created
            </p>
          </div>

          <div className="flex items-center gap-4">
            <Button type="submit" disabled={loading} className="w-full sm:w-auto">
              {loading ? "Saving..." : "Save Changes"}
            </Button>
            {saved && (
              <span className="text-sm text-green-600">Changes saved!</span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Client Team</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={addTeamMember} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-1" />
            Add Member
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {teamMembers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No client team members added yet.</p>
        ) : (
          <div className="space-y-3">
            {teamMembers.map((member, index) => (
              <div key={index} className="flex flex-col sm:flex-row gap-2 items-start sm:items-end">
                <div className="flex-1 w-full space-y-1">
                  <Label className="text-xs">Name</Label>
                  <Input
                    value={member.name}
                    onChange={(e) => updateTeamMember(index, "name", e.target.value)}
                    placeholder="Full name"
                  />
                </div>
                <div className="flex-1 w-full space-y-1">
                  <Label className="text-xs">Email</Label>
                  <Input
                    type="email"
                    value={member.email}
                    onChange={(e) => updateTeamMember(index, "email", e.target.value)}
                    placeholder="email@company.com"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-destructive hover:text-destructive"
                  onClick={() => removeTeamMember(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-4 mt-4">
          <Button
            type="button"
            onClick={() => saveTeamMembers()}
            disabled={teamSaving}
            className="w-full sm:w-auto"
          >
            {teamSaving ? "Saving..." : "Save Client Team"}
          </Button>
          {teamSaved && (
            <span className="text-sm text-green-600">Client team saved!</span>
          )}
        </div>
      </CardContent>
    </Card>
    </div>
  )
}
