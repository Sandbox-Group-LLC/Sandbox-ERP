"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  validatePortalAccess,
  getPortalBudgetData,
  getPortalComments,
  addPortalComment,
  addPortalMessage,
  getPortalClientVisibleVersions,
  getPortalVersionBudgetData,
  PortalAccessData,
  PortalBudgetData,
  PortalBudgetLine,
  BudgetCommentData,
  PortalBudgetVersionSummary,
} from "./actions";
import {
  ChevronDown,
  ChevronRight,
  MessageSquare,
  MessageSquarePlus,
  DollarSign,
  FileText,
  Clock,
  Send,
  User,
  Users,
  History,
} from "lucide-react";

export const dynamic = "force-dynamic"

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export default function PortalPage() {
  const params = useParams();
  const token = params.token as string;
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState<PortalAccessData | null>(null);
  const [budgetData, setBudgetData] = useState<PortalBudgetData | null>(null);
  const [comments, setComments] = useState<BudgetCommentData[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [versions, setVersions] = useState<PortalBudgetVersionSummary[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [loadingVersion, setLoadingVersion] = useState(false);

  const [commentDialog, setCommentDialog] = useState<{
    open: boolean;
    lineId?: string;
    lineDescription?: string;
    category?: string;
  }>({ open: false });
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [submittingReply, setSubmittingReply] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const accessData = await validatePortalAccess(token);
      setAccess(accessData);

      if (accessData.valid && accessData.projectId) {
        const [budget, commentsData, versionsData] = await Promise.all([
          getPortalBudgetData(accessData.projectId),
          getPortalComments(accessData.projectId),
          getPortalClientVisibleVersions(token),
        ]);
        setBudgetData(budget);
        setComments(commentsData);
        setVersions(versionsData);

        if (budget?.categories) {
          setExpandedCategories(new Set(budget.categories.map((c) => c.name)));
        }
      }

      setLoading(false);
    }
    load();
  }, [token]);

  async function handleVersionChange(value: string) {
    if (value === "live") {
      setSelectedVersionId(null);
      if (access?.projectId) {
        setLoadingVersion(true);
        const budget = await getPortalBudgetData(access.projectId);
        setBudgetData(budget);
        if (budget?.categories) {
          setExpandedCategories(new Set(budget.categories.map((c) => c.name)));
        }
        setLoadingVersion(false);
      }
    } else {
      setSelectedVersionId(value);
      setLoadingVersion(true);
      const versionBudget = await getPortalVersionBudgetData(token, value);
      setBudgetData(versionBudget);
      if (versionBudget?.categories) {
        setExpandedCategories(new Set(versionBudget.categories.map((c) => c.name)));
      }
      setLoadingVersion(false);
    }
  }

  const selectedVersion = selectedVersionId
    ? versions.find((v) => v.id === selectedVersionId)
    : null;

  async function handleSubmitComment() {
    if (!commentText.trim()) return;
    setSubmitting(true);

    const result = await addPortalComment(token, {
      budgetLineId: commentDialog.lineId,
      lineDescription: commentDialog.lineDescription,
      category: commentDialog.category,
      content: commentText,
    });

    if (result.success) {
      toast({ title: "Comment Added", description: "Your comment has been submitted" });
      setCommentDialog({ open: false });
      setCommentText("");

      if (access?.projectId) {
        const commentsData = await getPortalComments(access.projectId);
        setComments(commentsData);
      }
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to add comment",
        variant: "destructive",
      });
    }

    setSubmitting(false);
  }

  function toggleCategory(name: string) {
    const next = new Set(expandedCategories);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    setExpandedCategories(next);
  }

  function getCommentsForLine(lineId: string): BudgetCommentData[] {
    return comments.filter((c) => c.budgetLineId === lineId);
  }

  function toggleThread(commentId: string) {
    setExpandedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(commentId)) {
        next.delete(commentId);
      } else {
        next.add(commentId);
      }
      return next;
    });
  }

  async function handleSubmitReply(commentId: string) {
    const text = replyText[commentId]?.trim();
    if (!text) return;

    setSubmittingReply(commentId);
    const result = await addPortalMessage(token, commentId, text);

    if (result.success) {
      toast({ title: "Reply Sent" });
      setReplyText((prev) => ({ ...prev, [commentId]: "" }));
      if (access?.projectId) {
        const commentsData = await getPortalComments(access.projectId);
        setComments(commentsData);
      }
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to send reply",
        variant: "destructive",
      });
    }
    setSubmittingReply(null);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading budget...</p>
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
                ? "This budget access link has expired. Please contact your project manager for a new link."
                : "This link is invalid or has been revoked. Please check the link or contact your project manager."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h1 className="text-xl font-bold">{access.projectName}</h1>
              <p className="text-sm text-muted-foreground">{access.clientName}</p>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-end gap-2">
              {versions.length > 0 && (
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-muted-foreground" />
                  <Select
                    value={selectedVersionId || "live"}
                    onValueChange={handleVersionChange}
                    disabled={loadingVersion}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Select version" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="live">Current Budget</SelectItem>
                      {versions.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          v{v.versionNumber} - {v.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="text-sm text-muted-foreground">
                Viewing as: {access.firstName} {access.lastName}
              </div>
            </div>
          </div>
          {selectedVersion && (
            <div className="mt-3 p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="secondary">
                  Version {selectedVersion.versionNumber}
                </Badge>
                <span className="font-medium">{selectedVersion.title}</span>
                <span className="text-muted-foreground">
                  • Created {new Date(selectedVersion.createdAt).toLocaleDateString()}
                </span>
              </div>
              {selectedVersion.notes && (
                <p className="text-sm text-muted-foreground mt-1">{selectedVersion.notes}</p>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Subtotal
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(budgetData?.subtotal || 0)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Tax
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(budgetData?.taxAmount || 0)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Grand Total
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                {formatCurrency(budgetData?.grandTotal || 0)}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <CardTitle>Budget Details</CardTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MessageSquare className="h-4 w-4" />
                {comments.length} comment{comments.length !== 1 ? "s" : ""}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {budgetData?.categories.map((category) => (
              <Collapsible
                key={category.name}
                open={expandedCategories.has(category.name)}
                onOpenChange={() => toggleCategory(category.name)}
              >
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between px-4 py-3 bg-muted/50 border-b cursor-pointer hover:bg-muted/70">
                    <div className="flex items-center gap-2">
                      {expandedCategories.has(category.name) ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <span className="font-medium">{category.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {category.lines.length} item{category.lines.length !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                    <span className="font-medium">{formatCurrency(category.subtotal)}</span>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="overflow-x-auto">
                    <Table className="table-fixed">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[40%]">Description</TableHead>
                          <TableHead className="w-[15%]">Party</TableHead>
                          <TableHead className="w-[12%] text-right">Rate</TableHead>
                          <TableHead className="w-[10%] text-right">Hours</TableHead>
                          <TableHead className="w-[15%] text-right">Total</TableHead>
                          <TableHead className="w-[8%]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {category.lines.map((line) => {
                          const lineComments = getCommentsForLine(line.id);
                          return (
                            <TableRow key={line.id}>
                              <TableCell className="w-[40%]">
                                <div className="flex items-center gap-2">
                                  {line.description}
                                  {lineComments.length > 0 && (
                                    <Badge variant="outline" className="text-xs">
                                      <MessageSquare className="h-3 w-3 mr-1" />
                                      {lineComments.length}
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="w-[15%]">
                                <Badge
                                  variant={line.party === "Sandbox-XM" ? "default" : "secondary"}
                                >
                                  {line.party}
                                </Badge>
                              </TableCell>
                              <TableCell className="w-[12%] text-right">
                                {line.rate !== null ? formatCurrency(line.rate) : "-"}
                              </TableCell>
                              <TableCell className="w-[10%] text-right">
                                {line.hours !== null ? line.hours : "-"}
                              </TableCell>
                              <TableCell className="w-[15%] text-right font-medium">
                                {formatCurrency(line.total)}
                              </TableCell>
                              <TableCell className="w-[8%]">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    setCommentDialog({
                                      open: true,
                                      lineId: line.id,
                                      lineDescription: line.description,
                                      category: category.name,
                                    })
                                  }
                                  title="Add Comment"
                                >
                                  <MessageSquarePlus className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </CardContent>
        </Card>

        {comments.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Your Conversations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {comments.map((comment) => {
                  const displayLocation = comment.lineDescription || comment.category || "Budget";
                  const isExpanded = expandedThreads.has(comment.id);
                  const messageCount = comment.messages?.length || 0;
                  
                  return (
                    <div
                      key={comment.id}
                      className="border rounded-lg bg-muted/30"
                    >
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{comment.commenterName}</span>
                            <Badge variant="outline" className="text-xs">You</Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(comment.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mb-1 ml-6">
                          on <span className="font-medium text-foreground">{displayLocation}</span>
                        </p>
                        <p className="text-sm ml-6">{comment.content}</p>
                        <div className="flex items-center gap-2 mt-3 ml-6">
                          {comment.isResolved && (
                            <Badge variant="outline" className="text-xs">
                              Resolved
                            </Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleThread(comment.id)}
                            className="text-xs"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-3 w-3 mr-1" />
                            ) : (
                              <ChevronRight className="h-3 w-3 mr-1" />
                            )}
                            {messageCount > 0
                              ? `${messageCount} ${messageCount === 1 ? "reply" : "replies"}`
                              : "Reply"}
                          </Button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t bg-background/50 p-4 space-y-3">
                          {comment.messages && comment.messages.map((msg) => (
                            <div
                              key={msg.id}
                              className={`pl-4 border-l-2 ${
                                msg.authorType === "CLIENT"
                                  ? "border-blue-400/50"
                                  : "border-primary/30"
                              }`}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                {msg.authorType === "CLIENT" ? (
                                  <User className="h-3 w-3 text-blue-500" />
                                ) : (
                                  <Users className="h-3 w-3 text-primary" />
                                )}
                                <span className="text-sm font-medium">
                                  {msg.authorName}
                                </span>
                                <Badge
                                  variant={msg.authorType === "CLIENT" ? "secondary" : "default"}
                                  className="text-xs"
                                >
                                  {msg.authorType === "CLIENT" ? "You" : "Sandbox Team"}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(msg.createdAt).toLocaleDateString()}
                                </span>
                              </div>
                              <p className="text-sm ml-5">{msg.content}</p>
                            </div>
                          ))}

                          {(!comment.messages || comment.messages.length === 0) && (
                            <p className="text-sm text-muted-foreground italic">Waiting for a response from the Sandbox team...</p>
                          )}

                          <div className="flex gap-2 pt-2">
                            <Textarea
                              placeholder="Add another comment..."
                              value={replyText[comment.id] || ""}
                              onChange={(e) =>
                                setReplyText((prev) => ({
                                  ...prev,
                                  [comment.id]: e.target.value,
                                }))
                              }
                              rows={2}
                              className="flex-1"
                            />
                            <Button
                              size="sm"
                              onClick={() => handleSubmitReply(comment.id)}
                              disabled={!replyText[comment.id]?.trim() || submittingReply === comment.id}
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      <Dialog
        open={commentDialog.open}
        onOpenChange={(open) => {
          setCommentDialog({ ...commentDialog, open });
          if (!open) setCommentText("");
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Comment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {commentDialog.lineDescription && (
              <div className="text-sm bg-muted p-3 rounded-lg">
                <span className="text-muted-foreground">Commenting on:</span>
                <br />
                <span className="font-medium">{commentDialog.lineDescription}</span>
              </div>
            )}
            <Textarea
              placeholder="Enter your question or comment..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              rows={4}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setCommentDialog({ open: false })}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitComment}
                disabled={!commentText.trim() || submitting}
              >
                {submitting ? "Submitting..." : "Submit Comment"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
