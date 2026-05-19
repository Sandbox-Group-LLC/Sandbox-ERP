"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Building2,
  Users,
  FolderKanban,
  Target,
  Truck,
  UserCircle,
  FileText,
  LogOut,
  LayoutDashboard,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Settings,
  Moon,
  Sun,
  MessageSquare,
  Package,
  Sparkles,
  Calendar,
  Bot,
  Bell,
  Video,
  Search,
  ClipboardList,
} from "lucide-react"
import { NotificationToggle } from "@/components/notification-toggle"

interface SidebarProps {
  user: {
    name: string | null
    email: string | null
    organizationName: string | null
    role?: string
  }
}

interface NavItem {
  name: string
  href?: string
  icon: React.ComponentType<{ className?: string }>
  children?: { name: string; href: string; icon: React.ComponentType<{ className?: string }> }[]
}

const allNavigation: NavItem[] = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "AI Assistant", href: "/ai-assistant", icon: Bot },
  { name: "Alerts", href: "/alerts", icon: Bell },
  { name: "Clients", href: "/clients", icon: Building2 },
  { name: "Opportunities", href: "/opportunities", icon: Target },
  { name: "Projects", href: "/projects", icon: FolderKanban },
  { name: "Vendors", href: "/vendors", icon: Truck },
  { name: "Inventory", href: "/inventory", icon: Package },
  { name: "People", href: "/people", icon: Users },
  { name: "Messages", href: "/messages", icon: MessageSquare },
  { 
    name: "Meetings", 
    icon: Video,
    children: [
      { name: "Calendar Search", href: "/client-calls", icon: Search },
      { name: "AI Meeting Analyzer", href: "/meeting-notes", icon: Sparkles },
      { name: "Agenda", href: "/agenda", icon: ClipboardList },
    ]
  },
  { name: "Templates", href: "/templates", icon: FileText },
  { name: "Settings", href: "/settings", icon: Settings },
]

const adminOnlyPaths: string[] = []
const externalAllowedPaths = ['/projects', '/inventory', '/messages', '/ai-assistant', '/alerts']
const clientAllowedPaths = ['/', '/projects', '/ai-assistant']
const memberHiddenPaths = ['/opportunities']

function getNavigationForRole(role: string | undefined): NavItem[] {
  if (role === 'EXTERNAL') {
    return allNavigation.filter(item => {
      if (item.href) return externalAllowedPaths.includes(item.href)
      if (item.children) return item.children.some(child => externalAllowedPaths.includes(child.href))
      return false
    })
  }
  if (role === 'CLIENT') {
    return allNavigation.filter(item => {
      if (item.href) return clientAllowedPaths.includes(item.href)
      if (item.children) return item.children.some(child => clientAllowedPaths.includes(child.href))
      return false
    })
  }
  if (role === 'ADMIN') {
    return allNavigation
  }
  if (role === 'MEMBER') {
    return allNavigation.filter(item => {
      if (item.href) return !adminOnlyPaths.includes(item.href) && !memberHiddenPaths.includes(item.href)
      return true
    })
  }
  return allNavigation.filter(item => {
    if (item.href) return !adminOnlyPaths.includes(item.href)
    return true
  })
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false)
  const [hasUnreadAlerts, setHasUnreadAlerts] = useState(false)
  const [expandedMenus, setExpandedMenus] = useState<string[]>([])
  const { theme, setTheme, resolvedTheme } = useTheme()

  const toggleMenu = (menuName: string) => {
    setExpandedMenus(prev => 
      prev.includes(menuName) 
        ? prev.filter(m => m !== menuName)
        : [...prev, menuName]
    )
  }

  const isChildActive = (children?: { href: string }[]) => {
    if (!children) return false
    return children.some(child => pathname === child.href || pathname.startsWith(child.href))
  }

  const checkUnreadMessages = useCallback(async () => {
    try {
      const response = await fetch("/api/chat/unread")
      if (response.ok) {
        const data = await response.json()
        setHasUnreadMessages(data.hasUnread)
      }
    } catch (error) {
      console.error("Error checking unread messages:", error)
    }
  }, [])

  const checkUnreadAlerts = useCallback(async () => {
    try {
      const response = await fetch("/api/alerts/unread-count")
      if (response.ok) {
        const data = await response.json()
        setHasUnreadAlerts(data.count > 0)
      }
    } catch (error) {
      console.error("Error checking unread alerts:", error)
    }
  }, [])

  useEffect(() => {
    setMounted(true)
    checkUnreadMessages()
    checkUnreadAlerts()
    const messagesInterval = setInterval(checkUnreadMessages, 30000)
    const alertsInterval = setInterval(checkUnreadAlerts, 60000)
    return () => {
      clearInterval(messagesInterval)
      clearInterval(alertsInterval)
    }
  }, [checkUnreadMessages, checkUnreadAlerts])

  useEffect(() => {
    setIsMobileOpen(false)
  }, [pathname])

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsMobileOpen(false)
      }
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  useEffect(() => {
    const handleOpenSidebar = () => setIsMobileOpen(true)
    window.addEventListener("open-mobile-sidebar", handleOpenSidebar)
    return () => window.removeEventListener("open-mobile-sidebar", handleOpenSidebar)
  }, [])

  const handleLogout = () => {
    window.location.href = "/api/auth/logout"
  }

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark")
  }

  const isDark = mounted && resolvedTheme === "dark"

  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
    <div className={cn(
      "flex flex-col h-full bg-white dark:bg-gray-900",
      mobile ? "w-64" : isCollapsed ? "w-16" : "w-64"
    )}>
      <div className="p-4 border-b dark:border-gray-700 flex items-center justify-between">
        {(!isCollapsed || mobile) && (
          <div className="min-w-0 flex-1 flex items-center gap-2">
            <Image
              src="/images/sandbox-icon.png"
              alt="Sandbox"
              width={20}
              height={20}
              className="h-5 w-5"
              priority
            />
            <Image
              src="/images/sandbox-logo.png"
              alt="Sandbox ERP"
              width={100}
              height={20}
              className="h-5 w-auto"
              priority
            />
          </div>
        )}
        {mobile ? (
          <Button variant="ghost" size="icon" onClick={() => setIsMobileOpen(false)}>
            <X className="h-5 w-5" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden md:flex"
          >
            {isCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
          </Button>
        )}
      </div>

      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {getNavigationForRole(user.role).map((item) => {
          const hasChildren = item.children && item.children.length > 0
          const isExpanded = expandedMenus.includes(item.name) || isChildActive(item.children)
          const isActive = item.href ? (pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))) : false
          const showUnreadDot = (item.name === "Messages" && hasUnreadMessages && !isActive) ||
            (item.name === "Alerts" && hasUnreadAlerts && !isActive)

          if (hasChildren) {
            const firstChildHref = item.children?.[0]?.href || '/'
            
            if (isCollapsed && !mobile) {
              return (
                <Link
                  key={item.name}
                  href={firstChildHref}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors relative justify-center px-2",
                    isChildActive(item.children)
                      ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
                  )}
                  title={item.name}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                </Link>
              )
            }
            
            return (
              <div key={item.name}>
                <button
                  onClick={() => toggleMenu(item.name)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors relative",
                    isChildActive(item.children)
                      ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
                  )}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  <span className="flex-1 text-left">{item.name}</span>
                  <ChevronDown className={cn(
                    "h-4 w-4 transition-transform",
                    isExpanded && "rotate-180"
                  )} />
                </button>
                {isExpanded && (
                  <div className="ml-4 mt-1 space-y-1">
                    {item.children?.map((child) => {
                      const isChildItemActive = pathname === child.href || pathname.startsWith(child.href)
                      return (
                        <Link
                          key={child.name}
                          href={child.href}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                            isChildItemActive
                              ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white"
                              : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
                          )}
                        >
                          <child.icon className="h-4 w-4 flex-shrink-0" />
                          <span>{child.name}</span>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }

          return (
            <Link
              key={item.name}
              href={item.href!}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors relative",
                isActive
                  ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white",
                isCollapsed && !mobile && "justify-center px-2"
              )}
              title={isCollapsed && !mobile ? item.name : undefined}
            >
              <div className="relative">
                <item.icon className="h-5 w-5 flex-shrink-0" />
                {showUnreadDot && (
                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-white dark:border-gray-900" />
                )}
              </div>
              {(!isCollapsed || mobile) && <span>{item.name}</span>}
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t dark:border-gray-700">
        {(!isCollapsed || mobile) ? (
          <>
            <div className="flex items-center gap-3 mb-3">
              <UserCircle className="h-8 w-8 text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {user.name || "User"}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email || ""}</p>
              </div>
              <NotificationToggle />
              {mounted && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleTheme}
                  className="h-8 w-8"
                >
                  {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign out
            </Button>
          </>
        ) : (
          <div className="space-y-2">
            <NotificationToggle />
            {mounted && (
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                title={isDark ? "Light mode" : "Dark mode"}
                className="w-full"
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={handleLogout}
              title="Sign out"
              className="w-full"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <>

      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 ease-in-out md:hidden",
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <SidebarContent mobile />
      </div>

      <div className="hidden md:flex border-r dark:border-gray-700 transition-all duration-200">
        <SidebarContent />
      </div>
    </>
  )
}
