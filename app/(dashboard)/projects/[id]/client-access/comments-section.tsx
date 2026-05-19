"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getProjectComments, resolveComment, unresolveComment, addMessage, BudgetCommentWithDetails } from "./comment-actions";
import { MessageSquare, Check, RotateCcw, Send, ChevronDown, ChevronRight, User, Users } from "lucide-react";

export function CommentsSection({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const [comments, setComments] = useState<BudgetCommentWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [submittingReply, setSubmittingReply] = useState<string | null>(null);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());

  async function loadComments() {
    setLoading(true);
    const data = await getProjectComments(projectId);
    setComments(data);
    setLoading(false);
  }

  useEffect(() => {
    loadComments();
  }, [projectId]);

  async function handleResolve(commentId: string) {
    const result = await resolveComment(projectId, commentId);
    if (result.success) {
      toast({ title: "Comment Resolved" });
      loadComments();
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    }
  }

  async function handleUnresolve(commentId: string) {
    const result = await unresolveComment(projectId, commentId);
    if (result.success) {
      toast({ title: "Comment Reopened" });
      loadComments();
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    }
  }

  async function handleAddMessage(commentId: string) {
    const text = replyText[commentId]?.trim();
    if (!text) return;

    setSubmittingReply(commentId);
    const result = await addMessage(projectId, commentId, text);
    
    if (result.success) {
      toast({ title: "Reply Sent" });
      setReplyText((prev) => ({ ...prev, [commentId]: "" }));
      loadComments();
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    }
    setSubmittingReply(null);
  }

  function toggleExpanded(commentId: string) {
    setExpandedComments((prev) => {
      const next = new Set(prev);
      if (next.has(commentId)) {
        next.delete(commentId);
      } else {
        next.add(commentId);
      }
      return next;
    });
  }

  if (loading) {
    return <div className="text-muted-foreground">Loading comments...</div>;
  }

  if (comments.length === 0) {
    return null;
  }

  const unresolvedCount = comments.filter((c) => !c.isResolved).length;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Client Comments
          {unresolvedCount > 0 && (
            <Badge variant="secondary">{unresolvedCount} unresolved</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {comments.map((comment) => {
            const isExpanded = expandedComments.has(comment.id);
            const displayLocation = comment.lineDescription || comment.category || "Budget";
            const messageCount = comment.messages.length;
            
            return (
              <div
                key={comment.id}
                className={`border rounded-lg ${
                  comment.isResolved ? "bg-muted/30 opacity-60" : "bg-background"
                }`}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{comment.commenterName}</span>
                        <Badge variant="outline" className="text-xs">Client</Badge>
                      </div>
                      <span className="text-sm text-muted-foreground ml-6">
                        on <span className="font-medium text-foreground">{displayLocation}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {new Date(comment.createdAt).toLocaleDateString()}
                      </span>
                      {comment.isResolved ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleUnresolve(comment.id)}
                          title="Reopen"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleResolve(comment.id)}
                          title="Mark Resolved"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-sm mb-3 ml-6">{comment.content}</p>
                  
                  <div className="flex items-center gap-2 ml-6">
                    {comment.isResolved && (
                      <Badge variant="outline" className="text-xs">
                        Resolved
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleExpanded(comment.id)}
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
                  <div className="border-t bg-muted/20 p-4 space-y-3">
                    {comment.messages.map((msg) => (
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
                            {msg.authorType === "CLIENT" ? "Client" : "Team"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(msg.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-sm ml-5">{msg.content}</p>
                      </div>
                    ))}

                    {comment.messages.length === 0 && (
                      <p className="text-sm text-muted-foreground italic">No replies yet. Be the first to respond!</p>
                    )}

                    <div className="flex gap-2 pt-2">
                      <Textarea
                        placeholder="Write a reply..."
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
                        onClick={() => handleAddMessage(comment.id)}
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
  );
}
