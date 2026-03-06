# Phase 4: Contents System - Brainstorming Document

**Date:** 2026-03-06
**Status:** Brainstorming Complete
**Next Step:** Phase 4 상세 분석 및 구현 계획 수립

---

## 1. Overview & Scope

Phase 4는 **모든 문서 모듈(PO, PI, Shipping, Orders, Customs)에서 공유하는 콘텐츠 시스템**을 구현한다.

**포함 기능:**
- Tiptap 리치 텍스트 에디터 (메모/노트)
- 이미지 드래그 & 드롭 (Supabase Storage 업로드, 에디터 인라인)
- 파일 첨부 관리 (업로드/다운로드/삭제)
- 댓글 시스템 (평면 스레드)

**핵심 원칙:** 콘텐츠 시스템은 **공유 컴포넌트 + 공유 서버 유틸리티**로 구성. 별도 라우트가 아닌 각 문서의 상세 페이지에 임베딩.

---

## 2. Agent Team & File Ownership

| # | Role | File | Scope |
|---|------|------|-------|
| 1 | **Architect** | [architect.md](../brainstorm/phase4/architect.md) | 시스템 아키텍처, DB 스키마, 모듈 통합, 구현 단계 |
| 2 | **Frontend Dev** | [frontend.md](../brainstorm/phase4/frontend.md) | Tiptap 컴포넌트, UI/UX, 반응형, 한국어 |
| 3 | **Backend Dev** | [backend.md](../brainstorm/phase4/backend.md) | Migration, Storage, Loader/Action, 업로드 전략 |
| 4 | **Security Reviewer** | [security.md](../brainstorm/phase4/security.md) | 파일 업로드 보안, XSS, RLS, Storage 접근제어 |
| 5 | **Researcher** | (context7 리서치) | Tiptap 최신 문서, 대안 에디터, Storage 패턴 |

**제외:** Tester, Perf-analyzer, Code-reviewer (코드 없음, 시기상조)

---

## 3. Architecture Decisions

### 3.1 1:1 Contents per Document (1:N 아님)

각 문서(PO, PI 등)에 **하나의 콘텐츠 레코드**만 허용.

| 선택 | 근거 |
|------|------|
| 1:1 (UNIQUE 제약) | 비즈니스 현실: PO에는 메모 하나. 다중 메모 UX 복잡도 불필요 |
| `title` 컬럼 제거 | 1:1이면 제목 불필요 (컨텍스트는 부모 문서에서) |
| 댓글이 다중 입력 담당 | 토론/대화는 댓글로, 노트는 단일 본문으로 |

### 3.2 상세 페이지 임베딩 (별도 라우트 아님)

```
┌─ PO Detail Page ─────────────────────────┐
│  PODetailInfo  │  PODetailItems           │
│──────────────────────────────────────────│
│  ContentSection (공유 컴포넌트)            │
│  ├── Tiptap Editor (body JSONB)          │
│  ├── File Attachments List               │
│  └── Comments Thread                     │
└──────────────────────────────────────────┘
```

**근거:** 기존 PO 상세가 이미 PO + 연결 PI를 하나의 loader에서 로드. 동일 패턴으로 콘텐츠 추가. 새 라우트 불필요.

### 3.3 Lazy Content Creation (Upsert)

문서 생성 시 콘텐츠 레코드를 미리 만들지 않음. **첫 저장 시 Upsert**.

```sql
INSERT INTO contents (type, parent_id, body, created_by)
VALUES ('po', :parent_id, :body, :user_id)
ON CONFLICT (type, parent_id) DO UPDATE SET
  body = :body, updated_at = NOW();
```

### 3.4 공유 서버 유틸리티

```typescript
// app/lib/content.server.ts
export async function loadContent(supabase, contentType, parentId)
export async function handleContentAction(supabase, userId, contentType, parentId, intent, formData)
```

각 모듈의 loader/action에 3-4줄 추가로 통합:
```typescript
// loader에 추가
loadContent(supabase, "po", id),  // Promise.all에 추가

// action에 추가
if (intent.startsWith("content_")) {
  return handleContentAction(supabase, user.id, "po", id, intent, formData);
}
```

---

## 4. DB Schema

### 4.1 현재 상태 (DB에 이미 존재)

`contents`, `content_attachments`, `comments` 테이블이 이미 존재하나 다음이 누락:
- `deleted_at` 컬럼 (soft delete)
- 인덱스 (type + parent_id 복합)
- UNIQUE 제약 (1:1 강제)
- `content_attachments.created_by` 컬럼
- FK 제약 (created_by → auth.users)
- `contents.type` CHECK 제약

### 4.2 Migration 계획

**Migration 1: Schema 보강**
```sql
-- UNIQUE 제약 (1:1 강제)
ALTER TABLE contents ADD CONSTRAINT uq_content_parent UNIQUE (type, parent_id);

-- soft delete
ALTER TABLE contents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 업로더 추적
ALTER TABLE content_attachments ADD COLUMN IF NOT EXISTS created_by UUID;

-- CHECK 제약
ALTER TABLE contents ADD CONSTRAINT contents_type_check
  CHECK (type IN ('po', 'pi', 'customs', 'shipping', 'delivery', 'order'));

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_contents_type_parent
  ON contents(type, parent_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_comments_content_id
  ON comments(content_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_content_attachments_content_id
  ON content_attachments(content_id);

-- FK 보강
ALTER TABLE contents ADD CONSTRAINT contents_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) NOT VALID;
ALTER TABLE comments ADD CONSTRAINT comments_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) NOT VALID;
```

**Migration 2: RLS 정책**
```sql
-- GV 사용자: 전체 CRUD (Saelim 접근 불가)
CREATE POLICY "gv_contents_all" ON contents
  FOR ALL USING (get_user_org_type() = 'gv');
CREATE POLICY "gv_content_attachments_all" ON content_attachments
  FOR ALL USING (get_user_org_type() = 'gv');
CREATE POLICY "gv_comments_all" ON comments
  FOR ALL USING (get_user_org_type() = 'gv');
```

**Migration 3: Storage 버킷 보강**
```sql
-- 파일 크기/타입 제한 (현재 NULL)
UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
WHERE id = 'content-images';

UPDATE storage.buckets
SET file_size_limit = 20971520
WHERE id = 'attachments';

-- Storage 정책 수정: GV-only 업로드
DROP POLICY IF EXISTS "auth_upload_images" ON storage.objects;
CREATE POLICY "gv_upload_images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'content-images' AND get_user_org_type() = 'gv');
CREATE POLICY "gv_delete_images" ON storage.objects
  FOR DELETE USING (bucket_id = 'content-images' AND get_user_org_type() = 'gv');
```

---

## 5. File Storage Architecture

### 5.1 Bucket Design

| Bucket | Access | Max Size | Types | Path Pattern |
|--------|--------|----------|-------|-------------|
| `content-images` | Public | 5 MB | image/* (no SVG) | `{type}/{parent_id}/{uuid}.{ext}` |
| `attachments` | Private (RLS) | 20 MB | PDF/Excel/CSV/Image | `{type}/{parent_id}/{uuid}_{filename}` |

### 5.2 Upload Strategy

**인라인 이미지 (Tiptap):** Signed Upload URL 방식
1. Client → POST `/api/upload` (파일명, 타입 정보만)
2. Server → `createSignedUploadUrl()` + `getPublicUrl()` 반환
3. Client → PUT signed URL (파일 바이트 직접 전송)
4. Client → Tiptap에 public URL로 이미지 노드 삽입

**첨부파일:** 동일 Signed Upload URL 방식 + `content_attachments` 레코드 저장
- Private 버킷이므로 다운로드 시 서버에서 `createSignedUrl()` (1시간 유효)

**근거:** CF Workers 메모리 제한(128MB)을 우회. 서버는 URL만 발급, 실제 전송은 Client↔Supabase.

### 5.3 Security 필수사항

- [ ] SVG 업로드 차단 (XSS)
- [ ] 서버에서 magic byte MIME 검증
- [ ] UUID 기반 파일 경로 (원본 파일명은 DB에만)
- [ ] `auth_upload_images` 정책 GV-only로 수정
- [ ] 버킷 `file_size_limit` / `allowed_mime_types` 설정

---

## 6. Frontend Architecture

### 6.1 Tiptap 패키지

```bash
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-image \
  @tiptap/extension-link @tiptap/extension-placeholder @tiptap/pm
```

**`@tiptap-pro/extension-file-handler`는 유료** → ProseMirror `editorProps.handleDrop` / `handlePaste` 직접 구현.

### 6.2 Component Structure

```
app/components/content/
  content-section.tsx          # 메인 래퍼 Card (에디터+첨부+댓글)
  content-editor.tsx           # Tiptap 에디터 + 툴바
  content-editor-toolbar.tsx   # 서식 툴바 (굵게/기울임/제목/이미지)
  content-attachments.tsx      # 파일 첨부 목록 + 업로드
  content-comments.tsx         # 댓글 스레드
```

### 6.3 ContentEditor Props

```typescript
interface ContentEditorProps {
  content?: JSONContent | string;   // Tiptap JSON 초기값
  onChange?: (json: JSONContent) => void;
  readOnly?: boolean;               // 뷰어 모드
  placeholder?: string;             // "메모를 입력하세요..."
  onImageUpload?: (file: File) => Promise<string>;  // File → URL
  minHeight?: string;
  className?: string;
}
```

### 6.4 Key UX Decisions

| 결정 | 선택 | 근거 |
|------|------|------|
| 에디터 표시 방식 | 접이식 Card | 대부분 문서에 메모 없음, 시각적 노이즈 감소 |
| 자동 저장 vs 수동 | 수동 저장 (저장 버튼) | 에디터 펼침 → 편집 → 저장 흐름이 명확 |
| 툴바 반응형 | Mobile: 가로 스크롤, undo/redo 숨김 | 좁은 화면 최적화 |
| 이미지 리사이즈 | CSS `max-w-full` (에디터 내 리사이즈 없음) | MVP에서 충분 |
| 댓글 형식 | Plain text (마크다운 없음) | XSS 방지, 단순성 |
| SSR 호환 | `immediatelyRender: false` + client-only | Tiptap은 클라이언트 에디터 |

### 6.5 Image Upload UX Flow

```
1. 드래그/붙여넣기/버튼으로 이미지 선택
2. 반투명 플레이스홀더 삽입 (ObjectURL, opacity 낮춤)
3. POST /api/upload → signed URL 수신
4. PUT signed URL → 실제 업로드
5. 플레이스홀더를 실제 public URL로 교체
6. 에러 시 플레이스홀더 제거 + 토스트 알림
```

### 6.6 Korean Localization

```typescript
const TOOLBAR_LABELS = {
  bold: "굵게", italic: "기울임", underline: "밑줄",
  strikethrough: "취소선", heading2: "제목 2", heading3: "제목 3",
  bulletList: "글머리 기호", orderedList: "번호 매기기",
  blockquote: "인용", code: "코드", image: "이미지 삽입",
  undo: "실행 취소", redo: "다시 실행",
};
const PLACEHOLDER = "메모를 입력하세요...";
const EMPTY_COMMENT = "댓글을 입력하세요";
```

### 6.7 필요한 shadcn/ui 컴포넌트

- `Collapsible` (접이식 콘텐츠 섹션)
- `Avatar` (댓글 작성자 표시)
- `Tooltip` (툴바 버튼 힌트)
- 기존: Card, Button, Textarea, Badge

---

## 7. Server Architecture

### 7.1 New Files

```
app/types/content.ts              # ContentType, Content, Attachment, Comment 타입
app/lib/content.server.ts         # loadContent(), handleContentAction()
app/loaders/content.schema.ts     # Zod 스키마
app/loaders/upload.server.ts      # Signed URL 발급 action
app/routes/api.upload.ts          # Resource route (no UI)
```

### 7.2 Modified Files

```
app/loaders/po.$id.server.ts     # loadContent + content action intents
app/loaders/pi.$id.server.ts     # 동일
app/routes/_layout.po.$id.tsx    # <ContentSection> 추가
app/routes/_layout.pi.$id.tsx    # 동일
package.json                      # @tiptap/* 패키지 추가
```

### 7.3 Action Intent Map

| Intent | Route | 설명 |
|--------|-------|------|
| `content_save` | `po.$id` / `pi.$id` | 콘텐츠 upsert (body JSONB) |
| `content_delete` | `po.$id` / `pi.$id` | 콘텐츠 soft delete |
| `content_add_comment` | `po.$id` / `pi.$id` | 댓글 생성 |
| `content_update_comment` | `po.$id` / `pi.$id` | 댓글 수정 |
| `content_delete_comment` | `po.$id` / `pi.$id` | 댓글 soft delete |
| `content_save_attachment` | `po.$id` / `pi.$id` | 첨부 레코드 저장 |
| `content_delete_attachment` | `po.$id` / `pi.$id` | 첨부 삭제 (레코드+Storage) |
| (POST) | `api.upload` | Signed upload URL 발급 |

### 7.4 Zod Schemas

```typescript
export const contentSaveSchema = z.object({
  body: z.string().max(500_000, "본문이 너무 깁니다"),
});

export const commentCreateSchema = z.object({
  content_id: z.string().uuid(),
  body: z.string().min(1, "댓글을 입력하세요").max(2000, "2000자 이내"),
});

export const attachmentRecordSchema = z.object({
  content_id: z.string().uuid(),
  file_url: z.string().min(1),
  file_name: z.string().min(1).max(255),
  file_size: z.number().int().positive().optional(),
});
```

---

## 8. Security Highlights

### Critical (구현 전/중 필수)

| # | 항목 | 상세 |
|---|------|------|
| 1 | Storage 버킷 제한 | `file_size_limit`, `allowed_mime_types` 설정 |
| 2 | `auth_upload_images` 수정 | Saelim → GV-only |
| 3 | SVG 차단 | content-images에 SVG 허용 금지 |
| 4 | 파일명 산화 | UUID 경로 사용, 원본명은 DB만 |
| 5 | Tiptap JSON 검증 | 노드/마크 allowlist, src/href 검증 |
| 6 | `dangerouslySetInnerHTML` 금지 | Tiptap EditorContent read-only 사용 |
| 7 | `contents.type` CHECK | CHECK 제약 추가 |
| 8 | parent 존재 검증 | content 생성 전 부모 문서 확인 |

### Pre-existing Gap

- `shipping_documents`의 `saelim_read` RLS가 `amount`/`details` 노출 → Phase 5/8에서 컬럼 필터링 필요

---

## 9. Implementation Sub-phases

### Phase 4-A: DB + Storage + Server Layer
**Effort: Small**

**Deliverables:**
1. Supabase migration: schema 보강 (deleted_at, 인덱스, UNIQUE, CHECK, FK)
2. Supabase migration: RLS 정책
3. Storage 버킷 보강 (크기/타입 제한, 정책 수정)
4. `app/types/content.ts` - TypeScript 타입
5. `app/loaders/content.schema.ts` - Zod 스키마
6. `app/lib/content.server.ts` - loadContent(), handleContentAction()
7. `app/loaders/upload.server.ts` + `app/routes/api.upload.ts` - Signed URL

**Dependencies:** None

### Phase 4-B: Tiptap Editor + Image Upload
**Effort: Medium**

**Deliverables:**
1. Tiptap 패키지 설치
2. `content-editor.tsx` - Tiptap 에디터 + 이미지 D&D
3. `content-editor-toolbar.tsx` - 서식 툴바
4. `content-section.tsx` - 메인 래퍼 (에디터만, 첨부/댓글 미포함)
5. 이미지 업로드 연동 (signed URL → public URL 삽입)

**Dependencies:** Phase 4-A

### Phase 4-C: File Attachments + Comments
**Effort: Medium**

**Deliverables:**
1. `content-attachments.tsx` - 업로드/목록/다운로드/삭제
2. `content-comments.tsx` - 추가/목록/수정/삭제
3. ContentSection에 첨부+댓글 섹션 통합
4. Signed URL 다운로드 (private 첨부파일)

**Dependencies:** Phase 4-A, 4-B

### Phase 4-D: PO/PI Detail 통합
**Effort: Small**

**Deliverables:**
1. `po.$id.server.ts` - loadContent() + content action intents 추가
2. `_layout.po.$id.tsx` - `<ContentSection>` 컴포넌트 추가
3. `pi.$id.server.ts` - 동일
4. `_layout.pi.$id.tsx` - 동일
5. E2E 플로우 테스트

**Dependencies:** Phase 4-B, 4-C

---

## 10. Resolved Decisions

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | 1:1 vs 1:N contents | **1:1** (UNIQUE 제약) | 비즈니스 현실, 단순 UX |
| 2 | Lazy vs Eager creation | **Lazy** (첫 저장 시 upsert) | 빈 레코드 방지 |
| 3 | HTML vs JSON 저장 | **Tiptap JSON** (JSONB) | 네이티브 포맷, 변환 불필요 |
| 4 | 자동/수동 저장 | **수동 저장** (저장 버튼) | 명확한 UX 흐름 |
| 5 | 댓글 구조 | **Flat** (스레드 없음) | 내부 2-3명, 스레딩 과잉 |
| 6 | 이미지 버킷 | **Public** (content-images) | 인라인 URL 필요, UUID 경로 |
| 7 | 업로드 방식 | **Signed Upload URL** | CF Workers 메모리 절약 |
| 8 | 콘텐츠 라우트 | **임베딩** (상세 페이지 내) | 기존 패턴, 자연스러운 UX |
| 9 | 문서 삭제 시 콘텐츠 | **Cascade 안 함** | 비가시, 복원 보존 |
| 10 | Tiptap Pro 확장 | **사용 안 함** | ProseMirror editorProps로 직접 구현 |
| 11 | `title` 컬럼 | **제거 (1:1에서 불필요)** | 컨텍스트는 부모 문서 |
| 12 | `updated_by` 컬럼 | **보류** | 다른 테이블도 미사용, 일관성 |
| 13 | 고아 이미지 정리 | **무시 (MVP)** | 소규모 B2B, 비용 영향 미미 |

---

## 11. Open Questions

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | 에디터 항상 표시 vs 접이식 | Always / Collapsible | Collapsible (시각적 노이즈 감소) |
| 2 | 최대 인라인 이미지 수 | Unlimited / 10 / 20 | 10개 (5MB x 10 = 50MB 방지) |
| 3 | 댓글 사용자명 표시 | UUID / Name | Name (user_profiles JOIN) |
| 4 | 생성 페이지에 콘텐츠 | Yes / No | No (기존 문서의 작업 노트용) |
| 5 | Tiptap JSON 서버 deep-validate | Yes / No | No (string length만, Tiptap 출력 신뢰) |

---

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Tiptap 번들 크기 (~200KB gzip) | 초기 로딩 | Lazy load (dynamic import) |
| Storage 비용 증가 | 운영비 | 5MB/20MB 제한, 10 이미지 캡 |
| CF Workers 메모리 (파일 업로드) | OOM | Signed URL 직접 업로드 (서버 우회) |
| Tiptap SSR 호환성 | 하이드레이션 불일치 | `immediatelyRender: false`, client-only |
| 동시 편집 충돌 | 데이터 손실 | Last-write-wins (2-3명, 허용) |
| XSS via Tiptap content | 보안 | EditorContent read-only, src/href 검증 |
| Public 버킷 이미지 노출 | 기밀 | UUID 경로, GV-only 업로드 |

---

## 13. Researcher Findings Summary

### Tiptap
- `@tiptap/react` v2.x: `useEditor` hook, `EditorContent` 컴포넌트
- `immediatelyRender: false` SSR 호환 필수
- StarterKit: Bold, Italic, Strike, Code, Headings, Lists, History 포함
- Image extension: `@tiptap/extension-image` (인라인 이미지)
- File handler: `@tiptap-pro/extension-file-handler`는 **유료** → `editorProps.handleDrop`/`handlePaste` 직접 구현
- 무료 대안: 커뮤니티 예제로 D&D 구현 충분

### Supabase Storage
- `createSignedUploadUrl()`: 클라이언트 직접 업로드용 서명 URL
- `createSignedUrl()`: 다운로드용 서명 URL (만료 시간 설정)
- `getPublicUrl()`: public 버킷 직접 URL
- 버킷 레벨 `file_size_limit`, `allowed_mime_types` 설정 가능

### Alternative Editors (참고용)
- **Lexical (Meta)**: 무료, 확장성 좋으나 이미지 D&D 직접 구현 필요
- **BlockNote**: Tiptap 기반 고수준 API, Notion 유사 UX
- **Novel**: Tiptap 기반, 가볍고 Notion 유사

**결론:** Tiptap이 가장 성숙하고 React 통합 우수. Pro 확장 없이도 충분히 구현 가능.

---

## 14. File Structure Summary

### New Files (Phase 4 전체)
```
app/types/content.ts                            # Types
app/lib/content.server.ts                       # Shared server utilities
app/loaders/content.schema.ts                   # Zod schemas
app/loaders/upload.server.ts                    # Signed URL action
app/routes/api.upload.ts                        # Resource route
app/components/content/content-section.tsx       # Main wrapper Card
app/components/content/content-editor.tsx        # Tiptap editor
app/components/content/content-editor-toolbar.tsx # Toolbar
app/components/content/content-attachments.tsx   # File attachments
app/components/content/content-comments.tsx      # Comment thread
```

### Modified Files
```
app/loaders/po.$id.server.ts    # +loadContent, +content intents
app/loaders/pi.$id.server.ts    # +loadContent, +content intents
app/routes/_layout.po.$id.tsx   # +ContentSection
app/routes/_layout.pi.$id.tsx   # +ContentSection
package.json                     # +@tiptap/* packages
```

### No New Routes (routes.ts 변경 없음)
콘텐츠 시스템은 기존 상세 페이지 라우트 내에서 동작. `api.upload`만 resource route로 추가.

---

## 15. Detailed Notes by Team Member

각 팀원별 상세 분석은 아래 파일 참조:
- [Architect Notes](../brainstorm/phase4/architect.md) - 시스템 아키텍처, 데이터 흐름, 통합 패턴
- [Frontend Dev Notes](../brainstorm/phase4/frontend.md) - Tiptap 컴포넌트, UI/UX, 반응형, 와이어프레임
- [Backend Dev Notes](../brainstorm/phase4/backend.md) - Migration, Storage, Loader/Action, 쿼리 패턴
- [Security Review Notes](../brainstorm/phase4/security.md) - 보안 감사, 체크리스트, 라이브 DB 감사 결과
