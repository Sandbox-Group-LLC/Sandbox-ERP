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
import { createTemplateTask, updateTemplateTask } from "../actions"

interface TemplateTaskDialogProps {
  children: React.ReactNode
  templateId: string
  task?: {
    id: string
    title: string
    milestone: string | null
    offsetDaysFromStart: number
    defaultOwnerRole: string | null
  }
}

export function TemplateTaskDialog({
  children,
  templateId,
  task,
}: TemplateTaskDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    formData.set("templateId", templateId)

    try {
      if (task) {
        await updateTemplateTask(task.id, formData)
      } else {
        await createTemplateTask(formData)
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task ? "Edit Task" : "Add Task"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              name="title"
              defaultValue={task?.title}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="milestone">Milestone</Label>
            <Input
              id="milestone"
              name="milestone"
              placeholder="e.g., Pre-Production, Onsite"
              defaultValue={task?.milestone || ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="offsetDaysFromStart">Days from Project Start</Label>
            <Input
              id="offsetDaysFromStart"
              name="offsetDaysFromStart"
              type="number"
              defaultValue={task?.offsetDaysFromStart || 0}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="defaultOwnerRole">Default Owner Role</Label>
            <Input
              id="defaultOwnerRole"
              name="defaultOwnerRole"
              placeholder="e.g., Project Manager"
              defaultValue={task?.defaultOwnerRole || ""}
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
              {loading ? "Saving..." : task ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
