"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  validateProofPortalAccess,
  getProofForClient,
  getProofVersionsForClient,
  getProofCommentsForClient,
  addClientComment,
  submitProofDecision,
  ProofPortalAccessData,
  ProofPortalData,
  ProofVersionData,
  ProofCommentData,
} from "./actions";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Send,
  User,
  Users,
  FileText,
  Image,
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
  ExternalLink,
} from "lucide-react";

export const dynamic = "force-dynamic"

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getStatusBadge(status: string) {
  switch (status) {
    case "CLIENT_REVIEW":
      return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-300">Pending Review</Badge>;
    case "APPROVED":
      return <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-300">Approved</Badge>;
    case "REVISIONS_NEEDED":
      return <Badge variant="secondary" className="bg-orange-100 text-orange-800 border-orange-300">Revisions Needed</Badge>;
    case "DRAFT":
      return <Badge variant="outline">Draft</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getPriorityBadge(priority: string) {
  switch (priority) {
    case "HIGH":
      return <Badge variant="destructive">High Priority</Badge>;
    case "MEDIUM":
      return <Badge variant="secondary">Medium Priority</Badge>;
    case "LOW":
      return <Badge variant="outline">Low Priority</Badge>;
    default:
      return null;
  }
}

export default function ProofPortalPage() {
  const params = useParams();
  const token = params.token as string;
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState<ProofPortalAccessData | null>(null);
  const [proof, setProof] = useState<ProofPortalData | null>(null);
  const [versions, setVersions] = useState<ProofVersionData[]>([]);
  const [comments, setComments] = useState<ProofCommentData[]>([]);
  const [versionsOpen, setVersionsOpen] = useState(false);

  const [newComment, setNewComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  const [decisionDialog, setDecisionDialog] = useState<{
    open: boolean;
    type: "APPROVED" | "REVISIONS_NEEDED" | null;
  }>({ open: false, type: null });
  const [decisionComment, setDecisionComment] = useState("");
  const [submittingDecision, setSubmittingDecision] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const accessData = await validateProofPortalAccess(token);
      setAccess(accessData);

      if (accessData.valid && accessData.proofId) {
        const [proofData, versionsData, commentsData] = await Promise.all([
          getProofForClient(token),
          getProofVersionsForClient(token),
          getProofCommentsForClient(token),
        ]);
        setProof(proofData);
        setVersions(versionsData);
        setComments(commentsData);
      }

      setLoading(false);
    }
    load();
  }, [token]);

  async function handleAddComment() {
    if (!newComment.trim()) return;
    setSubmittingComment(true);

    const result = await addClientComment(token, newComment.trim());

    if (result.success) {
      toast({ title: "Comment Added", description: "Your comment has been submitted" });
      setNewComment("");
      const commentsData = await getProofCommentsForClient(token);
      setComments(commentsData);
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to add comment",
        variant: "destructive",
      });
    }

    setSubmittingComment(false);
  }

  async function handleSubmitDecision() {
    if (!decisionDialog.type) return;

    if (decisionDialog.type !== "APPROVED" && !decisionComment.trim()) {
      toast({
        title: "Comment Required",
        description: "Please provide a comment explaining your decision",
        variant: "destructive",
      });
      return;
    }

    setSubmittingDecision(true);

    const result = await submitProofDecision(
      token,
      decisionDialog.type,
      decisionComment.trim() || undefined
    );

    if (result.success) {
      const decisionText =
        decisionDialog.type === "APPROVED"
          ? "approved"
          : "revisions needed";
      toast({ title: "Decision Submitted", description: `The proof has been ${decisionText}` });
      setDecisionDialog({ open: false, type: null });
      setDecisionComment("");

      const proofData = await getProofForClient(token);
      setProof(proofData);
      const commentsData = await getProofCommentsForClient(token);
      setComments(commentsData);
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to submit decision",
        variant: "destructive",
      });
    }

    setSubmittingDecision(false);
  }

  function openDecisionDialog(type: "APPROVED" | "REVISIONS_NEEDED") {
    setDecisionDialog({ open: true, type });
    setDecisionComment("");
  }

  function isImageFile(mimeType: string | null): boolean {
    return mimeType?.startsWith("image/") || false;
  }

  function isPdfFile(mimeType: string | null): boolean {
    return mimeType === "application/pdf";
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading proof...</p>
        </div>
      </div>
    );
  }

  if (!access?.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center">
            <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              {access?.expired ? "Access Expired" : "Invalid Access Link"}
            </h2>
            <p className="text-muted-foreground">
              {access?.expired
                ? "This proof access link has expired. Please contact your project manager for a new link."
                : "This link is invalid or has been revoked. Please check the link or contact your project manager."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isPendingReview = proof?.status === "CLIENT_REVIEW";
  const isDecided = ["APPROVED", "REVISIONS_NEEDED"].includes(proof?.status || "");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h1 className="text-xl font-bold">Proof Review</h1>
              <p className="text-sm text-muted-foreground">Welcome, {access.clientName || "Client"}</p>
            </div>
            {proof && (
              <div className="flex items-center gap-2">
                {getStatusBadge(proof.status)}
                {getPriorityBadge(proof.priority)}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className={`container mx-auto px-4 py-6 space-y-6 ${isPendingReview ? "pb-32" : ""}`}>
        {proof && (
          <>
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div>
                    <CardTitle className="text-2xl">{proof.title}</CardTitle>
                    {proof.projectName && (
                      <CardDescription className="mt-1">
                        Project: {proof.projectName}
                      </CardDescription>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {proof.description && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Description</h3>
                    <p className="text-sm">{proof.description}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
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
              </CardContent>
            </Card>

            {proof.currentAsset && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Image className="h-5 w-5" />
                      Current Proof (Version {proof.currentAsset.version})
                    </CardTitle>
                    {proof.currentAsset.signedUrl ? (
                      <Button variant="outline" size="sm" asChild>
                        <a href={proof.currentAsset.signedUrl} download={proof.currentAsset.fileName} target="_blank" rel="noopener noreferrer">
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </a>
                      </Button>
                    ) : proof.currentAsset.googleDriveUrl ? (
                      <Button variant="outline" size="sm" asChild>
                        <a href={proof.currentAsset.googleDriveUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Open in Google Drive
                        </a>
                      </Button>
                    ) : null}
                  </div>
                  <CardDescription>
                    Uploaded by {proof.currentAsset.uploadedByName} on {formatDate(proof.currentAsset.createdAt)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {proof.currentAsset.notes && (
                    <p className="text-sm text-muted-foreground mb-4 p-3 bg-muted/50 rounded-lg">
                      {proof.currentAsset.notes}
                    </p>
                  )}
                  <div className="border rounded-lg overflow-hidden bg-muted/30">
                    {proof.currentAsset.signedUrl ? (
                      isImageFile(proof.currentAsset.mimeType) ? (
                        <img
                          src={proof.currentAsset.signedUrl}
                          alt={proof.currentAsset.fileName}
                          className="max-w-full h-auto mx-auto max-h-[600px] object-contain"
                        />
                      ) : isPdfFile(proof.currentAsset.mimeType) ? (
                        <iframe
                          src={proof.currentAsset.signedUrl}
                          className="w-full h-[600px]"
                          title={proof.currentAsset.fileName}
                        />
                      ) : (
                        <div className="p-8 text-center">
                          <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                          <p className="text-sm text-muted-foreground mb-2">{proof.currentAsset.fileName}</p>
                          <Button variant="outline" asChild>
                            <a href={proof.currentAsset.signedUrl} download={proof.currentAsset.fileName} target="_blank" rel="noopener noreferrer">
                              Download File
                            </a>
                          </Button>
                        </div>
                      )
                    ) : proof.currentAsset.googleDriveUrl ? (
                      <div className="p-8 text-center">
                        <ExternalLink className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                        <p className="text-sm text-muted-foreground mb-2">{proof.currentAsset.fileName}</p>
                        <Button variant="outline" asChild>
                          <a href={proof.currentAsset.googleDriveUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Open in Google Drive
                          </a>
                        </Button>
                      </div>
                    ) : (
                      <div className="p-8 text-center">
                        <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                        <p className="text-sm text-muted-foreground mb-2">{proof.currentAsset.fileName}</p>
                        <p className="text-xs text-muted-foreground">File preview not available</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {versions.length > 1 && (
              <Card>
                <Collapsible open={versionsOpen} onOpenChange={setVersionsOpen}>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                      <CardTitle className="flex items-center gap-2">
                        {versionsOpen ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                        <History className="h-5 w-5" />
                        Version History ({versions.length} versions)
                      </CardTitle>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      <div className="space-y-4">
                        {versions.map((version) => (
                          <div
                            key={version.id}
                            className={`p-4 border rounded-lg ${version.version === proof.currentAsset?.version ? "border-primary bg-primary/5" : ""}`}
                          >
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2">
                                <Badge variant={version.version === proof.currentAsset?.version ? "default" : "outline"}>
                                  v{version.version}
                                </Badge>
                                <span className="text-sm font-medium">{version.fileName}</span>
                                {version.version === proof.currentAsset?.version && (
                                  <Badge variant="secondary" className="text-xs">Current</Badge>
                                )}
                              </div>
                              {version.signedUrl ? (
                                <Button variant="ghost" size="sm" asChild>
                                  <a href={version.signedUrl} download={version.fileName} target="_blank" rel="noopener noreferrer">
                                    <Download className="h-4 w-4" />
                                  </a>
                                </Button>
                              ) : version.googleDriveUrl ? (
                                <Button variant="ghost" size="sm" asChild>
                                  <a href={version.googleDriveUrl} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="h-4 w-4" />
                                  </a>
                                </Button>
                              ) : null}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Uploaded by {version.uploadedByName} ({version.uploadedByRole}) on {formatDate(version.createdAt)}
                            </p>
                            {version.notes && (
                              <p className="text-sm mt-2 p-2 bg-muted/50 rounded">{version.notes}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Comments ({comments.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {comments.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No comments yet. Start the conversation below.</p>
                ) : (
                  <div className="space-y-4">
                    {comments.map((comment) => (
                      <div
                        key={comment.id}
                        className={`p-4 border rounded-lg ${comment.authorRole === "CLIENT" ? "border-blue-200 bg-blue-50/50" : "border-muted"}`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          {comment.authorRole === "CLIENT" ? (
                            <User className="h-4 w-4 text-blue-500" />
                          ) : (
                            <Users className="h-4 w-4 text-primary" />
                          )}
                          <span className="font-medium text-sm">{comment.authorName}</span>
                          <Badge variant={comment.authorRole === "CLIENT" ? "secondary" : "default"} className="text-xs">
                            {comment.authorRole === "CLIENT" ? "You" : "Sandbox Team"}
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
                    rows={3}
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
              </CardContent>
            </Card>

            {isPendingReview && (
              <Card className="border-2 border-primary/20">
                <CardHeader>
                  <CardTitle>Your Decision</CardTitle>
                  <CardDescription>
                    Please review the proof above and make a decision. You can approve or request revisions.
                  </CardDescription>
                </CardHeader>
                <CardContent>
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
                      Request Revision
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {isDecided && (
              <Card className={`border-2 ${
                proof.status === "APPROVED" 
                  ? "border-green-300 bg-green-50/50" 
                  : "border-orange-300 bg-orange-50/50"
              }`}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    {proof.status === "APPROVED" ? (
                      <CheckCircle className="h-8 w-8 text-green-600" />
                    ) : (
                      <AlertCircle className="h-8 w-8 text-orange-600" />
                    )}
                    <div>
                      <h3 className="text-lg font-semibold">
                        {proof.status === "APPROVED"
                          ? "Proof Approved"
                          : "Revisions Needed"}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {proof.status === "APPROVED"
                          ? "You have approved this proof. The team will proceed with production."
                          : "You have requested revisions. The team will update the proof and send a new version."}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>

      {isPendingReview && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t shadow-lg">
          <div className="container mx-auto px-4 py-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                onClick={() => openDecisionDialog("APPROVED")}
                className="bg-green-600 hover:bg-green-700 flex-1"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Approve Proof
              </Button>
              <Button
                onClick={() => openDecisionDialog("REVISIONS_NEEDED")}
                variant="outline"
                className="border-yellow-500 text-yellow-700 hover:bg-yellow-50 flex-1"
              >
                <AlertCircle className="h-4 w-4 mr-2" />
                Request Revision
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={decisionDialog.open} onOpenChange={(open) => setDecisionDialog({ open, type: open ? decisionDialog.type : null })}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {decisionDialog.type === "APPROVED"
                ? "Approve Proof"
                : "Request Revision"}
            </DialogTitle>
            <DialogDescription>
              {decisionDialog.type === "APPROVED"
                ? "You are approving this proof. Add an optional comment below."
                : "Please explain what revisions are needed."}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder={
                decisionDialog.type === "APPROVED"
                  ? "Optional comment..."
                  : "Please provide details about your decision..."
              }
              value={decisionComment}
              onChange={(e) => setDecisionComment(e.target.value)}
              rows={4}
            />
            {decisionDialog.type !== "APPROVED" && !decisionComment.trim() && (
              <p className="text-sm text-destructive mt-2">A comment is required for this action.</p>
            )}
          </div>
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
                  : "bg-yellow-600 hover:bg-yellow-700"
              }
            >
              {submittingDecision
                ? "Submitting..."
                : decisionDialog.type === "APPROVED"
                ? "Confirm Approval"
                : "Request Revision"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
