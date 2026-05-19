import { requireAuth } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { 
  TrendingUp,
  BarChart3,
  DollarSign,
  AlertTriangle,
  Users,
  UserX,
  Clock,
  FileText,
  MessageCircle,
  Wallet
} from "lucide-react"
import Link from "next/link"
import { 
  DashboardCard, 
  DashboardCardListItem, 
  DashboardAlertCard 
} from "@/components/dashboard/dashboard-card"
import {
  getAgencyMarginPulse,
  getForecastVsBooked,
  getProjectProfitability,
  getBudgetVarianceAlerts,
  getStaffingUtilization,
  getStaffingGapsAndConflicts,
  getTaskRiskRadar,
  getContractPipelineStatus,
  getVendorSpendPayables,
  getClientEngagementMetrics,
} from "./dashboard-actions"
import {
  getMyProjects,
  getMyTasks,
  getMyMeetings,
  getMyMentions,
  getMyDashboardUserInfo,
} from "./my-dashboard-actions"
import { MyDashboard } from "@/components/dashboard/my-dashboard"
import { ResourceCalendar } from "@/components/resource-calendar"

export const dynamic = "force-dynamic"

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export default async function DashboardPage() {
  const user = await requireAuth()

  if (!user.organizationId) {
    redirect("/")
  }

  const isAdmin = user.role === "ADMIN"
  const isClientOrExternal = user.role === "CLIENT" || user.role === "EXTERNAL"
  const showProjectPerformance = !isClientOrExternal && user.role !== "MEMBER"

  const emptyMetric = { marginPercent: 0, revenue: 0, cost: 0, margin: 0 }
  const emptyForecast = { bookedRevenue: 0, pipelineValue: 0 }
  const emptyProfit = { topProjects: [], bottomProjects: [] }
  const emptyBudget = { alertCount: 0 }
  const emptyStaffing = { plannedHours: 0, targetHours: 0, utilizationPercent: 0, personCount: 0 }
  const emptyGaps = { unfilledCount: 0, conflictCount: 0 }
  const emptyTask = { atRiskCount: 0 }
  const emptyContract = { stages: [], totalStalled: 0 }
  const emptyVendor = { byStatus: { Requested: 0, Approved: 0, Paid: 0 }, topUnpaid: [] }
  const emptyClient = { activeTokenCount: 0, unresolvedCommentCount: 0, recentAccessCount: 0 }

  const [
    marginPulse,
    forecastVsBooked,
    projectProfitability,
    budgetVariance,
    staffingUtilization,
    staffingGaps,
    taskRisk,
    contractPipeline,
    vendorSpend,
    clientEngagement,
    myProjects,
    myTasks,
    myMeetingsData,
    myMentionsData,
    myUserInfo,
  ] = await Promise.all([
    isAdmin ? getAgencyMarginPulse(user.organizationId) : emptyMetric,
    isAdmin ? getForecastVsBooked(user.organizationId) : emptyForecast,
    showProjectPerformance ? getProjectProfitability(user.organizationId) : emptyProfit,
    showProjectPerformance ? getBudgetVarianceAlerts(user.organizationId) : emptyBudget,
    !isClientOrExternal ? getStaffingUtilization(user.organizationId) : emptyStaffing,
    !isClientOrExternal ? getStaffingGapsAndConflicts(user.organizationId) : emptyGaps,
    !isClientOrExternal ? getTaskRiskRadar(user.organizationId) : emptyTask,
    !isClientOrExternal ? getContractPipelineStatus(user.organizationId) : emptyContract,
    isAdmin ? getVendorSpendPayables(user.organizationId) : emptyVendor,
    !isClientOrExternal ? getClientEngagementMetrics(user.organizationId) : emptyClient,
    getMyProjects(user.id, user.organizationId, user.role, user.email ?? undefined),
    getMyTasks(user.id, user.organizationId, user.role, user.email ?? undefined),
    getMyMeetings(user.id),
    getMyMentions(user.id, user.organizationId),
    getMyDashboardUserInfo(user.id),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
        <p className="text-gray-500 dark:text-gray-400">Welcome back, {user.name}</p>
      </div>

      <MyDashboard
        firstName={myUserInfo.firstName}
        projects={myProjects}
        tasks={myTasks}
        meetings={myMeetingsData.meetings}
        meetingsConnected={myMeetingsData.isConnected}
        mentions={myMentionsData.mentions}
        mentionsGoogleConnected={myMentionsData.isGoogleConnected}
      />

      {user.role === "ADMIN" && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Financial Health</h2>
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            <DashboardCard
              title="Agency Margin Pulse"
            value={`${marginPulse.marginPercent.toFixed(1)}%`}
            icon={TrendingUp}
            subtitle="90-day margin"
            trend={{
              value: marginPulse.marginPercent,
              isPositive: marginPulse.marginPercent >= 0,
            }}
            href="/projects"
          >
            <div className="mt-3 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Revenue</span>
                <span className="font-medium text-green-600">{formatCurrency(marginPulse.revenue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cost</span>
                <span className="font-medium text-red-600">{formatCurrency(marginPulse.cost)}</span>
              </div>
              <div className="flex justify-between border-t pt-1">
                <span className="text-muted-foreground">Margin</span>
                <span className="font-medium">{formatCurrency(marginPulse.margin)}</span>
              </div>
            </div>
          </DashboardCard>

          <DashboardCard
            title="Forecast vs Booked"
            value={formatCurrency(forecastVsBooked.bookedRevenue)}
            icon={BarChart3}
            subtitle="Booked revenue"
            href="/opportunities"
          >
            <div className="mt-3 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Pipeline (weighted)</span>
                <span className="font-medium">{formatCurrency(forecastVsBooked.pipelineValue)}</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full" 
                  style={{ 
                    width: `${Math.min(100, forecastVsBooked.pipelineValue > 0 
                      ? (forecastVsBooked.bookedRevenue / (forecastVsBooked.bookedRevenue + forecastVsBooked.pipelineValue)) * 100 
                      : 100)}%` 
                  }}
                />
              </div>
            </div>
          </DashboardCard>

          <DashboardCard
            title="Vendor Spend & Payables"
            value={formatCurrency(vendorSpend.byStatus.Requested + vendorSpend.byStatus.Approved)}
            icon={Wallet}
            subtitle="Unpaid this quarter"
            href="/vendors"
          >
            <div className="mt-3 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Requested</span>
                <span className="font-medium">{formatCurrency(vendorSpend.byStatus.Requested)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Approved</span>
                <span className="font-medium">{formatCurrency(vendorSpend.byStatus.Approved)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paid</span>
                <span className="font-medium text-green-600">{formatCurrency(vendorSpend.byStatus.Paid)}</span>
              </div>
            </div>
            {vendorSpend.topUnpaid.length > 0 && (
              <div className="mt-2 pt-2 border-t">
                <p className="text-xs text-muted-foreground mb-1">Top Unpaid</p>
                {vendorSpend.topUnpaid.slice(0, 2).map((item) => (
                  <DashboardCardListItem
                    key={item.id}
                    label={item.vendorName}
                    value={formatCurrency(item.amount)}
                  />
                ))}
              </div>
            )}
          </DashboardCard>
          </div>
        </div>
      )}

      {user.role !== "MEMBER" && user.role !== "EXTERNAL" && user.role !== "CLIENT" && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Project Performance</h2>
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            <Card className="col-span-1 md:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Project Profitability Watchlist
                </CardTitle>
                <DollarSign className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium text-green-600 mb-2">Top Performers</p>
                    {projectProfitability.topProjects.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No projects yet</p>
                    ) : (
                      projectProfitability.topProjects.map((project) => (
                        <DashboardCardListItem
                          key={project.id}
                          label={project.name}
                          value={`${project.marginPercent.toFixed(1)}%`}
                          href={`/projects/${project.id}`}
                          className="text-green-600"
                        />
                      ))
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-red-600 mb-2">Needs Attention</p>
                    {projectProfitability.bottomProjects.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No projects yet</p>
                    ) : (
                      projectProfitability.bottomProjects.map((project) => (
                        <DashboardCardListItem
                          key={project.id}
                          label={project.name}
                          value={`${project.marginPercent.toFixed(1)}%`}
                          href={`/projects/${project.id}`}
                          className="text-red-600"
                        />
                      ))
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <DashboardAlertCard
              title="Budget Variance Alerts"
              count={budgetVariance.alertCount}
              icon={AlertTriangle}
              variant={budgetVariance.alertCount > 0 ? "warning" : "success"}
              href="/projects"
            />
          </div>
        </div>
      )}

      {user.role !== "EXTERNAL" && user.role !== "CLIENT" && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Resource Management</h2>
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            <DashboardCard
              title="Staffing Utilization"
              value={`${staffingUtilization.utilizationPercent.toFixed(0)}%`}
              icon={Users}
              subtitle={`${staffingUtilization.personCount} people this week`}
            >
              <div className="mt-3">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">
                    {staffingUtilization.plannedHours.toFixed(0)}h / {staffingUtilization.targetHours}h
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full ${
                      staffingUtilization.utilizationPercent >= 80 
                        ? 'bg-green-600' 
                        : staffingUtilization.utilizationPercent >= 60 
                          ? 'bg-yellow-500' 
                          : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(100, staffingUtilization.utilizationPercent)}%` }}
                  />
                </div>
              </div>
            </DashboardCard>

            <DashboardAlertCard
              title="Staffing Gaps"
              count={staffingGaps.unfilledCount}
              icon={UserX}
              variant={staffingGaps.unfilledCount > 0 ? "danger" : "success"}
            />

            <DashboardAlertCard
              title="Staffing Conflicts"
              count={staffingGaps.conflictCount}
              icon={AlertTriangle}
              variant={staffingGaps.conflictCount > 0 ? "warning" : "success"}
            />
            
            <ResourceCalendar />
          </div>
        </div>
      )}

      {user.role !== "CLIENT" && (
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Deadlines & Operations</h2>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          <DashboardAlertCard
            title="Task Risk Radar"
            count={taskRisk.atRiskCount}
            icon={Clock}
            variant={taskRisk.atRiskCount > 5 ? "danger" : taskRisk.atRiskCount > 0 ? "warning" : "success"}
            href="/projects"
          />

          <DashboardCard
            title="Contract Pipeline"
            value={contractPipeline.stages.reduce((sum, s) => sum + s.count, 0)}
            icon={FileText}
            subtitle={`${contractPipeline.totalStalled} stalled`}
          >
            <div className="mt-3 space-y-1">
              {contractPipeline.stages.filter(s => s.count > 0).map((stage) => (
                <div key={stage.stage} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{stage.stage}</span>
                  <span className="font-medium">
                    {stage.count}
                    {stage.stalledCount > 0 && (
                      <span className="text-yellow-600 ml-1">({stage.stalledCount} stalled)</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </DashboardCard>
        </div>
      </div>
      )}

      {user.role !== "CLIENT" && (
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Client Engagement</h2>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          <DashboardCard
            title="Client Engagement Monitor"
            value={clientEngagement.activeTokenCount}
            icon={MessageCircle}
            subtitle="Active portal tokens"
          >
            <div className="mt-3 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Unresolved Comments</span>
                <span className={`font-medium ${clientEngagement.unresolvedCommentCount > 0 ? 'text-yellow-600' : ''}`}>
                  {clientEngagement.unresolvedCommentCount}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Recent Access (7d)</span>
                <span className="font-medium">{clientEngagement.recentAccessCount}</span>
              </div>
            </div>
          </DashboardCard>
        </div>
      </div>
      )}

    </div>
  )
}
