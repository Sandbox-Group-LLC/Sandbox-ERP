"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

interface MentionLinkProps {
  mentionType: string;
  entityId: string;
  displayText: string;
  className?: string;
}

function getEntityRoute(type: string, id: string): string {
  const lowerType = type.toLowerCase();
  
  // Some entity IDs include context: "entityId:projectId"
  const [entityId, contextId] = id.split(":");
  
  switch (lowerType) {
    case "user":
      return "/settings";
    case "project":
      return `/projects/${entityId}`;
    case "client":
      return `/clients/${entityId}`;
    case "vendor":
      return `/vendors/${entityId}`;
    case "contract":
      // Contract ID format: contractId:projectId
      return contextId ? `/projects/${contextId}/contracts` : "/projects";
    case "opportunity":
      return `/opportunities/${entityId}`;
    case "task":
      // Task ID format: taskId:projectId
      return contextId ? `/projects/${contextId}/plan` : "/projects";
    case "person":
      return `/people/${entityId}`;
    default:
      return "/";
  }
}

export function MentionLink({ mentionType, entityId, displayText, className }: MentionLinkProps) {
  const route = getEntityRoute(mentionType, entityId);

  return (
    <Link
      href={route}
      className={cn(
        "inline-flex items-center gap-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 px-1 py-0.5 rounded font-medium hover:bg-blue-200 dark:hover:bg-blue-800/50 transition-colors",
        className
      )}
    >
      @{displayText}
    </Link>
  );
}

interface ParsedMention {
  type: "text" | "mention";
  content: string;
  mentionType?: string;
  entityId?: string;
  displayText?: string;
}

export function parseMentions(content: string): ParsedMention[] {
  const mentionRegex = /@\[([^\]]+)\]\((\w+):([^)]+)\)/g;
  const parts: ParsedMention[] = [];
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: "text",
        content: content.slice(lastIndex, match.index),
      });
    }

    parts.push({
      type: "mention",
      content: match[0],
      displayText: match[1],
      mentionType: match[2],
      entityId: match[3],
    });

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({
      type: "text",
      content: content.slice(lastIndex),
    });
  }

  return parts.length > 0 ? parts : [{ type: "text", content }];
}

interface MessageContentProps {
  content: string;
}

export function MessageContent({ content }: MessageContentProps) {
  const parts = parseMentions(content);

  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((part, index) => {
        if (part.type === "mention" && part.mentionType && part.entityId && part.displayText) {
          return (
            <MentionLink
              key={index}
              mentionType={part.mentionType}
              entityId={part.entityId}
              displayText={part.displayText}
            />
          );
        }
        return <span key={index}>{part.content}</span>;
      })}
    </span>
  );
}
