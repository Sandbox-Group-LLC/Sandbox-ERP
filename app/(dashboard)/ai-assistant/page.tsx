"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Bot,
  Send,
  Database,
  Globe,
  Search,
  Loader2,
  User,
  ExternalLink,
  Sparkles,
} from "lucide-react"
import ReactMarkdown from "react-markdown"

export const dynamic = "force-dynamic"

type Mode = "erp" | "search" | "research"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  mode: Mode
  citations?: string[]
  timestamp: Date
}

const MODE_CONFIG = {
  erp: {
    label: "ERP Insights",
    description: "Query your business data",
    icon: Database,
    color: "bg-blue-500",
  },
  search: {
    label: "Web Search",
    description: "Quick answers from the web",
    icon: Globe,
    color: "bg-green-500",
  },
  research: {
    label: "Deep Research",
    description: "Comprehensive research with citations",
    icon: Search,
    color: "bg-purple-500",
  },
}

export default function AIAssistantPage() {
  const [mode, setMode] = useState<Mode>("erp")
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [userRole, setUserRole] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isInternalUser = userRole === "ADMIN" || userRole === "MEMBER"

  useEffect(() => {
    fetch("/api/auth/user")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.role) {
          setUserRole(data.role)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      mode,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    try {
      const response = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: userMessage.content,
          mode,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to get response")
      }

      const data = await response.json()

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.answer,
        mode,
        citations: data.citations,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Sorry, I encountered an error processing your request. Please try again.",
        mode,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const ModeIcon = MODE_CONFIG[mode].icon

  return (
    <div className="h-full flex flex-col max-w-4xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">AI Assistant</h1>
            <p className="text-sm text-muted-foreground">
              Ask questions about your data or research anything
            </p>
          </div>
        </div>

        <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(MODE_CONFIG).map(([key, config]) => (
              <SelectItem key={key} value={key}>
                <div className="flex items-center gap-2">
                  <config.icon className="h-4 w-4" />
                  <span>{config.label}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="flex-1 flex flex-col min-h-0">
        <CardHeader className="py-3 border-b">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded ${MODE_CONFIG[mode].color}`}>
              <ModeIcon className="h-4 w-4 text-white" />
            </div>
            <div>
              <CardTitle className="text-sm font-medium">
                {MODE_CONFIG[mode].label}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {MODE_CONFIG[mode].description}
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col p-0 min-h-0">
          <ScrollArea ref={scrollRef} className="flex-1 p-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-12">
                <Bot className="h-16 w-16 text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-medium mb-2">How can I help you?</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  {mode === "erp" && (isInternalUser 
                    ? "Ask about your projects, finances, tasks, risks, or anything in your ERP data."
                    : "Ask about your projects, tasks, timelines, and deliverables."
                  )}
                  {mode === "search" && "Get quick answers about permits, venues, vendors, or any external information."}
                  {mode === "research" && "Get comprehensive research with sources on complex topics."}
                </p>
                <div className="mt-6 grid gap-2 text-sm text-muted-foreground">
                  {mode === "erp" && isInternalUser && (
                    <>
                      <p className="italic">"What projects are over budget?"</p>
                      <p className="italic">"Show me overdue tasks"</p>
                      <p className="italic">"What's our revenue pipeline?"</p>
                    </>
                  )}
                  {mode === "erp" && !isInternalUser && (
                    <>
                      <p className="italic">"What is the current budget for my project?"</p>
                      <p className="italic">"What approvals are waiting for my response?"</p>
                      <p className="italic">"What's the timeline for upcoming deliverables?"</p>
                    </>
                  )}
                  {mode === "search" && (
                    <>
                      <p className="italic">"What permits are needed for events in Manhattan?"</p>
                      <p className="italic">"How many rooms does the Omni Dallas have?"</p>
                      <p className="italic">"Best AV rental companies in Chicago"</p>
                    </>
                  )}
                  {mode === "research" && (
                    <>
                      <p className="italic">"Compare event venues in Austin with pricing"</p>
                      <p className="italic">"Research sustainable event practices"</p>
                      <p className="italic">"Industry trends for corporate events 2026"</p>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${
                      message.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    {message.role === "assistant" && (
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                        <Bot className="h-4 w-4 text-white" />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-lg px-4 py-3 ${
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Badge 
                          variant="outline" 
                          className={`text-xs ${
                            message.role === "user" 
                              ? "border-primary-foreground/30 text-primary-foreground" 
                              : ""
                          }`}
                        >
                          {MODE_CONFIG[message.mode].label}
                        </Badge>
                      </div>
                      <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                      </div>
                      {message.citations && message.citations.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border/50">
                          <p className="text-xs font-medium mb-1">Sources:</p>
                          <div className="flex flex-wrap gap-1">
                            {message.citations.map((citation, idx) => (
                              <a
                                key={idx}
                                href={citation}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-blue-500 hover:underline"
                              >
                                <ExternalLink className="h-3 w-3" />
                                {new URL(citation).hostname}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    {message.role === "user" && (
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                        <User className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                ))}
                {isLoading && (
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                    <div className="bg-muted rounded-lg px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm text-muted-foreground">
                          {mode === "research" ? "Researching..." : "Thinking..."}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          <form onSubmit={handleSubmit} className="p-4 border-t">
            <div className="flex gap-2">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  mode === "erp"
                    ? "Ask about your business data..."
                    : mode === "search"
                    ? "Search the web..."
                    : "What would you like to research?"
                }
                className="min-h-[44px] max-h-32 resize-none"
                disabled={isLoading}
              />
              <Button type="submit" disabled={!input.trim() || isLoading}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
