import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserWithOrganization } from "@/lib/replit-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getUserWithOrganization();
    if (!user || !user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organizationId = user.organizationId;

    // Use upsert pattern to prevent duplicate general channels
    const generalChannel = await prisma.$transaction(async (tx) => {
      let channel = await tx.chatChannel.findFirst({
        where: {
          organizationId,
          channelType: "GENERAL",
          projectId: null,
        },
      });

      if (!channel) {
        // Double-check within transaction to prevent race conditions
        channel = await tx.chatChannel.create({
          data: {
            name: "General",
            channelType: "GENERAL",
            organizationId,
          },
        });
      }

      return channel;
    });

    const channels = await prisma.chatChannel.findMany({
      where: {
        organizationId,
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            messages: true,
          },
        },
      },
      orderBy: [
        { channelType: "asc" },
        { createdAt: "asc" },
      ],
    });

    return NextResponse.json(channels);
  } catch (error) {
    console.error("Error fetching channels:", error);
    return NextResponse.json({ error: "Failed to fetch channels" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUserWithOrganization();
    if (!user || !user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organizationId = user.organizationId;
    const body = await request.json();
    const { name, projectId } = body;

    if (projectId) {
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          organizationId,
        },
      });

      if (!project) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }

      let existingChannel = await prisma.chatChannel.findFirst({
        where: {
          projectId: projectId,
          organizationId,
        },
      });

      if (existingChannel) {
        return NextResponse.json(existingChannel);
      }

      const channel = await prisma.chatChannel.create({
        data: {
          name: name || project.name,
          channelType: "PROJECT",
          projectId: projectId,
          organizationId,
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      return NextResponse.json(channel, { status: 201 });
    } else {
      // Use transaction to prevent duplicate general channels
      const generalChannel = await prisma.$transaction(async (tx) => {
        let channel = await tx.chatChannel.findFirst({
          where: {
            organizationId,
            channelType: "GENERAL",
            projectId: null,
          },
        });

        if (!channel) {
          channel = await tx.chatChannel.create({
            data: {
              name: "General",
              channelType: "GENERAL",
              organizationId,
            },
          });
        }

        return channel;
      });

      return NextResponse.json(generalChannel);
    }
  } catch (error) {
    console.error("Error creating channel:", error);
    return NextResponse.json({ error: "Failed to create channel" }, { status: 500 });
  }
}
