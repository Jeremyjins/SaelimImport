# Phase 4: Contents System - Frontend Dev Notes

**Date:** 2026-03-06
**Role:** Frontend Dev

---

## 1. Tiptap Editor Component Design

### 1.1 패키지 설치

```bash
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-image @tiptap/extension-link @tiptap/extension-placeholder @tiptap/pm
```

참고: `@tiptap/extension-file-handler`는 Tiptap Pro(유료)이므로 사용하지 않음.
대신 ProseMirror `editorProps.handleDrop` / `handlePaste`를 직접 구현.

### 1.2 StarterKit 포함 확장

StarterKit에 기본 포함되는 것들:
- **텍스트 서식**: Bold, Italic, Strike, Code
- **블록 타입**: Heading (h1-h6), Blockquote, CodeBlock, BulletList, OrderedList, ListItem
- **기타**: HorizontalRule, HardBreak, Dropcursor, Gapcursor, History (undo/redo)

추가 확장:
- `@tiptap/extension-image` - 인라인 이미지
- `@tiptap/extension-link` - 하이퍼링크 (autolink, openOnClick)
- `@tiptap/extension-placeholder` - 빈 상태 안내 텍스트

### 1.3 ContentEditor 컴포넌트 Props

```typescript
interface ContentEditorProps {
  /** 초기 콘텐츠 (Tiptap JSON 또는 HTML string) */
  content?: JSONContent | string;
  /** 콘텐츠 변경 콜백 - JSON 반환 */
  onChange?: (json: JSONContent) => void;
  /** 읽기 전용 모드 (상세 페이지에서 뷰어로 사용) */
  readOnly?: boolean;
  /** 플레이스홀더 텍스트 */
  placeholder?: string;
  /** 이미지 업로드 핸들러 (File -> URL 반환 Promise) */
  onImageUpload?: (file: File) => Promise<string>;
  /** 에디터 최소 높이 */
  minHeight?: string;
  /** 추가 CSS 클래스 */
  className?: string;
}
```

### 1.4 에디터 상태 관리

**비제어(Uncontrolled) 방식 채택** - Tiptap은 내부적으로 ProseMirror state를 관리하므로 React state와 동기화하면 성능 문제 발생.

```typescript
// content-editor.tsx 핵심 구조
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";

export function ContentEditor({
  content,
  onChange,
  readOnly = false,
  placeholder = "내용을 입력하세요...",
  onImageUpload,
  minHeight = "200px",
  className,
}: ContentEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },  // h2, h3만 사용 (h1은 페이지 제목)
      }),
      Image.configure({
        HTMLAttributes: { class: "rounded-md max-w-full" },
      }),
      Link.configure({
        openOnClick: false,  // 편집 모드에서는 클릭으로 열지 않음
        autolink: true,
        HTMLAttributes: { class: "text-blue-600 underline" },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content,
    editable: !readOnly,
    immediatelyRender: false,  // SSR 호환 (React Router 7)
    onUpdate: ({ editor }) => {
      onChange?.(editor.getJSON());
    },
    editorProps: {
      handleDrop: /* 이미지 드롭 핸들러 (1.6 참조) */,
      handlePaste: /* 이미지 페이스트 핸들러 (1.6 참조) */,
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none",
        style: `min-height: ${minHeight}`,
      },
    },
  });

  if (!editor) return null;

  return (
    <div className={cn("border rounded-md", className)}>
      {!readOnly && <EditorToolbar editor={editor} onImageUpload={onImageUpload} />}
      <EditorContent editor={editor} />
    </div>
  );
}
```

### 1.5 툴바 디자인

**Desktop 툴바** (768px 이상): 모든 버튼 한 줄 표시

```
┌──────────────────────────────────────────────────────────────┐
│ [B] [I] [S] │ [H2] [H3] │ [UL] [OL] [인용] │ [링크] [이미지] │ [되돌리기] [다시하기] │
└──────────────────────────────────────────────────────────────┘
```

**Mobile 툴바** (768px 미만): 가로 스크롤 + 축약

```
┌──────────────────────────────────────────────┐
│ ← [B] [I] [S] [H2] [UL] [OL] [링크] [이미지] → │
└──────────────────────────────────────────────┘
```

**툴바 버튼 목록 (한국어 tooltip)**:

| 아이콘 | 한국어 Tooltip | Tiptap 명령 |
|--------|---------------|-------------|
| **B** (Bold) | 굵게 | `toggleBold()` |
| *I* (Italic) | 기울임 | `toggleItalic()` |
| ~~S~~ (Strike) | 취소선 | `toggleStrike()` |
| H2 | 제목 2 | `toggleHeading({ level: 2 })` |
| H3 | 제목 3 | `toggleHeading({ level: 3 })` |
| List (UL) | 글머리 기호 | `toggleBulletList()` |
| List (OL) | 번호 목록 | `toggleOrderedList()` |
| Quote | 인용 | `toggleBlockquote()` |
| Link | 링크 | 커스텀 링크 입력 다이얼로그 |
| Image | 이미지 | 파일 선택기 열기 |
| Undo | 되돌리기 | `undo()` |
| Redo | 다시하기 | `redo()` |

**툴바 컴포넌트 구조**:

```typescript
interface EditorToolbarProps {
  editor: Editor;
  onImageUpload?: (file: File) => Promise<string>;
}

function EditorToolbar({ editor, onImageUpload }: EditorToolbarProps) {
  return (
    <div className="flex items-center gap-0.5 border-b p-1 overflow-x-auto">
      {/* 서식 그룹 */}
      <ToolbarGroup>
        <ToolbarButton
          icon={Bold}
          label="굵게"
          isActive={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        {/* ... */}
      </ToolbarGroup>
      <Separator orientation="vertical" className="mx-1 h-6 hidden md:block" />
      {/* 블록 그룹 */}
      {/* ... */}
    </div>
  );
}
```

`ToolbarButton`은 shadcn `Button` variant="ghost" size="icon"에 `Tooltip`으로 한국어 라벨 표시.

### 1.6 Serialization

**저장 포맷: Tiptap JSON** (`editor.getJSON()`)
- DB `contents.body` 컬럼에 JSONB로 저장
- 장점: 구조화, 마이그레이션 용이, 서버 사이드 검색 가능
- HTML 변환은 클라이언트에서 EditorContent가 자동 처리

**폼 제출 시**:
```typescript
// content form에서
<input type="hidden" name="body" value={JSON.stringify(editorJson)} />
```

### 1.7 읽기 전용 모드

상세 페이지에서 콘텐츠 뷰어로 사용:
```tsx
<ContentEditor content={content.body} readOnly />
```
- 툴바 숨김 (`!readOnly && <EditorToolbar />`)
- `editable: false` 설정
- border 제거, prose 스타일만 적용
- 빈 콘텐츠일 때 렌더링하지 않음

### 1.8 빈 상태 / 플레이스홀더

```
┌──────────────────────────────────────────────┐
│ [B] [I] [S] │ [H2] [H3] │ [UL] [OL] │ ...  │
├──────────────────────────────────────────────┤
│                                              │
│  내용을 입력하세요...     (회색, 이탤릭)       │
│                                              │
└──────────────────────────────────────────────┘
```

Placeholder 스타일:
```css
.tiptap p.is-editor-empty:first-child::before {
  color: theme(--color-zinc-400);
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
}
```

---

## 2. Image Upload UX Flow

### 2.1 업로드 경로

이미지 업로드는 Supabase Storage 사용:
1. 사용자가 이미지 삽입 (드래그, 붙여넣기, 버튼)
2. 클라이언트에서 파일 유효성 검사
3. 임시 placeholder 삽입 (로딩 상태)
4. 서버 action으로 Supabase Storage 업로드
5. 반환된 public URL로 placeholder 교체

### 2.2 드래그 앤 드롭

ProseMirror `handleDrop` 활용 (Tiptap Pro FileHandler 대체):

```typescript
editorProps: {
  handleDrop: (view, event, _slice, moved) => {
    if (!moved && event.dataTransfer?.files?.length) {
      const files = Array.from(event.dataTransfer.files);
      const images = files.filter(f => f.type.startsWith("image/"));
      if (images.length === 0) return false;

      event.preventDefault();
      images.forEach(file => handleImageUpload(file, view, event));
      return true;
    }
    return false;
  },
}
```

### 2.3 클립보드 붙여넣기

```typescript
editorProps: {
  handlePaste: (view, event) => {
    const files = Array.from(event.clipboardData?.files ?? []);
    const images = files.filter(f => f.type.startsWith("image/"));
    if (images.length === 0) return false;

    event.preventDefault();
    images.forEach(file => handleImageUpload(file, view, event));
    return true;
  },
}
```

### 2.4 툴바 업로드 버튼

```typescript
function handleToolbarImageUpload() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) handleImageUpload(file);
  };
  input.click();
}
```

### 2.5 업로드 진행 표시

**Placeholder 방식**: 업로드 중 흐린 미리보기 + 스피너

```typescript
async function handleImageUpload(file: File) {
  // 1. 로컬 미리보기 URL 생성
  const previewUrl = URL.createObjectURL(file);

  // 2. Placeholder 이미지 삽입 (opacity 낮춤)
  editor.chain().focus().setImage({
    src: previewUrl,
    alt: "업로드 중...",
  }).run();

  try {
    // 3. 서버 업로드 (fetcher.submit with FormData)
    const uploadedUrl = await onImageUpload(file);

    // 4. Placeholder를 실제 URL로 교체
    // editor transaction으로 src 교체
    replaceImageSrc(editor, previewUrl, uploadedUrl);
  } catch {
    // 5. 실패 시 placeholder 제거
    removeImageBySrc(editor, previewUrl);
    toast.error("이미지 업로드에 실패했습니다.");
  } finally {
    URL.revokeObjectURL(previewUrl);
  }
}
```

### 2.6 파일 유효성 검사

```typescript
const IMAGE_MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return "지원하지 않는 이미지 형식입니다. (JPEG, PNG, GIF, WebP만 가능)";
  }
  if (file.size > IMAGE_MAX_SIZE) {
    return "이미지 크기는 5MB 이하여야 합니다.";
  }
  return null;
}
```

### 2.7 이미지 리사이즈/정렬

Phase 4 MVP에서는 리사이즈/정렬 미구현. 이유:
- Tiptap 이미지 리사이즈는 별도 Pro 확장 필요
- CSS `max-w-full`로 자동 반응형 처리
- 추후 필요시 `tiptap-extension-resize-image` (오픈소스) 검토

---

## 3. File Attachment Component Design

### 3.1 FileUploader 컴포넌트

파일 첨부는 에디터 내부가 아닌 별도 섹션으로 관리. Tiptap 콘텐츠와 분리.

```typescript
interface FileUploaderProps {
  /** 기존 첨부 파일 목록 */
  files: AttachedFile[];
  /** 파일 업로드 핸들러 */
  onUpload: (files: File[]) => Promise<void>;
  /** 파일 삭제 핸들러 */
  onDelete: (fileId: string) => void;
  /** 읽기 전용 모드 (상세 페이지) */
  readOnly?: boolean;
  /** 최대 파일 수 */
  maxFiles?: number;
  /** 최대 파일 크기 (bytes) */
  maxSize?: number;
}

interface AttachedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  created_at: string;
}
```

### 3.2 드래그 앤 드롭 영역

```
┌─ 첨부파일 ──────────────────────────────────────────────┐
│                                                         │
│  ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐   │
│  │                                                  │   │
│  │    📎 파일을 여기에 끌어다 놓거나 클릭하세요       │   │
│  │       PDF, Excel, Word, 이미지 (최대 10MB)       │   │
│  │                                                  │   │
│  └─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 📄 invoice-2026-03.pdf     2.3 MB    [다운로드] [×]│   │
│  │ 📊 packing-list.xlsx       156 KB    [다운로드] [×]│   │
│  │ 🖼️ sample-photo.jpg        1.1 MB    [다운로드] [×]│   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 3.3 파일 목록 표시

```typescript
function FileList({ files, onDelete, readOnly }: FileListProps) {
  return (
    <div className="flex flex-col gap-2">
      {files.map((file) => (
        <div key={file.id} className="flex items-center gap-3 rounded-md border px-3 py-2">
          <FileTypeIcon type={file.type} className="h-5 w-5 text-zinc-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{file.name}</p>
            <p className="text-xs text-zinc-400">{formatFileSize(file.size)}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
              <a href={file.url} download={file.name}>
                <FileDown className="h-4 w-4" />
              </a>
            </Button>
            {!readOnly && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-zinc-400 hover:text-red-600"
                onClick={() => onDelete(file.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

### 3.4 파일 타입 아이콘 매핑

```typescript
function FileTypeIcon({ type }: { type: string }) {
  // lucide-react 아이콘 매핑
  if (type.startsWith("image/")) return <ImageIcon />;
  if (type.includes("pdf")) return <FileText />;
  if (type.includes("sheet") || type.includes("excel")) return <Sheet />;
  if (type.includes("word") || type.includes("document")) return <FileText />;
  return <File />;
}
```

icons.tsx에 추가 필요: `File`, `FileDown`, `ImageIcon`, `Upload`, `Paperclip`

### 3.5 업로드 진행 표시

```typescript
interface UploadingFile {
  id: string;        // 임시 ID
  name: string;
  size: number;
  progress: number;  // 0-100
}
```

진행 상태 UI:
```
┌──────────────────────────────────────────────────┐
│ 📄 large-document.pdf    5.2 MB                  │
│ ████████████████░░░░░░░░░░░░░░  65%              │
└──────────────────────────────────────────────────┘
```

Supabase Storage는 resumable uploads를 지원하지만, 일반 파일은 단순 PUT으로 충분.
Progress는 `XMLHttpRequest` 또는 `fetch` + `ReadableStream`으로 구현 가능하나
MVP에서는 전체 스피너(Loader2 아이콘 회전)로 단순 처리.

### 3.6 파일 유효성 검사

```typescript
const FILE_MAX_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 10;
const BLOCKED_EXTENSIONS = [".exe", ".bat", ".sh", ".cmd"];

function validateFile(file: File): string | null {
  if (file.size > FILE_MAX_SIZE) {
    return `파일 크기는 10MB 이하여야 합니다. (${file.name})`;
  }
  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  if (BLOCKED_EXTENSIONS.includes(ext)) {
    return `허용되지 않는 파일 형식입니다. (${file.name})`;
  }
  return null;
}
```

---

## 4. Comment Section Design

### 4.1 컴포넌트 구조

```typescript
interface CommentSectionProps {
  /** 문서 타입 (po, pi, shipping, customs) */
  documentType: string;
  /** 문서 ID */
  documentId: string;
  /** 댓글 목록 */
  comments: Comment[];
  /** 현재 로그인 사용자 ID */
  currentUserId: string;
}

interface Comment {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
  user: {
    id: string;
    full_name: string;
    email: string;
    avatar_url: string | null;
  };
}
```

### 4.2 댓글 목록 레이아웃 (시간순 오래된것 위)

```
┌─ 댓글 (3) ──────────────────────────────────────────────┐
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 👤 김지영                           2시간 전      │   │
│  │ 견적서 단가 확인 부탁드립니다.                     │   │
│  │                                   [수정] [삭제]   │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 👤 박민수                           30분 전       │   │
│  │ 네, 확인했습니다. 단가 조정 완료.                  │   │
│  │                                   [수정] [삭제]   │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 📝 댓글을 입력하세요...                           │   │
│  │                                                  │   │
│  │                                      [작성]       │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 4.3 댓글 입력

```tsx
function CommentInput({ documentType, documentId }: CommentInputProps) {
  const fetcher = useFetcher();
  const [content, setContent] = useState("");
  const isSubmitting = fetcher.state !== "idle";

  // 제출 성공 시 입력 초기화
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      setContent("");
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <fetcher.Form method="post">
      <input type="hidden" name="_action" value="add_comment" />
      <input type="hidden" name="document_type" value={documentType} />
      <input type="hidden" name="document_id" value={documentId} />
      <div className="flex flex-col gap-2">
        <Textarea
          name="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="댓글을 입력하세요..."
          rows={2}
          maxLength={1000}
        />
        <div className="flex justify-end">
          <Button
            type="submit"
            size="sm"
            disabled={isSubmitting || content.trim().length === 0}
          >
            {isSubmitting && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            작성
          </Button>
        </div>
      </div>
    </fetcher.Form>
  );
}
```

### 4.4 댓글 수정 (인라인)

본인 댓글만 수정/삭제 가능. 수정 시 Textarea로 전환:

```tsx
function CommentItem({ comment, currentUserId }: CommentItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const fetcher = useFetcher();
  const isOwner = comment.user.id === currentUserId;

  if (isEditing) {
    return (
      <div className="flex flex-col gap-2">
        <Textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          rows={2}
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
            취소
          </Button>
          <Button
            size="sm"
            onClick={() => {
              fetcher.submit(
                { _action: "update_comment", comment_id: comment.id, content: editContent },
                { method: "post" }
              );
              setIsEditing(false);
            }}
          >
            저장
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarImage src={comment.user.avatar_url ?? undefined} />
        <AvatarFallback className="text-xs">
          {comment.user.full_name.charAt(0)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{comment.user.full_name}</span>
          <span className="text-xs text-zinc-400">{formatRelativeTime(comment.created_at)}</span>
        </div>
        <p className="text-sm text-zinc-700 whitespace-pre-wrap mt-0.5">{comment.content}</p>
        {isOwner && (
          <div className="flex gap-2 mt-1">
            <button
              className="text-xs text-zinc-400 hover:text-zinc-600"
              onClick={() => setIsEditing(true)}
            >
              수정
            </button>
            <button
              className="text-xs text-zinc-400 hover:text-red-600"
              onClick={() => {
                fetcher.submit(
                  { _action: "delete_comment", comment_id: comment.id },
                  { method: "post" }
                );
              }}
            >
              삭제
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

### 4.5 상대 시간 포맷 (한국어)

`app/lib/format.ts`에 추가:

```typescript
export function formatRelativeTime(date: string | Date): string {
  const now = Date.now();
  const target = new Date(date).getTime();
  const diffMs = now - target;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay < 7) return `${diffDay}일 전`;
  return formatDate(date);  // 7일 이상이면 일반 날짜 표시
}
```

### 4.6 빈 상태

```
┌─ 댓글 (0) ──────────────────────────────────────────────┐
│                                                         │
│              아직 댓글이 없습니다.                        │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 📝 댓글을 입력하세요...                           │   │
│  │                                      [작성]       │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 5. Content List Component (상세 페이지용)

### 5.1 콘텐츠 섹션이 상세 페이지에 표시되는 방식

PO/PI 상세 페이지에 추가되는 카드 섹션:

```
┌─ 콘텐츠 ──────────────────────────────── [+ 추가] ──┐
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │ 📄 공급업체 미팅 노트                         │   │
│  │ 김지영 | 2026.03.06                          │   │
│  │ 대만 CHP 사무실 방문 결과...                  │   │ <- 미리보기 (2줄)
│  │                          [펼치기] [수정] [삭제]│   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │ 📎 선적 관련 서류                             │   │
│  │ 박민수 | 2026.03.05                          │   │
│  │ B/L 사본 첨부합니다...                        │   │
│  │ [invoice.pdf] [packing-list.xlsx]             │   │ <- 첨부파일 뱃지
│  │                          [펼치기] [수정] [삭제]│   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 5.2 ContentList 컴포넌트

```typescript
interface ContentListProps {
  /** 문서 타입 (po, pi, shipping, customs) */
  documentType: string;
  /** 문서 ID */
  documentId: string;
  /** 콘텐츠 목록 */
  contents: ContentItem[];
  /** 현재 사용자 ID */
  currentUserId: string;
}

interface ContentItem {
  id: string;
  title: string;
  body: JSONContent;           // Tiptap JSON
  attachments: AttachedFile[];
  created_at: string;
  updated_at: string;
  author: {
    id: string;
    full_name: string;
  };
}
```

### 5.3 콘텐츠 카드 (접기/펼치기)

```typescript
function ContentCard({ content, currentUserId }: ContentCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const fetcher = useFetcher();
  const isOwner = content.author.id === currentUserId;

  // 본문 미리보기: Tiptap JSON에서 첫 100자 텍스트 추출
  const preview = extractTextPreview(content.body, 100);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-sm font-medium">{content.title}</CardTitle>
            <p className="text-xs text-zinc-400 mt-0.5">
              {content.author.full_name} | {formatDate(content.created_at)}
            </p>
          </div>
          {isOwner && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link to={`/contents/${content.id}/edit`}>
                    <Pencil className="mr-2 h-4 w-4" />
                    수정
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-red-600"
                  onClick={() => {
                    fetcher.submit(
                      { _action: "delete_content", content_id: content.id },
                      { method: "post" }
                    );
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  삭제
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isExpanded ? (
          <div>
            <ContentEditor content={content.body} readOnly />
            {content.attachments.length > 0 && (
              <div className="mt-3 pt-3 border-t">
                <FileUploader files={content.attachments} readOnly />
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 text-xs"
              onClick={() => setIsExpanded(false)}
            >
              접기
            </Button>
          </div>
        ) : (
          <div>
            <p className="text-sm text-zinc-600 line-clamp-2">{preview}</p>
            {content.attachments.length > 0 && (
              <div className="flex gap-1 mt-2">
                {content.attachments.map((f) => (
                  <Badge key={f.id} variant="outline" className="text-xs">
                    <Paperclip className="mr-1 h-3 w-3" />
                    {f.name}
                  </Badge>
                ))}
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 text-xs"
              onClick={() => setIsExpanded(true)}
            >
              펼치기
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

### 5.4 "추가" 버튼과 콘텐츠 생성

"+ 추가" 버튼 -> Dialog 또는 별도 페이지로 이동.

**결정: Dialog 방식 채택** (이유: 콘텐츠는 상세 페이지 맥락에서 작성. 별도 페이지 이동은 맥락 단절.)

```typescript
function ContentCreateDialog({
  open,
  onOpenChange,
  documentType,
  documentId,
}: ContentCreateDialogProps) {
  const fetcher = useFetcher();
  const [body, setBody] = useState<JSONContent | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>콘텐츠 추가</DialogTitle>
        </DialogHeader>
        <fetcher.Form method="post" className="flex flex-col gap-4">
          <input type="hidden" name="_action" value="create_content" />
          <input type="hidden" name="document_type" value={documentType} />
          <input type="hidden" name="document_id" value={documentId} />
          <input type="hidden" name="body" value={JSON.stringify(body)} />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="content-title">제목 *</Label>
            <Input id="content-title" name="title" required maxLength={200} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>본문</Label>
            <ContentEditor
              placeholder="내용을 입력하세요..."
              onChange={setBody}
              onImageUpload={handleImageUpload}
              minHeight="150px"
            />
          </div>

          {/* 첨부파일은 별도 action으로 업로드 후 ID 배열 전달 */}
          <FileUploader
            files={[]}
            onUpload={handleFileUpload}
            onDelete={handleFileDelete}
          />

          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button type="submit" disabled={fetcher.state !== "idle"}>
              {fetcher.state !== "idle" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              저장
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}
```

### 5.5 빈 상태

```
┌─ 콘텐츠 ──────────────────────────────── [+ 추가] ──┐
│                                                     │
│           아직 등록된 콘텐츠가 없습니다.              │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 5.6 텍스트 미리보기 유틸

```typescript
// Tiptap JSON에서 순수 텍스트 추출 (재귀)
function extractTextPreview(json: JSONContent, maxLength: number): string {
  let text = "";

  function walk(node: JSONContent) {
    if (text.length >= maxLength) return;
    if (node.text) {
      text += node.text;
    }
    if (node.content) {
      for (const child of node.content) {
        walk(child);
        if (text.length >= maxLength) break;
      }
      text += " ";  // 블록 사이 공백
    }
  }

  walk(json);
  return text.trim().slice(0, maxLength) + (text.length > maxLength ? "..." : "");
}
```

---

## 6. Responsive Design

### 6.1 Tiptap 툴바 반응형

**Mobile (< md)**:
- `overflow-x-auto` 가로 스크롤
- Separator(구분선) 숨김: `hidden md:block`
- Undo/Redo 숨김 (모바일에서는 OS 기본 undo 사용)
- 터치 타겟: 최소 `h-9 w-9` (44px에 근접)

**Desktop (>= md)**:
- 전체 툴바 한 줄 표시
- Separator로 그룹 구분
- 모든 버튼 표시

```tsx
<div className="flex items-center gap-0.5 border-b p-1 overflow-x-auto">
  {/* 서식 그룹 - 항상 표시 */}
  <ToolbarButton icon={Bold} label="굵게" ... />
  <ToolbarButton icon={Italic} label="기울임" ... />
  <ToolbarButton icon={Strikethrough} label="취소선" ... />

  <Separator orientation="vertical" className="mx-1 h-6 hidden md:block" />

  {/* 블록 그룹 - 항상 표시 */}
  <ToolbarButton icon={Heading2} label="제목 2" ... />
  <ToolbarButton icon={Heading3} label="제목 3" ... />
  <ToolbarButton icon={List} label="글머리 기호" ... />
  <ToolbarButton icon={ListOrdered} label="번호 목록" ... />
  <ToolbarButton icon={Quote} label="인용" ... />

  <Separator orientation="vertical" className="mx-1 h-6 hidden md:block" />

  {/* 삽입 그룹 */}
  <ToolbarButton icon={LinkIcon} label="링크" ... />
  <ToolbarButton icon={ImageIcon} label="이미지" ... />

  <Separator orientation="vertical" className="mx-1 h-6 hidden md:block" />

  {/* 이력 - Desktop만 */}
  <div className="hidden md:flex items-center gap-0.5">
    <ToolbarButton icon={Undo} label="되돌리기" ... />
    <ToolbarButton icon={Redo} label="다시하기" ... />
  </div>
</div>
```

### 6.2 Mobile 파일 업로드

- 드래그 앤 드롭 영역: 탭하면 파일 선택기 열림 (`<input type="file">` 트리거)
- 드롭 영역 텍스트 변경: `md:hidden`에서 "탭하여 파일 선택", `hidden md:block`에서 "파일을 끌어다 놓거나 클릭하세요"
- 파일 목록: 동일 레이아웃 (아이콘 + 이름 + 크기 + 액션)

### 6.3 Mobile 댓글 입력

- Textarea 전체 너비
- 제출 버튼 우측 정렬
- 수정/삭제 링크: 동일 위치 (댓글 하단)

### 6.4 Mobile 콘텐츠 카드

- 동일 카드 레이아웃 (모바일/데스크톱 차이 없음, Card가 이미 반응형)
- Dialog: `max-w-2xl` -> 모바일에서 전체 너비로 자동 조정
- 첨부파일 Badge: `flex-wrap`으로 줄바꿈

---

## 7. Component File Structure

### 7.1 파일 경로

```
app/components/shared/
  content-editor.tsx       # Tiptap 에디터 래퍼 + EditorToolbar
  content-list.tsx         # 콘텐츠 목록 (ContentCard + ContentCreateDialog)
  comment-section.tsx      # 댓글 섹션 (CommentItem + CommentInput)
  file-uploader.tsx        # 파일 첨부 관리자 (DropZone + FileList)

app/types/
  content.ts               # ContentItem, Comment, AttachedFile 타입

app/loaders/
  contents.server.ts       # 콘텐츠 CRUD actions (create, update, delete)
  comments.server.ts       # 댓글 CRUD actions (add, update, delete)
  upload.server.ts         # 파일/이미지 업로드 action (Supabase Storage)

app/lib/
  format.ts                # formatRelativeTime 추가
```

### 7.2 Props 인터페이스 정리

```typescript
// app/types/content.ts

import type { JSONContent } from "@tiptap/react";

/** 콘텐츠 항목 (DB contents 테이블) */
export interface ContentItem {
  id: string;
  document_type: string;   // "po" | "pi" | "shipping" | "customs"
  document_id: string;
  title: string;
  body: JSONContent;
  created_at: string;
  updated_at: string;
  created_by: string;
  author: {
    id: string;
    full_name: string;
  };
  attachments: AttachedFile[];
}

/** 첨부파일 */
export interface AttachedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  storage_path: string;
  created_at: string;
}

/** 댓글 */
export interface Comment {
  id: string;
  document_type: string;
  document_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  user: {
    id: string;
    full_name: string;
    email: string;
    avatar_url: string | null;
  };
}
```

### 7.3 커스텀 훅

에디터 상태는 `useEditor`(Tiptap 제공)로 충분. 별도 커스텀 훅 불필요.

파일 업로드 훅:

```typescript
// content-editor.tsx 내부 또는 별도 파일
function useImageUpload(fetcher: ReturnType<typeof useFetcher>) {
  const upload = useCallback(async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("_action", "upload_image");

    // fetcher.submit 대신 직접 fetch (URL 응답 필요)
    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    if (!data.url) throw new Error("업로드 실패");
    return data.url;
  }, []);

  return { upload };
}
```

참고: 이미지 업로드는 별도 API 라우트(`/api/upload`)로 처리. 에디터에서 즉시 URL이 필요하므로 fetcher 패턴 대신 직접 fetch 사용.

---

## 8. UI/UX Wireframes (ASCII)

### 8.1 PO/PI 상세 페이지 콘텐츠 섹션

```
┌─────────────────────────────────────────────────────────────┐
│ ← GVPO2603-001                    [진행] [완료 처리] [...]   │  <- Header
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─ 기본 정보 ──────────┐  ┌─ 거래 조건 ──────────┐          │  <- DetailInfo
│  │ ...                  │  │ ...                  │          │
│  └──────────────────────┘  └──────────────────────┘          │
│                                                             │
│  ┌─ 품목 내역 ─────────────────────────────────────┐          │  <- DetailItems
│  │ ...                                             │          │
│  └─────────────────────────────────────────────────┘          │
│                                                             │
│  ┌─ 비고 ──────────────────────────────────────────┐          │  <- Notes
│  │ ...                                             │          │
│  └─────────────────────────────────────────────────┘          │
│                                                             │
│  ┌─ 콘텐츠 ─────────────────────────────── [+ 추가] ┐          │  <- NEW
│  │                                                  │          │
│  │  ┌─────────────────────────────────────────────┐ │          │
│  │  │ 📄 미팅 노트        김지영 | 2026.03.06     │ │          │
│  │  │ CHP 공장 방문 결과...              [펼치기] │ │          │
│  │  └─────────────────────────────────────────────┘ │          │
│  │                                                  │          │
│  └──────────────────────────────────────────────────┘          │
│                                                             │
│  ┌─ 댓글 (2) ──────────────────────────────────────┐          │  <- NEW
│  │                                                  │          │
│  │  👤 김지영                          2시간 전      │          │
│  │  단가 확인 부탁드립니다.                          │          │
│  │                                                  │          │
│  │  👤 박민수                          30분 전       │          │
│  │  확인 완료.                                      │          │
│  │                                                  │          │
│  │  ┌──────────────────────────────────────────┐    │          │
│  │  │ 댓글을 입력하세요...              [작성]  │    │          │
│  │  └──────────────────────────────────────────┘    │          │
│  │                                                  │          │
│  └──────────────────────────────────────────────────┘          │
│                                                             │
│  작성: 2026.03.06    수정: 2026.03.06                         │  <- 메타
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 콘텐츠 작성 Dialog

```
┌─────────────────────────────────────────────────┐
│ 콘텐츠 추가                                [X]  │
├─────────────────────────────────────────────────┤
│                                                 │
│  제목 *                                         │
│  ┌─────────────────────────────────────────────┐│
│  │ 공급업체 미팅 노트                          ││
│  └─────────────────────────────────────────────┘│
│                                                 │
│  본문                                           │
│  ┌─────────────────────────────────────────────┐│
│  │ [B] [I] [S] │ [H2] [H3] │ [UL] [OL] │ ...  ││
│  ├─────────────────────────────────────────────┤│
│  │                                             ││
│  │  대만 CHP 공장 방문 결과                     ││
│  │                                             ││
│  │  1. 생산 라인 확인                           ││
│  │  2. 단가 협의 진행                           ││
│  │                                             ││
│  └─────────────────────────────────────────────┘│
│                                                 │
│  첨부파일                                       │
│  ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐│
│  │ 파일을 여기에 끌어다 놓거나 클릭하세요       ││
│  └─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘│
│  📄 meeting-photo.jpg  1.2 MB      [다운로드] [×]│
│                                                 │
│                          [취소]      [저장]      │
└─────────────────────────────────────────────────┘
```

### 8.3 콘텐츠 펼친 상태

```
┌──────────────────────────────────────────────────────┐
│ 📄 공급업체 미팅 노트                          [...] │
│ 김지영 | 2026.03.06                                  │
├──────────────────────────────────────────────────────┤
│                                                      │
│  대만 CHP 공장 방문 결과                              │
│                                                      │
│  1. 생산 라인 확인                                    │
│     - Glassine Paper 45gsm 생산 가능                 │
│     - 주간 생산량: 약 50톤                            │
│                                                      │
│  2. 단가 협의                                        │
│     - 기존 $1,200/MT -> $1,150/MT 합의               │
│                                                      │
│  [사진1.jpg 인라인 이미지]                            │
│                                                      │
│  ──────────────────────────────────────────           │
│  📎 첨부파일                                          │
│  📄 meeting-minutes.pdf    2.3 MB    [다운로드]       │
│  🖼️ factory-photo.jpg      1.1 MB    [다운로드]       │
│                                                      │
│                                          [접기]       │
└──────────────────────────────────────────────────────┘
```

### 8.4 Mobile 콘텐츠 작성 Dialog

```
┌──────────────────────────────────┐
│ 콘텐츠 추가               [X]   │
├──────────────────────────────────┤
│                                  │
│ 제목 *                           │
│ ┌──────────────────────────────┐ │
│ │                              │ │
│ └──────────────────────────────┘ │
│                                  │
│ 본문                             │
│ ┌──────────────────────────────┐ │
│ │← [B][I][S][H2][UL][OL][🔗]→│ │  <- 가로스크롤
│ ├──────────────────────────────┤ │
│ │                              │ │
│ │ 내용을 입력하세요...         │ │
│ │                              │ │
│ │                              │ │
│ └──────────────────────────────┘ │
│                                  │
│ 첨부파일                         │
│ ┌──────────────────────────────┐ │
│ │  탭하여 파일 선택             │ │
│ └──────────────────────────────┘ │
│                                  │
│         [취소]     [저장]        │
└──────────────────────────────────┘
```

---

## 9. shadcn/ui 컴포넌트 + 아이콘 추가 목록

### 9.1 신규 설치 필요 shadcn 컴포넌트

| 컴포넌트 | 용도 |
|----------|------|
| `dialog` | 콘텐츠 작성/수정 Dialog (이미 설치됨 확인) |
| `tooltip` | 툴바 버튼 한국어 라벨 (이미 설치됨 확인) |
| `avatar` | 댓글 사용자 프로필 (이미 설치됨 확인) |
| `progress` | 파일 업로드 진행바 (필요시) |

이미 설치된 것: dialog, tooltip, avatar, badge, card, button, input, textarea, label, select, dropdown-menu, alert-dialog, tabs, separator

**신규 설치 필요**: `progress` (업로드 진행바 사용 시)

```bash
npx shadcn@latest add progress
```

### 9.2 icons.tsx 추가 아이콘

```typescript
// 기존 + 추가 필요
export {
  // ... 기존 아이콘들
  // Phase 4 추가
  Bold,
  Italic,
  Strikethrough,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,    // Link 컴포넌트와 충돌 방지
  ImageIcon,           // lucide의 Image -> ImageIcon
  Undo,
  Redo,
  File,
  Upload,
  Paperclip,
  MessageSquare,       // 댓글 섹션 아이콘
} from "lucide-react";
```

### 9.3 커스텀 컴포넌트

- `ToolbarButton` - 에디터 툴바 버튼 (ghost Button + Tooltip)
- `DropZone` - 파일 드래그 앤 드롭 영역

이 두 컴포넌트는 content-editor.tsx / file-uploader.tsx 내부에 정의. 별도 파일 불필요.

---

## 10. Korean Localization

### 10.1 에디터 관련 텍스트

| 위치 | 한국어 텍스트 |
|------|-------------|
| Placeholder | "내용을 입력하세요..." |
| 이미지 업로드 중 alt | "업로드 중..." |
| 이미지 업로드 실패 toast | "이미지 업로드에 실패했습니다." |
| 이미지 크기 초과 | "이미지 크기는 5MB 이하여야 합니다." |
| 이미지 형식 오류 | "지원하지 않는 이미지 형식입니다. (JPEG, PNG, GIF, WebP만 가능)" |
| 링크 입력 Dialog 제목 | "링크 추가" |
| 링크 URL 라벨 | "URL" |
| 링크 URL placeholder | "https://" |

### 10.2 파일 관련 텍스트

| 위치 | 한국어 텍스트 |
|------|-------------|
| 드롭존 (Desktop) | "파일을 여기에 끌어다 놓거나 클릭하세요" |
| 드롭존 (Mobile) | "탭하여 파일 선택" |
| 드롭존 안내 | "PDF, Excel, Word, 이미지 (최대 10MB)" |
| 파일 크기 초과 | "파일 크기는 10MB 이하여야 합니다." |
| 파일 형식 오류 | "허용되지 않는 파일 형식입니다." |
| 파일 수 초과 | "최대 10개까지 첨부할 수 있습니다." |
| 다운로드 (sr-only) | "다운로드" |
| 삭제 (sr-only) | "삭제" |

### 10.3 콘텐츠 관련 텍스트

| 위치 | 한국어 텍스트 |
|------|-------------|
| 카드 제목 | "콘텐츠" |
| 추가 버튼 | "+ 추가" |
| 빈 상태 | "아직 등록된 콘텐츠가 없습니다." |
| Dialog 제목 (생성) | "콘텐츠 추가" |
| Dialog 제목 (수정) | "콘텐츠 수정" |
| 제목 라벨 | "제목" |
| 본문 라벨 | "본문" |
| 펼치기 | "펼치기" |
| 접기 | "접기" |
| 수정 | "수정" |
| 삭제 | "삭제" |
| 저장 | "저장" |
| 취소 | "취소" |
| 삭제 확인 | "이 콘텐츠를 삭제하시겠습니까?" |
| 삭제 설명 | "삭제된 콘텐츠는 복구할 수 없습니다." |

### 10.4 댓글 관련 텍스트

| 위치 | 한국어 텍스트 |
|------|-------------|
| 카드 제목 | "댓글" (+ 개수) |
| 입력 placeholder | "댓글을 입력하세요..." |
| 작성 버튼 | "작성" |
| 수정 버튼 | "수정" |
| 삭제 버튼 | "삭제" |
| 저장 버튼 | "저장" |
| 취소 버튼 | "취소" |
| 빈 상태 | "아직 댓글이 없습니다." |
| 삭제 확인 | "이 댓글을 삭제하시겠습니까?" |
| 상대시간 | "방금 전", "N분 전", "N시간 전", "N일 전" |

### 10.5 툴바 버튼 Tooltip (한국어)

| 버튼 | Tooltip |
|------|---------|
| Bold | 굵게 |
| Italic | 기울임 |
| Strikethrough | 취소선 |
| Heading 2 | 제목 2 |
| Heading 3 | 제목 3 |
| Bullet List | 글머리 기호 |
| Ordered List | 번호 목록 |
| Blockquote | 인용 |
| Link | 링크 |
| Image | 이미지 |
| Undo | 되돌리기 |
| Redo | 다시하기 |

---

## 11. 구현 순서

### Phase 4-A: 기반 컴포넌트
1. `app/types/content.ts` - 타입 정의
2. `app/lib/format.ts` - `formatRelativeTime` 추가
3. `app/components/ui/icons.tsx` - Phase 4 아이콘 추가
4. `app/components/shared/content-editor.tsx` - Tiptap 에디터 (툴바 + 읽기전용)
5. `app/components/shared/file-uploader.tsx` - 파일 첨부 컴포넌트

### Phase 4-B: 콘텐츠 + 댓글 + 통합
6. `app/loaders/upload.server.ts` - 이미지/파일 업로드 action
7. `app/loaders/contents.server.ts` - 콘텐츠 CRUD
8. `app/loaders/comments.server.ts` - 댓글 CRUD
9. `app/components/shared/content-list.tsx` - 콘텐츠 목록
10. `app/components/shared/comment-section.tsx` - 댓글 섹션
11. PO/PI 상세 페이지에 콘텐츠 + 댓글 섹션 통합
12. API 라우트: `/api/upload` (이미지 즉시 업로드용)

### Phase 4-C: 폴리시
13. Tiptap 에디터 스타일링 (prose 클래스 커스텀)
14. 에러 핸들링 + toast 메시지
15. 접근성 검수 (키보드 네비게이션, ARIA)

---

## 12. 주요 기술 결정 요약

| 결정 | 선택 | 이유 |
|------|------|------|
| FileHandler | ProseMirror 직접 구현 | Tiptap Pro 유료 회피 |
| 콘텐츠 저장 포맷 | Tiptap JSON (JSONB) | 구조화, 마이그레이션 용이 |
| 콘텐츠 작성 UI | Dialog | 맥락 유지 (상세 페이지에서 이탈 없음) |
| 이미지 업로드 | 별도 API 라우트 + fetch | 에디터에서 즉시 URL 필요 |
| 파일 첨부 | 에디터 외부 별도 섹션 | 파일과 콘텐츠 관심사 분리 |
| 이미지 리사이즈 | MVP 미구현 | Pro 확장 필요, CSS max-w-full로 대체 |
| 에디터 상태 | 비제어(Uncontrolled) | Tiptap 권장, 성능 최적화 |
| SSR 호환 | `immediatelyRender: false` | React Router 7 SSR 환경 |
| Heading 레벨 | h2, h3만 | h1은 페이지 제목에 예약 |
| 댓글 에디터 | Textarea (리치텍스트 아님) | 댓글은 간단한 텍스트면 충분 |
| 업로드 진행 표시 | 스피너 (MVP) | 진행바는 XHR 필요, 복잡도 증가 |

---

## 13. Tiptap 에디터 CSS 스타일

Tailwind CSS v4의 `@theme` 또는 글로벌 CSS에 추가:

```css
/* app/styles/tiptap.css (또는 app.css에 추가) */

/* 에디터 기본 스타일 */
.tiptap {
  padding: 0.75rem 1rem;
  outline: none;
}

/* 플레이스홀더 */
.tiptap p.is-editor-empty:first-child::before {
  color: var(--color-zinc-400);
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
  font-style: italic;
}

/* 이미지 스타일 */
.tiptap img {
  max-width: 100%;
  height: auto;
  border-radius: 0.375rem;
  margin: 0.5rem 0;
}

/* 업로드 중 이미지 (opacity 낮춤) */
.tiptap img[alt="업로드 중..."] {
  opacity: 0.5;
}

/* 링크 스타일 */
.tiptap a {
  color: var(--color-blue-600);
  text-decoration: underline;
  cursor: pointer;
}

/* prose 오버라이드 (Tiptap 내부 간격 조정) */
.tiptap h2 {
  font-size: 1.25rem;
  font-weight: 600;
  margin-top: 1.5rem;
  margin-bottom: 0.5rem;
}

.tiptap h3 {
  font-size: 1.1rem;
  font-weight: 600;
  margin-top: 1rem;
  margin-bottom: 0.5rem;
}

.tiptap blockquote {
  border-left: 3px solid var(--color-zinc-300);
  padding-left: 1rem;
  color: var(--color-zinc-600);
  font-style: italic;
}

.tiptap ul,
.tiptap ol {
  padding-left: 1.5rem;
  margin: 0.5rem 0;
}

.tiptap code {
  background-color: var(--color-zinc-100);
  padding: 0.125rem 0.25rem;
  border-radius: 0.25rem;
  font-size: 0.875rem;
}
```

---

## References

- [Tiptap React Installation](https://tiptap.dev/docs/editor/getting-started/install/react)
- [Tiptap Editor API](https://tiptap.dev/docs/editor/api/editor)
- [Tiptap StarterKit](https://tiptap.dev/docs/editor/extensions/functionality/starterkit)
- [Tiptap FileHandler Extension](https://tiptap.dev/docs/editor/extensions/functionality/filehandler)
- [Tiptap Image Drag & Drop (Community)](https://www.codemzy.com/blog/tiptap-drag-drop-image)
- [Tiptap Events](https://tiptap.dev/docs/editor/api/events)
