"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getTeamMembers, TeamMember } from "./internal-comment-actions";
import { cn } from "@/lib/utils";

interface MentionTextareaProps {
  projectId: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  id?: string;
}

export function MentionTextarea({
  projectId,
  value,
  onChange,
  placeholder,
  rows = 4,
  className,
  id,
}: MentionTextareaProps) {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [filteredMembers, setFilteredMembers] = useState<TeamMember[]>([]);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getTeamMembers(projectId).then(setTeamMembers);
  }, [projectId]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      const cursorPos = e.target.selectionStart;
      onChange(newValue);

      const textBeforeCursor = newValue.slice(0, cursorPos);
      const lastAtIndex = textBeforeCursor.lastIndexOf("@");

      if (lastAtIndex !== -1) {
        const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
        const hasSpaceAfterAt = /\s/.test(textAfterAt);
        const charBeforeAt = lastAtIndex > 0 ? newValue[lastAtIndex - 1] : " ";
        const isStartOfWord = charBeforeAt === " " || charBeforeAt === "\n" || lastAtIndex === 0;

        if (!hasSpaceAfterAt && isStartOfWord) {
          const searchText = textAfterAt.toLowerCase();
          const matches = teamMembers.filter(
            (m) =>
              m.username.toLowerCase().includes(searchText) ||
              m.name.toLowerCase().includes(searchText)
          );
          setFilteredMembers(matches);
          setMentionStart(lastAtIndex);
          setShowDropdown(matches.length > 0);
          setSelectedIndex(0);
          return;
        }
      }

      setShowDropdown(false);
      setMentionStart(null);
    },
    [teamMembers, onChange]
  );

  const insertMention = useCallback(
    (member: TeamMember) => {
      if (mentionStart === null || !textareaRef.current) return;

      const cursorPos = textareaRef.current.selectionStart;
      const beforeMention = value.slice(0, mentionStart);
      const afterCursor = value.slice(cursorPos);
      const newValue = `${beforeMention}@${member.username} ${afterCursor}`;

      onChange(newValue);
      setShowDropdown(false);
      setMentionStart(null);

      setTimeout(() => {
        if (textareaRef.current) {
          const newCursorPos = mentionStart + member.username.length + 2;
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
    },
    [mentionStart, value, onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!showDropdown) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < filteredMembers.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredMembers.length - 1
        );
      } else if (e.key === "Enter" && filteredMembers.length > 0) {
        e.preventDefault();
        insertMention(filteredMembers[selectedIndex]);
      } else if (e.key === "Escape") {
        setShowDropdown(false);
      }
    },
    [showDropdown, filteredMembers, selectedIndex, insertMention]
  );

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
    <div className="relative">
      <textarea
        ref={textareaRef}
        id={id}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      />
      {showDropdown && filteredMembers.length > 0 && (
        <Card
          ref={dropdownRef}
          className="absolute z-50 mt-1 max-h-48 overflow-y-auto shadow-lg border"
        >
          <div className="p-1">
            {filteredMembers.map((member, index) => (
              <Button
                key={member.id}
                variant="ghost"
                size="sm"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  index === selectedIndex && "bg-accent"
                )}
                onClick={() => insertMention(member)}
              >
                <span className="font-medium">@{member.username}</span>
                <span className="ml-2 text-muted-foreground text-xs">
                  {member.name}
                </span>
              </Button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

export function renderContentWithMentions(
  content: string,
  teamMembers: TeamMember[]
): React.ReactNode {
  const mentionPattern = /@([a-zA-Z0-9._-]+)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = mentionPattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }

    const username = match[1];
    const isMember = teamMembers.some(
      (m) => m.username.toLowerCase() === username.toLowerCase()
    );

    if (isMember) {
      parts.push(
        <span
          key={match.index}
          className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-1 rounded"
        >
          @{username}
        </span>
      );
    } else {
      parts.push(match[0]);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return parts.length > 0 ? parts : content;
}
