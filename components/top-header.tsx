"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { Search, Clock, Building2, FolderKanban, Target, Truck, Users, FileText, X, PanelLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface SearchResult {
  id: string
  type: "client" | "project" | "opportunity" | "vendor" | "person" | "contract"
  name: string
  subtitle?: string
}

const typeConfig = {
  client: { icon: Building2, label: "Client", href: "/clients" },
  project: { icon: FolderKanban, label: "Project", href: "/projects" },
  opportunity: { icon: Target, label: "Opportunity", href: "/opportunities" },
  vendor: { icon: Truck, label: "Vendor", href: "/vendors" },
  person: { icon: Users, label: "Person", href: "/people" },
  contract: { icon: FileText, label: "Contract", href: "/projects" },
}

export function TopHeader() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [pstTime, setPstTime] = useState("")
  const [estTime, setEstTime] = useState("")
  const searchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const updateTimes = () => {
      const now = new Date()
      const pstOptions: Intl.DateTimeFormatOptions = {
        timeZone: "America/Los_Angeles",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }
      const estOptions: Intl.DateTimeFormatOptions = {
        timeZone: "America/New_York",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }
      setPstTime(now.toLocaleTimeString("en-US", pstOptions))
      setEstTime(now.toLocaleTimeString("en-US", estOptions))
    }

    updateTimes()
    const interval = setInterval(updateTimes, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const searchEntities = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([])
      return
    }

    setIsSearching(true)
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
      if (response.ok) {
        const results = await response.json()
        setSearchResults(results)
      }
    } catch (error) {
      console.error("Search error:", error)
    } finally {
      setIsSearching(false)
    }
  }, [])

  useEffect(() => {
    const debounce = setTimeout(() => {
      searchEntities(searchQuery)
    }, 300)

    return () => clearTimeout(debounce)
  }, [searchQuery, searchEntities])

  const handleResultClick = (result: SearchResult) => {
    const config = typeConfig[result.type]
    if (result.type === "contract") {
      router.push(`/projects/${result.id}?tab=contracts`)
    } else {
      router.push(`${config.href}/${result.id}`)
    }
    setSearchQuery("")
    setShowResults(false)
  }

  const clearSearch = () => {
    setSearchQuery("")
    setSearchResults([])
    setShowResults(false)
  }

  const openMobileSidebar = () => {
    window.dispatchEvent(new CustomEvent("open-mobile-sidebar"))
  }

  return (
    <header className="h-14 bg-white dark:bg-gray-900 border-b dark:border-gray-700 flex items-center justify-between px-4 gap-4">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden flex-shrink-0"
        onClick={openMobileSidebar}
      >
        <PanelLeft className="h-5 w-5" />
      </Button>
      <div ref={searchRef} className="relative flex-1 max-w-xl">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search clients, projects, vendors..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setShowResults(true)
            }}
            onFocus={() => setShowResults(true)}
            className="pl-9 pr-8 h-9 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
          />
          {searchQuery && (
            <button
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {showResults && searchQuery && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-md shadow-lg max-h-80 overflow-y-auto z-50">
            {isSearching ? (
              <div className="p-4 text-center text-sm text-gray-500">Searching...</div>
            ) : searchResults.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">No results found</div>
            ) : (
              <div className="py-1">
                {searchResults.map((result) => {
                  const config = typeConfig[result.type]
                  const Icon = config.icon
                  return (
                    <button
                      key={`${result.type}-${result.id}`}
                      onClick={() => handleResultClick(result)}
                      className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 text-left"
                    >
                      <Icon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {result.name}
                        </p>
                        {result.subtitle && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {result.subtitle}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-gray-400 dark:text-gray-500 capitalize">
                        {config.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
          <Clock className="h-4 w-4" />
          <span className="font-medium">{pstTime}</span>
          <span className="text-gray-400 dark:text-gray-500">PST</span>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
          <Clock className="h-4 w-4" />
          <span className="font-medium">{estTime}</span>
          <span className="text-gray-400 dark:text-gray-500">EST</span>
        </div>
      </div>
    </header>
  )
}
