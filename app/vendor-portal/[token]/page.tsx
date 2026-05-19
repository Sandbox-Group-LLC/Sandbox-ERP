"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  validateVendorPortalAccess,
  getVendorProofs,
  vendorUploadPreflightProof,
  vendorMarkPrinted,
  getVendorProofComments,
  type VendorPortalAccessData,
  type VendorProofData,
} from "./actions"
import {
  ExternalLink,
  Package,
  Ruler,
  Tag,
  Building,
  Hash,
  Calendar,
  CheckCircle,
  FolderOpen,
  FileText,
  Download,
  Link2,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Upload,
  MessageSquare,
  Printer,
  Loader2,
} from "lucide-react"

export const dynamic = "force-dynamic"

function formatDate(dateString: string | null): string {
  if (!dateString) return "-"
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function isImageMimeType(mimeType: string | null): boolean {
  return mimeType?.startsWith("image/") || false
}

function getStatusBadge(status: string) {
  switch (status) {
    case "APPROVED":
      return (
        <Badge className="bg-green-600 hover:bg-green-700 shrink-0">
          <CheckCircle className="h-3 w-3 mr-1" />
          Approved
        </Badge>
      )
    case "PRODUCTION":
      return (
        <Badge className="bg-teal-600 hover:bg-teal-700 shrink-0">
          <Package className="h-3 w-3 mr-1" />
          Production
        </Badge>
      )
    case "PREFLIGHT_REVIEW":
      return (
        <Badge className="bg-indigo-500 hover:bg-indigo-600 shrink-0">
          <Clock className="h-3 w-3 mr-1" />
          Awaiting Review
        </Badge>
      )
    case "PREFLIGHT_REVISIONS":
      return (
        <Badge variant="outline" className="border-orange-500 text-orange-500 shrink-0">
          <AlertCircle className="h-3 w-3 mr-1" />
          Revisions Requested
        </Badge>
      )
    case "PREFLIGHT_APPROVED":
      return (
        <Badge className="bg-emerald-500 hover:bg-emerald-600 shrink-0">
          <CheckCircle className="h-3 w-3 mr-1" />
          Pre-Flight Approved
        </Badge>
      )
    case "PRINTED":
      return (
        <Badge className="bg-slate-500 hover:bg-slate-600 shrink-0">
          <Printer className="h-3 w-3 mr-1" />
          Printed
        </Badge>
      )
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

function ProofCard({
  proof,
  token,
  onRefresh,
}: {
  proof: VendorProofData
  token: string
  onRefresh: () => void
}) {
  const [open, setOpen] = useState(false)
  const [showUploadForm, setShowUploadForm] = useState(false)
  const [uploadMode, setUploadMode] = useState<"file" | "drive">("file")
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [driveUrl, setDriveUrl] = useState("")
  const [driveFileName, setDriveFileName] = useState("")
  const [uploadNotes, setUploadNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [comments, setComments] = useState<Array<{ id: string; authorName: string; content: string; createdAt: string }>>([])
  const [commentsLoaded, setCommentsLoaded] = useState(false)

  const loadComments = useCallback(async () => {
    if (proof.status === "PREFLIGHT_REVISIONS" && !commentsLoaded) {
      const data = await getVendorProofComments(token, proof.id)
      setComments(data)
      setCommentsLoaded(true)
    }
  }, [proof.status, proof.id, token, commentsLoaded])

  useEffect(() => {
    loadComments()
  }, [loadComments])

  async function handleUploadPreflight(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    try {
      let objectPath: string | undefined
      let fileName: string
      let fileSize: number | undefined
      let mimeType: string | undefined

      if (uploadMode === "file") {
        if (!uploadFile) {
          alert("Please select a file")
          setSubmitting(false)
          return
        }
        const formData = new FormData()
        formData.append("file", uploadFile)
        formData.append("token", token)

        const uploadRes = await fetch("/api/vendor-upload", {
          method: "POST",
          body: formData,
        })

        if (!uploadRes.ok) {
          const err = await uploadRes.json()
          throw new Error(err.error || "Upload failed")
        }

        const uploadData = await uploadRes.json()
        objectPath = uploadData.objectPath
        fileName = uploadData.fileName
        fileSize = uploadFile.size
        mimeType = uploadFile.type
      } else {
        if (!driveUrl) {
          alert("Please enter a Google Drive URL")
          setSubmitting(false)
          return
        }
        fileName = driveFileName || "Pre-Flight Proof"
      }

      const result = await vendorUploadPreflightProof(token, proof.id, {
        objectPath,
        googleDriveUrl: uploadMode === "drive" ? driveUrl : undefined,
        fileName: fileName!,
        fileSize,
        mimeType,
        notes: uploadNotes || undefined,
      })

      if (result.success) {
        setShowUploadForm(false)
        setUploadFile(null)
        setDriveUrl("")
        setDriveFileName("")
        setUploadNotes("")
        onRefresh()
      } else {
        alert(result.error || "Failed to upload pre-flight proof")
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : "Upload failed")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleMarkPrinted() {
    if (!confirm("Are you sure you want to mark this proof as printed? This action cannot be undone.")) return
    setSubmitting(true)
    try {
      const result = await vendorMarkPrinted(token, proof.id)
      if (result.success) {
        onRefresh()
      } else {
        alert(result.error || "Failed to mark as printed")
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to mark as printed")
    } finally {
      setSubmitting(false)
    }
  }

  const canUpload = proof.status === "PRODUCTION" || proof.status === "PREFLIGHT_REVISIONS"
  const uploadLabel = proof.status === "PREFLIGHT_REVISIONS" ? "Upload Revised Pre-Flight" : "Upload Pre-Flight Proof"

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base">{proof.title}</CardTitle>
              {proof.projectName && (
                <p className="text-sm text-muted-foreground mt-1">
                  Project: {proof.projectName}
                </p>
              )}
            </div>
            {getStatusBadge(proof.status)}
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {proof.dimensions && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Ruler className="h-3.5 w-3.5" />
                <span>{proof.dimensions}</span>
              </div>
            )}
            {proof.material && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Package className="h-3.5 w-3.5" />
                <span>{proof.material}</span>
              </div>
            )}
            {proof.quantity && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Hash className="h-3.5 w-3.5" />
                <span>Qty: {proof.quantity}</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {proof.dueDate && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                <span>Due: {formatDate(proof.dueDate)}</span>
              </div>
            )}
            {proof.approvedAt && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                <span>Approved: {formatDate(proof.approvedAt)}</span>
              </div>
            )}
          </div>

          {canUpload && (
            <div className="pt-1">
              {!showUploadForm ? (
                <Button onClick={() => setShowUploadForm(true)} className="w-full">
                  <Upload className="h-4 w-4 mr-2" />
                  {uploadLabel}
                </Button>
              ) : (
                <form onSubmit={handleUploadPreflight} className="border rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm">{uploadLabel}</h4>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setShowUploadForm(false)}>
                      Cancel
                    </Button>
                  </div>

                  <Tabs value={uploadMode} onValueChange={(v) => setUploadMode(v as "file" | "drive")}>
                    <TabsList className="w-full">
                      <TabsTrigger value="file" className="flex-1">Upload File</TabsTrigger>
                      <TabsTrigger value="drive" className="flex-1">Google Drive Link</TabsTrigger>
                    </TabsList>
                  </Tabs>

                  {uploadMode === "file" ? (
                    <div className="space-y-2">
                      <Label htmlFor={`upload-${proof.id}`}>File *</Label>
                      <Input
                        id={`upload-${proof.id}`}
                        type="file"
                        onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                      />
                      {uploadFile && (
                        <p className="text-sm text-muted-foreground">
                          Selected: {uploadFile.name} ({(uploadFile.size / 1024).toFixed(1)} KB)
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor={`drive-url-${proof.id}`}>Google Drive URL *</Label>
                        <Input
                          id={`drive-url-${proof.id}`}
                          type="url"
                          placeholder="https://drive.google.com/..."
                          value={driveUrl}
                          onChange={(e) => setDriveUrl(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`drive-name-${proof.id}`}>File Name</Label>
                        <Input
                          id={`drive-name-${proof.id}`}
                          placeholder="e.g., PreFlight_v1.pdf"
                          value={driveFileName}
                          onChange={(e) => setDriveFileName(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor={`notes-${proof.id}`}>Notes</Label>
                    <Textarea
                      id={`notes-${proof.id}`}
                      value={uploadNotes}
                      onChange={(e) => setUploadNotes(e.target.value)}
                      rows={2}
                      placeholder="Optional notes about this pre-flight proof..."
                    />
                  </div>

                  <Button type="submit" disabled={submitting} className="w-full">
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Submit Pre-Flight Proof
                      </>
                    )}
                  </Button>
                </form>
              )}
            </div>
          )}

          {proof.status === "PREFLIGHT_REVISIONS" && comments.length > 0 && (
            <div className="border border-orange-200 rounded-lg p-3 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-800 space-y-2">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-orange-500" />
                <h4 className="text-sm font-medium text-orange-700 dark:text-orange-400">Revision Comments</h4>
              </div>
              {comments.map((comment) => (
                <div key={comment.id} className="text-sm space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{comment.authorName}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(comment.createdAt)}</span>
                  </div>
                  <p className="text-muted-foreground">{comment.content}</p>
                </div>
              ))}
            </div>
          )}

          {proof.status === "PREFLIGHT_APPROVED" && (
            <div className="pt-1">
              <Button onClick={handleMarkPrinted} disabled={submitting} className="w-full" variant="outline">
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Printer className="h-4 w-4 mr-2" />
                    Mark as Printed
                  </>
                )}
              </Button>
            </div>
          )}

          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full mt-1">
              {open ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-2" />
                  Hide Details
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-2" />
                  View Details
                </>
              )}
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent className="space-y-4">
            {proof.description && (
              <p className="text-sm text-muted-foreground">{proof.description}</p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {proof.printVendor && (
                <div className="flex items-start gap-2">
                  <Building className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Print Vendor</p>
                    <p className="text-sm font-medium">{proof.printVendor}</p>
                  </div>
                </div>
              )}
              {proof.area && (
                <div className="flex items-start gap-2">
                  <Tag className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Area</p>
                    <p className="text-sm font-medium">{proof.area}</p>
                  </div>
                </div>
              )}
              {proof.category && (
                <div className="flex items-start gap-2">
                  <Tag className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Category</p>
                    <p className="text-sm font-medium">{proof.category}</p>
                  </div>
                </div>
              )}
              {proof.dimensions && (
                <div className="flex items-start gap-2">
                  <Ruler className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Dimensions</p>
                    <p className="text-sm font-medium">{proof.dimensions}</p>
                  </div>
                </div>
              )}
              {proof.material && (
                <div className="flex items-start gap-2">
                  <Package className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Material</p>
                    <p className="text-sm font-medium">{proof.material}</p>
                  </div>
                </div>
              )}
              {proof.quantity && (
                <div className="flex items-start gap-2">
                  <Hash className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Quantity</p>
                    <p className="text-sm font-medium">{proof.quantity}</p>
                  </div>
                </div>
              )}
              {proof.dueDate && (
                <div className="flex items-start gap-2">
                  <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Due Date</p>
                    <p className="text-sm font-medium">{formatDate(proof.dueDate)}</p>
                  </div>
                </div>
              )}
              {proof.approvedAt && (
                <div className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 mt-0.5 text-green-600" />
                  <div>
                    <p className="text-xs text-muted-foreground">Approved</p>
                    <p className="text-sm font-medium">
                      {formatDate(proof.approvedAt)}
                      {proof.approvedByName ? ` by ${proof.approvedByName}` : ""}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {proof.productionArtworkUrl && (
              <div className="border rounded-lg p-3 bg-primary/5 border-primary/20">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">Production Artwork Folder</p>
                      <p className="text-xs text-muted-foreground">Access production-ready artwork files</p>
                    </div>
                  </div>
                  <a
                    href={proof.productionArtworkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button size="sm">
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                      Open Folder
                    </Button>
                  </a>
                </div>
              </div>
            )}

            {proof.currentAsset && (
              <div className="space-y-3">
                <p className="text-sm font-medium">
                  {["PREFLIGHT_REVIEW", "PREFLIGHT_REVISIONS", "PREFLIGHT_APPROVED", "PRINTED"].includes(proof.status)
                    ? "Pre-Flight Proof"
                    : "Approved Proof"}
                </p>
                {proof.currentAsset.signedUrl && isImageMimeType(proof.currentAsset.mimeType) ? (
                  <div className="border rounded-lg overflow-hidden">
                    <img
                      src={proof.currentAsset.signedUrl}
                      alt={proof.currentAsset.fileName}
                      className="max-h-72 w-full object-contain bg-muted"
                    />
                  </div>
                ) : proof.currentAsset.googleDriveUrl && !proof.currentAsset.signedUrl ? (
                  <div className="border rounded-lg p-4 flex items-center justify-center bg-muted">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Link2 className="h-5 w-5" />
                      <p>{proof.currentAsset.fileName}</p>
                    </div>
                  </div>
                ) : proof.currentAsset.signedUrl ? (
                  <div className="border rounded-lg p-4 flex items-center justify-center bg-muted">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <FileText className="h-5 w-5" />
                      <p>{proof.currentAsset.fileName}</p>
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-muted-foreground">
                    <p>Version {proof.currentAsset.version} — {proof.currentAsset.fileName}</p>
                    <p>Uploaded by {proof.currentAsset.uploadedByName}</p>
                    {proof.currentAsset.notes && (
                      <p className="mt-1 italic">{proof.currentAsset.notes}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {proof.currentAsset.googleDriveUrl && (
                      <a
                        href={proof.currentAsset.googleDriveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button variant="outline" size="sm">
                          <Link2 className="h-3.5 w-3.5 mr-1.5" />
                          Google Drive
                        </Button>
                      </a>
                    )}
                    {proof.currentAsset.signedUrl && (
                      <a
                        href={proof.currentAsset.signedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button variant="outline" size="sm">
                          <Download className="h-3.5 w-3.5 mr-1.5" />
                          Download
                        </Button>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!proof.currentAsset && (
              <div className="text-center py-4 text-muted-foreground">
                <FileText className="h-6 w-6 mx-auto mb-1" />
                <p className="text-sm">No asset available</p>
              </div>
            )}
          </CollapsibleContent>
        </CardContent>
      </Collapsible>
    </Card>
  )
}

export default function VendorPortalPage() {
  const params = useParams()
  const token = params.token as string

  const [loading, setLoading] = useState(true)
  const [access, setAccess] = useState<VendorPortalAccessData | null>(null)
  const [proofs, setProofs] = useState<VendorProofData[]>([])

  const loadData = useCallback(async () => {
    const accessData = await validateVendorPortalAccess(token)
    setAccess(accessData)

    if (accessData.valid) {
      const proofsData = await getVendorProofs(token)
      setProofs(proofsData)
    }

    setLoading(false)
  }, [token])

  useEffect(() => {
    loadData()
  }, [loadData])

  function handleRefresh() {
    loadData()
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="text-muted-foreground">Loading vendor portal...</p>
        </div>
      </div>
    )
  }

  if (!access?.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
            <h2 className="text-xl font-semibold">
              {access?.expired ? "Link Expired" : "Invalid Link"}
            </h2>
            <p className="text-muted-foreground">
              {access?.expired
                ? "This vendor portal link has expired. Please contact the team for a new link."
                : "This vendor portal link is invalid. Please check the URL and try again."}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (proofs.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <div className="border-b bg-card">
          <div className="max-w-5xl mx-auto px-4 py-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-bold">Vendor Production Portal</h1>
              <p className="text-sm text-muted-foreground">
                Welcome, {access.vendorName}
              </p>
            </div>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4 py-6">
          <Card>
            <CardContent className="pt-6 text-center space-y-4">
              <Clock className="h-12 w-12 text-muted-foreground mx-auto" />
              <h2 className="text-xl font-semibold">No Proofs Available</h2>
              <p className="text-muted-foreground">
                There are no proofs available for viewing at this time.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold">Vendor Production Portal</h1>
            <p className="text-sm text-muted-foreground">
              Welcome, {access.vendorName}
            </p>
          </div>
          <Badge variant="secondary" className="w-fit">
            {proofs.length} {proofs.length === 1 ? "Proof" : "Proofs"}
          </Badge>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {proofs.map((proof) => (
            <ProofCard key={proof.id} proof={proof} token={token} onRefresh={handleRefresh} />
          ))}
        </div>
      </div>
    </div>
  )
}
