"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { 
  Eye, 
  ChevronDown, 
  ChevronRight, 
  Send, 
  User, 
  Users, 
  FileText, 
  Image as ImageIcon, 
  Calendar, 
  Package, 
  Ruler, 
  Tag, 
  Building, 
  Hash, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  History, 
  MessageSquare, 
  Download,
  Loader2,
  ExternalLink,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
  listClientProofs,
  getClientProofDetail,
  addClientProofComment,
  submitClientProofDecision,
  type ClientProofData,
  type ClientProofVersionData,
  type ClientProofCommentData,
} from "./client-proof-actions"

interface ClientProofApprovalsProps {
  projectId: string
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "-"
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function getStatusBadge(status: string) {
  switch (status) {
    case "CLIENT_REVIEW":
      return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-300">Pending Review</Badge>
    case "APPROVED":
      return <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-300">Approved</Badge>
    case "REVISIONS_NEEDED":
      return <Badge variant="secondary" className="bg-orange-100 text-orange-800 border-orange-300">Revisions Needed</Badge>
    case "DRAFT":
      return <Badge variant="outline">Draft</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

function getPriorityBadge(priority: string) {
  switch (priority) {
    case "HIGH":
      return <Badge variant="destructive">High Priority</Badge>
    case "MEDIUM":
      return <Badge variant="secondary">Medium Priority</Badge>
    case "LOW":
      return <Badge variant="outline">Low Priority</Badge>
    default:
      return null
  }
}

function isImageFile(mimeType: string | null): boolean {
  return mimeType?.startsWith("image/") || false
}

function isPdfFile(mimeType: string | null): boolean {
  return mimeType === "application/pdf"
}

export function ClientProofApprovals({ projectId }: ClientProofApprovalsProps) {
  const [proofs, setProofs] = useState<ClientProofData[]>([])
  const [loading, setLoading] = useState(true)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [selectedProofId, setSelectedProofId] = useState<string | null>(null)
  const [proofDetail, setProofDetail] = useState<{
    proof: ClientProofData | null
    versions: ClientProofVersionData[]
    comments: ClientProofCommentData[]
  } | null>(null)
  const [versionsOpen, setVersionsOpen] = useState(false)

  const [newComment, setNewComment] = useState("")
  const [submittingComment, setSubmittingComment] = useState(false)

  const [decisionDialog, setDecisionDialog] = useState<{
    open: boolean
    type: "APPROVED" | "REVISIONS_NEEDED" | null
  }>({ open: false, type: null })
  const [decisionComment, setDecisionComment] = useState("")
  const [submittingDecision, setSubmittingDecision] = useState(false)

  const { toast } = useToast()

  useEffect(() => {
    loadProofs()
  }, [projectId])

  async function loadProofs() {
    setLoading(true)
    try {
      const data = await listClientProofs(projectId)
      setProofs(data)
    } catch (error) {
      console.error("Failed to load proofs:", error)
      toast({
        title: "Error",
        description: "Failed to load proof approvals",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  async function loadProofDetail(proofId: string) {
    try {
      const detail = await getClientProofDetail(proofId)
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

  async function openDetailDialog(proofId: string) {
    setSelectedProofId(proofId)
    setProofDetail(null)
    setVersionsOpen(false)
    setNewComment("")
    setDetailDialogOpen(true)
    await loadProofDetail(proofId)
  }

  async function handleAddComment() {
    if (!newComment.trim() || !selectedProofId) return
    setSubmittingComment(true)

    const result = await addClientProofComment(selectedProofId, newComment.trim())

    if (result.success) {
      toast({ title: "Comment Added", description: "Your comment has been submitted" })
      setNewComment("")
      await loadProofDetail(selectedProofId)
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to add comment",
        variant: "destructive",
      })
    }

    setSubmittingComment(false)
  }

  function openDecisionDialog(type: "APPROVED" | "REVISIONS_NEEDED") {
    setDecisionDialog({ open: true, type })
    setDecisionComment("")
  }

  async function handleSubmitDecision() {
    if (!decisionDialog.type || !selectedProofId) return

    if (decisionDialog.type !== "APPROVED" && !decisionComment.trim()) {
      toast({
        title: "Comment Required",
        description: "Please provide a comment explaining your decision",
        variant: "destructive",
      })
      return
    }

    setSubmittingDecision(true)

    const result = await submitClientProofDecision(
      selectedProofId,
      decisionDialog.type,
      decisionComment.trim() || undefined
    )

    if (result.success) {
      const decisionText =
        decisionDialog.type === "APPROVED"
          ? "approved"
          : "marked as needing revisions"
      toast({ title: "Decision Submitted", description: `The proof has been ${decisionText}` })
      setDecisionDialog({ open: false, type: null })
      setDecisionComment("")
      await loadProofDetail(selectedProofId)
      await loadProofs()
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to submit decision",
        variant: "destructive",
      })
    }

    setSubmittingDecision(false)
  }

  const proof = proofDetail?.proof
  const versions = proofDetail?.versions || []
  const comments = proofDetail?.comments || []
  const isPendingReview = proof?.status === "CLIENT_REVIEW"
  const isDecided = ["APPROVED", "REVISIONS_NEEDED"].includes(proof?.status || "")

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Proof Approvals</CardTitle>
          <CardDescription>
            Review and approve proof requests for this project
          </CardDescription>
        </CardHeader>
        <CardContent>
          {proofs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No proof approvals available for this project.
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Area</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]">View</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {proofs.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.title}</TableCell>
                      <TableCell>{p.area || "-"}</TableCell>
                      <TableCell>{p.category || "-"}</TableCell>
                      <TableCell>{formatDate(p.dueDate)}</TableCell>
                      <TableCell>{getStatusBadge(p.status)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDetailDialog(p.id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-xl">{proof?.title || "Loading..."}</DialogTitle>
                {proof && (
                  <DialogDescription className="flex items-center gap-2 mt-1">
                    {getStatusBadge(proof.status)}
                    {getPriorityBadge(proof.priority)}
                  </DialogDescription>
                )}
              </div>
            </div>
          </DialogHeader>

          <div>
            {!proofDetail ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : proof ? (
              <div className="space-y-6 py-4">
                {proof.description && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Description</h3>
                    <p className="text-sm">{proof.description}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {proof.printVendor && (
                    <div className="flex items-start gap-2">
                      <Building className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-xs text-muted-foreground">Print Vendor</p>
                        <p className="text-sm font-medium">{proof.printVendor}</p>
                      </div>
                    </div>
                  )}
                  {proof.area && (
                    <div className="flex items-start gap-2">
                      <Tag className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-xs text-muted-foreground">Area</p>
                        <p className="text-sm font-medium">{proof.area}</p>
                      </div>
                    </div>
                  )}
                  {proof.category && (
                    <div className="flex items-start gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-xs text-muted-foreground">Category</p>
                        <p className="text-sm font-medium">{proof.category}</p>
                      </div>
                    </div>
                  )}
                  {proof.dimensions && (
                    <div className="flex items-start gap-2">
                      <Ruler className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-xs text-muted-foreground">Dimensions</p>
                        <p className="text-sm font-medium">{proof.dimensions}</p>
                      </div>
                    </div>
                  )}
                  {proof.material && (
                    <div className="flex items-start gap-2">
                      <Package className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-xs text-muted-foreground">Material</p>
                        <p className="text-sm font-medium">{proof.material}</p>
                      </div>
                    </div>
                  )}
                  {proof.quantity && (
                    <div className="flex items-start gap-2">
                      <Hash className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-xs text-muted-foreground">Quantity</p>
                        <p className="text-sm font-medium">{proof.quantity}</p>
                      </div>
                    </div>
                  )}
                  {proof.dueDate && (
                    <div className="flex items-start gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-xs text-muted-foreground">Due Date</p>
                        <p className="text-sm font-medium">{formatDate(proof.dueDate)}</p>
                      </div>
                    </div>
                  )}
                </div>

                {proof.currentAsset && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-muted/50">
                      <div className="flex items-center gap-2">
                        <ImageIcon className="h-4 w-4" />
                        <span className="text-sm font-medium">Current Proof (Version {proof.currentAsset.version})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {proof.currentAsset.googleDriveUrl && (
                          <Button variant="outline" size="sm" asChild>
                            <a 
                              href={proof.currentAsset.googleDriveUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="h-4 w-4 mr-2" />
                              Open in Google Drive
                            </a>
                          </Button>
                        )}
                        {proof.currentAsset.signedUrl && (
                          <Button variant="outline" size="sm" asChild>
                            <a 
                              href={proof.currentAsset.signedUrl} 
                              download={proof.currentAsset.fileName} 
                              target="_blank" 
                              rel="noopener noreferrer"
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Download
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="p-4 bg-muted/30">
                      {proof.currentAsset.notes && (
                        <p className="text-sm text-muted-foreground mb-4 p-3 bg-muted/50 rounded-lg">
                          {proof.currentAsset.notes}
                        </p>
                      )}
                      {proof.currentAsset.signedUrl ? (
                        isImageFile(proof.currentAsset.mimeType) ? (
                          <img
                            src={proof.currentAsset.signedUrl}
                            alt={proof.currentAsset.fileName}
                            className="max-w-full h-auto mx-auto max-h-[400px] object-contain rounded"
                          />
                        ) : isPdfFile(proof.currentAsset.mimeType) ? (
                          <iframe
                            src={proof.currentAsset.signedUrl}
                            className="w-full h-[400px] rounded"
                            title={proof.currentAsset.fileName}
                          />
                        ) : (
                          <div className="p-8 text-center">
                            <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                            <p className="text-sm text-muted-foreground mb-2">{proof.currentAsset.fileName}</p>
                            <Button variant="outline" asChild>
                              <a 
                                href={proof.currentAsset.signedUrl} 
                                download={proof.currentAsset.fileName} 
                                target="_blank" 
                                rel="noopener noreferrer"
                              >
                                Download File
                              </a>
                            </Button>
                          </div>
                        )
                      ) : proof.currentAsset.googleDriveUrl ? (
                        <div className="p-8 text-center">
                          <ExternalLink className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                          <p className="text-sm text-muted-foreground mb-2">{proof.currentAsset.fileName}</p>
                          <p className="text-sm text-muted-foreground mb-4">This file is stored in Google Drive</p>
                          <Button variant="outline" asChild>
                            <a 
                              href={proof.currentAsset.googleDriveUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="h-4 w-4 mr-2" />
                              Open in Google Drive
                            </a>
                          </Button>
                        </div>
                      ) : (
                        <div className="p-8 text-center">
                          <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                          <p className="text-sm text-muted-foreground mb-2">{proof.currentAsset.fileName}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {versions.length > 1 && (
                  <Collapsible open={versionsOpen} onOpenChange={setVersionsOpen}>
                    <CollapsibleTrigger className="flex items-center gap-2 w-full p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                      {versionsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <History className="h-4 w-4" />
                      <span className="font-medium text-sm">Version History ({versions.length} versions)</span>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-3">
                      <div className="space-y-3">
                        {versions.map((version) => (
                          <div
                            key={version.id}
                            className={`p-3 border rounded-lg ${
                              version.version === proof.currentAsset?.version 
                                ? "border-primary bg-primary/5" 
                                : ""
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <div className="flex items-center gap-2">
                                <Badge 
                                  variant={version.version === proof.currentAsset?.version ? "default" : "outline"}
                                >
                                  v{version.version}
                                </Badge>
                                <span className="text-sm font-medium">{version.fileName}</span>
                                {version.version === proof.currentAsset?.version && (
                                  <Badge variant="secondary" className="text-xs">Current</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                {version.googleDriveUrl && (
                                  <Button variant="ghost" size="sm" asChild>
                                    <a 
                                      href={version.googleDriveUrl} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      title="Open in Google Drive"
                                    >
                                      <ExternalLink className="h-4 w-4" />
                                    </a>
                                  </Button>
                                )}
                                {version.signedUrl && (
                                  <Button variant="ghost" size="sm" asChild>
                                    <a 
                                      href={version.signedUrl} 
                                      download={version.fileName} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                    >
                                      <Download className="h-4 w-4" />
                                    </a>
                                  </Button>
                                )}
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Uploaded by {version.uploadedByName} on {formatDate(version.createdAt)}
                            </p>
                            {version.notes && (
                              <p className="text-sm mt-2 p-2 bg-muted/50 rounded">{version.notes}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                <div className="border rounded-lg">
                  <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/50">
                    <MessageSquare className="h-4 w-4" />
                    <span className="font-medium text-sm">Comments ({comments.length})</span>
                  </div>
                  <div className="p-4 space-y-4">
                    {comments.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">
                        No comments yet. Start the conversation below.
                      </p>
                    ) : (
                      <div className="space-y-3 max-h-[200px] overflow-y-auto">
                        {comments.map((comment) => (
                          <div
                            key={comment.id}
                            className={`p-3 border rounded-lg ${
                              comment.authorRole === "VendorReviewer" 
                                ? "border-blue-200 bg-blue-50/50" 
                                : "border-muted"
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              {comment.authorRole === "VendorReviewer" ? (
                                <User className="h-4 w-4 text-blue-500" />
                              ) : (
                                <Users className="h-4 w-4 text-primary" />
                              )}
                              <span className="font-medium text-sm">{comment.authorName}</span>
                              <Badge 
                                variant={comment.authorRole === "VendorReviewer" ? "secondary" : "default"} 
                                className="text-xs"
                              >
                                {comment.authorRole === "VendorReviewer" ? "Client" : "Sandbox Team"}
                              </Badge>
                              <span className="text-xs text-muted-foreground ml-auto">
                                {formatDate(comment.createdAt)}
                              </span>
                            </div>
                            <p className="text-sm ml-6">{comment.content}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="border-t pt-4">
                      <Textarea
                        placeholder="Add a comment..."
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        rows={2}
                      />
                      <div className="flex justify-end mt-2">
                        <Button
                          onClick={handleAddComment}
                          disabled={!newComment.trim() || submittingComment}
                          size="sm"
                        >
                          <Send className="h-4 w-4 mr-2" />
                          {submittingComment ? "Sending..." : "Send Comment"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {isPendingReview && (
                  <div className="border-2 border-primary/20 rounded-lg p-4">
                    <h3 className="font-medium mb-2">Your Decision</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Please review the proof above and make a decision. You can approve or request revisions.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button
                        onClick={() => openDecisionDialog("APPROVED")}
                        className="bg-green-600 hover:bg-green-700 flex-1"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Approve
                      </Button>
                      <Button
                        onClick={() => openDecisionDialog("REVISIONS_NEEDED")}
                        variant="outline"
                        className="border-yellow-500 text-yellow-700 hover:bg-yellow-50 flex-1"
                      >
                        <AlertCircle className="h-4 w-4 mr-2" />
                        Request Revisions
                      </Button>
                    </div>
                  </div>
                )}

                {isDecided && (
                  <div className={`border-2 rounded-lg p-4 ${
                    proof.status === "APPROVED" 
                      ? "border-green-300 bg-green-50/50" 
                      : "border-orange-300 bg-orange-50/50"
                  }`}>
                    <div className="flex items-center gap-3">
                      {proof.status === "APPROVED" ? (
                        <>
                          <CheckCircle className="h-6 w-6 text-green-600" />
                          <div>
                            <p className="font-medium text-green-700">Proof Approved</p>
                            {proof.approvedByName && (
                              <p className="text-sm text-green-600">
                                Approved by {proof.approvedByName} on {formatDate(proof.approvedAt)}
                              </p>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="h-6 w-6 text-orange-600" />
                          <div>
                            <p className="font-medium text-orange-700">Revisions Needed</p>
                            <p className="text-sm text-orange-600">
                              Waiting for an updated proof version
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Proof not found
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog 
        open={decisionDialog.open} 
        onOpenChange={(open) => setDecisionDialog({ open, type: open ? decisionDialog.type : null })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decisionDialog.type === "APPROVED" && "Approve Proof"}
              {decisionDialog.type === "REVISIONS_NEEDED" && "Request Revisions"}
            </DialogTitle>
            <DialogDescription>
              {decisionDialog.type === "APPROVED" 
                ? "You are about to approve this proof. You can optionally add a comment."
                : "Please provide a comment explaining your decision."}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder={
              decisionDialog.type === "APPROVED"
                ? "Optional comment..."
                : "Please explain your decision..."
            }
            value={decisionComment}
            onChange={(e) => setDecisionComment(e.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDecisionDialog({ open: false, type: null })}
              disabled={submittingDecision}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitDecision}
              disabled={submittingDecision || (decisionDialog.type !== "APPROVED" && !decisionComment.trim())}
              className={
                decisionDialog.type === "APPROVED"
                  ? "bg-green-600 hover:bg-green-700"
                  : ""
              }
            >
              {submittingDecision ? "Submitting..." : "Submit Decision"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
