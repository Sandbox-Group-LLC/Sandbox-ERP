"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import {
  Folder,
  File,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  Upload,
  Trash2,
  MessageSquare,
  Download,
  Plus,
  MoreVertical,
  Pencil,
  FolderOpen,
  X,
  User,
  Link2,
  ExternalLink,
  LayoutList,
  LayoutGrid,
} from "lucide-react"
import { format } from "date-fns"
import {
  getDocuments,
  createFolder,
  renameFolder,
  deleteFolder,
  deleteFile,
  saveFileRecord,
  saveGoogleDriveLink,
  addComment,
  getComments,
  type DocFolderData,
  type DocFileData,
  type DocCommentData,
} from "./actions"
import { MessageContent } from "@/components/chat/mention-link"

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

function getFileIcon(contentType: string) {
  if (contentType === "application/vnd.google-apps.link") return FileText
  if (contentType.startsWith("image/")) return FileImage
  if (contentType.startsWith("video/")) return FileVideo
  if (contentType.startsWith("audio/")) return FileAudio
  if (contentType.includes("pdf") || contentType.includes("document") || contentType.includes("text"))
    return FileText
  return File
}

function getFileIconColor(contentType: string) {
  if (contentType === "application/vnd.google-apps.link") return "text-blue-600"
  if (contentType.startsWith("image/")) return "text-green-500"
  if (contentType.startsWith("video/")) return "text-purple-500"
  if (contentType.startsWith("audio/")) return "text-orange-500"
  if (contentType.includes("pdf")) return "text-red-500"
  if (contentType.includes("document") || contentType.includes("text")) return "text-blue-500"
  return "text-muted-foreground"
}

function getGoogleDriveEmbedUrl(url: string): string | null {
  const docMatch = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/)
  if (docMatch) return `https://docs.google.com/document/d/${docMatch[1]}/preview`

  const sheetMatch = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  if (sheetMatch) return `https://docs.google.com/spreadsheets/d/${sheetMatch[1]}/preview`

  const slideMatch = url.match(/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/)
  if (slideMatch) return `https://docs.google.com/presentation/d/${slideMatch[1]}/preview`

  const driveMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (driveMatch) return `https://drive.google.com/file/d/${driveMatch[1]}/preview`

  return null
}

interface MentionResult {
  id: string
  name: string
  type: string
  subtitle?: string
}

function MentionTextarea({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  placeholder?: string
  disabled?: boolean
}) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [mentionResults, setMentionResults] = useState<MentionResult[]>([])
  const [mentionStart, setMentionStart] = useState<number | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const searchMentions = useCallback(async (query: string) => {
    try {
      const url = `/api/chat/mentions/search?query=${encodeURIComponent(query)}&type=user`
      const response = await fetch(url)
      if (response.ok) {
        return await response.json()
      }
    } catch (error) {
      console.error("Error searching mentions:", error)
    }
    return []
  }, [])

  const handleChange = useCallback(
    async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value
      const cursorPos = e.target.selectionStart
      onChange(newValue)

      const textBeforeCursor = newValue.slice(0, cursorPos)
      const lastAtIndex = textBeforeCursor.lastIndexOf("@")

      if (lastAtIndex !== -1) {
        const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1)
        const hasSpace = /\s/.test(textAfterAt)
        const charBefore = lastAtIndex > 0 ? newValue[lastAtIndex - 1] : " "
        const isStartOfWord = charBefore === " " || charBefore === "\n" || lastAtIndex === 0

        if (!hasSpace && isStartOfWord) {
          const results = await searchMentions(textAfterAt)
          setMentionResults(results)
          setMentionStart(lastAtIndex)
          setShowDropdown(results.length > 0)
          setSelectedIndex(0)
          return
        }
      }

      setShowDropdown(false)
      setMentionStart(null)
    },
    [onChange, searchMentions]
  )

  const insertMention = useCallback(
    (result: MentionResult) => {
      if (mentionStart === null || !textareaRef.current) return
      const cursorPos = textareaRef.current.selectionStart
      const before = value.slice(0, mentionStart)
      const after = value.slice(cursorPos)
      const mentionText = `@[${result.name}](${result.type}:${result.id}) `
      onChange(`${before}${mentionText}${after}`)
      setShowDropdown(false)
      setMentionStart(null)
      setTimeout(() => {
        if (textareaRef.current) {
          const pos = before.length + mentionText.length
          textareaRef.current.focus()
          textareaRef.current.setSelectionRange(pos, pos)
        }
      }, 0)
    },
    [mentionStart, value, onChange]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (showDropdown) {
        if (e.key === "ArrowDown") {
          e.preventDefault()
          setSelectedIndex((prev) => (prev < mentionResults.length - 1 ? prev + 1 : 0))
          return
        } else if (e.key === "ArrowUp") {
          e.preventDefault()
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : mentionResults.length - 1))
          return
        } else if (e.key === "Enter" && mentionResults.length > 0) {
          e.preventDefault()
          insertMention(mentionResults[selectedIndex])
          return
        } else if (e.key === "Escape") {
          e.preventDefault()
          setShowDropdown(false)
          return
        }
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        onSubmit()
      }
    },
    [showDropdown, mentionResults, selectedIndex, insertMention, onSubmit]
  )

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={2}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
      />
      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute bottom-full left-0 mb-1 w-64 max-h-48 overflow-y-auto bg-popover border rounded-md shadow-md z-50"
        >
          {mentionResults.map((result, index) => (
            <button
              key={`${result.type}-${result.id}`}
              className={cn(
                "w-full px-3 py-2 text-left text-sm hover:bg-accent flex items-center gap-2",
                index === selectedIndex && "bg-accent"
              )}
              onMouseDown={(e) => {
                e.preventDefault()
                insertMention(result)
              }}
            >
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <div className="font-medium truncate">{result.name}</div>
                {result.subtitle && (
                  <div className="text-xs text-muted-foreground truncate">{result.subtitle}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function GalleryThumbnail({ file }: { file: DocFileData }) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch("/api/storage-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storagePath: file.storagePath }),
        })
        if (res.ok && !cancelled) {
          const { url } = await res.json()
          setThumbUrl(url)
        }
      } catch {}
    }
    load()
    return () => { cancelled = true }
  }, [file.storagePath])

  if (!thumbUrl) {
    return <FileImage className="h-12 w-12 text-green-500 animate-pulse" />
  }

  return (
    <img
      src={thumbUrl}
      alt={file.name}
      className="w-full h-full object-cover"
    />
  )
}

export function DocumentsTab({ projectId }: { projectId: string }) {
  const [folders, setFolders] = useState<DocFolderData[]>([])
  const [files, setFiles] = useState<DocFileData[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [creatingFolder, setCreatingFolder] = useState(false)

  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [renameFolderName, setRenameFolderName] = useState("")

  const [deleteFolderTarget, setDeleteFolderTarget] = useState<DocFolderData | null>(null)
  const [deleteFileTarget, setDeleteFileTarget] = useState<DocFileData | null>(null)

  const [selectedFile, setSelectedFile] = useState<DocFileData | null>(null)
  const [comments, setComments] = useState<DocCommentData[]>([])
  const [commentText, setCommentText] = useState("")
  const [addingComment, setAddingComment] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loadingComments, setLoadingComments] = useState(false)

  const [viewMode, setViewMode] = useState<"list" | "gallery">("list")
  const [showDriveLink, setShowDriveLink] = useState(false)
  const [driveLinkUrl, setDriveLinkUrl] = useState("")
  const [driveLinkName, setDriveLinkName] = useState("")
  const [savingDriveLink, setSavingDriveLink] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadDocuments = useCallback(async () => {
    try {
      const data = await getDocuments(projectId)
      setFolders(data.folders)
      setFiles(data.files)
    } catch (e) {
      console.error("Failed to load documents:", e)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    loadDocuments()
  }, [loadDocuments])

  const filteredFiles =
    selectedFolderId === null
      ? files
      : files.filter((f) => f.folderId === selectedFolderId)

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || creatingFolder) return
    setCreatingFolder(true)
    try {
      await createFolder(projectId, newFolderName)
      setNewFolderName("")
      setShowNewFolder(false)
      await loadDocuments()
    } catch (e) {
      console.error("Failed to create folder:", e)
    } finally {
      setCreatingFolder(false)
    }
  }

  const handleRenameFolder = async (folderId: string) => {
    if (!renameFolderName.trim()) return
    try {
      await renameFolder(folderId, renameFolderName)
      setRenamingFolderId(null)
      setRenameFolderName("")
      await loadDocuments()
    } catch (e) {
      console.error("Failed to rename folder:", e)
    }
  }

  const handleDeleteFolder = async () => {
    if (!deleteFolderTarget) return
    try {
      await deleteFolder(deleteFolderTarget.id)
      if (selectedFolderId === deleteFolderTarget.id) {
        setSelectedFolderId(null)
      }
      setDeleteFolderTarget(null)
      await loadDocuments()
    } catch (e) {
      console.error("Failed to delete folder:", e)
    }
  }

  const handleDeleteFile = async () => {
    if (!deleteFileTarget) return
    try {
      await deleteFile(deleteFileTarget.id)
      if (selectedFile?.id === deleteFileTarget.id) {
        setSelectedFile(null)
      }
      setDeleteFileTarget(null)
      await loadDocuments()
    } catch (e) {
      console.error("Failed to delete file:", e)
    }
  }

  const handleUpload = async (uploadFiles: FileList) => {
    if (uploading) return
    setUploading(true)
    try {
      for (const file of Array.from(uploadFiles)) {
        const res = await fetch("/api/uploads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: file.name,
            size: file.size,
            contentType: file.type || "application/octet-stream",
          }),
        })
        if (!res.ok) throw new Error("Failed to get upload URL")
        const { uploadUrl, storagePath } = await res.json()

        await fetch(uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || "application/octet-stream" },
        })

        await saveFileRecord(projectId, {
          name: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
          storagePath,
          folderId: selectedFolderId,
        })
      }
      await loadDocuments()
    } catch (e) {
      console.error("Upload failed:", e)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleDownload = async (file: DocFileData) => {
    try {
      const res = await fetch("/api/storage-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath: file.storagePath }),
      })
      if (!res.ok) throw new Error("Failed to get download URL")
      const { url } = await res.json()
      const a = document.createElement("a")
      a.href = url
      a.download = file.name
      a.target = "_blank"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (e) {
      console.error("Download failed:", e)
    }
  }

  const openFileDetail = async (file: DocFileData) => {
    setSelectedFile(file)
    setCommentText("")
    setLoadingComments(true)
    setPreviewUrl(null)

    try {
      const [commentsData] = await Promise.all([getComments(file.id)])
      setComments(commentsData)
    } catch (e) {
      console.error("Failed to load comments:", e)
    } finally {
      setLoadingComments(false)
    }

    if (file.contentType.startsWith("image/")) {
      try {
        const res = await fetch("/api/storage-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storagePath: file.storagePath }),
        })
        if (res.ok) {
          const { url } = await res.json()
          setPreviewUrl(url)
        }
      } catch (e) {
        console.error("Failed to load preview:", e)
      }
    }
  }

  const handleSaveDriveLink = async () => {
    if (!driveLinkUrl.trim() || savingDriveLink) return
    setSavingDriveLink(true)
    try {
      await saveGoogleDriveLink(projectId, {
        url: driveLinkUrl,
        name: driveLinkName || undefined,
        folderId: selectedFolderId,
      })
      setDriveLinkUrl("")
      setDriveLinkName("")
      setShowDriveLink(false)
      await loadDocuments()
    } catch (e: any) {
      console.error("Failed to save drive link:", e)
      alert(e.message || "Failed to save link")
    } finally {
      setSavingDriveLink(false)
    }
  }

  const handleAddComment = async () => {
    if (!commentText.trim() || !selectedFile || addingComment) return
    setAddingComment(true)
    try {
      await addComment(selectedFile.id, commentText)
      const updated = await getComments(selectedFile.id)
      setComments(updated)
      setCommentText("")
      await loadDocuments()
    } catch (e) {
      console.error("Failed to add comment:", e)
    } finally {
      setAddingComment(false)
    }
  }

  if (loading) {
    return <div className="text-muted-foreground py-8 text-center">Loading documents...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">Documents</h2>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <div className="flex border rounded-md overflow-hidden">
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="icon"
              className="h-9 w-9 rounded-none"
              onClick={() => setViewMode("list")}
              title="List view"
            >
              <LayoutList className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "gallery" ? "default" : "ghost"}
              size="icon"
              className="h-9 w-9 rounded-none"
              onClick={() => setViewMode("gallery")}
              title="Gallery view"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleUpload(e.target.files)}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex-1 sm:flex-none"
          >
            <Upload className="h-4 w-4 mr-2" />
            {uploading ? "Uploading..." : "Upload Files"}
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowDriveLink(true)}
            className="flex-1 sm:flex-none"
          >
            <Link2 className="h-4 w-4 mr-2" />
            Add Drive Link
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <Card className="w-full sm:w-[250px] shrink-0">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Folders</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setShowNewFolder(true)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {showNewFolder && (
              <div className="flex gap-1 mb-2">
                <Input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Folder name"
                  className="h-8 text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateFolder()
                    if (e.key === "Escape") {
                      setShowNewFolder(false)
                      setNewFolderName("")
                    }
                  }}
                />
                <Button
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={handleCreateFolder}
                  disabled={creatingFolder}
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => {
                    setShowNewFolder(false)
                    setNewFolderName("")
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            <ScrollArea className="max-h-[400px]">
              <button
                onClick={() => setSelectedFolderId(null)}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-accent transition-colors text-left",
                  selectedFolderId === null && "bg-accent font-medium"
                )}
              >
                <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="truncate">All Files</span>
                <span className="ml-auto text-xs text-muted-foreground">{files.length}</span>
              </button>

              {folders.map((folder) =>
                renamingFolderId === folder.id ? (
                  <div key={folder.id} className="flex gap-1 my-0.5">
                    <Input
                      value={renameFolderName}
                      onChange={(e) => setRenameFolderName(e.target.value)}
                      className="h-8 text-sm"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameFolder(folder.id)
                        if (e.key === "Escape") {
                          setRenamingFolderId(null)
                          setRenameFolderName("")
                        }
                      }}
                    />
                    <Button
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => handleRenameFolder(folder.id)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div key={folder.id} className="flex items-center group">
                    <button
                      onClick={() => setSelectedFolderId(folder.id)}
                      className={cn(
                        "flex-1 flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-accent transition-colors text-left min-w-0",
                        selectedFolderId === folder.id && "bg-accent font-medium"
                      )}
                    >
                      <Folder className="h-4 w-4 text-amber-500 shrink-0" />
                      <span className="truncate">{folder.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground shrink-0">
                        {folder.fileCount}
                      </span>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
                        >
                          <MoreVertical className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setRenamingFolderId(folder.id)
                            setRenameFolderName(folder.name)
                          }}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeleteFolderTarget(folder)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )
              )}

              {folders.length === 0 && (
                <p className="text-xs text-muted-foreground px-2 py-2">No folders yet</p>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <div className="flex-1 min-w-0">
          {filteredFiles.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <File className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">
                  {files.length === 0
                    ? "No documents yet. Upload files to get started."
                    : "No files in this folder."}
                </p>
              </CardContent>
            </Card>
          ) : viewMode === "list" ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 px-3 font-medium">Name</th>
                    <th className="text-left py-2 px-3 font-medium hidden sm:table-cell">Size</th>
                    <th className="text-left py-2 px-3 font-medium hidden md:table-cell">Uploaded</th>
                    <th className="text-left py-2 px-3 font-medium hidden lg:table-cell">By</th>
                    <th className="text-right py-2 px-3 font-medium w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFiles.map((file) => {
                    const Icon = getFileIcon(file.contentType)
                    const iconColor = getFileIconColor(file.contentType)
                    return (
                      <tr
                        key={file.id}
                        className="border-b hover:bg-accent/50 transition-colors cursor-pointer"
                        onClick={() => openFileDetail(file)}
                      >
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <Icon className={cn("h-4 w-4 shrink-0", iconColor)} />
                            <span className="truncate">{file.name}</span>
                            {file.commentCount > 0 && (
                              <span className="flex items-center gap-0.5 text-xs text-muted-foreground shrink-0">
                                <MessageSquare className="h-3 w-3" />
                                {file.commentCount}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-3 text-muted-foreground hidden sm:table-cell">
                          {file.contentType === "application/vnd.google-apps.link" ? "—" : formatFileSize(file.size)}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground hidden md:table-cell">
                          {format(new Date(file.createdAt), "MMM d, yyyy")}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground hidden lg:table-cell truncate max-w-[120px]">
                          {file.uploadedByName || "—"}
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            {file.contentType === "application/vnd.google-apps.link" ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => window.open(file.storagePath, "_blank")}
                                title="Open in Drive"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleDownload(file)}
                                title="Download"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => setDeleteFileTarget(file)}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filteredFiles.map((file) => {
                const Icon = getFileIcon(file.contentType)
                const iconColor = getFileIconColor(file.contentType)
                const isImage = file.contentType.startsWith("image/")
                const isDriveLink = file.contentType === "application/vnd.google-apps.link"
                return (
                  <Card
                    key={file.id}
                    className="group cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all overflow-hidden"
                    onClick={() => openFileDetail(file)}
                  >
                    <div className="aspect-square bg-muted/50 flex items-center justify-center relative overflow-hidden">
                      {isImage ? (
                        <GalleryThumbnail file={file} />
                      ) : (
                        <Icon className={cn("h-12 w-12", iconColor)} />
                      )}
                      <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                        {isDriveLink ? (
                          <Button
                            variant="secondary"
                            size="icon"
                            className="h-7 w-7 shadow-sm"
                            onClick={() => window.open(file.storagePath, "_blank")}
                            title="Open in Drive"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            size="icon"
                            className="h-7 w-7 shadow-sm"
                            onClick={() => handleDownload(file)}
                            title="Download"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="secondary"
                          size="icon"
                          className="h-7 w-7 shadow-sm text-destructive hover:text-destructive"
                          onClick={() => setDeleteFileTarget(file)}
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {file.commentCount > 0 && (
                        <span className="absolute bottom-1 right-1 flex items-center gap-0.5 text-xs bg-background/80 backdrop-blur-sm rounded px-1.5 py-0.5 text-muted-foreground">
                          <MessageSquare className="h-3 w-3" />
                          {file.commentCount}
                        </span>
                      )}
                    </div>
                    <CardContent className="p-2">
                      <p className="text-xs font-medium truncate" title={file.name}>{file.name}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {isDriveLink ? "Drive Link" : formatFileSize(file.size)} · {format(new Date(file.createdAt), "MMM d")}
                      </p>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!selectedFile} onOpenChange={(open) => !open && setSelectedFile(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {selectedFile && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {(() => {
                    const Icon = getFileIcon(selectedFile.contentType)
                    const iconColor = getFileIconColor(selectedFile.contentType)
                    return <Icon className={cn("h-5 w-5 shrink-0", iconColor)} />
                  })()}
                  <span className="truncate">{selectedFile.name}</span>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {selectedFile.contentType !== "application/vnd.google-apps.link" && (
                    <div>
                      <span className="text-muted-foreground">Size</span>
                      <p>{formatFileSize(selectedFile.size)}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">Type</span>
                    <p className="truncate">{selectedFile.contentType === "application/vnd.google-apps.link" ? "Google Drive Link" : selectedFile.contentType}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Uploaded</span>
                    <p>{format(new Date(selectedFile.createdAt), "MMM d, yyyy 'at' h:mm a")}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">By</span>
                    <p>{selectedFile.uploadedByName || "—"}</p>
                  </div>
                  {selectedFile.folderName && (
                    <div>
                      <span className="text-muted-foreground">Folder</span>
                      <p>{selectedFile.folderName}</p>
                    </div>
                  )}
                </div>

                {selectedFile.contentType === "application/vnd.google-apps.link" ? (
                  <Button variant="outline" className="w-full" asChild>
                    <a href={selectedFile.storagePath} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open in Google Drive
                    </a>
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleDownload(selectedFile)}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                )}

                {selectedFile.contentType === "application/vnd.google-apps.link" ? (
                  (() => {
                    const embedUrl = getGoogleDriveEmbedUrl(selectedFile.storagePath)
                    return embedUrl ? (
                      <div className="rounded-md overflow-hidden border">
                        <iframe
                          src={embedUrl}
                          className="w-full h-[400px]"
                          allow="autoplay"
                        />
                      </div>
                    ) : null
                  })()
                ) : previewUrl && selectedFile.contentType.startsWith("image/") ? (
                  <div className="rounded-md overflow-hidden border">
                    <img
                      src={previewUrl}
                      alt={selectedFile.name}
                      className="w-full h-auto max-h-[300px] object-contain bg-muted"
                    />
                  </div>
                ) : null}

                <div className="border-t pt-4">
                  <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
                    <MessageSquare className="h-4 w-4" />
                    Comments ({comments.length})
                  </h3>

                  {loadingComments ? (
                    <p className="text-sm text-muted-foreground">Loading comments...</p>
                  ) : comments.length === 0 ? (
                    <p className="text-sm text-muted-foreground mb-3">No comments yet</p>
                  ) : (
                    <ScrollArea className="max-h-[200px] mb-3">
                      <div className="space-y-3">
                        {comments.map((comment) => (
                          <div key={comment.id} className="text-sm">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-medium">{comment.authorName}</span>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(comment.createdAt), "MMM d 'at' h:mm a")}
                              </span>
                            </div>
                            <div className="text-muted-foreground">
                              <MessageContent content={comment.content} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}

                  <div className="space-y-2">
                    <MentionTextarea
                      value={commentText}
                      onChange={setCommentText}
                      onSubmit={handleAddComment}
                      placeholder="Add a comment... Use @ to mention"
                      disabled={addingComment}
                    />
                    <Button
                      size="sm"
                      onClick={handleAddComment}
                      disabled={!commentText.trim() || addingComment}
                      className="w-full sm:w-auto"
                    >
                      {addingComment ? "Adding..." : "Add Comment"}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showDriveLink} onOpenChange={(open) => { if (!open) { setShowDriveLink(false); setDriveLinkUrl(""); setDriveLinkName("") } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Google Drive Link</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Google Drive URL</label>
              <Input
                value={driveLinkUrl}
                onChange={(e) => setDriveLinkUrl(e.target.value)}
                placeholder="Paste Google Drive, Docs, Sheets, or Slides link..."
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Display Name (optional)</label>
              <Input
                value={driveLinkName}
                onChange={(e) => setDriveLinkName(e.target.value)}
                placeholder="e.g. Project Brief, Budget Sheet..."
                className="mt-1"
              />
            </div>
            <Button
              onClick={handleSaveDriveLink}
              disabled={!driveLinkUrl.trim() || savingDriveLink}
              className="w-full"
            >
              {savingDriveLink ? "Saving..." : "Save Link"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteFolderTarget} onOpenChange={(open) => !open && setDeleteFolderTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Folder</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deleteFolderTarget?.name}&rdquo;? This will also
              delete all files inside it. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteFolder} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteFileTarget} onOpenChange={(open) => !open && setDeleteFileTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete File</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deleteFileTarget?.name}&rdquo;? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteFile} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
