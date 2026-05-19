"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Send, User, FolderKanban, Building2, Truck, FileText, Target, CheckSquare, Users } from "lucide-react";

interface MentionResult {
  id: string;
  name: string;
  type: string;
  subtitle?: string;
}

interface MessageInputProps {
  onSendMessage: (content: string) => Promise<void>;
  disabled?: boolean;
}

const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  user: User,
  project: FolderKanban,
  client: Building2,
  vendor: Truck,
  contract: FileText,
  opportunity: Target,
  task: CheckSquare,
  person: Users,
};

export function MessageInput({ onSendMessage, disabled }: MessageInputProps) {
  const [value, setValue] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [mentionResults, setMentionResults] = useState<MentionResult[]>([]);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionTrigger, setMentionTrigger] = useState<"@" | "#" | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const searchMentions = useCallback(async (query: string, trigger: "@" | "#") => {
    try {
      const typeParam = trigger === "@" ? "user" : "";
      const url = `/api/chat/mentions/search?query=${encodeURIComponent(query)}${typeParam ? `&type=${typeParam}` : ""}`;
      const response = await fetch(url);
      if (response.ok) {
        const results = await response.json();
        if (trigger === "#") {
          return results.filter((r: MentionResult) => r.type !== "user");
        }
        return results;
      }
    } catch (error) {
      console.error("Error searching mentions:", error);
    }
    return [];
  }, []);

  const handleChange = useCallback(
    async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      const cursorPos = e.target.selectionStart;
      setValue(newValue);

      const textBeforeCursor = newValue.slice(0, cursorPos);
      
      const lastAtIndex = textBeforeCursor.lastIndexOf("@");
      const lastHashIndex = textBeforeCursor.lastIndexOf("#");
      
      let triggerIndex = -1;
      let trigger: "@" | "#" | null = null;
      
      if (lastAtIndex > lastHashIndex) {
        triggerIndex = lastAtIndex;
        trigger = "@";
      } else if (lastHashIndex > lastAtIndex) {
        triggerIndex = lastHashIndex;
        trigger = "#";
      }

      if (triggerIndex !== -1 && trigger) {
        const textAfterTrigger = textBeforeCursor.slice(triggerIndex + 1);
        const hasSpaceAfterTrigger = /\s/.test(textAfterTrigger);
        const charBeforeTrigger = triggerIndex > 0 ? newValue[triggerIndex - 1] : " ";
        const isStartOfWord = charBeforeTrigger === " " || charBeforeTrigger === "\n" || triggerIndex === 0;

        if (!hasSpaceAfterTrigger && isStartOfWord) {
          const searchText = textAfterTrigger;
          const results = await searchMentions(searchText, trigger);
          setMentionResults(results);
          setMentionStart(triggerIndex);
          setMentionTrigger(trigger);
          setShowDropdown(results.length > 0);
          setSelectedIndex(0);
          return;
        }
      }

      setShowDropdown(false);
      setMentionStart(null);
      setMentionTrigger(null);
    },
    [searchMentions]
  );

  const insertMention = useCallback(
    (result: MentionResult) => {
      if (mentionStart === null || !textareaRef.current) return;

      const cursorPos = textareaRef.current.selectionStart;
      const beforeMention = value.slice(0, mentionStart);
      const afterCursor = value.slice(cursorPos);
      const mentionText = `@[${result.name}](${result.type}:${result.id}) `;
      const newValue = `${beforeMention}${mentionText}${afterCursor}`;

      setValue(newValue);
      setShowDropdown(false);
      setMentionStart(null);
      setMentionTrigger(null);

      setTimeout(() => {
        if (textareaRef.current) {
          const newCursorPos = beforeMention.length + mentionText.length;
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
    },
    [mentionStart, value]
  );

  const handleKeyDown = useCallback(
    async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (showDropdown) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < mentionResults.length - 1 ? prev + 1 : 0
          );
          return;
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : mentionResults.length - 1
          );
          return;
        } else if (e.key === "Enter" && mentionResults.length > 0) {
          e.preventDefault();
          insertMention(mentionResults[selectedIndex]);
          return;
        } else if (e.key === "Escape") {
          e.preventDefault();
          setShowDropdown(false);
          return;
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        await handleSend();
      }
    },
    [showDropdown, mentionResults, selectedIndex, insertMention]
  );

  const handleSend = async () => {
    const trimmedValue = value.trim();
    if (!trimmedValue || sending || disabled) return;

    setSending(true);
    try {
      await onSendMessage(trimmedValue);
      setValue("");
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative p-4 border-t dark:border-gray-700">
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... Use @ to mention users, # to mention entities"
          rows={2}
          disabled={disabled || sending}
          className={cn(
            "flex w-full rounded-md border border-input bg-background px-3 py-2 pr-12 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
          )}
        />
        <Button
          size="icon"
          className="absolute right-2 bottom-2 h-8 w-8"
          onClick={handleSend}
          disabled={!value.trim() || sending || disabled}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>

      {showDropdown && mentionResults.length > 0 && (
        <Card
          ref={dropdownRef}
          className="absolute bottom-full mb-1 left-4 right-4 max-h-48 overflow-y-auto shadow-lg border z-50"
        >
          <div className="p-1">
            {mentionResults.map((result, index) => {
              const Icon = typeIcons[result.type] || User;
              return (
                <Button
                  key={`${result.type}-${result.id}`}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    index === selectedIndex && "bg-accent"
                  )}
                  onClick={() => insertMention(result)}
                >
                  <Icon className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="font-medium truncate">{result.name}</span>
                  {result.subtitle && (
                    <span className="ml-2 text-muted-foreground text-xs truncate">
                      {result.subtitle}
                    </span>
                  )}
                </Button>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
