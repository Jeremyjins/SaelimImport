import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import type { JSONContent } from "@tiptap/react";
import type { EditorView } from "@tiptap/pm/view";
import { useRef, useCallback } from "react";
import { toast } from "sonner";
import { ContentEditorToolbar } from "./content-editor-toolbar";
import { cn } from "~/lib/utils";

const MAX_INLINE_IMAGES = 10;

interface ContentEditorProps {
  content?: JSONContent | null;
  onChange?: (json: JSONContent) => void;
  readOnly?: boolean;
  placeholder?: string;
  documentType: "po" | "pi" | "shipping" | "order" | "customs" | "delivery";
  parentId: string;
  className?: string;
}

// content-images 버킷에 이미지 업로드 (Signed URL 방식)
async function uploadImageToStorage(
  file: File,
  documentType: string,
  parentId: string
): Promise<string> {
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket: "content-images",
      fileName: file.name,
      contentType: file.type,
      documentType,
      parentId,
    }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "업로드 URL 발급 실패");
  }

  const { signedUrl, publicUrl } = (await res.json()) as {
    signedUrl: string;
    publicUrl: string | null;
  };

  if (!signedUrl || !publicUrl) throw new Error("업로드 URL 정보 누락");

  // 실제 파일 바이트 직접 업로드 (CF Workers 우회)
  const uploadRes = await fetch(signedUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });

  if (!uploadRes.ok) throw new Error("스토리지 업로드 실패");

  return publicUrl;
}

// 에디터 내 인라인 이미지 수 카운트
function countInlineImages(editor: ReturnType<typeof useEditor>): number {
  if (!editor) return 0;
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "image") count++;
  });
  return count;
}

export function ContentEditor({
  content,
  onChange,
  readOnly = false,
  placeholder = "메모를 입력하세요...",
  documentType,
  parentId,
  className,
}: ContentEditorProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = useCallback(
    async (
      file: File,
      editorInstance: ReturnType<typeof useEditor>
    ): Promise<void> => {
      if (!editorInstance) return;

      // 이미지 타입 검증
      if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
        toast.error("지원하지 않는 이미지 형식입니다 (SVG 불가)");
        return;
      }

      // 최대 이미지 수 체크
      if (countInlineImages(editorInstance) >= MAX_INLINE_IMAGES) {
        toast.error(`이미지는 최대 ${MAX_INLINE_IMAGES}개까지 삽입할 수 있습니다`);
        return;
      }

      // 임시 ObjectURL로 플레이스홀더 삽입
      const tempUrl = URL.createObjectURL(file);
      editorInstance
        .chain()
        .focus()
        .setImage({ src: tempUrl, alt: "업로드 중..." })
        .run();

      try {
        const publicUrl = await uploadImageToStorage(file, documentType, parentId);

        // 플레이스홀더를 실제 URL로 교체
        editorInstance.state.doc.descendants((node, pos) => {
          if (node.type.name === "image" && node.attrs.src === tempUrl) {
            const tr = editorInstance.state.tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              src: publicUrl,
              alt: file.name,
            });
            editorInstance.view.dispatch(tr);
          }
        });
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "이미지 업로드에 실패했습니다"
        );
        // 플레이스홀더 제거
        editorInstance.state.doc.descendants((node, pos) => {
          if (node.type.name === "image" && node.attrs.src === tempUrl) {
            const tr = editorInstance.state.tr.delete(
              pos,
              pos + node.nodeSize
            );
            editorInstance.view.dispatch(tr);
          }
        });
      } finally {
        URL.revokeObjectURL(tempUrl);
      }
    },
    [documentType, parentId]
  );

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          codeBlock: false, // code inline만 사용
        }),
        Image.configure({
          inline: false,
          allowBase64: false,
          HTMLAttributes: {
            class: "max-w-full rounded-md my-2",
          },
        }),
        Placeholder.configure({ placeholder }),
      ],
      content: content ?? undefined,
      editable: !readOnly,
      immediatelyRender: false, // SSR 호환 필수
      onUpdate({ editor: e }) {
        onChange?.(e.getJSON());
      },
      editorProps: {
        attributes: {
          class: cn(
            "prose prose-sm max-w-none min-h-[120px] px-4 py-3 focus:outline-none",
            "prose-headings:font-semibold prose-h2:text-base prose-h3:text-sm",
            "prose-blockquote:border-l-2 prose-blockquote:border-zinc-300 prose-blockquote:pl-3 prose-blockquote:text-zinc-600",
            "prose-code:bg-zinc-100 prose-code:px-1 prose-code:rounded prose-code:text-sm prose-code:font-mono"
          ),
        },
        handleDrop(
          view: EditorView,
          event: DragEvent,
          _slice: unknown,
          moved: boolean
        ) {
          if (moved) return false;
          const files = event.dataTransfer?.files;
          if (!files?.length) return false;

          const imageFile = Array.from(files).find((f) =>
            f.type.startsWith("image/")
          );
          if (!imageFile || !editor) return false;

          event.preventDefault();
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          handleImageUpload(imageFile, editor);
          return true;
        },
        handlePaste(view: EditorView, event: ClipboardEvent) {
          const items = event.clipboardData?.items;
          if (!items) return false;

          const imageItem = Array.from(items).find((item) =>
            item.type.startsWith("image/")
          );
          if (!imageItem) return false;

          const file = imageItem.getAsFile();
          if (!file || !editor) return false;

          event.preventDefault();
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          handleImageUpload(file, editor);
          return true;
        },
      },
    },
    [readOnly]
  );

  function handleImageButtonClick() {
    imageInputRef.current?.click();
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && editor) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      handleImageUpload(file, editor);
    }
    // input 초기화 (같은 파일 재선택 가능)
    e.target.value = "";
  }

  return (
    <div className={cn("flex flex-col", className)}>
      {/* 툴바 (ReadOnly 숨김) */}
      {!readOnly && editor && (
        <ContentEditorToolbar
          editor={editor}
          onImageInsert={handleImageButtonClick}
        />
      )}

      {/* 에디터 본문 */}
      <EditorContent editor={editor} />

      {/* 숨겨진 파일 input */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleFileInputChange}
        aria-hidden="true"
      />
    </div>
  );
}
