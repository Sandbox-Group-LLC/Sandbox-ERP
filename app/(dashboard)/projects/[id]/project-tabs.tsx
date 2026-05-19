"use client"

import { useEffect, useState, type ReactNode } from "react"
import { Tabs } from "@/components/ui/tabs"

export function ProjectTabs({
  defaultTab,
  children,
}: {
  defaultTab: string
  children: ReactNode
}) {
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash.replace("#", "")
      return hash || defaultTab
    }
    return defaultTab
  })

  useEffect(() => {
    const hash = window.location.hash.replace("#", "")
    if (hash) {
      setActiveTab(hash)
    }

    const onHashChange = () => {
      const h = window.location.hash.replace("#", "")
      if (h) setActiveTab(h)
    }
    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [])

  const handleChange = (value: string) => {
    setActiveTab(value)
    window.history.replaceState(null, "", `#${value}`)
  }

  return (
    <Tabs value={activeTab} onValueChange={handleChange} className="space-y-4">
      {children}
    </Tabs>
  )
}
