import { useState } from "react";
import { useFetcher } from "react-router";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { MessageSquare, Edit2, Trash2, Check, X, Loader2 } from "~/components/ui/icons";
import type { Comment } from "~/types/content";
import { formatDate } from "~/lib/format";
import { cn } from "~/lib/utils";

interface ContentCommentsProps {
  comments: Comment[];
  currentUserId: string;
  className?: string;
}

export function ContentComments({
  comments,
  currentUserId,
  className,
}: ContentCommentsProps) {
  const fetcher = useFetcher();
  const [newComment, setNewComment] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  function handleAddComment() {
    const body = newComment.trim();
    if (!body) return;

    fetcher.submit(
      { _action: "content_add_comment", body },
      { method: "post" }
    );
    setNewComment("");
  }

  function startEdit(comment: Comment) {
    setEditingId(comment.id);
    setEditBody(comment.body);
  }

  function handleSaveEdit() {
    if (!editingId || !editBody.trim()) return;
    fetcher.submit(
      {
        _action: "content_update_comment",
        comment_id: editingId,
        body: editBody.trim(),
      },
      { method: "post" }
    );
    setEditingId(null);
    setEditBody("");
  }

  function handleDeleteComment(commentId: string) {
    fetcher.submit(
      { _action: "content_delete_comment", comment_id: commentId },
      { method: "post" }
    );
  }

  const isBusy = fetcher.state !== "idle";

  return (
    <div className={cn("px-4 py-3", className)}>
      <h4 className="text-xs font-medium text-zinc-500 flex items-center gap-1.5 mb-3">
        <MessageSquare className="h-3.5 w-3.5" />
        댓글
        {comments.length > 0 && (
          <span className="text-zinc-400">({comments.length})</span>
        )}
      </h4>

      {/* 댓글 목록 */}
      {comments.length > 0 && (
        <div className="space-y-3 mb-4">
          {comments.map((comment) => {
            const isOwn = comment.created_by === currentUserId;
            const isEditing = editingId === comment.id;
            const isModified =
              comment.updated_at &&
              comment.updated_at !== comment.created_at;

            return (
              <div key={comment.id} className="flex gap-2 group">
                {/* Avatar */}
                <div className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center">
                  <span className="text-[10px] font-medium text-zinc-500">
                    {isOwn ? "나" : "팀"}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-medium text-zinc-600">
                      {isOwn ? "나" : "팀원"}
                    </span>
                    <span className="text-[10px] text-zinc-400">
                      {formatDate(comment.created_at)}
                      {isModified && " (수정됨)"}
                    </span>
                  </div>

                  {isEditing ? (
                    <div className="mt-1 space-y-1.5">
                      <Textarea
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        className="text-sm min-h-[60px] resize-none"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                            handleSaveEdit();
                          }
                          if (e.key === "Escape") {
                            setEditingId(null);
                          }
                        }}
                      />
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          className="h-6 px-2 text-xs gap-1"
                          onClick={handleSaveEdit}
                          disabled={isBusy || !editBody.trim()}
                        >
                          {isBusy ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Check className="h-3 w-3" />
                          )}
                          저장
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs gap-1"
                          onClick={() => setEditingId(null)}
                        >
                          <X className="h-3 w-3" />
                          취소
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-700 whitespace-pre-wrap break-words mt-0.5">
                      {comment.body}
                    </p>
                  )}
                </div>

                {/* 수정/삭제 버튼 (hover 또는 모바일에서 표시) */}
                {!isEditing && (
                  <div className="flex items-start gap-1 opacity-100 group-hover:opacity-100 focus-within:opacity-100 transition-opacity md:opacity-0">
                    {isOwn && (
                      <button
                        type="button"
                        className="text-zinc-300 hover:text-zinc-500 transition-colors p-0.5"
                        title="수정"
                        onClick={() => startEdit(comment)}
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-zinc-300 hover:text-red-500 transition-colors p-0.5"
                      title="삭제"
                      onClick={() => handleDeleteComment(comment.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 댓글 입력 폼 */}
      <div className="space-y-1.5">
        <Textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="댓글을 입력하세요... (Cmd+Enter로 작성)"
          className="text-sm min-h-[60px] resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              handleAddComment();
            }
          }}
        />
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            className="h-7 text-xs"
            onClick={handleAddComment}
            disabled={!newComment.trim() || isBusy}
          >
            {isBusy && fetcher.formData?.get("_action") === "content_add_comment" ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : null}
            댓글 작성
          </Button>
        </div>
      </div>
    </div>
  );
}
