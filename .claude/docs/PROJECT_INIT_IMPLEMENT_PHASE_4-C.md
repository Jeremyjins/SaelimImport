# Phase 4-C: File Attachments + Comments - Implementation Plan

**Date:** 2026-03-06
**Status:** Complete
**Depends on:** Phase 4-A (server layer), Phase 4-B (Tiptap editor)

---

## Overview

Phase 4-C는 ContentSection에 **파일 첨부** 및 **댓글** UI를 추가한다.
서버 로직(handleContentAction, loadContent)은 Phase 4-A에서 이미 완성됨.

---

## Agent Team

| Role | Scope |
|------|-------|
| **Architect** | 설계 결정, 컴포넌트 인터페이스 |
| **Frontend Dev** | content-attachments.tsx, content-comments.tsx, content-section.tsx 업데이트 |
| **Backend Dev** | schema 수정, loader userId 추가 |

*(Tester, Perf-analyzer, Code-reviewer: Phase 4-C는 UI-heavy, 현 단계 불필요)*

---

## File Ownership (충돌 방지)

| File | Owner | Change |
|------|-------|--------|
| `app/loaders/content.schema.ts` | Backend Dev | commentCreateSchema content_id 제거 |
| `app/lib/content.server.ts` | Backend Dev | handleCommentCreate 스키마 적용 수정 |
| `app/loaders/po.$id.server.ts` | Backend Dev | loader에 userId 추가 |
| `app/loaders/pi.$id.server.ts` | Backend Dev | loader에 userId 추가 |
| `app/components/content/content-attachments.tsx` | Frontend Dev | NEW |
| `app/components/content/content-comments.tsx` | Frontend Dev | NEW |
| `app/components/content/content-section.tsx` | Frontend Dev | 첨부+댓글 섹션 통합 |
| `app/routes/_layout.po.$id.tsx` | Frontend Dev | userId prop 전달 |
| `app/routes/_layout.pi.$id.tsx` | Frontend Dev | userId prop 전달 |

---

## Architecture Decisions

### commentCreateSchema 수정
- `content_id` 필드 제거: 서버가 `ensureContentExists(type, parentId)` 기반으로 처리
- 클라이언트에서 content_id를 몰라도 댓글 작성 가능

### userId 전달 경로
```
loader (requireGVUser → user.id)
  → route loaderData (userId 추가)
    → ContentSection prop (currentUserId)
      → ContentComments prop (currentUserId)
```

### 파일 업로드 UX Flow
```
[파일 추가] 클릭
  → file input → 파일 선택
  → POST /api/upload (attachments bucket) → signedUrl + path 반환
  → PUT signedUrl (실제 파일 바이트)
  → fetcher.submit(_action=content_save_attachment, file_url=path, ...)
  → loader revalidation → 첨부 목록 갱신
```

### 댓글 표시
- `created_by === currentUserId` → "나" 표시 + 수정 가능
- 그 외 → "팀원" 표시 (소규모 내부팀 2-3명, 이름 표시 불필요)
- 삭제: 모든 댓글 삭제 가능 (서버 RLS는 GV-only)
- 수정: 본인 댓글만 (서버에서 `created_by` 조건)

---

## Task List

### [x] TASK-1: commentCreateSchema 수정
**File:** `app/loaders/content.schema.ts`
- [x] content_id 필드 제거 → body만 남김

### [x] TASK-2: handleCommentCreate 서버 수정
**File:** `app/lib/content.server.ts`
- [x] commentCreateSchema에서 content_id 제거 대응 (이미 ensureContentExists 사용 중이므로 실질적 변경 없음)

### [x] TASK-3: loader에 userId 추가
**Files:** `app/loaders/po.$id.server.ts`, `app/loaders/pi.$id.server.ts`
- [x] po detail loader: `userId: user.id` 반환 추가
- [x] pi detail loader: `userId: user.id` 반환 추가

### [x] TASK-4: content-attachments.tsx 구현
**File:** `app/components/content/content-attachments.tsx` (NEW)
- [x] 파일 목록 (type icon, name, size, download, delete)
- [x] 업로드 버튼 → file input → signed URL 업로드 → DB 저장
- [x] 파일 크기 포맷터 (B/KB/MB)
- [x] 파일 타입별 아이콘 (PDF/Excel/Image/Generic)
- [x] 업로드 중 로딩 상태

### [x] TASK-5: content-comments.tsx 구현
**File:** `app/components/content/content-comments.tsx` (NEW)
- [x] 댓글 목록 (avatar, 작성자, 날짜, 본문)
- [x] 본인 댓글 수정 (inline textarea edit)
- [x] 댓글 삭제 버튼
- [x] 댓글 작성 폼 (textarea + 댓글 작성 버튼)
- [x] Cmd+Enter 단축키

### [x] TASK-6: content-section.tsx 업데이트
**File:** `app/components/content/content-section.tsx`
- [x] ContentAttachments 섹션 추가 (에디터 아래)
- [x] ContentComments 섹션 추가 (첨부 아래)
- [x] currentUserId prop 추가
- [x] 헤더 배지: 첨부 수 + 댓글 수 표시

### [x] TASK-7: PO/PI 상세 route 업데이트
**Files:** `app/routes/_layout.po.$id.tsx`, `app/routes/_layout.pi.$id.tsx`
- [x] useLoaderData에서 userId 추출
- [x] ContentSection에 currentUserId prop 전달

### [x] TASK-8: Pencil 디자인 드래프트
- [x] saelim.pen에 Phase 4-C frame 추가 (첨부파일+댓글 섹션)

---

## Implemented Components

### ContentAttachments
```typescript
interface ContentAttachmentsProps {
  attachments: ContentAttachment[];
  contentType: ContentType;
  parentId: string;
  className?: string;
}
```

### ContentComments
```typescript
interface ContentCommentsProps {
  comments: Comment[];
  currentUserId: string;
  className?: string;
}
```

### ContentSection (updated)
```typescript
interface ContentSectionProps {
  content: ContentItem | null;
  contentType: ContentType;
  parentId: string;
  currentUserId: string;  // NEW
  className?: string;
}
```

---

## Implementation Notes

- `content_id` 스키마 제거로 클라이언트 단순화
- 업로드 중 상태는 로컬 state로 추적 (Set<tempId>)
- 첨부 삭제는 browser confirm() 사용 (AlertDialog 불필요 - 작은 액션)
- hover에 수정/삭제 버튼 표시 (opacity transition)
- 댓글 Cmd+Enter 지원
- 모바일: 터치에서 hover 불가 → 항상 버튼 표시
