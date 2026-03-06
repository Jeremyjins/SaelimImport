# Phase 4: Contents System — 구현 검증 분석 보고서

**Date:** 2026-03-06
**Scope:** Phase 4-A/4-B/4-C/4-D 전체 구현 완료 여부 + 코드 품질/보안/성능 검증
**Method:** 5-agent 병렬 분석 (Architect, Frontend/Code Reviewer, Backend Dev, Security Reviewer, Perf Analyzer)

---

## 1. Phase 4-D 완료 검증 — 결론: 실질적 완료 (95%)

Phase 4-D(PO/PI Detail ContentSection 통합)는 **4-B와 4-C에서 이미 구현됨**. 별도 Phase 불필요.

| # | 4-D 요구사항 | 구현 Phase | 코드 증거 |
|---|-------------|-----------|----------|
| 1 | `po.$id.server.ts` — loadContent + content intents | 4-B (Task B6) | `po.$id.server.ts:8,28-50,143-153` |
| 2 | `_layout.po.$id.tsx` — ContentSection 추가 | 4-B/C (Task B7) | `_layout.po.$id.tsx:40,217-222` |
| 3 | `pi.$id.server.ts` — loadContent + content intents | 4-B (Task B6) | `pi.$id.server.ts:8,28-44,139-149` |
| 4 | `_layout.pi.$id.tsx` — ContentSection 추가 | 4-B/C (Task B7) | `_layout.pi.$id.tsx:38,169-173` |
| 5 | E2E 플로우 테스트 | **미구현** | 브레인스토밍에서 Tester 명시적 제외 (Phase 10 QA 예정) |

### 브레인스토밍 파일 구조 vs 실제 구현

| 파일 (New) | 존재 | 비고 |
|---|---|---|
| `app/types/content.ts` | ✅ | ContentType, ContentItem, ContentAttachment, Comment |
| `app/lib/content.server.ts` | ✅ | loadContent, handleContentAction + 7개 핸들러 |
| `app/loaders/content.schema.ts` | ✅ | 6개 Zod 스키마 + uploadRequestSchema |
| `app/loaders/upload.server.ts` | ✅ | magic byte 함수 + signed URL 발급 |
| `app/routes/api.upload.ts` | ✅ | resource route re-export |
| `app/components/content/content-section.tsx` | ✅ | Collapsible Card 래퍼 |
| `app/components/content/content-editor.tsx` | ✅ | Tiptap + D&D/Paste 이미지 |
| `app/components/content/content-editor-toolbar.tsx` | ✅ | 서식 툴바 |
| `app/components/content/content-attachments.tsx` | ✅ | 파일 첨부 CRUD |
| `app/components/content/content-comments.tsx` | ✅ | 댓글 스레드 |

| 파일 (Modified) | 수정됨 | 비고 |
|---|---|---|
| `app/loaders/po.$id.server.ts` | ✅ | loadContent + content intents |
| `app/loaders/pi.$id.server.ts` | ✅ | 동일 |
| `app/routes/_layout.po.$id.tsx` | ✅ | ContentSection 렌더링 |
| `app/routes/_layout.pi.$id.tsx` | ✅ | 동일 |
| `package.json` | ✅ | @tiptap/* 6개 패키지 |
| `app/routes.ts` | ✅ | api/upload 등록 |

### Architecture Decisions 반영 확인 (13/13)

| # | 결정 | 반영 |
|---|------|------|
| 1 | 1:1 UNIQUE 제약 | ✅ upsert `onConflict: "type,parent_id"` |
| 2 | Lazy Upsert | ✅ `ensureContentExists` 헬퍼 |
| 3 | Tiptap JSON (JSONB) 저장 | ✅ `JSON.parse` → JSONB |
| 4 | 수동 저장 (버튼) | ✅ Save 버튼 + isDirty |
| 5 | Flat 댓글 | ✅ 단일 레벨 |
| 6 | Public 이미지 버킷 | ✅ `getPublicUrl()` |
| 7 | Signed Upload URL | ✅ Client→Supabase 직접 PUT |
| 8 | 상세 페이지 임베딩 | ✅ 별도 라우트 없음 |
| 9 | Cascade 안 함 | ✅ 삭제 시 content 유지 |
| 10 | Tiptap Pro 미사용 | ✅ ProseMirror editorProps 직접 구현 |
| 11 | title 컬럼 제거 | ✅ ContentItem에 title 없음 |
| 12 | updated_by 보류 | ✅ 관련 필드 없음 |
| 13 | 고아 이미지 무시 (MVP) | ✅ 정리 로직 없음 |

### Action Intent Map 완전 구현 (8/8)

| Intent | 구현 | Zod 검증 |
|--------|------|----------|
| `content_save` | ✅ handleContentSave | contentSaveSchema |
| `content_delete` | ✅ handleContentDelete | contentDeleteSchema |
| `content_add_comment` | ✅ handleCommentCreate | commentCreateSchema |
| `content_update_comment` | ✅ handleCommentUpdate | commentUpdateSchema |
| `content_delete_comment` | ✅ handleCommentDelete | commentDeleteSchema |
| `content_save_attachment` | ✅ handleAttachmentSave | attachmentSaveSchema |
| `content_delete_attachment` | ✅ handleAttachmentDelete | attachmentDeleteSchema |
| POST `api.upload` | ✅ upload.server.ts | uploadRequestSchema |

---

## 2. 발견된 이슈 — 우선순위별 정리

### 🔴 BUG — 즉시 수정 필요

#### BUG-1: 첨부파일 Signed URL 생성 및 Storage 삭제 미작동
**파일:** `app/lib/content.server.ts:67,474`
**심각도:** High (첨부파일 다운로드/삭제 기능 장애)

`upload.server.ts:106`에서 생성하는 `file_url` 형식은 `{documentType}/{parentId}/{timestamp}_{uuid}.{ext}` (예: `po/abc-123/1709..._.pdf`).

그러나 `content.server.ts:67`에서 `att.file_url.startsWith("attachments/")`로 비교하므로 **절대 매칭되지 않음**:
- Signed URL 미생성 → private 버킷 파일 다운로드 불가능
- Storage 삭제 미실행 → `content-images/` 접두사도 동일하게 매칭 실패

```
// 저장되는 file_url: "po/abc-123/1709..._uuid.pdf"
// 비교 조건: att.file_url.startsWith("attachments/")  → false
// 비교 조건: fileUrl.startsWith("content-images/")     → false
```

**수정 방향:** content_attachments는 항상 `attachments` 버킷이므로, `startsWith` 분기 제거하고 하드코딩:
```typescript
// loadContent: 모든 첨부파일에 signed URL 생성
const { data: signed } = await supabase.storage
  .from("attachments")
  .createSignedUrl(att.file_url, 3600);

// handleAttachmentDelete: 항상 attachments 버킷에서 삭제
await supabase.storage.from("attachments").remove([fileUrl]);
```

---

### 🟡 SECURITY — 보안 개선 필요

#### SEC-1: `file_url` 필드 입력 검증 부재
**파일:** `app/loaders/content.schema.ts:43`
**심각도:** Medium

`attachmentSaveSchema.file_url`이 `z.string().min(1)`만 검증. 악의적 사용자가 임의 경로(다른 사용자 파일, 외부 URL)를 DB에 저장 가능. 첨부 삭제 시 타인 파일 삭제 가능성.

**수정 방향:** 경로 패턴 정규식 검증:
```typescript
file_url: z.string().regex(
  /^[a-z]+\/[0-9a-f-]+\/\d+_[0-9a-f-]+\.\w{2,5}$/,
  "유효하지 않은 파일 경로"
),
```

#### SEC-2: Tiptap JSON body 내 image src URL 미검증
**파일:** `app/lib/content.server.ts:177-221`
**심각도:** Low-Medium

저장 시 JSON 내 image 노드의 `src` 속성을 검증하지 않음. 외부 추적 픽셀 삽입 가능. XSS는 아니지만 정보 유출 벡터.

**수정 방향:** JSON traverse 후 `src`가 자체 Supabase Storage URL(`*.supabase.co/storage/`)로 시작하는지 검증.

#### SEC-3: 댓글/첨부 삭제에 소유자 검증 없음
**파일:** `content.server.ts:343-371` (댓글), `content.server.ts:430-481` (첨부)
**심각도:** Low (GV-only 내부 사용자 간 문제)

`handleCommentUpdate`에는 `.eq("created_by", userId)` 있으나 Delete에는 없음. 일관성 부재.

**수정 방향:** 의도적이면 주석 명시, 아니면 `.eq("created_by", userId)` 추가.

#### SEC-4: `detectMimeFromMagicBytes` 데드 코드
**파일:** `upload.server.ts:20-41`
**심각도:** Info

정의되었으나 미호출. Signed URL 방식에서 서버가 파일 바이트를 볼 수 없어 구조적으로 사용 불가. Supabase 버킷 `allowed_mime_types`가 마지막 방어선.

**수정 방향:** 데드 코드 제거 또는 TODO 주석으로 전환. 버킷 `allowed_mime_types` 설정 반드시 확인.

#### SEC-5: 확장자 검증 미흡
**파일:** `upload.server.ts:105`
**심각도:** Low

`ext = fileName.split(".").pop()` — `.html`, `.js`, `.php` 등 비안전 확장자 허용. MIME allowlist과 불일치 가능.

**수정 방향:** MIME→확장자 안전 맵 사용:
```typescript
const EXT_MAP: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", ... };
const ext = EXT_MAP[contentType] ?? "bin";
```

---

### 🟡 CODE QUALITY — 코드 품질 개선

#### CQ-1: 렌더 body에서 `toast.error()` 호출
**파일:** `content-section.tsx:63-70`
**심각도:** Medium

React StrictMode/Concurrent에서 토스트 중복 발생 가능. `useEffect`로 이동 필요.

```typescript
// 수정 방향
const prevStateRef = useRef(fetcher.state);
useEffect(() => {
  if (prevStateRef.current !== "idle" && fetcher.state === "idle" && fetcher.data) {
    const result = fetcher.data as { error?: string };
    if (result?.error) toast.error(result.error);
  }
  prevStateRef.current = fetcher.state;
}, [fetcher.state, fetcher.data]);
```

#### CQ-2: `fetcher.data._action` 조건 미작동
**파일:** `content-section.tsx:126-131`
**심각도:** Medium

`fetcher.data`는 서버 반환값이므로 `_action` 필드 없음. 인라인 에러 메시지 표시 조건이 항상 false.

**수정 방향:** `fetcher.formData?.get("_action")` 또는 단순히 `fetcher.data?.error` 유무로 판단.

#### CQ-3: Tailwind 클래스 충돌
**파일:** `content-comments.tsx:157`
**심각도:** Low

`opacity-0`과 `opacity-100`이 같은 줄에 공존. 모바일 항상 표시 의도면 기본 `opacity-0` 제거하고 `md:opacity-0`만 유지.

#### CQ-4: `TooltipProvider` 반복 마운트 (12개 인스턴스)
**파일:** `content-editor-toolbar.tsx:60`
**심각도:** Low

각 `ToolbarButton` 안에 `TooltipProvider`. 툴바 최상위 1개로 이동 권장.

#### CQ-5: 미사용 import `Underline`
**파일:** `content-editor-toolbar.tsx:12`
**심각도:** Info — 삭제 필요.

#### CQ-6: `@tiptap/extension-link` 미적용
**파일:** `package.json` + `content-editor.tsx`
**심각도:** Info

설치되었으나 에디터에 등록되지 않음. 링크 기능 비활성. 사용 예정이면 추가, 아니면 패키지 제거.

#### CQ-7: `lucide-react` 직접 import
**파일:** `content-section.tsx:12`, `content-attachments.tsx:5-15`, `content-comments.tsx:4`, `content-editor-toolbar.tsx:9-23`
**심각도:** Info

프로젝트 패턴은 `~/components/ui/icons.tsx`를 통한 re-export. Content 아이콘을 `icons.tsx`에 추가하거나 예외로 문서화 필요.

---

### 🟢 PERFORMANCE — 성능 최적화 기회

#### PERF-1: Tiptap Dynamic Import 미적용
**파일:** `content-section.tsx:13`
**Impact:** High — 초기 번들 ~180-250KB 절감 가능
**Effort:** Low

```typescript
// 현재
import { ContentEditor } from "./content-editor";
// 개선
const ContentEditor = React.lazy(() => import("./content-editor"));
// + <Suspense fallback={...}> 래핑
```

#### PERF-2: Signed URL N+1 호출
**파일:** `content.server.ts:64-75`
**Impact:** Medium — 첨부 5개 기준 ~400-700ms 절감
**Effort:** Low

```typescript
// 현재: N번 개별 호출
Promise.all(attachments.map(att => createSignedUrl(att.file_url, 3600)))
// 개선: 1회 배치 호출
supabase.storage.from("attachments").createSignedUrls(paths, 3600)
```

#### PERF-3: `verifyParentExists` 추가 쿼리
**파일:** `content.server.ts:191`
**Impact:** Low — 저장마다 ~80-150ms 절감
**Effort:** Low

FK 제약으로 이미 보호됨. 에러 핸들링으로 대체 가능.

#### PERF-4: Collapsible 닫힘 상태에서 에디터 마운트
**파일:** `content-section.tsx:111-120`
**Impact:** Low-Medium — 초기 로드 시 Tiptap 초기화 비용 제거
**Effort:** Low (단, 열릴 때마다 재초기화 트레이드오프)

---

## 3. 에이전트별 분석 요약

### Architect — 구조 정합성 ✅
- 4-D 5개 요구사항 중 4개 완전 구현 (E2E 테스트만 의도적 지연)
- 13개 Architecture Decision 전체 반영
- 8개 Action Intent 전체 구현
- 미세 갭: `ContentType`에 `delivery` 미포함 (Phase 8에서 추가), `@tiptap/extension-link` 미적용

### Frontend/Code Reviewer — UI 완전성 ✅ (품질 이슈 일부)
- 기능 체크리스트 전항목 PASS
- 프로젝트 패턴 대체로 준수 (lucide 직접 import 위반)
- P1 이슈 3건 (toast side-effect, fetcher.data._action, Tailwind 충돌)

### Backend Dev — 서버 로직 ✅ (버그 1건)
- 7개 Action Intent + Zod 검증 완전 구현
- **BUG-1 확인**: file_url 경로 접두사 불일치 → signed URL 미생성 + Storage 미삭제
- DB 스키마 구현 보고서 기준 전항목 완료 (Supabase MCP 미접근으로 직접 확인 불가)

### Security Reviewer — 보안 등급 B
- 핵심 보안 패턴 견고 (인증/인가, XSS 방지, SQL injection 방지)
- SVG 삼중 차단, UUID 경로, GV-only 접근 모두 확인
- Critical: file_url 미검증 (SEC-1), Supabase 버킷 설정 직접 확인 불가
- Warning: 삭제 권한 일관성, JSON body src 미검증

### Perf Analyzer — 최적화 기회 4건
- 이미 잘 된 것: Promise.all 병렬 로드, partial 인덱스, signed URL 패턴
- Critical 최적화: Tiptap lazy load (~200KB 절감)
- 배치 signed URL 처리 (N+1 → 1)

---

## 4. Supabase 직접 검증 과제

Supabase MCP 접근 권한 문제로 다음 항목은 직접 확인하지 못함:

| 항목 | 확인 방법 |
|------|-----------|
| RLS 활성화 (contents, content_attachments, comments) | `SELECT rowsecurity FROM pg_tables` |
| RLS 정책 상세 (gv_all 등) | `SELECT * FROM pg_policies` |
| Storage 버킷 `file_size_limit` / `allowed_mime_types` | `SELECT * FROM storage.buckets` |
| Storage 정책 (gv_upload_images, gv_delete_images) | `SELECT * FROM pg_policies WHERE schemaname='storage'` |
| UNIQUE 제약 / CHECK 제약 | `SELECT * FROM pg_constraint` |
| Partial 인덱스 | `SELECT * FROM pg_indexes` |

**권장:** Supabase Dashboard에서 수동 확인하거나, MCP 권한 설정 후 재검증.

---

## 5. 수정 우선순위 로드맵

### Phase 4-Fix-A: 즉시 수정 (기능 장애)
1. **BUG-1**: `content.server.ts` — 첨부파일 signed URL + Storage 삭제 경로 수정
2. **CQ-1**: `content-section.tsx` — toast.error()를 useEffect로 이동
3. **CQ-2**: `content-section.tsx` — fetcher.data._action 조건 수정

### Phase 4-Fix-B: 보안 강화
4. **SEC-1**: `content.schema.ts` — file_url 경로 패턴 검증
5. **SEC-4**: `upload.server.ts` — detectMimeFromMagicBytes 데드 코드 제거
6. **SEC-5**: `upload.server.ts` — MIME→확장자 안전 맵
7. Supabase 버킷 `allowed_mime_types` / `file_size_limit` 설정 확인

### Phase 4-Fix-C: 성능 최적화
8. **PERF-1**: ContentEditor lazy import
9. **PERF-2**: createSignedUrls 배치 호출

### Phase 4-Fix-D: 코드 정리 (선택)
10. **CQ-3~7**: Tailwind 충돌, TooltipProvider, 미사용 import, icons.tsx 패턴
11. **SEC-3**: 삭제 권한 일관성 (의도 문서화 또는 수정)
12. **SEC-2**: JSON body src URL 검증

---

## 6. 종합 판단

| 항목 | 점수 | 비고 |
|------|------|------|
| **기능 완전성** | 95% | 4-D 통합 완료, E2E 테스트만 미구현 (의도적) |
| **코드 품질** | B+ | 구조 우수, toast side-effect + 조건 미작동 등 수정 필요 |
| **보안** | B | 핵심 패턴 견고, file_url 검증 + 삭제 권한 개선 필요 |
| **성능** | B | 쿼리 패턴 양호, Tiptap lazy load + signed URL 배치 미적용 |
| **패턴 준수** | A- | 대부분 준수, lucide 직접 import만 위반 |

**결론: Phase 4는 실질적으로 완료.** BUG-1(첨부파일 경로 불일치)만 기능 장애를 유발하므로 즉시 수정이 필요하고, 나머지는 개선 수준의 이슈입니다.
