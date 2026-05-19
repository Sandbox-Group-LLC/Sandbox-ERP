"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react"
import { format, startOfWeek, addWeeks, addMonths, isSameWeek, isWithinInterval, endOfWeek, parseISO } from "date-fns"
import Link from "next/link"

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

interface WeeklyHoursGridProps {
  people: Person[]
  allocations: Allocation[]
}

export function WeeklyHoursGrid({ people, allocations }: WeeklyHoursGridProps) {
  const [periodStart, setPeriodStart] = useState(() => {
    return startOfWeek(new Date(), { weekStartsOn: 1 })
  })

  const weeks = useMemo(() => {
    const result: Date[] = []
    let current = periodStart
    for (let i = 0; i < 9; i++) {
      result.push(current)
      current = addWeeks(current, 1)
    }
    return result
  }, [periodStart])

  const hoursMap = useMemo(() => {
    const map = new Map<string, Map<string, number>>()
    
    people.forEach(person => {
      map.set(person.id, new Map())
    })
    
    allocations.forEach(alloc => {
      const personMap = map.get(alloc.personId)
      if (!personMap) return
      
      const allocDateStr = alloc.weekStartDate.split('T')[0]
      
      weeks.forEach(week => {
        const weekKey = format(week, "yyyy-MM-dd")
        if (allocDateStr === weekKey) {
          const current = personMap.get(weekKey) || 0
          personMap.set(weekKey, current + alloc.plannedHours)
        }
      })
    })
    
    return map
  }, [people, allocations, weeks])

  const projectBreakdownMap = useMemo(() => {
    const map = new Map<string, Map<string, { project: string; hours: number }[]>>()
    
    people.forEach(person => {
      map.set(person.id, new Map())
    })
    
    allocations.forEach(alloc => {
      const personMap = map.get(alloc.personId)
      if (!personMap) return
      
      const allocDateStr = alloc.weekStartDate.split('T')[0]
      
      weeks.forEach(week => {
        const weekKey = format(week, "yyyy-MM-dd")
        if (allocDateStr === weekKey) {
          const existing = personMap.get(weekKey) || []
          const projectEntry = existing.find(e => e.project === alloc.projectName)
          if (projectEntry) {
            projectEntry.hours += alloc.plannedHours
          } else {
            existing.push({ project: alloc.projectName, hours: alloc.plannedHours })
          }
          personMap.set(weekKey, existing)
        }
      })
    })
    
    return map
  }, [people, allocations, weeks])

  const getProjectBreakdown = (personId: string, week: Date): { project: string; hours: number }[] => {
    const personMap = projectBreakdownMap.get(personId)
    if (!personMap) return []
    return personMap.get(format(week, "yyyy-MM-dd")) || []
  }

  const yearlyTotals = useMemo(() => {
    const totals = new Map<string, Map<number, number>>()
    
    people.forEach(person => {
      totals.set(person.id, new Map())
    })
    
    allocations.forEach(alloc => {
      const personTotals = totals.get(alloc.personId)
      if (!personTotals) return
      
      const year = new Date(alloc.weekStartDate).getFullYear()
      const current = personTotals.get(year) || 0
      personTotals.set(year, current + alloc.plannedHours)
    })
    
    return totals
  }, [people, allocations])

  const displayYears = useMemo(() => {
    const years = new Set<number>()
    allocations.forEach(alloc => {
      years.add(new Date(alloc.weekStartDate).getFullYear())
    })
    return Array.from(years).sort()
  }, [allocations])

  const getHoursForPersonWeek = (personId: string, week: Date): number => {
    const personMap = hoursMap.get(personId)
    if (!personMap) return 0
    return personMap.get(format(week, "yyyy-MM-dd")) || 0
  }

  const navigatePeriod = (direction: "prev" | "next") => {
    setPeriodStart(current => {
      const newDate = direction === "prev" 
        ? addMonths(current, -2) 
        : addMonths(current, 2)
      return startOfWeek(newDate, { weekStartsOn: 1 })
    })
  }

  const periodEnd = addWeeks(periodStart, 8)

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Weekly Hours by Person</CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigatePeriod("prev")}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[180px] text-center">
            {format(periodStart, "MMM d")} - {format(periodEnd, "MMM d, yyyy")}
          </span>
          <Button variant="outline" size="sm" onClick={() => navigatePeriod("next")}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {people.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            No people to display.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <TooltipProvider>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-10 min-w-[150px]">Person</TableHead>
                  {weeks.map((week) => (
                    <TableHead key={week.toISOString()} className="text-center min-w-[80px]">
                      <div className="text-xs">
                        <div>{format(week, "MMM d")}</div>
                      </div>
                    </TableHead>
                  ))}
                  <TableHead className="text-center min-w-[80px] bg-muted/50">Period</TableHead>
                  {displayYears.map(year => (
                    <TableHead key={year} className="text-center min-w-[80px] bg-muted/50 font-semibold">
                      {year}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {people.map((person) => {
                  const weeklyHours = weeks.map(week => getHoursForPersonWeek(person.id, week))
                  const totalHours = weeklyHours.reduce((sum, h) => sum + h, 0)
                  
                  return (
                    <TableRow key={person.id}>
                      <TableCell className="sticky left-0 bg-background z-10">
                        <Link 
                          href={`/people/${person.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {person.name}
                        </Link>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {person.type}
                        </div>
                      </TableCell>
                      {weeks.map((week, idx) => {
                        const hours = weeklyHours[idx]
                        const isOverCapacity = hours > 40
                        const breakdown = getProjectBreakdown(person.id, week)
                        
                        return (
                          <TableCell 
                            key={week.toISOString()} 
                            className={`text-center ${
                              isOverCapacity 
                                ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-semibold" 
                                : hours > 0 
                                  ? "bg-blue-50 dark:bg-blue-900/20" 
                                  : ""
                            }`}
                          >
                            {hours > 0 ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center justify-center gap-1 cursor-default">
                                    {hours}
                                    {isOverCapacity && (
                                      <AlertTriangle className="h-3 w-3" />
                                    )}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[250px]">
                                  <div className="text-xs space-y-1">
                                    <div className="font-semibold border-b pb-1 mb-1">
                                      {person.name} • {format(week, "MMM d")}
                                    </div>
                                    {breakdown.map((entry, i) => (
                                      <div key={i} className="flex justify-between gap-4">
                                        <span className="truncate">{entry.project}</span>
                                        <span className="font-medium">{entry.hours}h</span>
                                      </div>
                                    ))}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <span>-</span>
                            )}
                          </TableCell>
                        )
                      })}
                      <TableCell className="text-center font-semibold bg-muted/50">
                        {totalHours > 0 ? totalHours : "-"}
                      </TableCell>
                      {displayYears.map(year => {
                        const yearHours = yearlyTotals.get(person.id)?.get(year) || 0
                        return (
                          <TableCell key={year} className="text-center font-semibold bg-muted/50">
                            {yearHours > 0 ? yearHours.toLocaleString() : "-"}
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            </TooltipProvider>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
