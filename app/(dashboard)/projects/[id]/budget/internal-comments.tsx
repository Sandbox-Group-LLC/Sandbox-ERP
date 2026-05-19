"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  getInternalComments,
  getTeamMembers,
  resolveInternalComment,
  unresolveInternalComment,
  addInternalReply,
  InternalCommentWithDetails,
  TeamMember,
} from "./internal-comment-actions";
import { MentionTextarea, renderContentWithMentions } from "./mention-textarea";
import {
  MessageSquare,
  Check,
  RotateCcw,
  Send,
  ChevronDown,
  ChevronRight,
  Users,
} from "lucide-react";

const AUTHOR_COLORS = [
  "border-blue-400",
  "border-green-400",
  "border-purple-400",
  "border-orange-400",
  "border-pink-400",
  "border-cyan-400",
  "border-yellow-400",
];

function getAuthorColor(authorName: string, colorMap: Map<string, string>): string {
  if (!colorMap.has(authorName)) {
    const colorIndex = colorMap.size % AUTHOR_COLORS.length;
    colorMap.set(authorName, AUTHOR_COLORS[colorIndex]);
  }
  return colorMap.get(authorName)!;
}

interface InternalCommentsSectionProps {
  projectId: string;
  refreshTrigger?: number;
}

export function InternalCommentsSection({ projectId, refreshTrigger }: InternalCommentsSectionProps) {
  const { toast } = useToast();
  const [comments, setComments] = useState<InternalCommentWithDetails[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(true);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [submittingReply, setSubmittingReply] = useState<string | null>(null);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [authorColorMap] = useState<Map<string, string>>(new Map());

  async function loadComments() {
    setLoading(true);
    const [commentsData, membersData] = await Promise.all([
      getInternalComments(projectId),
      getTeamMembers(projectId),
    ]);
    setComments(commentsData);
    setTeamMembers(membersData);
    setLoading(false);
  }

  useEffect(() => {
    loadComments();
  }, [projectId, refreshTrigger]);

  async function handleResolve(commentId: string) {
    const result = await resolveInternalComment(projectId, commentId);
    if (result.success) {
      toast({ title: "Comment Resolved" });
      loadComments();
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    }
  }

  async function handleUnresolve(commentId: string) {
    const result = await unresolveInternalComment(projectId, commentId);
    if (result.success) {
      toast({ title: "Comment Reopened" });
      loadComments();
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    }
  }

  async function handleAddReply(commentId: string) {
    const text = replyText[commentId]?.trim();
    if (!text) return;

    setSubmittingReply(commentId);
    const result = await addInternalReply(projectId, commentId, text);

    if (result.success) {
      toast({ title: "Reply Added" });
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
    return <div className="text-muted-foreground mt-6">Loading internal comments...</div>;
  }

  if (comments.length === 0) {
    return null;
  }

  const unresolvedCount = comments.filter((c) => !c.isResolved).length;

  const commentsByLine = new Map<string, InternalCommentWithDetails[]>();
  for (const comment of comments) {
    const key = comment.lineDescription || comment.category || "General";
    if (!commentsByLine.has(key)) {
      commentsByLine.set(key, []);
    }
    commentsByLine.get(key)!.push(comment);
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="mt-6">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardTitle className="flex items-center gap-2">
              {isOpen ? (
                <ChevronDown className="h-5 w-5" />
              ) : (
                <ChevronRight className="h-5 w-5" />
              )}
              <MessageSquare className="h-5 w-5" />
              Internal Comments
              {unresolvedCount > 0 && (
                <Badge variant="secondary">{unresolvedCount} unresolved</Badge>
              )}
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent>
            <div className="space-y-6">
              {Array.from(commentsByLine.entries()).map(([lineName, lineComments]) => (
                <div key={lineName} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-sm">{lineName}</h4>
                    <Badge variant="outline" className="text-xs">
                      {lineComments.length} {lineComments.length === 1 ? "comment" : "comments"}
                    </Badge>
                  </div>
                  <div className="space-y-3 pl-4 border-l-2 border-muted">
                    {lineComments.map((comment) => {
                      const isExpanded = expandedComments.has(comment.id);
                      const messageCount = comment.messages.length;
                      const authorColor = getAuthorColor(comment.commenterName, authorColorMap);

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
                                <div className={`flex items-center gap-2 pl-2 border-l-4 ${authorColor}`}>
                                  <Users className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-medium">{comment.commenterName}</span>
                                  <Badge variant="default" className="text-xs">Team</Badge>
                                </div>
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
                            <p className="text-sm mb-3 ml-6">{renderContentWithMentions(comment.content, teamMembers)}</p>

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
                              {comment.messages.map((msg) => {
                                const msgAuthorColor = getAuthorColor(msg.authorName, authorColorMap);
                                return (
                                  <div
                                    key={msg.id}
                                    className={`pl-4 border-l-2 ${msgAuthorColor}`}
                                  >
                                    <div className="flex items-center gap-2 mb-1">
                                      <Users className="h-3 w-3 text-primary" />
                                      <span className="text-sm font-medium">{msg.authorName}</span>
                                      <Badge variant="default" className="text-xs">Team</Badge>
                                      <span className="text-xs text-muted-foreground">
                                        {new Date(msg.createdAt).toLocaleDateString()}
                                      </span>
                                    </div>
                                    <p className="text-sm ml-5">{renderContentWithMentions(msg.content, teamMembers)}</p>
                                  </div>
                                );
                              })}

                              {comment.messages.length === 0 && (
                                <p className="text-sm text-muted-foreground italic">
                                  No replies yet. Be the first to respond!
                                </p>
                              )}

                              <div className="flex gap-2 pt-2">
                                <MentionTextarea
                                  projectId={projectId}
                                  placeholder="Write a reply... Use @mention to tag team members"
                                  value={replyText[comment.id] || ""}
                                  onChange={(value) =>
                                    setReplyText((prev) => ({
                                      ...prev,
                                      [comment.id]: value,
                                    }))
                                  }
                                  rows={2}
                                  className="flex-1"
                                />
                                <Button
                                  size="sm"
                                  onClick={() => handleAddReply(comment.id)}
                                  disabled={
                                    !replyText[comment.id]?.trim() ||
                                    submittingReply === comment.id
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
                </div>
              ))}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

interface LineCommentCountProps {
  comments: InternalCommentWithDetails[];
  budgetLineId: string;
}

export function getLineCommentCount(
  comments: InternalCommentWithDetails[],
  budgetLineId: string
): { total: number; unresolved: number } {
  const lineComments = comments.filter((c) => c.budgetLineId === budgetLineId);
  return {
    total: lineComments.length,
    unresolved: lineComments.filter((c) => !c.isResolved).length,
  };
}
