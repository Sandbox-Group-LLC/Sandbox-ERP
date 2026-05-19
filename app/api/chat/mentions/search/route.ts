import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserWithOrganization } from "@/lib/replit-auth";

export const dynamic = "force-dynamic";

interface MentionResult {
  id: string;
  name: string;
  type: string;
  subtitle?: string;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getUserWithOrganization();
    if (!user || !user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query") || "";
    const type = searchParams.get("type");
    const limit = parseInt(searchParams.get("limit") || "10", 10);

    const results: MentionResult[] = [];

    const searchFilter = query
      ? { contains: query, mode: "insensitive" as const }
      : undefined;

    if (!type || type === "user") {
      const users = await prisma.user.findMany({
        where: {
          organizationId: user.organizationId,
          approvalStatus: "APPROVED",
          ...(searchFilter && {
            OR: [
              { name: searchFilter },
              { firstName: searchFilter },
              { lastName: searchFilter },
              { email: searchFilter },
            ],
          }),
        },
        select: {
          id: true,
          name: true,
          firstName: true,
          lastName: true,
          email: true,
        },
        take: limit,
      });

      results.push(
        ...users.map((u) => ({
          id: u.id,
          name: u.firstName && u.lastName 
            ? `${u.firstName} ${u.lastName}` 
            : u.name || u.email || "User",
          type: "user",
          subtitle: u.email || undefined,
        }))
      );
    }

    if (!type || type === "project") {
      const projects = await prisma.project.findMany({
        where: {
          organizationId: user.organizationId,
          ...(searchFilter && { name: searchFilter }),
        },
        select: {
          id: true,
          name: true,
          client: { select: { name: true } },
        },
        take: limit,
      });

      results.push(
        ...projects.map((p) => ({
          id: p.id,
          name: p.name,
          type: "project",
          subtitle: p.client.name,
        }))
      );
    }

    if (!type || type === "client") {
      const clients = await prisma.client.findMany({
        where: {
          organizationId: user.organizationId,
          ...(searchFilter && { name: searchFilter }),
        },
        select: {
          id: true,
          name: true,
          industry: true,
        },
        take: limit,
      });

      results.push(
        ...clients.map((c) => ({
          id: c.id,
          name: c.name,
          type: "client",
          subtitle: c.industry || undefined,
        }))
      );
    }

    if (!type || type === "vendor") {
      const vendors = await prisma.vendor.findMany({
        where: {
          organizationId: user.organizationId,
          ...(searchFilter && { name: searchFilter }),
        },
        select: {
          id: true,
          name: true,
          categories: true,
        },
        take: limit,
      });

      results.push(
        ...vendors.map((v) => ({
          id: v.id,
          name: v.name,
          type: "vendor",
          subtitle: v.categories || undefined,
        }))
      );
    }

    if (!type || type === "contract") {
      const contracts = await prisma.contract.findMany({
        where: {
          project: {
            organizationId: user.organizationId,
          },
          ...(searchFilter && { name: searchFilter }),
        },
        select: {
          id: true,
          name: true,
          projectId: true,
          vendor: { select: { name: true } },
        },
        take: limit,
      });

      results.push(
        ...contracts.map((c) => ({
          id: `${c.id}:${c.projectId}`,
          name: c.name,
          type: "contract",
          subtitle: c.vendor?.name || undefined,
        }))
      );
    }

    if (!type || type === "opportunity") {
      const opportunities = await prisma.opportunity.findMany({
        where: {
          organizationId: user.organizationId,
        },
        select: {
          id: true,
          client: { select: { name: true } },
          eventType: true,
          stage: true,
        },
        take: limit,
      });

      results.push(
        ...opportunities.map((o) => ({
          id: o.id,
          name: `${o.client.name} - ${o.eventType || "Opportunity"}`,
          type: "opportunity",
          subtitle: o.stage,
        }))
      );
    }

    if (!type || type === "task") {
      const tasks = await prisma.task.findMany({
        where: {
          project: {
            organizationId: user.organizationId,
          },
          ...(searchFilter && { title: searchFilter }),
        },
        select: {
          id: true,
          title: true,
          projectId: true,
          project: { select: { name: true } },
          status: true,
        },
        take: limit,
      });

      results.push(
        ...tasks.map((t) => ({
          id: `${t.id}:${t.projectId}`,
          name: t.title,
          type: "task",
          subtitle: t.project.name,
        }))
      );
    }

    if (!type || type === "person") {
      const people = await prisma.person.findMany({
        where: {
          organizationId: user.organizationId,
          ...(searchFilter && { name: searchFilter }),
        },
        select: {
          id: true,
          name: true,
          type: true,
          email: true,
        },
        take: limit,
      });

      results.push(
        ...people.map((p) => ({
          id: p.id,
          name: p.name,
          type: "person",
          subtitle: p.type,
        }))
      );
    }

    const sortedResults = results.slice(0, limit);

    return NextResponse.json(sortedResults);
  } catch (error) {
    console.error("Error searching mentions:", error);
    return NextResponse.json({ error: "Failed to search mentions" }, { status: 500 });
  }
}
