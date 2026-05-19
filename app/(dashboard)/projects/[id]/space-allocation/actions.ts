"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { revalidatePath } from "next/cache";

export async function getRunOfShows(projectId: string) {
  const user = await requireAuth();
  if (!user.organizationId) {
    throw new Error("Unauthorized");
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: user.organizationId },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  const runOfShows = await prisma.runOfShow.findMany({
    where: { projectId },
    include: {
      spaces: {
        include: { cells: { orderBy: { updatedAt: "desc" } } },
        orderBy: { rowOrder: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  try {
    const dupeIdsToDelete: string[] = [];
    for (const ros of runOfShows) {
      for (const space of ros.spaces) {
        const seen = new Map<string, string>();
        for (const cell of space.cells) {
          const dateKey = new Date(cell.date).toISOString().slice(0, 10);
          if (seen.has(dateKey)) {
            dupeIdsToDelete.push(cell.id);
          } else {
            seen.set(dateKey, cell.id);
          }
        }
      }
    }
    if (dupeIdsToDelete.length > 0) {
      await prisma.runOfShowCell.deleteMany({
        where: { id: { in: dupeIdsToDelete } },
      });
    }
  } catch (e) {
    console.error("Error cleaning up duplicate cells:", e);
  }

  if (runOfShows.some((r) => r.spaces.some((s) => s.cells.length > new Set(s.cells.map((c) => new Date(c.date).toISOString().slice(0, 10))).size))) {
    return prisma.runOfShow.findMany({
      where: { projectId },
      include: {
        spaces: {
          include: { cells: { orderBy: { updatedAt: "desc" } } },
          orderBy: { rowOrder: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  return runOfShows;
}

export async function getRunOfShow(id: string) {
  const user = await requireAuth();
  if (!user.organizationId) {
    throw new Error("Unauthorized");
  }

  const runOfShow = await prisma.runOfShow.findFirst({
    where: { id },
    include: {
      project: { select: { organizationId: true } },
      spaces: {
        include: { cells: true },
        orderBy: { rowOrder: "asc" },
      },
    },
  });

  if (!runOfShow || runOfShow.project.organizationId !== user.organizationId) {
    throw new Error("Run of Show not found");
  }

  return runOfShow;
}

export async function createRunOfShow(data: {
  projectId: string;
  name: string;
  startDate: Date;
  endDate: Date;
}) {
  const user = await requireAuth();
  if (!user.organizationId) {
    throw new Error("Unauthorized");
  }

  const project = await prisma.project.findFirst({
    where: { id: data.projectId, organizationId: user.organizationId },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  const runOfShow = await prisma.runOfShow.create({
    data: {
      projectId: data.projectId,
      name: data.name,
      startDate: data.startDate,
      endDate: data.endDate,
    },
    include: {
      spaces: {
        include: { cells: true },
        orderBy: { rowOrder: "asc" },
      },
    },
  });

  revalidatePath(`/projects/${data.projectId}`);
  return runOfShow;
}

export async function updateRunOfShow(
  id: string,
  data: { name?: string; startDate?: Date; endDate?: Date }
) {
  const user = await requireAuth();
  if (!user.organizationId) {
    throw new Error("Unauthorized");
  }

  const runOfShow = await prisma.runOfShow.findFirst({
    where: { id },
    include: { project: { select: { organizationId: true, id: true } } },
  });

  if (!runOfShow || runOfShow.project.organizationId !== user.organizationId) {
    throw new Error("Run of Show not found");
  }

  const updated = await prisma.runOfShow.update({
    where: { id },
    data,
  });

  revalidatePath(`/projects/${runOfShow.project.id}`);
  return updated;
}

export async function deleteRunOfShow(id: string) {
  const user = await requireAuth();
  if (!user.organizationId) {
    throw new Error("Unauthorized");
  }

  const runOfShow = await prisma.runOfShow.findFirst({
    where: { id },
    include: { project: { select: { organizationId: true, id: true } } },
  });

  if (!runOfShow || runOfShow.project.organizationId !== user.organizationId) {
    throw new Error("Run of Show not found");
  }

  await prisma.runOfShow.delete({ where: { id } });

  revalidatePath(`/projects/${runOfShow.project.id}`);
}

export async function addSpace(runOfShowId: string, data: {
  function?: string;
  capacity?: string;
  venueSpace?: string;
}) {
  const user = await requireAuth();
  if (!user.organizationId) {
    throw new Error("Unauthorized");
  }

  const runOfShow = await prisma.runOfShow.findFirst({
    where: { id: runOfShowId },
    include: { 
      project: { select: { organizationId: true, id: true } },
      spaces: { select: { rowOrder: true }, orderBy: { rowOrder: "desc" }, take: 1 },
    },
  });

  if (!runOfShow || runOfShow.project.organizationId !== user.organizationId) {
    throw new Error("Run of Show not found");
  }

  const maxRowOrder = runOfShow.spaces[0]?.rowOrder ?? -1;

  const space = await prisma.runOfShowSpace.create({
    data: {
      runOfShowId,
      rowOrder: maxRowOrder + 1,
      function: data.function || null,
      capacity: data.capacity || null,
      venueSpace: data.venueSpace || null,
    },
  });

  revalidatePath(`/projects/${runOfShow.project.id}`);
  return space;
}

export async function updateSpace(
  id: string,
  data: { function?: string; capacity?: string; venueSpace?: string }
) {
  const user = await requireAuth();
  if (!user.organizationId) {
    throw new Error("Unauthorized");
  }

  const space = await prisma.runOfShowSpace.findFirst({
    where: { id },
    include: {
      runOfShow: {
        include: { project: { select: { organizationId: true, id: true } } },
      },
    },
  });

  if (!space || space.runOfShow.project.organizationId !== user.organizationId) {
    throw new Error("Space not found");
  }

  const updated = await prisma.runOfShowSpace.update({
    where: { id },
    data: {
      function: data.function,
      capacity: data.capacity,
      venueSpace: data.venueSpace,
    },
  });

  revalidatePath(`/projects/${space.runOfShow.project.id}`);
  return updated;
}

export async function deleteSpace(id: string) {
  const user = await requireAuth();
  if (!user.organizationId) {
    throw new Error("Unauthorized");
  }

  const space = await prisma.runOfShowSpace.findFirst({
    where: { id },
    include: {
      runOfShow: {
        include: { project: { select: { organizationId: true, id: true } } },
      },
    },
  });

  if (!space || space.runOfShow.project.organizationId !== user.organizationId) {
    throw new Error("Space not found");
  }

  await prisma.runOfShowSpace.delete({ where: { id } });

  revalidatePath(`/projects/${space.runOfShow.project.id}`);
}

export async function updateCell(
  spaceId: string,
  dateString: string,
  content: string | null
) {
  const user = await requireAuth();
  if (!user.organizationId) {
    throw new Error("Unauthorized");
  }

  const space = await prisma.runOfShowSpace.findFirst({
    where: { id: spaceId },
    include: {
      runOfShow: {
        include: { project: { select: { organizationId: true, id: true } } },
      },
    },
  });

  if (!space || space.runOfShow.project.organizationId !== user.organizationId) {
    throw new Error("Space not found");
  }

  const dayStart = new Date(dateString + "T00:00:00.000Z");
  const dayEnd = new Date(dateString + "T23:59:59.999Z");
  const noon = new Date(dateString + "T12:00:00.000Z");

  const existingCells = await prisma.runOfShowCell.findMany({
    where: {
      spaceId,
      date: { gte: dayStart, lte: dayEnd },
    },
    orderBy: { updatedAt: "desc" },
  });

  let cell;
  if (existingCells.length > 0) {
    cell = await prisma.runOfShowCell.update({
      where: { id: existingCells[0].id },
      data: { content },
    });

    if (existingCells.length > 1) {
      await prisma.runOfShowCell.deleteMany({
        where: {
          id: { in: existingCells.slice(1).map((c) => c.id) },
        },
      });
    }
  } else {
    cell = await prisma.runOfShowCell.create({
      data: {
        spaceId,
        date: noon,
        content,
      },
    });
  }

  revalidatePath(`/projects/${space.runOfShow.project.id}`);
  return cell;
}

export async function reorderSpaces(runOfShowId: string, spaceIds: string[]) {
  const user = await requireAuth();
  if (!user.organizationId) {
    throw new Error("Unauthorized");
  }

  const runOfShow = await prisma.runOfShow.findFirst({
    where: { id: runOfShowId },
    include: { project: { select: { organizationId: true, id: true } } },
  });

  if (!runOfShow || runOfShow.project.organizationId !== user.organizationId) {
    throw new Error("Run of Show not found");
  }

  await prisma.$transaction(
    spaceIds.map((id, index) =>
      prisma.runOfShowSpace.update({
        where: { id },
        data: { rowOrder: index },
      })
    )
  );

  revalidatePath(`/projects/${runOfShow.project.id}`);
}
