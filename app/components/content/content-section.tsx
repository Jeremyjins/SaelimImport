import React, { useState, useCallback, useEffect, useRef, Suspense } from "react";
import { useFetcher } from "react-router";
import type { JSONContent } from "@tiptap/react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import { Button } from "~/components/ui/button";
import { ChevronDown, ChevronUp, Loader2, Save } from "~/components/ui/icons";
import { ContentAttachments } from "./content-attachments";
import { ContentComments } from "./content-comments";
import type { ContentItem, ContentType } from "~/types/content";
import { cn } from "~/lib/utils";

const ContentEditor = React.lazy(() =>
  import("./content-editor").then((m) => ({ default: m.ContentEditor }))
);

interface ContentSectionProps {
  content: ContentItem | null;
  contentType: ContentType;
  parentId: string;
  currentUserId: string;
  className?: string;
}

export function ContentSection({
  content,
  contentType,
  parentId,
  currentUserId,
  className,
}: ContentSectionProps) {
  const [isOpen, setIsOpen] = useState(
    !!(content?.body || (content?.attachments?.length ?? 0) > 0 || (content?.comments?.length ?? 0) > 0)
  );
  const [editorJson, setEditorJson] = useState<JSONContent | null>(
    content?.body ? (content.body as JSONContent) : null
  );
  const [isDirty, setIsDirty] = useState(false);

  const fetcher = useFetcher();
  const isSaving = fetcher.state !== "idle";
  const prevFetcherStateRef = useRef(fetcher.state);

  const handleEditorChange = useCallback((json: JSONContent) => {
    setEditorJson(json);
    setIsDirty(true);
  }, []);

  function handleSave() {
    if (!isDirty || isSaving) return;

    fetcher.submit(
      {
        _action: "content_save",
        body: editorJson ? JSON.stringify(editorJson) : "",
      },
      { method: "post" }
    );
    setIsDirty(false);
  }

  // 저장 결과 토스트 — useEffect로 side-effect 분리 (StrictMode/Concurrent 중복 방지)
  useEffect(() => {
    if (prevFetcherStateRef.current !== "idle" && fetcher.state === "idle" && fetcher.data) {
      const result = fetcher.data as { error?: string } | null;
      if (result?.error) toast.error(result.error);
    }
    prevFetcherStateRef.current = fetcher.state;
  }, [fetcher.state, fetcher.data]);

  const initialContent: JSONContent | null = content?.body
    ? (content.body as unknown as JSONContent)
    : null;

  const attachmentCount = content?.attachments?.length ?? 0;
  const commentCount = content?.comments?.length ?? 0;
  const hasMemo = !!content?.body;

  // 헤더 배지 텍스트
  const badges: string[] = [];
  if (hasMemo) badges.push("메모");
  if (attachmentCount > 0) badges.push(`첨부 ${attachmentCount}`);
  if (commentCount > 0) badges.push(`댓글 ${commentCount}`);

  return (
    <Card className={cn("overflow-hidden", className)}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer select-none py-3 px-4 hover:bg-zinc-50 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-zinc-700">
                메모 & 첨부파일 & 댓글
              </CardTitle>
              <div className="flex items-center gap-2">
                {badges.length > 0 && (
                  <span className="text-xs text-zinc-400">
                    {badges.join(" · ")}
                  </span>
                )}
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 text-zinc-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-zinc-400" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="p-0">
            {/* 메모 에디터 — lazy load로 초기 번들 절감 */}
            <Suspense fallback={<div className="border-b h-32 animate-pulse bg-zinc-50" />}>
              <ContentEditor
                content={initialContent}
                onChange={handleEditorChange}
                documentType={contentType}
                parentId={parentId}
                className="border-b"
              />
            </Suspense>

            {/* 저장 버튼 영역 */}
            <div className="flex items-center justify-between px-4 py-2 border-b">
              {fetcher.data &&
                !(fetcher.data as { success?: boolean }).success &&
                fetcher.formData?.get("_action") === "content_save" && (
                  <p className="text-xs text-red-500">
                    {(fetcher.data as { error?: string }).error ?? "저장 실패"}
                  </p>
                )}
              <div className="ml-auto flex items-center gap-2">
                {isDirty && (
                  <span className="text-xs text-zinc-400">
                    저장되지 않은 변경사항
                  </span>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant={isDirty ? "default" : "outline"}
                  onClick={handleSave}
                  disabled={!isDirty || isSaving}
                  className="h-7 text-xs"
                >
                  {isSaving ? (
                    <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 h-3 w-3" />
                  )}
                  메모 저장
                </Button>
              </div>
            </div>

            {/* 첨부파일 섹션 */}
            <ContentAttachments
              attachments={content?.attachments ?? []}
              contentType={contentType}
              parentId={parentId}
              className="border-b"
            />

            {/* 댓글 섹션 */}
            <ContentComments
              comments={content?.comments ?? []}
              currentUserId={currentUserId}
            />
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
