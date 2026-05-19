"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "@/components/ui/card";
import { ChannelList } from "@/components/chat/channel-list";
import { MessageList } from "@/components/chat/message-list";
import { MessageInput } from "@/components/chat/message-input";
import { Hash, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic"

function playNotificationSound() {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (error) {
    console.log("Could not play notification sound");
  }
}

interface Channel {
  id: string;
  name: string;
  channelType: "GENERAL" | "PROJECT";
  projectId: string | null;
  project?: {
    id: string;
    name: string;
  } | null;
  _count?: {
    messages: number;
  };
}

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

export default function MessagesPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const lastMessageIdRef = useRef<string | null>(null);
  const isInitialLoadRef = useRef(true);

  const fetchChannels = useCallback(async () => {
    try {
      const response = await fetch("/api/chat/channels");
      if (response.ok) {
        const data = await response.json();
        setChannels(data);
        if (data.length > 0 && !activeChannelId) {
          const generalChannel = data.find((c: Channel) => c.channelType === "GENERAL");
          setActiveChannelId(generalChannel?.id || data[0].id);
        }
      }
    } catch (error) {
      console.error("Error fetching channels:", error);
    } finally {
      setLoadingChannels(false);
    }
  }, [activeChannelId]);

  const fetchMessages = useCallback(async () => {
    if (!activeChannelId) return;

    try {
      const response = await fetch(`/api/chat/channels/${activeChannelId}/messages`);
      if (response.ok) {
        const data = await response.json();
        const newMessages = data.messages || [];
        setMessages(newMessages);
        
        if (newMessages.length > 0) {
          const latestMessage = newMessages[newMessages.length - 1];
          if (!isInitialLoadRef.current && 
              latestMessage.id !== lastMessageIdRef.current &&
              latestMessage.author.id !== currentUserId) {
            playNotificationSound();
          }
          lastMessageIdRef.current = latestMessage.id;
        }
        isInitialLoadRef.current = false;
      }
    } catch (error) {
      console.error("Error fetching messages:", error);
    } finally {
      setLoadingMessages(false);
    }
  }, [activeChannelId, currentUserId]);

  useEffect(() => {
    fetchChannels();
    fetch("/api/chat/unread", { method: "POST" }).catch(() => {});
    fetch("/api/auth/user").then(res => res.ok ? res.json() : null).then(data => {
      if (data?.id) setCurrentUserId(data.id);
    }).catch(() => {});
  }, [fetchChannels]);

  useEffect(() => {
    if (activeChannelId) {
      setLoadingMessages(true);
      fetchMessages();
    }
  }, [activeChannelId, fetchMessages]);

  useEffect(() => {
    if (!activeChannelId) return;

    const interval = setInterval(() => {
      fetchMessages();
    }, 3000);

    return () => clearInterval(interval);
  }, [activeChannelId, fetchMessages]);

  const handleSelectChannel = (channelId: string) => {
    setActiveChannelId(channelId);
    setShowMobileSidebar(false);
    isInitialLoadRef.current = true;
    lastMessageIdRef.current = null;
  };

  const handleSendMessage = async (content: string) => {
    if (!activeChannelId) return;

    try {
      const response = await fetch(`/api/chat/channels/${activeChannelId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content }),
      });

      if (response.ok) {
        const newMessage = await response.json();
        setMessages((prev) => [...prev, newMessage]);
      }
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const channelName = activeChannel?.project?.name || activeChannel?.name || "Select a channel";

  return (
    <div className="h-[calc(100vh-6rem)] md:h-[calc(100vh-3rem)] flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setShowMobileSidebar(!showMobileSidebar)}
        >
          {showMobileSidebar ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Messages</h1>
      </div>

      <Card className="flex-1 flex overflow-hidden">
        <div
          className={cn(
            "w-full md:w-80 border-r dark:border-gray-700 flex-shrink-0 bg-white dark:bg-gray-900",
            "absolute md:relative inset-0 z-10 md:z-auto",
            showMobileSidebar ? "block" : "hidden md:block"
          )}
        >
          {loadingChannels ? (
            <div className="flex items-center justify-center h-full">
              <span className="text-sm text-gray-500">Loading channels...</span>
            </div>
          ) : (
            <ChannelList
              channels={channels}
              activeChannelId={activeChannelId}
              onSelectChannel={handleSelectChannel}
            />
          )}
        </div>

        <div className="flex-1 flex flex-col min-w-0 bg-gray-50 dark:bg-gray-950">
          <div className="px-4 py-3 border-b dark:border-gray-700 bg-white dark:bg-gray-900">
            <div className="flex items-center gap-2">
              <Hash className="h-5 w-5 text-gray-400" />
              <span className="font-semibold text-gray-900 dark:text-white">{channelName}</span>
            </div>
          </div>

          <MessageList messages={messages} loading={loadingMessages} />

          <MessageInput onSendMessage={handleSendMessage} disabled={!activeChannelId} />
        </div>
      </Card>
    </div>
  );
}
