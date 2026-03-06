# Phase 4-A: DB + Storage + Server Layer 구현 계획

**Date:** 2026-03-06
**Status:** 구현 중
**Reference:** `.claude/docs/PROJECT_INIT_BRAINSTORMING_PHASE_4.md`

---

## DB 현황 분석 (구현 전 확인)

### 기존 존재하는 것 (이미 완료)
- `contents` 테이블: `id`, `type`, `parent_id`, `title`, `body` (JSONB), `created_by`, `created_at`, `updated_at`
- `content_attachments` 테이블: `id`, `content_id`, `file_url`, `file_name`, `file_size`, `created_at`
- `comments` 테이블: `id`, `content_id`, `body`, `created_by`, `created_at`, `updated_at`
- `contents_type_check` CHECK 제약 ✓
- `contents_created_by_fkey` FK ✓
- `comments_created_by_fkey` FK ✓
- `comments_content_id_fkey` FK (ON DELETE CASCADE) ✓
- `content_attachments_content_id_fkey` FK (ON DELETE CASCADE) ✓
- `gv_all` RLS 정책 (contents, content_attachments, comments) ✓
- `idx_contents_type_parent` 인덱스 (비-partial) ✓
- `idx_comments_content_id` 인덱스 (비-partial) ✓
- `content-images` 버킷 (public) ✓
- `attachments` 버킷 (private) ✓

### 누락 사항 (마이그레이션 필요)
- `deleted_at` 컬럼 — `contents`, `comments`, `content_attachments`
- `created_by` 컬럼 — `content_attachments`
- `mime_type` 컬럼 — `content_attachments` (파일 타입 아이콘/검증용)
- UNIQUE 제약 `(type, parent_id)` — `contents` (1:1 강제)
- FK `created_by → auth.users` — `content_attachments`
- Partial 인덱스 업그레이드 — `idx_contents_type_parent`, `idx_comments_content_id`
- 인덱스 추가 — `content_attachments.content_id`
- Storage `file_size_limit` / `allowed_mime_types` — 두 버킷 모두 NULL
- Storage 정책 수정 — `auth_upload_images` → GV-only
- Storage 정책 추가 — `gv_delete_images` (content-images 버킷)

---

## 에이전트 팀 구성

| 역할 | 담당 파일 |
|------|-----------|
| **Architect (Leader)** | 구현 계획 관리, 통합 |
| **Backend Dev** | `app/lib/content.server.ts`, `app/loaders/upload.server.ts` |
| **Security Reviewer** | Storage 정책, MIME 검증, Tiptap JSON 검증 로직 |

> Tester, Perf-analyzer, Code-reviewer, Frontend Dev — Phase 4-A는 순수 서버/DB 작업이므로 제외

---

## Task 목록

### Task A1: DB Migration — Schema 보강
- [x] `deleted_at` 추가: `contents`, `comments`, `content_attachments`
- [x] `created_by` 추가: `content_attachments`
- [x] `mime_type` 추가: `content_attachments`
- [x] UNIQUE 제약 추가: `contents(type, parent_id)`
- [x] FK 추가: `content_attachments.created_by → auth.users`
- [x] Partial 인덱스 업그레이드: `idx_contents_type_parent` (WHERE deleted_at IS NULL)
- [x] Partial 인덱스 업그레이드: `idx_comments_content_id` (WHERE deleted_at IS NULL)
- [x] 인덱스 추가: `idx_content_attachments_content_id`

### Task A2: Storage 보강
- [x] `content-images` 버킷: file_size_limit=5MB, allowed_mime_types=[jpeg,png,webp,gif]
- [x] `attachments` 버킷: file_size_limit=20MB, allowed_mime_types=[pdf,xlsx,xls,docx,csv,jpeg,png]
- [x] `auth_upload_images` 정책 삭제 → `gv_upload_images` 정책 생성 (GV-only)
- [x] `gv_delete_images` 정책 생성 (content-images DELETE)

### Task A3: TypeScript 타입
- [x] `app/types/content.ts` — ContentType, ContentItem, ContentAttachment, Comment

### Task A4: Zod 스키마
- [x] `app/loaders/content.schema.ts` — 모든 content action 스키마

### Task A5: 공유 서버 유틸리티
- [x] `app/lib/content.server.ts` — `loadContent()`, `handleContentAction()`

### Task A6: Upload 엔드포인트
- [x] `app/loaders/upload.server.ts` — Signed URL 발급 action
- [x] `app/routes/api.upload.ts` — Resource route
- [x] `app/routes.ts` — `api/upload` 라우트 추가

### Task A7: DB Types 업데이트
- [x] `app/types/database.ts` — 새 컬럼 반영 (deleted_at, created_by, mime_type)

---

## 파일 소유권 (File Ownership)

| 파일 | 담당 |
|------|------|
| DB Migration (Supabase MCP) | Backend Dev |
| `app/types/content.ts` | Backend Dev |
| `app/loaders/content.schema.ts` | Backend Dev |
| `app/lib/content.server.ts` | Backend Dev |
| `app/loaders/upload.server.ts` | Backend Dev + Security |
| `app/routes/api.upload.ts` | Backend Dev |
| `app/routes.ts` | Backend Dev |
| `app/types/database.ts` | Backend Dev |

---

## 구현 세부사항

### DB 컬럼 명 확정 (기존 DB 기준)
- `contents.type` (not `content_type`) — 기존 DB 유지
- `content_attachments.file_url` (not `storage_path`) — 기존 DB 유지
- Signed URL 업로드 방식 — CF Workers 메모리 절약

### Action Intents
| Intent | 설명 |
|--------|------|
| `content_save` | 콘텐츠 upsert (body JSONB) |
| `content_delete` | 콘텐츠 soft delete |
| `content_add_comment` | 댓글 생성 |
| `content_update_comment` | 댓글 수정 |
| `content_delete_comment` | 댓글 soft delete |
| `content_save_attachment` | 첨부파일 레코드 저장 |
| `content_delete_attachment` | 첨부파일 삭제 (레코드 + Storage) |

### Upload 흐름 (Signed URL)
```
1. Client: POST /api/upload { bucket, fileName, contentType, documentType, parentId }
2. Server: requireGVUser → createSignedUploadUrl(filePath)
3. Server: return { signedUrl, path, publicUrl? }
4. Client: PUT signedUrl (raw file bytes)
5. Client: content_save_attachment intent (attachments 버킷) 또는 Tiptap 이미지 URL 삽입
```

---

## 구현 완료 내용

### Migration: `phase4a_content_schema_augmentation`
- deleted_at 컬럼 추가 (contents, comments, content_attachments)
- created_by, mime_type 컬럼 추가 (content_attachments)
- UNIQUE 제약 (type, parent_id) on contents
- FK contents_attachments_created_by_fkey
- Partial 인덱스 업그레이드
- idx_content_attachments_content_id 추가

### Migration: `phase4a_storage_security`
- content-images 버킷: 5MB 제한, JPEG/PNG/WebP/GIF 허용
- attachments 버킷: 20MB 제한, PDF/Excel/CSV/Image 허용
- auth_upload_images 정책 삭제 → gv_upload_images (GV-only)
- gv_delete_images 정책 추가

### 신규 파일
- `app/types/content.ts` — ContentType, ContentItem, ContentAttachment, Comment 타입
- `app/loaders/content.schema.ts` — Zod 스키마
- `app/lib/content.server.ts` — loadContent(), handleContentAction()
- `app/loaders/upload.server.ts` — Signed URL 발급
- `app/routes/api.upload.ts` — Resource route

### 수정 파일
- `app/routes.ts` — api/upload 라우트 추가
- `app/types/database.ts` — 새 컬럼 반영
