import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserWithOrganization } from "@/lib/replit-auth";
import { MentionType } from "@prisma/client";

export const dynamic = "force-dynamic";

interface ParsedMention {
  displayText: string;
  mentionType: MentionType;
  entityId: string;
}

function parseMentions(content: string): ParsedMention[] {
  const mentionRegex = /@\[([^\]]+)\]\((\w+):([^)]+)\)/g;
  const mentions: ParsedMention[] = [];
  let match;

  while ((match = mentionRegex.exec(content)) !== null) {
    const [, displayText, type, entityId] = match;
    const mentionType = type.toUpperCase() as MentionType;
    
    if (Object.values(MentionType).includes(mentionType)) {
      mentions.push({
        displayText,
        mentionType,
        entityId,
      });
    }
  }

  return mentions;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const user = await getUserWithOrganization();
    if (!user || !user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { channelId } = await params;
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor");
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const channel = await prisma.chatChannel.findFirst({
      where: {
        id: channelId,
        organizationId: user.organizationId,
      },
    });

    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const messages = await prisma.chatMessage.findMany({
      where: {
        channelId: channelId,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            firstName: true,
            lastName: true,
            email: true,
            profileImageUrl: true,
          },
        },
        mentions: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit + 1,
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
    });

    let nextCursor: string | null = null;
    if (messages.length > limit) {
      const nextItem = messages.pop();
      nextCursor = nextItem?.id || null;
    }

    return NextResponse.json({
      messages: messages.reverse(),
      nextCursor,
    });
  } catch (error) {
    console.error("Error fetching messages:", error);
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const user = await getUserWithOrganization();
    if (!user || !user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { channelId } = await params;
    const body = await request.json();
    const { content } = body;

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    const channel = await prisma.chatChannel.findFirst({
      where: {
        id: channelId,
        organizationId: user.organizationId,
      },
    });

    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const mentions = parseMentions(content);

    const message = await prisma.chatMessage.create({
      data: {
        channelId: channelId,
        authorId: user.id,
        content: content.trim(),
        mentions: {
          create: mentions.map((mention) => ({
            mentionType: mention.mentionType,
            entityId: mention.entityId,
            displayText: mention.displayText,
          })),
        },
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            firstName: true,
            lastName: true,
            email: true,
            profileImageUrl: true,
          },
        },
        mentions: true,
      },
    });

    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    console.error("Error creating message:", error);
    return NextResponse.json({ error: "Failed to create message" }, { status: 500 });
  }
}
