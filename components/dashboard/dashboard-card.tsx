import * as React from "react"
import Link from "next/link"
import { LucideIcon } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export interface DashboardCardProps {
  title: string
  value: string | number
  icon?: LucideIcon
  subtitle?: string
  trend?: {
    value: number
    isPositive: boolean
  }
  href?: string
  className?: string
  valueClassName?: string
  children?: React.ReactNode
}

export function DashboardCard({
  title,
  value,
  icon: Icon,
  subtitle,
  trend,
  href,
  className,
  valueClassName,
  children,
}: DashboardCardProps) {
  const content = (
    <Card className={cn("transition-shadow h-full", href && "hover:shadow-md cursor-pointer", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {Icon && <Icon className="h-5 w-5 text-muted-foreground" />}
      </CardHeader>
      <CardContent>
        <div className={cn("text-2xl font-bold", valueClassName)}>{value}</div>
        {(subtitle || trend) && (
          <div className="flex items-center gap-2 mt-1">
            {trend && (
              <span
                className={cn(
                  "text-xs font-medium",
                  trend.isPositive ? "text-green-600" : "text-red-600"
                )}
              >
                {trend.isPositive ? "↑" : "↓"} {Math.abs(trend.value)}%
              </span>
            )}
            {subtitle && (
              <span className="text-xs text-muted-foreground">{subtitle}</span>
            )}
          </div>
        )}
        {children}
      </CardContent>
    </Card>
  )

  if (href) {
    return <Link href={href} className="h-full">{content}</Link>
  }

  return content
}

export interface DashboardCardListItemProps {
  label: string
  value: string | number
  href?: string
  className?: string
}

export function DashboardCardListItem({
  label,
  value,
  href,
  className,
}: DashboardCardListItemProps) {
  const content = (
    <div
      className={cn(
        "flex items-center justify-between py-2 border-b last:border-b-0",
        href && "hover:bg-muted/50 cursor-pointer -mx-2 px-2 rounded",
        className
      )}
    >
      <span className="text-sm text-muted-foreground truncate">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )

  if (href) {
    return <Link href={href}>{content}</Link>
  }

  return content
}

export interface DashboardAlertCardProps {
  title: string
  count: number
  icon?: LucideIcon
  variant?: "warning" | "danger" | "success" | "info"
  href?: string
  className?: string
}

const variantStyles = {
  warning: "border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20",
  danger: "border-red-500/50 bg-red-50 dark:bg-red-950/20",
  success: "border-green-500/50 bg-green-50 dark:bg-green-950/20",
  info: "border-blue-500/50 bg-blue-50 dark:bg-blue-950/20",
}

const variantIconStyles = {
  warning: "text-yellow-600",
  danger: "text-red-600",
  success: "text-green-600",
  info: "text-blue-600",
}

const variantValueStyles = {
  warning: "text-yellow-700",
  danger: "text-red-700",
  success: "text-green-700",
  info: "text-blue-700",
}

export function DashboardAlertCard({
  title,
  count,
  icon: Icon,
  variant = "info",
  href,
  className,
}: DashboardAlertCardProps) {
  const content = (
    <Card
      className={cn(
        "transition-shadow h-full",
        variantStyles[variant],
        href && "hover:shadow-md cursor-pointer",
        className
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {Icon && <Icon className={cn("h-5 w-5", variantIconStyles[variant])} />}
      </CardHeader>
      <CardContent>
        <div className={cn("text-2xl font-bold", variantValueStyles[variant])}>
          {count}
        </div>
      </CardContent>
    </Card>
  )

  if (href) {
    return <Link href={href} className="h-full">{content}</Link>
  }

  return content
}
