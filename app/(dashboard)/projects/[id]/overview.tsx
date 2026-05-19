"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { format } from "date-fns"
import Link from "next/link"

function formatDateSafe(date: Date | string | null): string {
  if (!date) return "-"
  const d = typeof date === "string" ? new Date(date) : date
  return format(d, "MMMM d, yyyy")
}

type ContractStage = "Draft" | "InternalReview" | "VendorReview" | "Approved" | "SentForSignature" | "Signed"

interface ProjectOverviewProps {
  project: {
    id: string
    name: string
    eventType: string | null
    city: string | null
    venue: string | null
    startDate: Date | null
    endDate: Date | null
    status: string
    budgetThreshold: number | null
    client: { id: string; name: string; [key: string]: unknown }
    owner: { name: string | null; [key: string]: unknown } | null
    tasks: { status: string; [key: string]: unknown }[]
    purchases: { amount: number; status: string; [key: string]: unknown }[]
    [key: string]: unknown
  }
  budgetForecastCost?: number
  budgetForecastRevenue?: number
  contracts?: { id: string; stage: ContractStage }[]
}

const stageLabels: Record<ContractStage, string> = {
  Draft: "Draft",
  InternalReview: "Internal Review",
  VendorReview: "Vendor Review",
  Approved: "Approved",
  SentForSignature: "Sent for Signature",
  Signed: "Signed",
}

export function ProjectOverview({ project, budgetForecastCost = 0, budgetForecastRevenue = 0, contracts = [] }: ProjectOverviewProps) {
  const taskStats = {
    total: project.tasks.length,
    done: project.tasks.filter((t) => t.status === "Done").length,
    doing: project.tasks.filter((t) => t.status === "Doing").length,
    todo: project.tasks.filter((t) => t.status === "Todo").length,
  }

  const purchaseTotal = project.purchases
    .filter((p) => p.status === "Approved" || p.status === "Paid")
    .reduce((sum, p) => sum + p.amount, 0)

  const currentBudget = budgetForecastRevenue
  const budgetThreshold = project.budgetThreshold ?? 0
  const budgetVariance = budgetThreshold > 0 ? budgetThreshold - currentBudget : 0

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-sm text-gray-500">Client</p>
            <Link
              href={`/clients/${project.client.id}`}
              className="text-primary hover:underline"
            >
              {project.client.name}
            </Link>
          </div>
          <div>
            <p className="text-sm text-gray-500">Event Type</p>
            <p>{project.eventType || "-"}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Venue</p>
            <p>
              {project.venue || "-"}
              {project.city && `, ${project.city}`}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Owner</p>
            <p>{project.owner?.name || "Unassigned"}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-sm text-gray-500">Start Date</p>
            <p suppressHydrationWarning>
              {formatDateSafe(project.startDate)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">End Date</p>
            <p suppressHydrationWarning>
              {formatDateSafe(project.endDate)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tasks</CardTitle>
        </CardHeader>
        <CardContent>
          {taskStats.total === 0 ? (
            <p className="text-gray-500 text-sm">No tasks yet</p>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Completed</span>
                <span className="font-medium">
                  {taskStats.done} / {taskStats.total}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full"
                  style={{
                    width: `${(taskStats.done / taskStats.total) * 100}%`,
                  }}
                />
              </div>
              <div className="flex gap-4 text-xs text-gray-500 mt-2">
                <span>Todo: {taskStats.todo}</span>
                <span>In Progress: {taskStats.doing}</span>
                <span>Done: {taskStats.done}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Purchases</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">
            ${purchaseTotal.toLocaleString()}
          </p>
          <p className="text-sm text-gray-500">
            Approved/Paid purchases
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Budget</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Budget Threshold</span>
            <span className="font-medium">
              {budgetThreshold > 0 ? `$${budgetThreshold.toLocaleString()}` : "Not set"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Current Budget</span>
            <span className="font-medium">
              ${currentBudget.toLocaleString()}
            </span>
          </div>
          {budgetThreshold > 0 && (
            <div className="flex justify-between border-t pt-2">
              <span className="text-sm text-gray-500">Variance</span>
              <span className={`font-medium ${budgetVariance < 0 ? "text-red-600" : "text-green-600"}`}>
                {budgetVariance < 0 ? "-" : ""}${Math.abs(budgetVariance).toLocaleString()}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contracts</CardTitle>
        </CardHeader>
        <CardContent>
          {contracts.length === 0 ? (
            <p className="text-gray-500 text-sm">No contracts yet</p>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Total</span>
                <span className="font-medium">{contracts.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Signed</span>
                <span className="font-medium text-green-600">
                  {contracts.filter((c) => c.stage === "Signed").length}
                </span>
              </div>
              {contracts.filter((c) => c.stage !== "Signed").length > 0 && (
                <div className="border-t pt-2 space-y-1">
                  {(["Draft", "InternalReview", "VendorReview", "Approved", "SentForSignature"] as ContractStage[])
                    .filter((stage) => contracts.some((c) => c.stage === stage))
                    .map((stage) => (
                      <div key={stage} className="flex justify-between text-xs text-gray-500">
                        <span>{stageLabels[stage]}</span>
                        <span>{contracts.filter((c) => c.stage === stage).length}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  )
}
