"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { createInternalComment } from "./internal-comment-actions";
import { MentionTextarea } from "./mention-textarea";

interface CommentDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budgetLineId: string;
  lineDescription: string | null;
  category: string | null;
  onCommentAdded?: () => void;
}

export function CommentDialog({
  projectId,
  open,
  onOpenChange,
  budgetLineId,
  lineDescription,
  category,
  onCommentAdded,
}: CommentDialogProps) {
  const { toast } = useToast();
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;

    setSubmitting(true);
    const result = await createInternalComment(projectId, {
      budgetLineId,
      lineDescription,
      category,
      content: content.trim(),
    });

    if (result.success) {
      toast({ title: "Comment Added" });
      setContent("");
      onOpenChange(false);
      onCommentAdded?.();
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    }
    setSubmitting(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Internal Comment</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-md bg-muted p-3">
            <p className="text-sm text-muted-foreground">Commenting on:</p>
            <p className="font-medium">{lineDescription || category || "Budget Line"}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="comment-content">Comment</Label>
            <MentionTextarea
              id="comment-content"
              projectId={projectId}
              placeholder="Write your internal comment... Use @mention to tag team members"
              value={content}
              onChange={setContent}
              rows={4}
            />
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!content.trim() || submitting}
              className="w-full sm:w-auto"
            >
              {submitting ? "Adding..." : "Add Comment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
