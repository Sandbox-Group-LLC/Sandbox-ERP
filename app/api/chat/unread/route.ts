import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/session"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const sessionUser = await getCurrentUser()
    if (!sessionUser) {
      return NextResponse.json({ hasUnread: false })
    }

    const user = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: { 
        organizationId: true, 
        lastMessagesReadAt: true,
        approvalStatus: true 
      }
    })

    if (!user?.organizationId || user.approvalStatus !== "APPROVED") {
      return NextResponse.json({ hasUnread: false })
    }

    const lastRead = user.lastMessagesReadAt || new Date(0)

    const unreadCount = await prisma.chatMessage.count({
      where: {
        channel: {
          organizationId: user.organizationId
        },
        createdAt: { gt: lastRead },
        authorId: { not: sessionUser.id }
      }
    })

    return NextResponse.json({ hasUnread: unreadCount > 0, count: unreadCount })
  } catch (error) {
    console.error("Error checking unread messages:", error)
    return NextResponse.json({ hasUnread: false })
  }
}

export async function POST() {
  try {
    const sessionUser = await getCurrentUser()
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await prisma.user.update({
      where: { id: sessionUser.id },
      data: { lastMessagesReadAt: new Date() }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error marking messages as read:", error)
    return NextResponse.json({ error: "Failed to mark as read" }, { status: 500 })
  }
}
