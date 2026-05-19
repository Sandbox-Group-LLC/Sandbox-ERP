"use client";

import { useEffect, useRef } from "react";
import { format, isToday, isYesterday, isSameDay } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageContent } from "./mention-link";

interface Author {
  id: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  profileImageUrl: string | null;
}

interface Message {
  id: string;
  content: string;
  createdAt: string;
  author: Author;
}

interface MessageListProps {
  messages: Message[];
  loading?: boolean;
}

function getAuthorName(author: Author): string {
  if (author.firstName && author.lastName) {
    return `${author.firstName} ${author.lastName}`;
  }
  return author.name || author.email?.split("@")[0] || "User";
}

function getAuthorInitials(author: Author): string {
  const name = getAuthorName(author);
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatMessageDate(date: Date): string {
  if (isToday(date)) {
    return "Today";
  }
  if (isYesterday(date)) {
    return "Yesterday";
  }
  return format(date, "MMMM d, yyyy");
}

function formatMessageTime(date: Date): string {
  return format(date, "h:mm a");
}

export function MessageList({ messages, loading }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (lastMessageRef.current) {
      lastMessageRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading messages...</div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">No messages yet</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Start the conversation by sending a message
          </p>
        </div>
      </div>
    );
  }

  let lastDate: Date | null = null;

  return (
    <ScrollArea className="flex-1" ref={scrollRef}>
      <div className="p-4 space-y-4">
        {messages.map((message, index) => {
          const messageDate = new Date(message.createdAt);
          const showDateSeparator = !lastDate || !isSameDay(lastDate, messageDate);
          lastDate = messageDate;

          const isLast = index === messages.length - 1;

          return (
            <div key={message.id} ref={isLast ? lastMessageRef : undefined}>
              {showDateSeparator && (
                <div className="flex items-center gap-4 my-4">
                  <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {formatMessageDate(messageDate)}
                  </span>
                  <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                </div>
              )}
              <div className="flex gap-3 group">
                <Avatar className="h-8 w-8 flex-shrink-0">
                  {message.author.profileImageUrl && (
                    <AvatarImage src={message.author.profileImageUrl} />
                  )}
                  <AvatarFallback className="text-xs">
                    {getAuthorInitials(message.author)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium text-sm text-gray-900 dark:text-white">
                      {getAuthorName(message.author)}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {formatMessageTime(messageDate)}
                    </span>
                  </div>
                  <div className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">
                    <MessageContent content={message.content} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
