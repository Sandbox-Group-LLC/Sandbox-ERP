"use client";

import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Hash, FolderKanban } from "lucide-react";

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

interface ChannelListProps {
  channels: Channel[];
  activeChannelId: string | null;
  onSelectChannel: (channelId: string) => void;
}

export function ChannelList({ channels, activeChannelId, onSelectChannel }: ChannelListProps) {
  const generalChannels = channels.filter((c) => c.channelType === "GENERAL");
  const projectChannels = channels.filter((c) => c.channelType === "PROJECT");

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b dark:border-gray-700">
        <h2 className="font-semibold text-sm text-gray-900 dark:text-white">Channels</h2>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {generalChannels.map((channel) => (
            <button
              key={channel.id}
              onClick={() => onSelectChannel(channel.id)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                activeChannelId === channel.id
                  ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-medium"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50"
              )}
            >
              <Hash className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1 text-left truncate">{channel.name}</span>
              {channel._count && channel._count.messages > 0 && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {channel._count.messages}
                </span>
              )}
            </button>
          ))}

          {projectChannels.length > 0 && (
            <>
              <div className="pt-3 pb-1 px-3">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Projects
                </span>
              </div>
              {projectChannels.map((channel) => (
                <button
                  key={channel.id}
                  onClick={() => onSelectChannel(channel.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                    activeChannelId === channel.id
                      ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-medium"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  )}
                >
                  <FolderKanban className="h-4 w-4 flex-shrink-0" />
                  <span className="flex-1 text-left truncate">
                    {channel.project?.name || channel.name}
                  </span>
                  {channel._count && channel._count.messages > 0 && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {channel._count.messages}
                    </span>
                  )}
                </button>
              ))}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
