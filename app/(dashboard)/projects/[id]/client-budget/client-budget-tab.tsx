"use client";

import { useState, useEffect, Fragment } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Download, FileSpreadsheet, MessageSquare, MessageSquarePlus, ChevronDown, ChevronRight, User, Users, Send } from "lucide-react";
import { getClientBudgetData, getClientVisibleVersions, ClientBudgetData, ClientBudgetLine, ClientBudgetVersionData } from "./actions";
import { getClientBudgetComments, addClientBudgetComment, addClientBudgetMessage, BudgetCommentData } from "./comment-actions";
import { exportClientBudgetToExcel } from "./export";
import { useToast } from "@/hooks/use-toast";

interface ClientBudgetTabProps {
  projectId: string;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function ClientBudgetTab({ projectId }: ClientBudgetTabProps) {
  const { toast } = useToast();
  const [data, setData] = useState<ClientBudgetData | null>(null);
  const [versions, setVersions] = useState<ClientBudgetVersionData[]>([]);
  const [comments, setComments] = useState<BudgetCommentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportingSheet, setExportingSheet] = useState(false);

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
    async function loadData() {
      setLoading(true);
      const [result, versionsData, commentsData] = await Promise.all([
        getClientBudgetData(projectId),
        getClientVisibleVersions(projectId),
        getClientBudgetComments(projectId),
      ]);
      setData(result);
      setVersions(versionsData);
      setComments(commentsData);
      setLoading(false);
    }
    loadData();
  }, [projectId]);

  async function handleExport() {
    if (!data) return;
    setExporting(true);
    try {
      await exportClientBudgetToExcel(data, versions.length > 0 ? versions : undefined);
    } finally {
      setExporting(false);
    }
  }

  async function handleExportSheet() {
    setExportingSheet(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/export-budget-sheet`, {
        method: "POST",
      });
      const result = await res.json();
      if (result.success && result.sheetUrl) {
        window.open(result.sheetUrl, "_blank");
        toast({ title: "Exported to Google Sheet", description: "The budget has been exported and the sheet is now open" });
      } else {
        toast({ title: "Export Failed", description: result.error || "Could not export to Google Sheet", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Export Failed", description: "An unexpected error occurred", variant: "destructive" });
    } finally {
      setExportingSheet(false);
    }
  }

  async function handleSubmitComment() {
    if (!commentText.trim()) return;
    setSubmitting(true);

    const result = await addClientBudgetComment(projectId, {
      budgetLineId: commentDialog.lineId,
      lineDescription: commentDialog.lineDescription,
      category: commentDialog.category,
      content: commentText,
    });

    if (result.success) {
      toast({ title: "Comment Added", description: "Your comment has been submitted" });
      setCommentDialog({ open: false });
      setCommentText("");
      const commentsData = await getClientBudgetComments(projectId);
      setComments(commentsData);
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to add comment",
        variant: "destructive",
      });
    }

    setSubmitting(false);
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
    const result = await addClientBudgetMessage(projectId, commentId, text);

    if (result.success) {
      toast({ title: "Reply Sent" });
      setReplyText((prev) => ({ ...prev, [commentId]: "" }));
      const commentsData = await getClientBudgetComments(projectId);
      setComments(commentsData);
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
    return <div className="text-muted-foreground">Loading client budget...</div>;
  }

  if (!data) {
    return <div className="text-muted-foreground">No budget data available.</div>;
  }

  if (data.categories.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No budget lines have been added yet. Add budget items in the Budget tab first.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Client Budget View</h2>
          <p className="text-sm text-muted-foreground">
            {data.clientName} - {data.projectName}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MessageSquare className="h-4 w-4" />
            {comments.length} comment{comments.length !== 1 ? "s" : ""}
          </div>
          <Button
            onClick={handleExportSheet}
            disabled={exportingSheet}
            variant="outline"
            className="w-full sm:w-auto"
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            {exportingSheet ? "Exporting..." : "Export to Sheet"}
          </Button>
          <Button 
            onClick={handleExport} 
            disabled={exporting}
            className="w-full sm:w-auto"
          >
            <Download className="h-4 w-4 mr-2" />
            {exporting ? "Exporting..." : "Export to Excel"}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-bold">DESCRIPTION</TableHead>
                  <TableHead className="font-bold">PARTY</TableHead>
                  <TableHead className="font-bold text-right">RATE</TableHead>
                  <TableHead className="font-bold text-right">HOURS</TableHead>
                  <TableHead className="font-bold text-right">TOTAL</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.categories.map((category, catIndex) => (
                  <Fragment key={`category-${catIndex}`}>
                    <TableRow className="bg-muted font-semibold">
                      <TableCell colSpan={6} className="text-sm uppercase tracking-wide">
                        {category.name}
                      </TableCell>
                    </TableRow>
                    {category.lines.map((line, lineIndex) => {
                      const lineComments = getCommentsForLine(line.id);
                      return (
                        <TableRow key={`line-${catIndex}-${lineIndex}`}>
                          <TableCell className="pl-6">
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
                          <TableCell>{line.party}</TableCell>
                          <TableCell className="text-right">
                            {line.rate !== null ? formatCurrency(line.rate) : "N/A"}
                          </TableCell>
                          <TableCell className="text-right">
                            {line.hours !== null ? line.hours.toLocaleString() : "N/A"}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(line.total)}
                          </TableCell>
                          <TableCell>
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
                    <TableRow className="border-t-2">
                      <TableCell colSpan={4}></TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(category.subtotal)}
                      </TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </Fragment>
                ))}
                
                {data.taxAmount > 0 && (
                  <>
                    <TableRow className="bg-muted font-semibold">
                      <TableCell colSpan={6} className="text-sm uppercase tracking-wide">
                        TAX
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={4}></TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(data.taxAmount)}
                      </TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </>
                )}
                
                <TableRow className="bg-primary/10 font-bold text-lg">
                  <TableCell colSpan={4}>GRAND TOTAL</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(data.grandTotal)}
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
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
                            disabled={
                              submittingReply === comment.id ||
                              !replyText[comment.id]?.trim()
                            }
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

      <Dialog open={commentDialog.open} onOpenChange={(open) => setCommentDialog({ open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Comment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {commentDialog.lineDescription && (
              <p className="text-sm text-muted-foreground">
                Commenting on: <span className="font-medium text-foreground">{commentDialog.lineDescription}</span>
              </p>
            )}
            <Textarea
              placeholder="Enter your comment..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              rows={4}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setCommentDialog({ open: false })}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitComment}
                disabled={submitting || !commentText.trim()}
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
