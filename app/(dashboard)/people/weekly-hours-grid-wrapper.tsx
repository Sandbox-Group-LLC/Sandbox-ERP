"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { WeeklyHoursGrid } from "./weekly-hours-grid"

interface Allocation {
  personId: string
  weekStartDate: string
  plannedHours: number
  projectName: string
}

interface Person {
  id: string
  name: string
  type: string
}

interface WeeklyHoursGridWrapperProps {
  people: Person[]
  allocations: Allocation[]
}

export function WeeklyHoursGridWrapper({ people, allocations }: WeeklyHoursGridWrapperProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Weekly Hours by Person</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="h-8 w-full bg-muted animate-pulse rounded" />
            <div className="h-8 w-full bg-muted animate-pulse rounded" />
            <div className="h-8 w-full bg-muted animate-pulse rounded" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return <WeeklyHoursGrid people={people} allocations={allocations} />
}
