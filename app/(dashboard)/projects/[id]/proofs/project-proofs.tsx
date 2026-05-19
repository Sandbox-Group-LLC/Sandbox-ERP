"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import { Plus, Upload, Send, MessageSquare, History, ExternalLink, Loader2, Link2, Pencil, FolderOpen, Truck, Trash2, Printer, CheckCircle2, Clock, FileSpreadsheet, ArrowUpDown } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
  listProofRequests,
  createProofRequest,
  editProofRequest,
  getProofDetail,
  addComment,
  sendMagicLinkEmail,
  uploadNewVersion,
  updateProofStatus,
  sendVendorPortalAccess,
  deleteProofRequest,
  adminUploadPreflightProof,
  adminMarkPrinted,
  type ProofRequestData,
} from "./actions"

interface ProjectProofsProps {
  projectId: string
  userRole?: string
}

export function ProjectProofs({ projectId, userRole }: ProjectProofsProps) {
  const isAdmin = userRole === "ADMIN"
  const canManageProofs = userRole === "ADMIN" || userRole === "MEMBER"
  const [proofs, setProofs] = useState<ProofRequestData[]>([])
  const [loading, setLoading] = useState(true)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [uploadVersionDialogOpen, setUploadVersionDialogOpen] = useState(false)
  const [clientInfoDialogOpen, setClientInfoDialogOpen] = useState(false)
  const [revisionCommentDialogOpen, setRevisionCommentDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [adminApproveDialogOpen, setAdminApproveDialogOpen] = useState(false)
  const [adminPreflightDialogOpen, setAdminPreflightDialogOpen] = useState(false)
  const [adminPreflightFile, setAdminPreflightFile] = useState<File | null>(null)
  const [adminPreflightUploadMode, setAdminPreflightUploadMode] = useState<"file" | "drive">("file")
  const [adminPreflightDriveUrl, setAdminPreflightDriveUrl] = useState("")
  const [adminPreflightDriveFileName, setAdminPreflightDriveFileName] = useState("")
  const [adminPreflightNotes, setAdminPreflightNotes] = useState("")
  const [deleteProofId, setDeleteProofId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [exportingSheet, setExportingSheet] = useState(false)
  const [vendorFormData, setVendorFormData] = useState({ vendorName: "", vendorEmail: "" })
  const [editFormData, setEditFormData] = useState({
    title: "",
    description: "",
    designerName: "",
    designerEmail: "",
    clientName: "",
    clientEmail: "",
    printVendor: "",
    area: "",
    category: "",
    dimensions: "",
    material: "",
    quantity: "",
    dueDate: "",
    priority: "NORMAL",
    productionArtworkUrl: "",
  })
  const [submitting, setSubmitting] = useState(false)
  const [selectedProofId, setSelectedProofId] = useState<string | null>(null)
  const [proofDetail, setProofDetail] = useState<{
    proof: ProofRequestData | null
    versions: Array<{
      id: string
      version: number
      fileName: string
      signedUrl: string | null
      googleDriveUrl: string | null
      mimeType: string | null
      uploadedByName: string
      uploadedByRole: string
      notes: string | null
      createdAt: string
    }>
    comments: Array<{
      id: string
      authorName: string
      authorRole: string
      content: string
      isInternal: boolean
      createdAt: string
    }>
    portalToken: string | null
  } | null>(null)

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    designerName: "",
    designerEmail: "",
    clientEmail: "",
    clientName: "",
    printVendor: "",
    area: "",
    category: "",
    dimensions: "",
    material: "",
    quantity: "",
    dueDate: "",
    priority: "NORMAL",
    productionArtworkUrl: "",
  })
  const [uploading, setUploading] = useState(false)

  const [newComment, setNewComment] = useState("")
  const [isInternalComment, setIsInternalComment] = useState(false)
  const [addingComment, setAddingComment] = useState(false)

  const [versionFile, setVersionFile] = useState<File | null>(null)
  const [versionNotes, setVersionNotes] = useState("")
  const [uploadMode, setUploadMode] = useState<"file" | "drive">("file")
  const [googleDriveUrl, setGoogleDriveUrl] = useState("")
  const [googleDriveFileName, setGoogleDriveFileName] = useState("")

  const [clientFormData, setClientFormData] = useState({ clientName: "", clientEmail: "", feedbackDueDate: "" })
  const [revisionComment, setRevisionComment] = useState("")
  const [preflightRevisionDialogOpen, setPreflightRevisionDialogOpen] = useState(false)
  const [preflightRevisionComment, setPreflightRevisionComment] = useState("")
  const [sortBy, setSortBy] = useState<"dueDate" | "priority">("dueDate")

  const { toast } = useToast()

  const PRIORITY_ORDER: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2 }

  const groupedProofs = useMemo(() => {
    const groups: Record<string, ProofRequestData[]> = {
      active: proofs.filter(p => ["REQUESTED", "IN_PROGRESS"].includes(p.status)),
      review: proofs.filter(p => ["INTERNAL_REVIEW", "CLIENT_REVIEW", "PREFLIGHT_REVIEW"].includes(p.status)),
      revisions: proofs.filter(p => ["REVISIONS_NEEDED", "PREFLIGHT_REVISIONS"].includes(p.status)),
      approved: proofs.filter(p => ["APPROVED", "PRODUCTION", "PREFLIGHT_APPROVED"].includes(p.status)),
      complete: proofs.filter(p => ["PRINTED"].includes(p.status)),
    }

    const sortFn = sortBy === "dueDate"
      ? (a: ProofRequestData, b: ProofRequestData) => {
          const aTime = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER
          const bTime = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER
          return aTime - bTime
        }
      : (a: ProofRequestData, b: ProofRequestData) => {
          const aOrder = PRIORITY_ORDER[a.priority] ?? 99
          const bOrder = PRIORITY_ORDER[b.priority] ?? 99
          return aOrder - bOrder
        }

    for (const key in groups) groups[key].sort(sortFn)
    return groups
  }, [proofs, sortBy])

  useEffect(() => {
    loadProofs()
  }, [projectId])

  const searchParams = useSearchParams()
  useEffect(() => {
    const proofId = searchParams.get("proofId")
    if (proofId && proofs.length > 0 && !detailDialogOpen) {
      const exists = proofs.some(p => p.id === proofId)
      if (exists) {
        openDetailDialog(proofId)
        const url = new URL(window.location.href)
        url.searchParams.delete("proofId")
        window.history.replaceState(null, "", url.pathname + url.search + url.hash)
      }
    }
  }, [searchParams, proofs])

  async function loadProofs() {
    setLoading(true)
    try {
      const data = await listProofRequests(projectId)
      setProofs(data)
    } catch (error) {
      console.error("Failed to load proofs:", error)
      toast({
        title: "Error",
        description: "Failed to load proof requests",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  async function loadProofDetail(proofId: string) {
    try {
      const detail = await getProofDetail(proofId)
      setProofDetail(detail)
    } catch (error) {
      console.error("Failed to load proof detail:", error)
      toast({
        title: "Error",
        description: "Failed to load proof details",
        variant: "destructive",
      })
    }
  }

  function openCreateDialog() {
    setFormData({
      title: "",
      description: "",
      designerName: "",
      designerEmail: "",
      clientEmail: "",
      clientName: "",
      printVendor: "",
      area: "",
      category: "",
      dimensions: "",
      material: "",
      quantity: "",
      dueDate: "",
      priority: "NORMAL",
      productionArtworkUrl: "",
    })
    setCreateDialogOpen(true)
  }

  async function openDetailDialog(proofId: string) {
    setSelectedProofId(proofId)
    setProofDetail(null)
    setDetailDialogOpen(true)
    await loadProofDetail(proofId)
  }

  function openEditDialog() {
    if (!proofDetail?.proof) return
    const p = proofDetail.proof
    setEditFormData({
      title: p.title || "",
      description: p.description || "",
      designerName: p.designerName || "",
      designerEmail: p.designerEmail || "",
      clientName: p.clientName || "",
      clientEmail: p.clientEmail || "",
      printVendor: p.printVendor || "",
      area: p.area || "",
      category: p.category || "",
      dimensions: p.dimensions || "",
      material: p.material || "",
      quantity: p.quantity?.toString() || "",
      dueDate: p.dueDate ? p.dueDate.split("T")[0] : "",
      priority: p.priority || "NORMAL",
      productionArtworkUrl: p.productionArtworkUrl || "",
    })
    setEditDialogOpen(true)
  }

  function openVendorDialog() {
    setVendorFormData({
      vendorName: proofDetail?.proof?.printVendor || "",
      vendorEmail: "",
    })
    setVendorDialogOpen(true)
  }

  function openUploadVersionDialog() {
    setVersionFile(null)
    setVersionNotes("")
    setUploadMode("file")
    setGoogleDriveUrl("")
    setGoogleDriveFileName("")
    setUploadVersionDialogOpen(true)
  }

  function openClientInfoDialog() {
    setClientFormData({
      clientName: proofDetail?.proof?.clientName || "",
      clientEmail: proofDetail?.proof?.clientEmail || "",
      feedbackDueDate: proofDetail?.proof?.feedbackDueDate ? proofDetail.proof.feedbackDueDate.split("T")[0] : "",
    })
    setClientInfoDialogOpen(true)
  }

  function openRevisionCommentDialog() {
    setRevisionComment("")
    setRevisionCommentDialogOpen(true)
  }

  function openPreflightRevisionDialog() {
    setPreflightRevisionComment("")
    setPreflightRevisionDialogOpen(true)
  }

  async function handlePreflightRevisions(e: React.FormEvent) {
    e.preventDefault()

    setSubmitting(true)
    try {
      const result = await updateProofStatus(selectedProofId!, "PREFLIGHT_REVISIONS", {
        comment: preflightRevisionComment || undefined,
      })
      if (result.success) {
        toast({
          title: "Success",
          description: "Pre-flight revisions requested",
        })
        setPreflightRevisionDialogOpen(false)
        await loadProofDetail(selectedProofId!)
        await loadProofs()
      } else {
        throw new Error(result.error || "Failed to request revisions")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to request revisions",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  function openAdminPreflightDialog() {
    setAdminPreflightFile(null)
    setAdminPreflightUploadMode("file")
    setAdminPreflightDriveUrl("")
    setAdminPreflightDriveFileName("")
    setAdminPreflightNotes("")
    setAdminPreflightDialogOpen(true)
  }

  async function handleAdminUploadPreflight(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedProofId) return

    if (adminPreflightUploadMode === "file" && !adminPreflightFile) {
      toast({ title: "Error", description: "Please select a file to upload", variant: "destructive" })
      return
    }
    if (adminPreflightUploadMode === "drive" && !adminPreflightDriveUrl) {
      toast({ title: "Error", description: "Please enter a Google Drive URL", variant: "destructive" })
      return
    }

    setSubmitting(true)
    setUploading(true)

    try {
      if (adminPreflightUploadMode === "file" && adminPreflightFile) {
        const uploadResult = await uploadFileToStorage(adminPreflightFile)
        if (!uploadResult) throw new Error("Failed to upload file")
        setUploading(false)
        const result = await adminUploadPreflightProof(selectedProofId, {
          objectPath: uploadResult.objectPath,
          fileName: uploadResult.fileName,
          fileSize: uploadResult.fileSize,
          mimeType: uploadResult.mimeType,
          notes: adminPreflightNotes || undefined,
        })
        if (!result.success) throw new Error(result.error || "Failed to upload preflight proof")
      } else {
        setUploading(false)
        const fileName = adminPreflightDriveFileName || "Google Drive File"
        const result = await adminUploadPreflightProof(selectedProofId, {
          googleDriveUrl: adminPreflightDriveUrl,
          fileName,
          notes: adminPreflightNotes || undefined,
        })
        if (!result.success) throw new Error(result.error || "Failed to save Google Drive link")
      }

      toast({ title: "Success", description: "Pre-flight proof uploaded — status moved to Pre-Flight Review" })
      setAdminPreflightDialogOpen(false)
      await loadProofDetail(selectedProofId)
      await loadProofs()
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to upload preflight proof",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
      setUploading(false)
    }
  }

  async function handleAdminMarkPrinted() {
    if (!selectedProofId) return
    setSubmitting(true)
    try {
      const result = await adminMarkPrinted(selectedProofId)
      if (!result.success) throw new Error(result.error || "Failed to mark as printed")
      toast({ title: "Success", description: "Proof marked as Printed — workflow complete" })
      await loadProofDetail(selectedProofId)
      await loadProofs()
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to mark as printed",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function uploadFileToStorage(file: File): Promise<{ objectPath: string; fileName: string; fileSize: number; mimeType: string } | null> {
    try {
      const response = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type,
          uploadType: "proof",
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to get upload URL")
      }

      const { uploadUrl, storagePath } = await response.json()

      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
      })

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload file")
      }

      return {
        objectPath: storagePath,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      }
    } catch (error) {
      console.error("Upload error:", error)
      return null
    }
  }

  async function handleCreateProof(e: React.FormEvent) {
    e.preventDefault()

    if (!formData.title) {
      toast({
        title: "Error",
        description: "Please enter a title",
        variant: "destructive",
      })
      return
    }

    setSubmitting(true)

    try {
      const result = await createProofRequest(projectId, {
        title: formData.title,
        description: formData.description || undefined,
        designerName: formData.designerName || undefined,
        designerEmail: formData.designerEmail || undefined,
        clientEmail: formData.clientEmail || undefined,
        clientName: formData.clientName || undefined,
        printVendor: formData.printVendor || undefined,
        area: formData.area || undefined,
        category: formData.category || undefined,
        dimensions: formData.dimensions || undefined,
        material: formData.material || undefined,
        quantity: formData.quantity ? parseInt(formData.quantity) : undefined,
        dueDate: formData.dueDate || undefined,
        priority: formData.priority || undefined,
        productionArtworkUrl: formData.productionArtworkUrl || undefined,
      })

      if (result.success) {
        toast({
          title: "Success",
          description: "Proof request created successfully",
        })
        setCreateDialogOpen(false)
        await loadProofs()
      } else {
        throw new Error(result.error || "Failed to create proof request")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create proof request",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleEditProof(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedProofId) return

    setSubmitting(true)
    try {
      const result = await editProofRequest(selectedProofId, {
        title: editFormData.title || undefined,
        description: editFormData.description || undefined,
        designerName: editFormData.designerName || undefined,
        designerEmail: editFormData.designerEmail || undefined,
        clientName: editFormData.clientName || undefined,
        clientEmail: editFormData.clientEmail || undefined,
        printVendor: editFormData.printVendor || undefined,
        area: editFormData.area || undefined,
        category: editFormData.category || undefined,
        dimensions: editFormData.dimensions || undefined,
        material: editFormData.material || undefined,
        quantity: editFormData.quantity ? parseInt(editFormData.quantity) : null,
        dueDate: editFormData.dueDate || null,
        priority: editFormData.priority || undefined,
        productionArtworkUrl: editFormData.productionArtworkUrl || null,
      })

      if (result.success) {
        toast({ title: "Success", description: "Proof request updated" })
        setEditDialogOpen(false)
        await loadProofDetail(selectedProofId)
        await loadProofs()
      } else {
        throw new Error(result.error || "Failed to update proof request")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeleteProof() {
    if (!deleteProofId) return
    setDeleting(true)
    try {
      const result = await deleteProofRequest(deleteProofId)
      if (result.success) {
        toast({ title: "Success", description: "Proof request deleted" })
        setDeleteDialogOpen(false)
        setDeleteProofId(null)
        setDetailDialogOpen(false)
        setSelectedProofId(null)
        await loadProofs()
      } else {
        throw new Error(result.error || "Failed to delete")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete proof request",
        variant: "destructive",
      })
    } finally {
      setDeleting(false)
    }
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault()

    if (!newComment.trim() || !selectedProofId) return

    setAddingComment(true)
    try {
      const result = await addComment(selectedProofId, newComment, isInternalComment)
      if (result.success) {
        toast({
          title: "Success",
          description: "Comment added successfully",
        })
        setNewComment("")
        setIsInternalComment(false)
        await loadProofDetail(selectedProofId)
      } else {
        throw new Error(result.error || "Failed to add comment")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add comment",
        variant: "destructive",
      })
    } finally {
      setAddingComment(false)
    }
  }

  async function handleSendMagicLink() {
    if (!selectedProofId) return

    setSubmitting(true)
    try {
      const result = await sendMagicLinkEmail(selectedProofId)
      if (result.success) {
        toast({
          title: "Success",
          description: "Magic link email sent to client",
        })
        await loadProofDetail(selectedProofId)
      } else {
        throw new Error(result.error || "Failed to send magic link")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send magic link",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUploadNewVersion(e: React.FormEvent) {
    e.preventDefault()

    if (!selectedProofId) return

    if (uploadMode === "file" && !versionFile) {
      toast({
        title: "Error",
        description: "Please select a file to upload",
        variant: "destructive",
      })
      return
    }

    if (uploadMode === "drive" && !googleDriveUrl) {
      toast({
        title: "Error",
        description: "Please enter a Google Drive URL",
        variant: "destructive",
      })
      return
    }

    setSubmitting(true)
    setUploading(true)

    try {
      if (uploadMode === "file" && versionFile) {
        const uploadResult = await uploadFileToStorage(versionFile)
        if (!uploadResult) {
          throw new Error("Failed to upload file")
        }
        setUploading(false)

        const result = await uploadNewVersion(selectedProofId, {
          objectPath: uploadResult.objectPath,
          fileName: uploadResult.fileName,
          fileSize: uploadResult.fileSize,
          mimeType: uploadResult.mimeType,
          notes: versionNotes || undefined,
        })

        if (!result.success) {
          throw new Error(result.error || "Failed to upload new version")
        }
      } else {
        setUploading(false)
        const fileName = googleDriveFileName || "Google Drive File"
        const result = await uploadNewVersion(selectedProofId, {
          googleDriveUrl,
          fileName,
          notes: versionNotes || undefined,
        })

        if (!result.success) {
          throw new Error(result.error || "Failed to save Google Drive link")
        }
      }

      toast({
        title: "Success",
        description: uploadMode === "file" ? "New version uploaded successfully" : "Google Drive link added successfully",
      })
      setUploadVersionDialogOpen(false)
      await loadProofDetail(selectedProofId)
      await loadProofs()
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to upload new version",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
      setUploading(false)
    }
  }

  async function handleStatusTransition(newStatus: string, data?: { clientName?: string; clientEmail?: string; comment?: string }) {
    if (!selectedProofId) return

    setSubmitting(true)
    try {
      const result = await updateProofStatus(selectedProofId, newStatus, data)
      if (result.success) {
        toast({
          title: "Success",
          description: `Status updated to ${newStatus.replace(/_/g, " ").toLowerCase()}`,
        })
        await loadProofDetail(selectedProofId)
        await loadProofs()
      } else {
        throw new Error(result.error || "Failed to update status")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update status",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSendToClient(e: React.FormEvent) {
    e.preventDefault()

    if (!clientFormData.clientName || !clientFormData.clientEmail) {
      toast({
        title: "Error",
        description: "Client name and email are required",
        variant: "destructive",
      })
      return
    }

    setSubmitting(true)
    try {
      const result = await updateProofStatus(selectedProofId!, "CLIENT_REVIEW", {
        clientName: clientFormData.clientName,
        clientEmail: clientFormData.clientEmail,
        feedbackDueDate: clientFormData.feedbackDueDate || undefined,
      })
      if (result.success) {
        toast({
          title: "Success",
          description: "Proof sent to client for review",
        })
        setClientInfoDialogOpen(false)
        await loadProofDetail(selectedProofId!)
        await loadProofs()
      } else {
        throw new Error(result.error || "Failed to send to client")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send to client",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRequestRevisions(e: React.FormEvent) {
    e.preventDefault()

    setSubmitting(true)
    try {
      const result = await updateProofStatus(selectedProofId!, "REVISIONS_NEEDED", {
        comment: revisionComment || undefined,
      })
      if (result.success) {
        toast({
          title: "Success",
          description: "Revisions requested",
        })
        setRevisionCommentDialogOpen(false)
        await loadProofDetail(selectedProofId!)
        await loadProofs()
      } else {
        throw new Error(result.error || "Failed to request revisions")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to request revisions",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAdminApproveOnBehalf() {
    if (!selectedProofId) return

    setSubmitting(true)
    try {
      const result = await updateProofStatus(selectedProofId, "APPROVED", {
        adminApproveOnBehalf: true,
      })
      if (result.success) {
        toast({
          title: "Success",
          description: "Proof approved on behalf of client",
        })
        setAdminApproveDialogOpen(false)
        await loadProofDetail(selectedProofId)
        await loadProofs()
      } else {
        throw new Error(result.error || "Failed to approve proof")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to approve proof",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "REQUESTED":
        return <Badge className="bg-blue-500 hover:bg-blue-600">Requested</Badge>
      case "IN_PROGRESS":
        return <Badge className="bg-yellow-500 hover:bg-yellow-600 text-black">In Progress</Badge>
      case "INTERNAL_REVIEW":
        return <Badge className="bg-purple-500 hover:bg-purple-600">Internal Review</Badge>
      case "CLIENT_REVIEW":
        return <Badge variant="secondary">Client Review</Badge>
      case "REVISIONS_NEEDED":
        return <Badge variant="outline" className="border-orange-500 text-orange-500">Revisions Needed</Badge>
      case "APPROVED":
        return <Badge className="bg-green-600 hover:bg-green-700">Approved</Badge>
      case "PRODUCTION":
        return <Badge className="bg-teal-600 hover:bg-teal-700">Production</Badge>
      case "PREFLIGHT_REVIEW":
        return <Badge className="bg-indigo-500 hover:bg-indigo-600">Pre-Flight Review</Badge>
      case "PREFLIGHT_REVISIONS":
        return <Badge variant="outline" className="border-orange-500 text-orange-500">Pre-Flight Revisions</Badge>
      case "PREFLIGHT_APPROVED":
        return <Badge className="bg-emerald-500 hover:bg-emerald-600">Pre-Flight Approved</Badge>
      case "PRINTED":
        return <Badge className="bg-slate-500 hover:bg-slate-600">Printed</Badge>
      case "REJECTED":
        return <Badge variant="destructive">Rejected</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  function getPriorityBadge(priority: string) {
    switch (priority) {
      case "NORMAL":
        return <Badge variant="outline">Normal</Badge>
      case "HIGH":
        return <Badge className="bg-orange-500 hover:bg-orange-600">High</Badge>
      case "URGENT":
        return <Badge variant="destructive">Urgent</Badge>
      default:
        return <Badge variant="outline">{priority}</Badge>
    }
  }

  function getDesignerOrClient(proof: ProofRequestData) {
    const showDesigner = ["REQUESTED", "IN_PROGRESS", "INTERNAL_REVIEW"].includes(proof.status)
    if (showDesigner) {
      return {
        name: proof.designerName || proof.createdBy?.name || "-",
        email: proof.designerEmail || proof.createdBy?.email || "",
      }
    }
    const showVendor = ["PRODUCTION", "PREFLIGHT_REVIEW", "PREFLIGHT_REVISIONS", "PREFLIGHT_APPROVED", "PRINTED"].includes(proof.status)
    if (showVendor) {
      return {
        name: proof.printVendor || "-",
        email: "",
      }
    }
    return {
      name: proof.clientName || "-",
      email: proof.clientEmail || "",
    }
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "-"
    return new Date(dateStr).toLocaleDateString()
  }

  function formatDateTime(dateStr: string): string {
    return new Date(dateStr).toLocaleString()
  }

  function isImageMimeType(mimeType: string | null): boolean {
    return mimeType?.startsWith("image/") || false
  }

  function renderStatusActions() {
    if (!proofDetail?.proof || !selectedProofId) return null

    const status = proofDetail.proof.status

    switch (status) {
      case "REQUESTED":
        return (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => handleStatusTransition("IN_PROGRESS")} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Mark In Progress
            </Button>
          </div>
        )

      case "IN_PROGRESS":
        return (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={openUploadVersionDialog} disabled={submitting}>
              <Upload className="h-4 w-4 mr-2" />
              Upload Asset
            </Button>
            <Button
              onClick={() => handleStatusTransition("INTERNAL_REVIEW")}
              disabled={submitting || !proofDetail.proof?.currentAsset}
            >
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Submit for Review
            </Button>
          </div>
        )

      case "INTERNAL_REVIEW":
        return (
          <div className="flex flex-wrap gap-2">
            <Button onClick={openClientInfoDialog} disabled={submitting}>
              <Send className="h-4 w-4 mr-2" />
              Send to Client
            </Button>
            <Button variant="outline" onClick={openRevisionCommentDialog} disabled={submitting}>
              Request Revisions
            </Button>
          </div>
        )

      case "CLIENT_REVIEW":
        return (
          <div className="flex flex-wrap gap-2">
            {proofDetail.portalToken && (
              <a
                href={`/proof-portal/${proofDetail.portalToken}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View Client Portal
                </Button>
              </a>
            )}
            <Button onClick={handleSendMagicLink} disabled={submitting}>
              <Send className="h-4 w-4 mr-2" />
              {submitting ? "Sending..." : "Re-send Magic Link"}
            </Button>
            {canManageProofs && (
              <>
                <Button
                  onClick={() => setAdminApproveDialogOpen(true)}
                  disabled={submitting}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Approve on Behalf of Client
                </Button>
                <Button variant="outline" onClick={openRevisionCommentDialog} disabled={submitting}>
                  Request Revisions
                </Button>
              </>
            )}
          </div>
        )

      case "REVISIONS_NEEDED":
        return (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={openUploadVersionDialog} disabled={submitting}>
              <Upload className="h-4 w-4 mr-2" />
              Upload New Version
            </Button>
            <Button
              onClick={() => handleStatusTransition("INTERNAL_REVIEW")}
              disabled={submitting || !proofDetail.proof?.currentAsset}
            >
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Submit for Review
            </Button>
            <Button variant="ghost" onClick={() => handleStatusTransition("IN_PROGRESS")} disabled={submitting}>
              Back to In Progress
            </Button>
          </div>
        )

      case "APPROVED":
        return (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              {proofDetail.proof.approvedAt && (
                <p>Approved on {formatDateTime(proofDetail.proof.approvedAt)}</p>
              )}
              {proofDetail.proof.approvedByName && (
                <p>Approved by {proofDetail.proof.approvedByName}</p>
              )}
            </div>
            <Button onClick={openVendorDialog} disabled={submitting}>
              <Truck className="h-4 w-4 mr-2" />
              Send to Vendor
            </Button>
          </div>
        )

      case "PRODUCTION":
        return (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                {proofDetail.proof.approvedAt && (
                  <p>Approved on {formatDateTime(proofDetail.proof.approvedAt)}</p>
                )}
                {proofDetail.proof.approvedByName && (
                  <p>Approved by {proofDetail.proof.approvedByName}</p>
                )}
                <p className="text-teal-600 font-medium">Sent to vendor for production</p>
                <p className="text-xs mt-1">Vendor can upload a pre-flight proof via the vendor portal.</p>
              </div>
              <Button variant="outline" onClick={openVendorDialog} disabled={submitting}>
                <Truck className="h-4 w-4 mr-2" />
                Re-send to Vendor
              </Button>
            </div>
            {canManageProofs && (
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground mb-2 font-medium">Act as Vendor</p>
                <Button size="sm" variant="outline" onClick={openAdminPreflightDialog} disabled={submitting}>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Pre-Flight Proof on Behalf of Vendor
                </Button>
              </div>
            )}
          </div>
        )

      case "PREFLIGHT_REVIEW":
        return (
          <div className="flex flex-col gap-3">
            <div className="text-sm text-muted-foreground">
              <p className="text-indigo-600 font-medium">Vendor has uploaded a pre-flight proof for review.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => handleStatusTransition("PREFLIGHT_APPROVED")} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Approve Pre-Flight
              </Button>
              <Button variant="outline" onClick={openPreflightRevisionDialog} disabled={submitting}>
                Request Revisions
              </Button>
            </div>
          </div>
        )

      case "PREFLIGHT_REVISIONS":
        return (
          <div className="flex flex-col gap-3">
            <div className="text-sm text-muted-foreground">
              <p className="text-orange-600 font-medium">Pre-flight revisions requested.</p>
              <p className="mt-1">Waiting for vendor to upload a revised pre-flight proof via the vendor portal.</p>
            </div>
            {canManageProofs && (
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground mb-2 font-medium">Act as Vendor</p>
                <Button size="sm" variant="outline" onClick={openAdminPreflightDialog} disabled={submitting}>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Revised Pre-Flight Proof on Behalf of Vendor
                </Button>
              </div>
            )}
          </div>
        )

      case "PREFLIGHT_APPROVED":
        return (
          <div className="flex flex-col gap-3">
            <div className="text-sm text-muted-foreground">
              <p className="text-emerald-600 font-medium">Pre-flight proof approved.</p>
              <p className="mt-1">Waiting for vendor to mark as printed via the vendor portal.</p>
            </div>
            {canManageProofs && (
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground mb-2 font-medium">Act as Vendor</p>
                <Button size="sm" onClick={handleAdminMarkPrinted} disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Printer className="h-4 w-4 mr-2" />}
                  Mark as Printed on Behalf of Vendor
                </Button>
              </div>
            )}
          </div>
        )

      case "PRINTED":
        return (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Printer className="h-4 w-4 text-slate-500" />
            <div>
              <p className="text-slate-600 font-medium">Printed — workflow complete.</p>
              {proofDetail.proof.approvedAt && (
                <p className="text-xs">Originally approved on {formatDateTime(proofDetail.proof.approvedAt)}</p>
              )}
            </div>
          </div>
        )

      default:
        return null
    }
  }

  function renderCurrentAsset() {
    if (!proofDetail?.proof) return null
    const asset = proofDetail.proof.currentAsset

    if (!asset) {
      return <div className="text-muted-foreground text-center py-4">No asset available</div>
    }

    if (asset.googleDriveUrl && !asset.signedUrl) {
      return (
        <div className="border rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-center h-24 bg-muted rounded">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Link2 className="h-5 w-5" />
              <p className="text-sm">{asset.fileName}</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">v{asset.version} - {asset.fileName}</span>
            <a
              href={asset.googleDriveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline text-sm flex items-center"
            >
              Open in Google Drive <ExternalLink className="h-3 w-3 ml-1" />
            </a>
          </div>
        </div>
      )
    }

    return (
      <div className="border rounded-lg p-3 space-y-2">
        {asset.signedUrl && isImageMimeType(asset.mimeType) ? (
          <img
            src={asset.signedUrl}
            alt={asset.fileName}
            className="max-h-48 rounded object-contain mx-auto"
          />
        ) : (
          <div className="flex items-center justify-center h-24 bg-muted rounded">
            <p className="text-muted-foreground text-sm">{asset.fileName}</p>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-sm">v{asset.version} - {asset.fileName}</span>
          <div className="flex items-center gap-2">
            {asset.googleDriveUrl && (
              <a
                href={asset.googleDriveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline text-sm flex items-center"
              >
                <Link2 className="h-3 w-3 mr-1" />
                Drive
              </a>
            )}
            {asset.signedUrl && (
              <a
                href={asset.signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline text-sm flex items-center"
              >
                Open <ExternalLink className="h-3 w-3 ml-1" />
              </a>
            )}
          </div>
        </div>
      </div>
    )
  }

  function renderVersionLink(version: { signedUrl: string | null; googleDriveUrl: string | null }) {
    if (version.googleDriveUrl) {
      return (
        <a href={version.googleDriveUrl} target="_blank" rel="noopener noreferrer">
          <Button variant="ghost" size="sm">
            <Link2 className="h-3 w-3" />
          </Button>
        </a>
      )
    }
    if (version.signedUrl) {
      return (
        <a href={version.signedUrl} target="_blank" rel="noopener noreferrer">
          <Button variant="ghost" size="sm">
            <ExternalLink className="h-3 w-3" />
          </Button>
        </a>
      )
    }
    return null
  }

  async function handleExportToSheet() {
    setExportingSheet(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/export-proofs-sheet`, {
        method: "POST",
      })
      const data = await response.json()
      if (data.success) {
        toast({
          title: "Exported to Google Sheet",
          description: "Proof tracker has been synced to Google Sheets",
        })
        window.open(data.sheetUrl, "_blank")
      } else {
        toast({
          title: "Export failed",
          description: data.error || "Failed to export to Google Sheet",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Failed to export to Google Sheet",
        variant: "destructive",
      })
    } finally {
      setExportingSheet(false)
    }
  }

  if (loading) {
    return <div className="p-4">Loading proof requests...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">Proof Requests</h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center border rounded-md">
            <Button
              variant={sortBy === "dueDate" ? "default" : "ghost"}
              size="sm"
              className="h-8 rounded-r-none text-xs"
              onClick={() => setSortBy("dueDate")}
            >
              <ArrowUpDown className="h-3 w-3 mr-1" />
              Due Date
            </Button>
            <Button
              variant={sortBy === "priority" ? "default" : "ghost"}
              size="sm"
              className="h-8 rounded-l-none text-xs"
              onClick={() => setSortBy("priority")}
            >
              <ArrowUpDown className="h-3 w-3 mr-1" />
              Priority
            </Button>
          </div>
          <Button
            variant="outline"
            onClick={handleExportToSheet}
            disabled={exportingSheet}
            className="w-full sm:w-auto"
          >
            {exportingSheet ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 mr-2" />
            )}
            {exportingSheet ? "Exporting..." : "Export to Sheet"}
          </Button>
          <Button onClick={openCreateDialog} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            New Proof Request
          </Button>
        </div>
      </div>

      {proofs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No proof requests for this project yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {[
            { key: "active", label: "Requested", borderColor: "border-t-blue-500", proofs: groupedProofs.active },
            { key: "review", label: "In Review", borderColor: "border-t-purple-500", proofs: groupedProofs.review },
            { key: "revisions", label: "Revisions", borderColor: "border-t-orange-500", proofs: groupedProofs.revisions },
            { key: "approved", label: "Approved / Production", borderColor: "border-t-green-500", proofs: groupedProofs.approved },
            { key: "complete", label: "Complete", borderColor: "border-t-slate-500", proofs: groupedProofs.complete },
          ].map((column) => (
            <Card key={column.key} className={`border-t-2 ${column.borderColor}`}>
              <CardHeader className="pb-3 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">{column.label}</CardTitle>
                  <Badge variant="secondary" className="text-xs">{column.proofs.length}</Badge>
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-2 min-h-[80px]">
                {column.proofs.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">No proofs</p>
                ) : (
                  column.proofs.map((proof) => {
                    const person = getDesignerOrClient(proof)
                    const now = new Date()
                    const dueDate = proof.dueDate ? new Date(proof.dueDate) : null
                    const isOverdue = dueDate && dueDate < now
                    const isDueSoon = dueDate && !isOverdue && (dueDate.getTime() - now.getTime()) < 3 * 24 * 60 * 60 * 1000
                    return (
                      <div
                        key={proof.id}
                        className="border rounded-lg p-3 bg-background hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => openDetailDialog(proof.id)}
                      >
                        <p className="text-sm font-medium leading-tight">{proof.title}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          {(proof.category || proof.area) && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{proof.category || proof.area}</Badge>
                          )}
                          {getPriorityBadge(proof.priority)}
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[11px] text-muted-foreground truncate max-w-[60%]">{person.name}</span>
                          {dueDate && (
                            <span className={`text-[11px] ${isOverdue ? "text-red-500 font-medium" : isDueSoon ? "text-amber-500 font-medium" : "text-muted-foreground"}`}>
                              {dueDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                            </span>
                          )}
                        </div>
                        {(proof.dimensions || proof.material) && (
                          <p className="text-[10px] text-muted-foreground mt-1 truncate">
                            {[proof.dimensions, proof.material].filter(Boolean).join(" · ")}
                          </p>
                        )}
                        {proof.currentAsset && (
                          <span className="text-[10px] text-muted-foreground mt-1 inline-block">v{proof.currentAsset.version}</span>
                        )}
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Proof Request</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateProof} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="designerName">Designer Name</Label>
                <Input
                  id="designerName"
                  value={formData.designerName}
                  onChange={(e) => setFormData({ ...formData, designerName: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="designerEmail">Designer Email</Label>
                <Input
                  id="designerEmail"
                  type="email"
                  value={formData.designerEmail}
                  onChange={(e) => setFormData({ ...formData, designerEmail: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="printVendor">Print Vendor</Label>
                <Input
                  id="printVendor"
                  value={formData.printVendor}
                  onChange={(e) => setFormData({ ...formData, printVendor: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="area">Area</Label>
                <Input
                  id="area"
                  value={formData.area}
                  onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dimensions">Dimensions</Label>
                <Input
                  id="dimensions"
                  value={formData.dimensions}
                  onChange={(e) => setFormData({ ...formData, dimensions: e.target.value })}
                  placeholder="e.g., 24x36 inches"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="material">Material</Label>
                <Input
                  id="material"
                  value={formData.material}
                  onChange={(e) => setFormData({ ...formData, material: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dueDate">Due Date</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value) => setFormData({ ...formData, priority: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NORMAL">Normal</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="URGENT">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="clientName">Client Name</Label>
                <Input
                  id="clientName"
                  value={formData.clientName}
                  onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="clientEmail">Client Email</Label>
                <Input
                  id="clientEmail"
                  type="email"
                  value={formData.clientEmail}
                  onChange={(e) => setFormData({ ...formData, clientEmail: e.target.value })}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="productionArtworkUrl">Production Artwork Folder (Google Drive URL)</Label>
                <Input
                  id="productionArtworkUrl"
                  type="url"
                  placeholder="https://drive.google.com/..."
                  value={formData.productionArtworkUrl}
                  onChange={(e) => setFormData({ ...formData, productionArtworkUrl: e.target.value })}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Proof Request"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>Proof Request Details</DialogTitle>
                {proofDetail?.proof && (
                  <p className="text-xs text-muted-foreground mt-1">
                    ID: <code className="font-mono bg-muted px-1.5 py-0.5 rounded">{proofDetail.proof.id.slice(-8).toUpperCase()}</code>
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {proofDetail?.proof && !["APPROVED", "PRODUCTION", "PREFLIGHT_REVIEW", "PREFLIGHT_REVISIONS", "PREFLIGHT_APPROVED", "PRINTED"].includes(proofDetail.proof.status) && (
                  <Button variant="outline" size="sm" onClick={openEditDialog}>
                    <Pencil className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                )}
                {proofDetail?.proof && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      setDeleteProofId(proofDetail!.proof!.id)
                      setDeleteDialogOpen(true)
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                )}
              </div>
            </div>
          </DialogHeader>

          {!proofDetail?.proof ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Title</p>
                    <p className="font-medium">{proofDetail.proof.title}</p>
                  </div>
                  {proofDetail.proof.description && (
                    <div>
                      <p className="text-sm text-muted-foreground">Description</p>
                      <p>{proofDetail.proof.description}</p>
                    </div>
                  )}
                  <div className="flex gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      {getStatusBadge(proofDetail.proof.status)}
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Priority</p>
                      {getPriorityBadge(proofDetail.proof.priority)}
                    </div>
                  </div>
                  {(proofDetail.proof.designerName || proofDetail.proof.designerEmail) && (
                    <div>
                      <p className="text-sm text-muted-foreground">Designer</p>
                      <p>{proofDetail.proof.designerName}{proofDetail.proof.designerEmail ? ` (${proofDetail.proof.designerEmail})` : ""}</p>
                    </div>
                  )}
                  {(proofDetail.proof.clientName || proofDetail.proof.clientEmail) && (
                    <div>
                      <p className="text-sm text-muted-foreground">Client</p>
                      <p>{proofDetail.proof.clientName}{proofDetail.proof.clientEmail ? ` (${proofDetail.proof.clientEmail})` : ""}</p>
                    </div>
                  )}
                  {proofDetail.proof.printVendor && (
                    <div>
                      <p className="text-sm text-muted-foreground">Print Vendor</p>
                      <p>{proofDetail.proof.printVendor}</p>
                    </div>
                  )}
                  {proofDetail.proof.productionArtworkUrl && (
                    <div>
                      <p className="text-sm text-muted-foreground">Production Artwork Folder</p>
                      <a
                        href={proofDetail.proof.productionArtworkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline text-sm flex items-center gap-1"
                      >
                        <FolderOpen className="h-3 w-3" />
                        Open Folder
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {proofDetail.proof.area && <div><span className="text-muted-foreground">Area:</span> {proofDetail.proof.area}</div>}
                    {proofDetail.proof.category && <div><span className="text-muted-foreground">Category:</span> {proofDetail.proof.category}</div>}
                    {proofDetail.proof.dimensions && <div><span className="text-muted-foreground">Dimensions:</span> {proofDetail.proof.dimensions}</div>}
                    {proofDetail.proof.material && <div><span className="text-muted-foreground">Material:</span> {proofDetail.proof.material}</div>}
                    {proofDetail.proof.quantity && <div><span className="text-muted-foreground">Quantity:</span> {proofDetail.proof.quantity}</div>}
                    {proofDetail.proof.dueDate && <div><span className="text-muted-foreground">Due:</span> {formatDate(proofDetail.proof.dueDate)}</div>}
                    {proofDetail.proof.feedbackDueDate && <div><span className="text-muted-foreground">Feedback Due:</span> {formatDate(proofDetail.proof.feedbackDueDate)}</div>}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Current Asset</p>
                    {proofDetail.proof.status === "IN_PROGRESS" && (
                      <Button variant="outline" size="sm" onClick={openUploadVersionDialog}>
                        <Upload className="h-4 w-4 mr-1" />
                        New Version
                      </Button>
                    )}
                  </div>
                  {renderCurrentAsset()}
                </div>
              </div>

              <Separator />

              {renderStatusActions()}

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4" />
                  <h3 className="font-medium">Version History</h3>
                </div>
                {proofDetail.versions.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No versions available</p>
                ) : (
                  <ScrollArea className="h-40">
                    <div className="space-y-2">
                      {proofDetail.versions.map((version) => (
                        <div key={version.id} className="flex items-center justify-between p-2 border rounded text-sm">
                          <div>
                            <span className="font-medium">v{version.version}</span>
                            <span className="text-muted-foreground ml-2">{version.fileName}</span>
                            {version.googleDriveUrl && <Link2 className="h-3 w-3 inline ml-1 text-muted-foreground" />}
                            <span className="text-muted-foreground ml-2">by {version.uploadedByName}</span>
                            {version.notes && <span className="text-muted-foreground ml-2">- {version.notes}</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground text-xs">{formatDateTime(version.createdAt)}</span>
                            {renderVersionLink(version)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  <h3 className="font-medium">Comments</h3>
                </div>
                {proofDetail.comments.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No comments yet</p>
                ) : (
                  <ScrollArea className="h-48">
                    <div className="space-y-3">
                      {proofDetail.comments.map((comment) => (
                        <div
                          key={comment.id}
                          className={`p-3 rounded-lg ${
                            comment.isInternal ? "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 border" : "bg-muted"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{comment.authorName}</span>
                              <Badge variant="outline" className="text-xs">{comment.authorRole}</Badge>
                              {comment.isInternal && <Badge variant="secondary" className="text-xs">Internal</Badge>}
                            </div>
                            <span className="text-xs text-muted-foreground">{formatDateTime(comment.createdAt)}</span>
                          </div>
                          <p className="text-sm">{comment.content}</p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}

                <form onSubmit={handleAddComment} className="space-y-2">
                  <Textarea
                    placeholder="Add a comment..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    rows={2}
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="isInternal"
                        checked={isInternalComment}
                        onCheckedChange={(checked) => setIsInternalComment(checked === true)}
                      />
                      <Label htmlFor="isInternal" className="text-sm">Internal only (not visible to client)</Label>
                    </div>
                    <Button type="submit" size="sm" disabled={addingComment || !newComment.trim()}>
                      {addingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Comment"}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={uploadVersionDialogOpen} onOpenChange={setUploadVersionDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upload New Version</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUploadNewVersion} className="space-y-4">
            <Tabs value={uploadMode} onValueChange={(v) => setUploadMode(v as "file" | "drive")}>
              <TabsList className="w-full">
                <TabsTrigger value="file" className="flex-1">Upload File</TabsTrigger>
                <TabsTrigger value="drive" className="flex-1">Google Drive Link</TabsTrigger>
              </TabsList>
            </Tabs>

            {uploadMode === "file" ? (
              <div className="space-y-2">
                <Label htmlFor="versionFile">New Version File *</Label>
                <Input
                  id="versionFile"
                  type="file"
                  onChange={(e) => setVersionFile(e.target.files?.[0] || null)}
                />
                {versionFile && (
                  <p className="text-sm text-muted-foreground">
                    Selected: {versionFile.name} ({(versionFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="driveUrl">Google Drive URL *</Label>
                  <Input
                    id="driveUrl"
                    type="url"
                    placeholder="https://drive.google.com/..."
                    value={googleDriveUrl}
                    onChange={(e) => setGoogleDriveUrl(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="driveFileName">File Name</Label>
                  <Input
                    id="driveFileName"
                    placeholder="e.g., Design_v2.pdf"
                    value={googleDriveFileName}
                    onChange={(e) => setGoogleDriveFileName(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="versionNotes">Notes</Label>
              <Textarea
                id="versionNotes"
                value={versionNotes}
                onChange={(e) => setVersionNotes(e.target.value)}
                rows={2}
                placeholder="Optional notes about this version..."
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setUploadVersionDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {uploading ? "Uploading..." : "Saving..."}
                  </>
                ) : uploadMode === "file" ? (
                  "Upload Version"
                ) : (
                  "Save Drive Link"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={clientInfoDialogOpen} onOpenChange={setClientInfoDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Send to Client</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSendToClient} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter the client details to send this proof for review. A magic link email will be sent to the client.
            </p>
            <div className="space-y-2">
              <Label htmlFor="sendClientName">Client Name *</Label>
              <Input
                id="sendClientName"
                value={clientFormData.clientName}
                onChange={(e) => setClientFormData({ ...clientFormData, clientName: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sendClientEmail">Client Email *</Label>
              <Input
                id="sendClientEmail"
                type="email"
                value={clientFormData.clientEmail}
                onChange={(e) => setClientFormData({ ...clientFormData, clientEmail: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="feedbackDueDate">Feedback Due By</Label>
              <Input
                id="feedbackDueDate"
                type="date"
                value={clientFormData.feedbackDueDate}
                onChange={(e) => setClientFormData({ ...clientFormData, feedbackDueDate: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">Optional deadline for client to provide feedback</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setClientInfoDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send to Client
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={revisionCommentDialogOpen} onOpenChange={setRevisionCommentDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Request Revisions</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRequestRevisions} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Add an optional comment explaining what revisions are needed.
            </p>
            <div className="space-y-2">
              <Label htmlFor="revisionComment">Comment</Label>
              <Textarea
                id="revisionComment"
                value={revisionComment}
                onChange={(e) => setRevisionComment(e.target.value)}
                rows={3}
                placeholder="Describe the revisions needed..."
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRevisionCommentDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Request Revisions"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={adminApproveDialogOpen} onOpenChange={setAdminApproveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve on Behalf of Client</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the proof as approved without the client's direct approval through the portal. The approval will be recorded as made by you on behalf of the client.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAdminApproveOnBehalf}
              disabled={submitting}
              className="bg-green-600 hover:bg-green-700"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Approving...
                </>
              ) : (
                "Approve"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={preflightRevisionDialogOpen} onOpenChange={setPreflightRevisionDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Request Pre-Flight Revisions</DialogTitle>
          </DialogHeader>
          <form onSubmit={handlePreflightRevisions} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Add a comment explaining what revisions are needed on the pre-flight proof. This will be visible to the vendor.
            </p>
            <div className="space-y-2">
              <Label htmlFor="preflightRevisionComment">Comment</Label>
              <Textarea
                id="preflightRevisionComment"
                value={preflightRevisionComment}
                onChange={(e) => setPreflightRevisionComment(e.target.value)}
                rows={3}
                placeholder="Describe the revisions needed..."
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPreflightRevisionDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Request Revisions"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={adminPreflightDialogOpen} onOpenChange={setAdminPreflightDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upload Pre-Flight Proof (Admin — Acting as Vendor)</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdminUploadPreflight} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload the vendor's pre-flight proof on their behalf. This will move the proof to Pre-Flight Review status.
            </p>
            <Tabs value={adminPreflightUploadMode} onValueChange={(v) => setAdminPreflightUploadMode(v as "file" | "drive")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="file">Upload File</TabsTrigger>
                <TabsTrigger value="drive">Google Drive Link</TabsTrigger>
              </TabsList>
            </Tabs>
            {adminPreflightUploadMode === "file" ? (
              <div className="space-y-2">
                <Label htmlFor="adminPreflightFile">File *</Label>
                <Input
                  id="adminPreflightFile"
                  type="file"
                  onChange={(e) => setAdminPreflightFile(e.target.files?.[0] || null)}
                />
                {adminPreflightFile && (
                  <p className="text-xs text-muted-foreground">{adminPreflightFile.name} ({(adminPreflightFile.size / 1024).toFixed(1)} KB)</p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="adminPreflightDriveUrl">Google Drive URL *</Label>
                  <Input
                    id="adminPreflightDriveUrl"
                    value={adminPreflightDriveUrl}
                    onChange={(e) => setAdminPreflightDriveUrl(e.target.value)}
                    placeholder="https://drive.google.com/..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adminPreflightDriveFileName">Display Name</Label>
                  <Input
                    id="adminPreflightDriveFileName"
                    value={adminPreflightDriveFileName}
                    onChange={(e) => setAdminPreflightDriveFileName(e.target.value)}
                    placeholder="e.g. Pre-Flight v1.pdf"
                  />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="adminPreflightNotes">Notes (optional)</Label>
              <Textarea
                id="adminPreflightNotes"
                value={adminPreflightNotes}
                onChange={(e) => setAdminPreflightNotes(e.target.value)}
                rows={2}
                placeholder="Any notes about this pre-flight..."
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAdminPreflightDialogOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || uploading}>
                {uploading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading...</>
                ) : submitting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                ) : (
                  <><Upload className="h-4 w-4 mr-2" />Upload Pre-Flight Proof</>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Proof Request</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditProof} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="edit-title">Title *</Label>
                <Input
                  id="edit-title"
                  value={editFormData.title}
                  onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={editFormData.description}
                  onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-designerName">Designer Name</Label>
                <Input
                  id="edit-designerName"
                  value={editFormData.designerName}
                  onChange={(e) => setEditFormData({ ...editFormData, designerName: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-designerEmail">Designer Email</Label>
                <Input
                  id="edit-designerEmail"
                  type="email"
                  value={editFormData.designerEmail}
                  onChange={(e) => setEditFormData({ ...editFormData, designerEmail: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-printVendor">Print Vendor</Label>
                <Input
                  id="edit-printVendor"
                  value={editFormData.printVendor}
                  onChange={(e) => setEditFormData({ ...editFormData, printVendor: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-area">Area</Label>
                <Input
                  id="edit-area"
                  value={editFormData.area}
                  onChange={(e) => setEditFormData({ ...editFormData, area: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-category">Category</Label>
                <Input
                  id="edit-category"
                  value={editFormData.category}
                  onChange={(e) => setEditFormData({ ...editFormData, category: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-dimensions">Dimensions</Label>
                <Input
                  id="edit-dimensions"
                  value={editFormData.dimensions}
                  onChange={(e) => setEditFormData({ ...editFormData, dimensions: e.target.value })}
                  placeholder="e.g., 24x36 inches"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-material">Material</Label>
                <Input
                  id="edit-material"
                  value={editFormData.material}
                  onChange={(e) => setEditFormData({ ...editFormData, material: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-quantity">Quantity</Label>
                <Input
                  id="edit-quantity"
                  type="number"
                  min="1"
                  value={editFormData.quantity}
                  onChange={(e) => setEditFormData({ ...editFormData, quantity: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-dueDate">Due Date</Label>
                <Input
                  id="edit-dueDate"
                  type="date"
                  value={editFormData.dueDate}
                  onChange={(e) => setEditFormData({ ...editFormData, dueDate: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-priority">Priority</Label>
                <Select
                  value={editFormData.priority}
                  onValueChange={(value) => setEditFormData({ ...editFormData, priority: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NORMAL">Normal</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="URGENT">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-clientName">Client Name</Label>
                <Input
                  id="edit-clientName"
                  value={editFormData.clientName}
                  onChange={(e) => setEditFormData({ ...editFormData, clientName: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-clientEmail">Client Email</Label>
                <Input
                  id="edit-clientEmail"
                  type="email"
                  value={editFormData.clientEmail}
                  onChange={(e) => setEditFormData({ ...editFormData, clientEmail: e.target.value })}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="edit-productionArtworkUrl">Production Artwork Folder (Google Drive URL)</Label>
                <Input
                  id="edit-productionArtworkUrl"
                  type="url"
                  placeholder="https://drive.google.com/..."
                  value={editFormData.productionArtworkUrl}
                  onChange={(e) => setEditFormData({ ...editFormData, productionArtworkUrl: e.target.value })}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={vendorDialogOpen} onOpenChange={setVendorDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Send to Vendor</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              if (!selectedProofId || !vendorFormData.vendorName || !vendorFormData.vendorEmail) {
                toast({
                  title: "Error",
                  description: "Vendor name and email are required",
                  variant: "destructive",
                })
                return
              }
              setSubmitting(true)
              try {
                const result = await sendVendorPortalAccess(
                  selectedProofId,
                  vendorFormData.vendorEmail,
                  vendorFormData.vendorName
                )
                if (result.success) {
                  toast({
                    title: "Success",
                    description: "Vendor portal link sent successfully",
                  })
                  setVendorDialogOpen(false)
                } else {
                  throw new Error(result.error || "Failed to send vendor portal link")
                }
              } catch (error) {
                toast({
                  title: "Error",
                  description: error instanceof Error ? error.message : "Failed to send vendor portal link",
                  variant: "destructive",
                })
              } finally {
                setSubmitting(false)
              }
            }}
            className="space-y-4"
          >
            <p className="text-sm text-muted-foreground">
              Send the approved proof and production details to a vendor. They will receive an email with a link to view the production portal.
            </p>
            <div className="space-y-2">
              <Label htmlFor="vendorName">Vendor Name *</Label>
              <Input
                id="vendorName"
                value={vendorFormData.vendorName}
                onChange={(e) => setVendorFormData({ ...vendorFormData, vendorName: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vendorEmail">Vendor Email *</Label>
              <Input
                id="vendorEmail"
                type="email"
                value={vendorFormData.vendorEmail}
                onChange={(e) => setVendorFormData({ ...vendorFormData, vendorEmail: e.target.value })}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setVendorDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Truck className="h-4 w-4 mr-2" />
                    Send to Vendor
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Proof Request</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this proof request? This will permanently remove the proof and all associated versions, comments, and portal access. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProof}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
