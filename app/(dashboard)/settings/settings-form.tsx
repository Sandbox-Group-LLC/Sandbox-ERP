"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { updateOrganization } from "./actions"

interface SettingsFormProps {
  organizationId: string
  currentName: string
}

export function SettingsForm({ organizationId, currentName }: SettingsFormProps) {
  const [name, setName] = useState(currentName)
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) {
      toast({
        title: "Error",
        description: "Organization name cannot be empty",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)
    try {
      const result = await updateOrganization(organizationId, name.trim())
      if (result.success) {
        toast({
          title: "Success",
          description: "Organization name updated successfully",
        })
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to update organization",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold mb-4 dark:text-white">Organization Details</h2>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Organization Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter organization name"
            />
          </div>
        </div>
      </div>

      <Button type="submit" disabled={isLoading || name === currentName}>
        {isLoading ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  )
}
