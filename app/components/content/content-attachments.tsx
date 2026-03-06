import { useRef, useState } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
  FileText,
  FileSpreadsheet,
  ImageIcon,
  File,
  Paperclip,
  Download,
  Trash2,
  Loader2,
  Upload,
} from "~/components/ui/icons";
import type { ContentAttachment, ContentType } from "~/types/content";
import { cn } from "~/lib/utils";

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileTypeIcon({ mimeType }: { mimeType: string | null }) {
  if (!mimeType) return <File className="h-4 w-4 text-zinc-400" />;
  if (mimeType === "application/pdf")
    return <FileText className="h-4 w-4 text-red-500" />;
  if (
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    mimeType === "text/csv"
  )
    return <FileSpreadsheet className="h-4 w-4 text-green-600" />;
  if (mimeType.startsWith("image/"))
    return <ImageIcon className="h-4 w-4 text-blue-500" />;
  return <File className="h-4 w-4 text-zinc-400" />;
}

interface ContentAttachmentsProps {
  attachments: ContentAttachment[];
  contentType: ContentType;
  parentId: string;
  className?: string;
}

export function ContentAttachments({
  attachments,
  contentType,
  parentId,
  className,
}: ContentAttachmentsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fetcher = useFetcher();
  const [isUploading, setIsUploading] = useState(false);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setIsUploading(true);
    try {
      // 1. Signed Upload URL 발급
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bucket: "attachments",
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          documentType: contentType,
          parentId,
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(err.error ?? "업로드 URL 발급 실패");
      }

      const { signedUrl, path } = (await res.json()) as {
        signedUrl: string;
        path: string;
      };

      // 2. 실제 파일 바이트 직접 업로드 (CF Workers 우회)
      const uploadRes = await fetch(signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });

      if (!uploadRes.ok) throw new Error("파일 업로드 실패");

      // 3. DB 레코드 저장
      fetcher.submit(
        {
          _action: "content_save_attachment",
          file_url: path,
          file_name: file.name,
          file_size: String(file.size),
          mime_type: file.type,
        },
        { method: "post" }
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "파일 업로드에 실패했습니다"
      );
    } finally {
      setIsUploading(false);
    }
  }

  function handleDelete(attachmentId: string, fileName: string) {
    if (!confirm(`"${fileName}"을 삭제하시겠습니까?`)) return;
    fetcher.submit(
      { _action: "content_delete_attachment", attachment_id: attachmentId },
      { method: "post" }
    );
  }

  const isBusy = isUploading || fetcher.state !== "idle";

  return (
    <div className={cn("px-4 py-3", className)}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-medium text-zinc-500 flex items-center gap-1.5">
          <Paperclip className="h-3.5 w-3.5" />
          첨부파일
          {attachments.length > 0 && (
            <span className="text-zinc-400">({attachments.length})</span>
          )}
        </h4>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-6 text-xs px-2 gap-1"
          onClick={() => fileInputRef.current?.click()}
          disabled={isBusy}
        >
          {isUploading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Upload className="h-3 w-3" />
          )}
          파일 추가
        </Button>
      </div>

      {/* 파일 목록 */}
      {attachments.length === 0 && !isUploading ? (
        <p className="text-xs text-zinc-400 py-1">첨부된 파일이 없습니다.</p>
      ) : (
        <ul className="space-y-1.5">
          {attachments.map((att) => {
            const downloadUrl = att.signed_url ?? att.file_url;
            return (
              <li key={att.id} className="flex items-center gap-2 group">
                <FileTypeIcon mimeType={att.mime_type} />
                <span className="flex-1 text-xs text-zinc-700 truncate min-w-0">
                  {att.file_name}
                </span>
                {att.file_size != null && (
                  <span className="text-xs text-zinc-400 shrink-0">
                    {formatFileSize(att.file_size)}
                  </span>
                )}
                <a
                  href={downloadUrl}
                  download={att.file_name}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-zinc-400 hover:text-zinc-600 transition-colors"
                  title="다운로드"
                >
                  <Download className="h-3.5 w-3.5" />
                </a>
                <button
                  type="button"
                  className="shrink-0 text-zinc-300 hover:text-red-500 transition-colors"
                  title="삭제"
                  onClick={() => handleDelete(att.id, att.file_name)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
          {isUploading && (
            <li className="flex items-center gap-2 text-xs text-zinc-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              업로드 중...
            </li>
          )}
        </ul>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.xlsx,.xls,.docx,.pptx,.csv,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileSelect}
        aria-hidden="true"
      />
    </div>
  );
}
