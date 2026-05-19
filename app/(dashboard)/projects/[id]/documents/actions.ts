"use server"

import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/session"
import { signObjectURL } from "@/lib/object-storage"
import { revalidatePath } from "next/cache"

async function verifyProjectAccess(projectId: string) {
  const user = await requireAuth()
  if (!user.organizationId) {
    throw new Error("No organization")
  }
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: user.organizationId },
    select: { id: true },
  })
  if (!project) {
    throw new Error("Project not found")
  }
  return user
}

export interface DocFolderData {
  id: string
  name: string
  createdAt: string
  fileCount: number
}

export interface DocFileData {
  id: string
  name: string
  size: number
  contentType: string
  storagePath: string
  folderId: string | null
  folderName: string | null
  uploadedByName: string | null
  createdAt: string
  commentCount: number
}

export interface DocCommentData {
  id: string
  authorName: string
  content: string
  createdAt: string
}

export async function getDocuments(projectId: string): Promise<{
  folders: DocFolderData[]
  files: DocFileData[]
}> {
  const user = await requireAuth()
  if (!user.organizationId) return { folders: [], files: [] }

  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: user.organizationId },
    select: { id: true },
  })
  if (!project) return { folders: [], files: [] }

  const [folders, files] = await Promise.all([
    prisma.docFolder.findMany({
      where: { projectId },
      include: { _count: { select: { files: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.docFile.findMany({
      where: { projectId },
      include: {
        folder: { select: { name: true } },
        uploadedBy: { select: { name: true } },
        _count: { select: { comments: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ])

  return {
    folders: folders.map((f) => ({
      id: f.id,
      name: f.name,
      createdAt: f.createdAt.toISOString(),
      fileCount: f._count.files,
    })),
    files: files.map((f) => ({
      id: f.id,
      name: f.name,
      size: f.size,
      contentType: f.contentType,
      storagePath: f.storagePath,
      folderId: f.folderId,
      folderName: f.folder?.name || null,
      uploadedByName: f.uploadedBy?.name || null,
      createdAt: f.createdAt.toISOString(),
      commentCount: f._count.comments,
    })),
  }
}

export async function createFolder(projectId: string, name: string) {
  const user = await verifyProjectAccess(projectId)
  await prisma.docFolder.create({
    data: {
      projectId,
      name: name.trim(),
      createdById: user.id,
    },
  })
  revalidatePath(`/projects/${projectId}`)
}

export async function renameFolder(folderId: string, name: string) {
  const user = await requireAuth()
  if (!user.organizationId) throw new Error("No organization")

  const folder = await prisma.docFolder.findUnique({
    where: { id: folderId },
    include: { project: { select: { organizationId: true, id: true } } },
  })
  if (!folder || folder.project.organizationId !== user.organizationId) {
    throw new Error("Folder not found")
  }

  await prisma.docFolder.update({
    where: { id: folderId },
    data: { name: name.trim() },
  })
  revalidatePath(`/projects/${folder.project.id}`)
}

export async function deleteFolder(folderId: string) {
  const user = await requireAuth()
  if (!user.organizationId) throw new Error("No organization")

  const folder = await prisma.docFolder.findUnique({
    where: { id: folderId },
    include: {
      project: { select: { organizationId: true, id: true } },
      files: { select: { storagePath: true, contentType: true } },
    },
  })
  if (!folder || folder.project.organizationId !== user.organizationId) {
    throw new Error("Folder not found")
  }

  for (const file of folder.files) {
    if (file.contentType !== "application/vnd.google-apps.link") {
      try {
        const deleteUrl = await signObjectURL({
          objectPath: file.storagePath,
          method: "DELETE",
        })
        await fetch(deleteUrl, { method: "DELETE" })
      } catch (e) {
        console.error("Failed to delete file from storage:", e)
      }
    }
  }

  await prisma.docFolder.delete({ where: { id: folderId } })
  revalidatePath(`/projects/${folder.project.id}`)
}

export async function deleteFile(fileId: string) {
  const user = await requireAuth()
  if (!user.organizationId) throw new Error("No organization")

  const file = await prisma.docFile.findUnique({
    where: { id: fileId },
    include: { project: { select: { organizationId: true, id: true } } },
  })
  if (!file || file.project.organizationId !== user.organizationId) {
    throw new Error("File not found")
  }

  if (file.contentType !== "application/vnd.google-apps.link") {
    try {
      const deleteUrl = await signObjectURL({
        objectPath: file.storagePath,
        method: "DELETE",
      })
      await fetch(deleteUrl, { method: "DELETE" })
    } catch (e) {
      console.error("Failed to delete file from storage:", e)
    }
  }

  await prisma.docFile.delete({ where: { id: fileId } })
  revalidatePath(`/projects/${file.project.id}`)
}

export async function saveFileRecord(
  projectId: string,
  data: {
    name: string
    size: number
    contentType: string
    storagePath: string
    folderId?: string | null
  }
) {
  const user = await verifyProjectAccess(projectId)

  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR
  if (!privateObjectDir || !data.storagePath.startsWith(privateObjectDir)) {
    throw new Error("Invalid storage path")
  }

  const file = await prisma.docFile.create({
    data: {
      projectId,
      name: data.name,
      size: data.size,
      contentType: data.contentType,
      storagePath: data.storagePath,
      folderId: data.folderId || null,
      uploadedById: user.id,
    },
  })
  revalidatePath(`/projects/${projectId}`)
  return file.id
}

function extractNameFromDriveUrl(url: string): string {
  if (url.includes("docs.google.com/document")) return "Google Doc"
  if (url.includes("docs.google.com/spreadsheets")) return "Google Sheet"
  if (url.includes("docs.google.com/presentation")) return "Google Slides"
  if (url.includes("drive.google.com")) return "Google Drive File"
  return "Google Drive Link"
}

export async function saveGoogleDriveLink(
  projectId: string,
  data: { url: string; name?: string; folderId?: string | null }
) {
  const user = await verifyProjectAccess(projectId)

  const url = data.url.trim()
  if (!url.match(/^https:\/\/(docs|drive|sheets|slides)\.google\.com\//)) {
    throw new Error("Please provide a valid Google Drive, Docs, Sheets, or Slides URL")
  }

  const displayName = data.name?.trim() || extractNameFromDriveUrl(url)

  await prisma.docFile.create({
    data: {
      projectId,
      name: displayName,
      size: 0,
      contentType: "application/vnd.google-apps.link",
      storagePath: url,
      folderId: data.folderId || null,
      uploadedById: user.id,
    },
  })
  revalidatePath(`/projects/${projectId}`)
}

export async function addComment(fileId: string, content: string) {
  const user = await requireAuth()
  if (!user.organizationId) throw new Error("No organization")

  const file = await prisma.docFile.findUnique({
    where: { id: fileId },
    include: { project: { select: { organizationId: true, id: true } } },
  })
  if (!file || file.project.organizationId !== user.organizationId) {
    throw new Error("File not found")
  }

  await prisma.docComment.create({
    data: {
      fileId,
      authorId: user.id,
      authorName: user.name || "Unknown",
      content: content.trim(),
    },
  })
  revalidatePath(`/projects/${file.project.id}`)
}

export async function getComments(fileId: string): Promise<DocCommentData[]> {
  const user = await requireAuth()
  if (!user.organizationId) return []

  const file = await prisma.docFile.findUnique({
    where: { id: fileId },
    include: { project: { select: { organizationId: true } } },
  })
  if (!file || file.project.organizationId !== user.organizationId) {
    return []
  }

  const comments = await prisma.docComment.findMany({
    where: { fileId },
    orderBy: { createdAt: "asc" },
  })

  return comments.map((c) => ({
    id: c.id,
    authorName: c.authorName,
    content: c.content,
    createdAt: c.createdAt.toISOString(),
  }))
}
