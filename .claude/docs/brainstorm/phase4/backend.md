# Phase 4: Contents System - Backend Dev Notes

**Date:** 2026-03-06
**Role:** Backend Dev

---

## 1. DB 현황 분석

### 이미 존재하는 테이블 (database.ts 기준)

`contents`, `content_attachments`, `comments` 테이블이 이미 DB에 존재하며 `database.ts` 타입에 반영되어 있다.

**contents 테이블 (현재 상태):**
```sql
contents (
  id UUID PRIMARY KEY,
  type TEXT NOT NULL,         -- 'po', 'pi', 'shipping', 'order', 'customs'
  parent_id UUID NOT NULL,
  title TEXT,
  body JSONB,                 -- Tiptap JSON
  created_by UUID,            -- FK to auth.users (없음 - 현재 Relationships: [])
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
```

**content_attachments 테이블 (현재 상태):**
```sql
content_attachments (
  id UUID PRIMARY KEY,
  content_id UUID,            -- FK to contents(id)
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INT,
  created_at TIMESTAMPTZ
)
```

**comments 테이블 (현재 상태):**
```sql
comments (
  id UUID PRIMARY KEY,
  content_id UUID,            -- FK to contents(id)
  body TEXT NOT NULL,
  created_by UUID,            -- FK 없음 (현재)
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
```

### 누락 사항 (마이그레이션 필요)

1. **`deleted_at` 컬럼 없음** -- 전체 프로젝트가 soft delete 패턴 사용 중
2. **`updated_by` 컬럼 없음** -- 수정자 추적 필요 시
3. **인덱스 없음** -- type + parent_id 복합 인덱스 필수
4. **RLS 정책 확인 필요** -- 현재 상태 불명
5. **contents.created_by FK 없음** -- Relationships가 빈 배열
6. **content_attachments에 `created_by` 없음** -- 누가 업로드했는지 추적 불가
7. **Storage 버킷 존재 여부 불명** -- 확인 필요

---

## 2. 마이그레이션 계획

### Migration: `add_contents_indexes_and_columns`

```sql
-- 1. deleted_at 추가 (soft delete 패턴 통일)
ALTER TABLE contents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
-- content_attachments는 contents CASCADE 삭제로 충분, 별도 soft delete 불필요

-- 2. updated_by 추가 (선택적 - 우선순위 낮음)
-- ALTER TABLE contents ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);

-- 3. content_attachments에 created_by 추가
ALTER TABLE content_attachments ADD COLUMN IF NOT EXISTS created_by UUID;

-- 4. 핵심 인덱스
CREATE INDEX IF NOT EXISTS idx_contents_type_parent
  ON contents(type, parent_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_contents_parent_id
  ON contents(parent_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_contents_created_at
  ON contents(created_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_comments_content_id
  ON comments(content_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_comments_created_at
  ON comments(created_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_content_attachments_content_id
  ON content_attachments(content_id);

-- 5. FK 보강 (created_by -> auth.users)
-- contents.created_by가 FK 없이 존재 - 추가
-- 주의: 기존 데이터가 있으면 실패할 수 있으므로 NOT VALID 사용
ALTER TABLE contents
  ADD CONSTRAINT contents_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id)
  NOT VALID;

ALTER TABLE comments
  ADD CONSTRAINT comments_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id)
  NOT VALID;
```

### Migration: `contents_rls_policies`

```sql
-- RLS 활성화
ALTER TABLE contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- contents 정책
-- GV 사용자: 모든 CRUD
CREATE POLICY "gv_contents_all" ON contents
  FOR ALL
  TO authenticated
  USING (get_user_org_type() = 'gv')
  WITH CHECK (get_user_org_type() = 'gv');

-- Saelim 사용자: delivery 관련 content만 읽기 (향후 필요 시)
-- 현재는 GV-only로 시작, 추후 확장
-- CREATE POLICY "saelim_contents_select" ON contents
--   FOR SELECT
--   TO authenticated
--   USING (
--     get_user_org_type() = 'saelim'
--     AND type = 'delivery'
--   );

-- content_attachments 정책
CREATE POLICY "gv_content_attachments_all" ON content_attachments
  FOR ALL
  TO authenticated
  USING (get_user_org_type() = 'gv')
  WITH CHECK (get_user_org_type() = 'gv');

-- comments 정책
CREATE POLICY "gv_comments_all" ON comments
  FOR ALL
  TO authenticated
  USING (get_user_org_type() = 'gv')
  WITH CHECK (get_user_org_type() = 'gv');
```

**참고:** `get_user_org_type()` RPC 함수가 이미 존재한다 (database.ts에서 확인). 기존 RLS 정책 패턴과 동일하게 사용한다.

### updated_by 컬럼에 대한 판단

**추천: 보류.** 현재 프로젝트의 다른 테이블(purchase_orders, proforma_invoices)도 `updated_by`를 사용하지 않는다. 일관성을 위해 Phase 4에서도 생략하고, 감사 로그가 필요해지면 전체 테이블에 일괄 추가한다.

---

## 3. Storage 설정

### 버킷 생성 SQL

```sql
-- content-images: 인라인 이미지 (public 접근)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'content-images',
  'content-images',
  true,
  5242880,  -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
);

-- attachments: 첨부파일 (private, RLS)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attachments',
  'attachments',
  false,
  20971520,  -- 20MB
  NULL       -- 모든 타입 허용
);
```

### Storage RLS 정책

```sql
-- content-images (public bucket)
-- 업로드: GV 인증 사용자만
CREATE POLICY "gv_upload_content_images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'content-images'
    AND (SELECT get_user_org_type()) = 'gv'
  );

-- 읽기: public bucket이므로 자동 공개
-- 삭제: 업로드한 사용자 또는 GV 사용자
CREATE POLICY "gv_delete_content_images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'content-images'
    AND (SELECT get_user_org_type()) = 'gv'
  );

-- attachments (private bucket)
-- 업로드
CREATE POLICY "gv_upload_attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'attachments'
    AND (SELECT get_user_org_type()) = 'gv'
  );

-- 다운로드: GV 사용자
CREATE POLICY "gv_download_attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'attachments'
    AND (SELECT get_user_org_type()) = 'gv'
  );

-- 삭제: GV 사용자
CREATE POLICY "gv_delete_attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'attachments'
    AND (SELECT get_user_org_type()) = 'gv'
  );
```

### 파일 경로 규칙

```
content-images/{type}/{parent_id}/{timestamp}_{filename}
attachments/{type}/{parent_id}/{timestamp}_{filename}
```

예시:
```
content-images/po/550e8400-e29b-41d4-a716-446655440000/1709712000000_diagram.png
attachments/pi/660e8400-e29b-41d4-a716-446655440000/1709712000000_contract.pdf
```

이유:
- `{type}/{parent_id}` 접두사로 소속 문서 식별 가능
- 부모 문서 삭제 시 해당 경로 하위 파일 일괄 정리 가능
- 타임스탬프로 동명 파일 충돌 방지

### Signed URL 전략

**Private 파일 (attachments 버킷):**
```typescript
// 서버에서 signed URL 생성 (1시간 유효)
const { data: signedUrl } = await supabase.storage
  .from("attachments")
  .createSignedUrl(filePath, 3600);
```

- content loader에서 attachment 목록 반환 시 signed URL 포함
- 클라이언트는 signed URL로 직접 다운로드
- 1시간 TTL -- 페이지 새로고침으로 갱신

**Public 파일 (content-images 버킷):**
```typescript
// public URL 사용 (signed URL 불필요)
const { data: publicUrl } = supabase.storage
  .from("content-images")
  .getPublicUrl(filePath);
```

---

## 4. 파일 업로드 전략

### 옵션 분석

| 옵션 | 설명 | 장점 | 단점 |
|------|------|------|------|
| A. Client Direct | 클라이언트에서 직접 Supabase Storage 업로드 | 서버 부하 없음, 대용량 OK | 클라이언트 Supabase 인스턴스 필요 |
| B. Server FormData | 서버 action으로 FormData + File 전송 | 단순, 검증 용이 | CF Workers 메모리 제한 (128MB), 큰 파일 부담 |
| C. Signed Upload URL | 서버에서 signed URL 발급, 클라이언트가 직접 업로드 | 서버 부하 없음, 인증 서버에서 처리 | 2-step 통신 |

### 추천: Option C (Signed Upload URL)

**근거:**
1. **Cloudflare Workers 메모리 제한**: Workers는 128MB 메모리 제한이 있다. 20MB 파일을 FormData로 파싱하면 메모리 부담이 크다.
2. **서버 무상태**: 서버는 URL만 발급하고, 실제 바이트 전송은 클라이언트-Supabase 직접 통신.
3. **보안 유지**: signed URL 발급 시 서버에서 인증/권한 검증 완료.
4. **이미 SSR 서버가 있음**: Option A처럼 별도 클라이언트 Supabase를 만들 필요 없이, 서버 action으로 signed URL 받아서 사용.

### 구현 흐름

```
1. 클라이언트: POST /api/upload (or fetcher action)
   body: { bucket, filePath, contentType }
2. 서버: requireGVUser() -> supabase.storage.from(bucket).createSignedUploadUrl(path)
   response: { signedUrl, token, path }
3. 클라이언트: PUT signedUrl (raw file body, Content-Type header)
4. 클라이언트: 업로드 완료 -> content 저장 시 file_url 포함
```

**인라인 이미지 (Tiptap)의 경우:**
- content-images 버킷은 public이므로, 업로드 후 바로 `getPublicUrl(path)` 사용
- Tiptap 에디터에 이미지 URL 삽입

**첨부파일의 경우:**
- attachments 버킷은 private이므로, content_attachments 테이블에 레코드 저장
- 조회 시 서버에서 signed URL 생성하여 반환

### Option B 폴백 (소규모 파일)

인라인 이미지는 대부분 5MB 이하이므로, Option B (server FormData)도 가능하다. 복잡도를 줄이고 싶다면 이미지만 Option B로, 대용량 첨부파일만 Option C로 분리하는 하이브리드도 고려할 수 있다. 다만 일관성을 위해 Option C 통일을 추천한다.

---

## 5. 서버 파일 구조

```
app/loaders/content.server.ts       # 공유 content CRUD (helper 함수)
app/loaders/content.schema.ts       # Zod 검증 스키마
app/loaders/upload.server.ts        # 파일 업로드 (signed URL 발급) action
app/types/content.ts                # Content, Comment, Attachment 타입
```

### content.server.ts -- Helper 함수

```typescript
import { data } from "react-router";
import type { AppLoadContext } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "~/types/database";

type ContentType = "po" | "pi" | "shipping" | "order" | "customs";

// ── 콘텐츠 조회 (다른 모듈 loader에서 호출) ────────────

export async function getContentsForDocument(
  supabase: SupabaseClient<Database>,
  type: ContentType,
  parentId: string
) {
  const { data: contents, error } = await supabase
    .from("contents")
    .select(
      "id, title, body, created_by, created_at, updated_at, " +
      "attachments:content_attachments(id, file_name, file_size, file_url, created_at)"
    )
    .eq("type", type)
    .eq("parent_id", parentId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) return { contents: [], error };
  return { contents: contents ?? [], error: null };
}

// ── 댓글 조회 ─────────────────────────────────────────

export async function getCommentsForContent(
  supabase: SupabaseClient<Database>,
  contentId: string,
  options?: { limit?: number; offset?: number }
) {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  const { data: comments, error, count } = await supabase
    .from("comments")
    .select("id, body, created_by, created_at, updated_at", { count: "exact" })
    .eq("content_id", contentId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) return { comments: [], count: 0, error };
  return { comments: comments ?? [], count: count ?? 0, error: null };
}

// ── Signed URL for attachments ────────────────────────

export async function getSignedAttachmentUrls(
  supabase: SupabaseClient<Database>,
  attachments: Array<{ id: string; file_url: string }>
) {
  if (attachments.length === 0) return [];

  const results = await Promise.all(
    attachments.map(async (att) => {
      const { data } = await supabase.storage
        .from("attachments")
        .createSignedUrl(att.file_url, 3600); // 1시간
      return {
        ...att,
        signed_url: data?.signedUrl ?? null,
      };
    })
  );

  return results;
}
```

### content action 패턴 (모듈 detail action에 통합)

콘텐츠 CRUD는 각 모듈의 detail action에 `_action` 분기로 통합한다. 별도 route를 만들지 않는다.

```typescript
// po.$id.server.ts (또는 pi.$id.server.ts) action에 추가
// _action: "create_content" | "update_content" | "delete_content"
//          "create_comment" | "update_comment" | "delete_comment"
//          "upload_file"

if (intent === "create_content") {
  const title = formData.get("title") as string;
  const body = formData.get("body") as string; // Tiptap JSON string

  const parsed = contentSchema.safeParse({ title, body });
  if (!parsed.success) {
    return data(
      { success: false, error: parsed.error.issues[0]?.message ?? "입력을 확인하세요." },
      { status: 400, headers: responseHeaders }
    );
  }

  let parsedBody: unknown = null;
  if (parsed.data.body) {
    try {
      parsedBody = JSON.parse(parsed.data.body);
    } catch {
      return data(
        { success: false, error: "본문 형식이 올바르지 않습니다." },
        { status: 400, headers: responseHeaders }
      );
    }
  }

  const { error: insertError } = await supabase
    .from("contents")
    .insert({
      type: "po",           // 모듈에 따라 변경
      parent_id: id,
      title: parsed.data.title || null,
      body: parsedBody as Json,
      created_by: user.id,
    });

  if (insertError) {
    return data(
      { success: false, error: "저장 중 오류가 발생했습니다." },
      { status: 500, headers: responseHeaders }
    );
  }

  return data({ success: true }, { headers: responseHeaders });
}
```

### 대안: 공유 action handler 함수

모듈별로 코드 중복을 피하기 위해 helper 함수로 추출한다.

```typescript
// content.server.ts

export async function handleContentAction(
  supabase: SupabaseClient<Database>,
  user: { id: string },
  formData: FormData,
  intent: string,
  documentType: ContentType,
  parentId: string,
  responseHeaders: Headers
) {
  switch (intent) {
    case "create_content":
      return handleCreateContent(supabase, user, formData, documentType, parentId, responseHeaders);
    case "update_content":
      return handleUpdateContent(supabase, user, formData, responseHeaders);
    case "delete_content":
      return handleDeleteContent(supabase, formData, responseHeaders);
    case "create_comment":
      return handleCreateComment(supabase, user, formData, responseHeaders);
    case "update_comment":
      return handleUpdateComment(supabase, user, formData, responseHeaders);
    case "delete_comment":
      return handleDeleteComment(supabase, formData, responseHeaders);
    default:
      return null; // null이면 기존 action 로직으로 fall-through
  }
}
```

각 모듈의 action에서:

```typescript
// po.$id.server.ts action 내부
const contentResult = await handleContentAction(
  supabase, user, formData, intent, "po", id, responseHeaders
);
if (contentResult) return contentResult;

// 기존 PO-specific action 로직 계속...
```

이 패턴으로 content/comment CRUD 로직을 한 곳에서 관리하면서, 각 모듈 action에 2줄 추가로 통합할 수 있다.

---

## 6. 기존 모듈 loader 통합

### PO Detail Loader 수정 예시

```typescript
// po.$id.server.ts loader
export async function loader({ request, context, params }: DetailLoaderArgs) {
  const { supabase, responseHeaders } = await requireGVUser(request, context);

  const idResult = z.string().uuid().safeParse(params.id);
  if (!idResult.success) {
    throw data(null, { status: 404, headers: responseHeaders });
  }

  const [{ data: po, error }, { data: pis }, { contents }] = await Promise.all([
    // 기존 PO 조회
    supabase.from("purchase_orders").select("...").eq("id", idResult.data).single(),
    // 연결 PI 조회
    supabase.from("proforma_invoices").select("...").eq("po_id", idResult.data),
    // 콘텐츠 조회 (새로 추가)
    getContentsForDocument(supabase, "po", idResult.data),
  ]);

  if (error || !po) throw data(null, { status: 404, headers: responseHeaders });

  return data({ po, pis: pis ?? [], contents }, { headers: responseHeaders });
}
```

**핵심:** `getContentsForDocument`를 Promise.all에 추가하여 기존 쿼리와 병렬 실행. 추가 round-trip 없음.

### 첨부파일 signed URL 처리

contents 조회 결과에 attachments가 포함되어 있으므로, private 버킷 파일의 경우 loader에서 signed URL을 생성해야 한다.

```typescript
// attachments 버킷 파일만 signed URL 필요
// content-images 버킷 파일은 public URL이므로 처리 불필요

// contents 내 attachments에서 attachments 버킷 파일 추출
const allAttachments = contents.flatMap(c =>
  (c.attachments ?? []).filter(a => a.file_url.startsWith("attachments/") || !a.file_url.startsWith("http"))
);

if (allAttachments.length > 0) {
  const withSignedUrls = await getSignedAttachmentUrls(supabase, allAttachments);
  // Map back to contents...
}
```

**간소화 방안:** file_url에 bucket prefix를 저장하지 않고, content_attachments 테이블에 `bucket` 컬럼을 추가하는 것도 고려. 하지만 현재 테이블 구조에서는 file_url 경로 규칙으로 구분하는 것이 마이그레이션 없이 가능하다.

---

## 7. 인라인 이미지 업로드 (Tiptap)

### 업로드 엔드포인트

별도 resource route를 만든다 (Form 기반이 아닌 fetch API 호출).

```
app/routes/api.upload.ts    # resource route (no UI)
```

```typescript
// app/routes/api.upload.ts
export { action } from "~/loaders/upload.server";
```

```typescript
// app/loaders/upload.server.ts
import { data } from "react-router";
import type { AppLoadContext } from "react-router";
import { requireGVUser } from "~/lib/auth.server";
import { z } from "zod";

interface LoaderArgs {
  request: Request;
  context: AppLoadContext;
}

const uploadRequestSchema = z.object({
  bucket: z.enum(["content-images", "attachments"]),
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1),
  documentType: z.enum(["po", "pi", "shipping", "order", "customs"]),
  parentId: z.string().uuid(),
});

export async function action({ request, context }: LoaderArgs) {
  const { supabase, user, responseHeaders } = await requireGVUser(request, context);

  const body = await request.json();
  const parsed = uploadRequestSchema.safeParse(body);

  if (!parsed.success) {
    return data(
      { error: parsed.error.issues[0]?.message ?? "잘못된 요청입니다." },
      { status: 400, headers: responseHeaders }
    );
  }

  const { bucket, fileName, contentType, documentType, parentId } = parsed.data;

  // 파일 경로 생성
  const timestamp = Date.now();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `${documentType}/${parentId}/${timestamp}_${safeName}`;

  // Signed upload URL 생성
  const { data: signedData, error } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(filePath);

  if (error || !signedData) {
    return data(
      { error: "업로드 URL 생성에 실패했습니다." },
      { status: 500, headers: responseHeaders }
    );
  }

  // Public URL (content-images) 또는 path (attachments)
  let publicUrl: string | null = null;
  if (bucket === "content-images") {
    const { data: urlData } = supabase.storage
      .from("content-images")
      .getPublicUrl(filePath);
    publicUrl = urlData.publicUrl;
  }

  return data(
    {
      signedUrl: signedData.signedUrl,
      token: signedData.token,
      path: filePath,
      publicUrl,
    },
    { headers: responseHeaders }
  );
}
```

### Tiptap 이미지 업로드 흐름

```
1. 사용자: 이미지 붙여넣기/드래그/버튼 클릭
2. Tiptap extension: fetch("/api/upload", { method: "POST", body: JSON.stringify({
     bucket: "content-images",
     fileName: file.name,
     contentType: file.type,
     documentType: "po",
     parentId: "uuid..."
   })})
3. 서버: signed upload URL 반환 + publicUrl
4. 클라이언트: fetch(signedUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } })
5. 클라이언트: Tiptap에 publicUrl로 이미지 노드 삽입
6. 사용자: content 저장 시 body JSONB에 이미지 URL이 포함됨
```

### 이미지 최적화

- **업로드 전 리사이즈:** 클라이언트에서 canvas API로 최대 1920px로 리사이즈 후 업로드
- **WebP 변환:** 클라이언트에서 canvas.toBlob('image/webp', 0.85) 사용
- **Supabase Image Transformation:** Supabase Pro 플랜에서 사용 가능 -- 현재는 클라이언트 리사이즈로 충분

### 고아 이미지 정리 전략

Tiptap 에디터에서 이미지를 삽입 후 저장하지 않고 떠나면 고아 이미지가 발생한다.

**방안 1 (추천): 주기적 정리 (Cron)**
- 24시간 이상 된 파일 중 어떤 contents.body에도 참조되지 않는 파일 삭제
- Supabase Edge Function 또는 pg_cron으로 구현
- 즉시 필요하지 않으므로 Phase 4 이후에 구현

**방안 2: 즉시 추적**
- `pending_uploads` 테이블에 업로드 시 기록, content 저장 시 confirmed로 변경
- 복잡도 높음 -- 비추

**방안 3: 무시**
- content-images 버킷은 public이고 5MB 제한이므로 고아 이미지가 누적되어도 비용 영향 적음
- MVP에서는 이 방식으로 시작하고, 스토리지 사용량 모니터링 후 정리 도입

**추천: 방안 3으로 시작, 필요 시 방안 1 도입.**

---

## 8. Zod 검증 스키마

### content.schema.ts

```typescript
// app/loaders/content.schema.ts
import { z } from "zod";

export const contentCreateSchema = z.object({
  title: z.string().max(200, "제목은 200자 이내로 입력하세요").optional().default(""),
  body: z.string().max(100000, "본문이 너무 깁니다").optional().default(""),
  // body는 Tiptap JSON string -- 파싱은 action에서 별도 수행
});

export const contentUpdateSchema = z.object({
  content_id: z.string().uuid("유효한 콘텐츠 ID가 필요합니다"),
  title: z.string().max(200, "제목은 200자 이내로 입력하세요").optional().default(""),
  body: z.string().max(100000, "본문이 너무 깁니다").optional().default(""),
});

export const commentCreateSchema = z.object({
  content_id: z.string().uuid("유효한 콘텐츠 ID가 필요합니다"),
  body: z.string().min(1, "댓글 내용을 입력하세요").max(2000, "댓글은 2000자 이내로 입력하세요"),
});

export const commentUpdateSchema = z.object({
  comment_id: z.string().uuid("유효한 댓글 ID가 필요합니다"),
  body: z.string().min(1, "댓글 내용을 입력하세요").max(2000, "댓글은 2000자 이내로 입력하세요"),
});

export const commentDeleteSchema = z.object({
  comment_id: z.string().uuid("유효한 댓글 ID가 필요합니다"),
});

export const contentDeleteSchema = z.object({
  content_id: z.string().uuid("유효한 콘텐츠 ID가 필요합니다"),
});

export const attachmentRecordSchema = z.object({
  content_id: z.string().uuid(),
  file_url: z.string().min(1),
  file_name: z.string().min(1).max(255),
  file_size: z.number().int().positive().optional(),
});
```

---

## 9. 콘텐츠 쿼리 패턴

### 문서 콘텐츠 전체 조회

```typescript
// 한 문서의 모든 콘텐츠 + 첨부파일 + 댓글
const { data: contents } = await supabase
  .from("contents")
  .select(
    "id, title, body, created_by, created_at, updated_at, " +
    "attachments:content_attachments(id, file_name, file_size, file_url, created_at), " +
    "comments(id, body, created_by, created_at, updated_at)"
  )
  .eq("type", "po")
  .eq("parent_id", poId)
  .is("deleted_at", null)
  .order("created_at", { ascending: false });
```

**주의:** comments가 many인 경우 대량 데이터가 될 수 있다. 실무에서 한 content에 댓글이 수십 개 이상 달리는 경우는 드물지만, 안전을 위해:

### 댓글 별도 조회 (페이지네이션)

초기 로드 시 contents에 댓글은 포함하지 않고, 클라이언트에서 content를 선택/확장할 때 댓글을 별도 fetch한다.

```typescript
// contents 조회 (댓글 제외)
const { data: contents } = await supabase
  .from("contents")
  .select(
    "id, title, body, created_by, created_at, updated_at, " +
    "attachments:content_attachments(id, file_name, file_size, file_url, created_at)"
  )
  .eq("type", "po")
  .eq("parent_id", poId)
  .is("deleted_at", null)
  .order("created_at", { ascending: false });

// 댓글 조회 (별도 fetcher 또는 resource route)
const { data: comments, count } = await supabase
  .from("comments")
  .select("id, body, created_by, created_at, updated_at", { count: "exact" })
  .eq("content_id", contentId)
  .is("deleted_at", null)
  .order("created_at", { ascending: true })
  .range(0, 49);  // 50개씩
```

### 정렬 전략

- **Contents:** `created_at DESC` (최신 콘텐츠 먼저)
- **Comments:** `created_at ASC` (시간순 -- 대화 흐름)
- **Attachments:** `created_at ASC` (업로드 순)

---

## 10. 크로스모듈 통합 전략

### 부모 문서 soft delete 시 콘텐츠 처리

현재 PO, PI는 `deleted_at` soft delete를 사용한다. 부모 문서가 삭제될 때 연관 contents도 처리해야 한다.

**방안 A: Application-level cascade (추천)**
```typescript
// po.$id.server.ts delete intent
if (intent === "delete") {
  // 1. PO soft delete
  await supabase.from("purchase_orders")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  // 2. 연관 contents soft delete
  await supabase.from("contents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("type", "po")
    .eq("parent_id", id)
    .is("deleted_at", null);

  // 3. 연관 comments soft delete (contents가 soft delete되었으므로 선택적)
  // comments는 content_id FK로 연결. 별도 처리 불필요 --
  // 쿼리 시 contents를 거쳐서 조회하므로 부모 content가 deleted면 자동 제외

  throw redirect("/po", { headers: responseHeaders });
}
```

이 패턴은 기존 PI delete 시 Delivery cascade와 동일한 application-level 패턴이다.

**방안 B: DB trigger**
프로젝트 원칙에 따라 사용하지 않는다.

### 콘텐츠 존재 여부 표시 (목록 페이지)

목록 페이지에서 콘텐츠가 있는 문서에 아이콘을 표시하고 싶다면, count 서브쿼리가 필요하다.

```typescript
// 목록 조회 시 contents 개수 포함 -- 성능 고려
// Option 1: RPC로 count 포함
// Option 2: 목록에서는 표시하지 않음 (추천 -- 단순성)
// Option 3: contents 테이블에서 type+parent_id로 exists 체크
```

**추천: 목록에서는 콘텐츠 존재 여부를 표시하지 않는다.** 상세 페이지에서만 콘텐츠를 보여준다. 필요해지면 RPC로 count 포함하는 커스텀 쿼리를 만든다.

---

## 11. Supabase 고려사항

### RLS 성능 -- Polymorphic type+parent_id

`contents` 테이블은 polymorphic 패턴 (type + parent_id)을 사용한다. parent_id는 purchase_orders, proforma_invoices 등 여러 테이블의 ID를 참조하지만 FK가 없다.

**성능 영향:**
- `WHERE type = 'po' AND parent_id = :uuid` 쿼리는 compound index로 빠르게 처리됨
- RLS 정책은 `get_user_org_type()` 함수 호출 -- 이 함수는 `auth.jwt()` 기반이므로 빠름
- parent 테이블 존재 확인이 없으므로, 삭제된 parent의 contents가 남을 수 있음 -- application-level cascade로 처리

**인덱스 효과:**
```sql
idx_contents_type_parent ON contents(type, parent_id) WHERE deleted_at IS NULL
```
이 partial compound index가 대부분의 쿼리를 커버한다.

### Storage 파일 크기 제한

- content-images: 5MB (버킷 설정)
- attachments: 20MB (버킷 설정)
- Supabase Free Plan: 1GB total storage
- Supabase Pro Plan: 100GB total storage

현재 프로젝트 규모(소수 사용자, B2B)에서 스토리지 부족 가능성은 낮다.

### cascade delete 주의

`content_attachments`는 `ON DELETE CASCADE`로 `contents(id)`를 참조한다. soft delete 시에는 CASCADE가 트리거되지 않으므로 문제없다. 하지만 hard delete를 실행하면 content_attachments 레코드도 함께 삭제되며, Storage의 실제 파일은 남는다. 파일 정리는 별도 프로세스가 필요하다.

---

## 12. TypeScript 타입

### app/types/content.ts

```typescript
import type { Json } from "~/types/database";

export interface ContentAttachment {
  id: string;
  file_name: string;
  file_size: number | null;
  file_url: string;
  created_at: string | null;
  signed_url?: string | null;  // private 버킷 파일용
}

export interface Comment {
  id: string;
  body: string;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ContentItem {
  id: string;
  title: string | null;
  body: Json | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  attachments: ContentAttachment[];
}

export interface ContentWithComments extends ContentItem {
  comments: Comment[];
}

export type ContentType = "po" | "pi" | "shipping" | "order" | "customs";
```

---

## 13. API 설계 요약

| Action Intent | Route | 설명 |
|--------------|-------|------|
| `create_content` | `po.$id` / `pi.$id` / etc. | 콘텐츠 생성 |
| `update_content` | `po.$id` / `pi.$id` / etc. | 콘텐츠 수정 |
| `delete_content` | `po.$id` / `pi.$id` / etc. | 콘텐츠 soft delete |
| `create_comment` | `po.$id` / `pi.$id` / etc. | 댓글 생성 |
| `update_comment` | `po.$id` / `pi.$id` / etc. | 댓글 수정 |
| `delete_comment` | `po.$id` / `pi.$id` / etc. | 댓글 soft delete |
| `save_attachment` | `po.$id` / `pi.$id` / etc. | 첨부파일 레코드 저장 |
| `delete_attachment` | `po.$id` / `pi.$id` / etc. | 첨부파일 삭제 (레코드 + Storage) |
| (POST) | `api.upload` | Signed upload URL 발급 |

---

## 14. 구현 우선순위

1. **Migration** -- deleted_at, 인덱스, RLS, Storage 버킷
2. **upload.server.ts** -- Signed URL 발급 action
3. **content.schema.ts** -- Zod 스키마
4. **content.server.ts** -- Helper 함수 (getContentsForDocument, handleContentAction)
5. **PO detail loader 통합** -- 가장 완성된 모듈에 먼저 통합
6. **PI detail loader 통합** -- 동일 패턴 적용
7. **댓글 기능** -- content CRUD 안정 후

---

## 15. 미결 사항

1. **댓글 페이지네이션 UX** -- 무한 스크롤 vs "더 보기" 버튼 vs 초기 전체 로드. 데이터 규모가 작으므로 초기 전체 로드 + 클라이언트 필터링이 단순하다.
2. **content-images 버킷 존재 확인** -- Supabase 대시보드에서 확인 필요. 이미 있으면 CREATE 스킵.
3. **사용자 이름 표시** -- `created_by`는 UUID. 표시 시 `user_profiles` 조인 필요. contents 조회에 `created_by_profile:user_profiles!created_by(name)` FK join이 가능한지 확인 필요 (FK가 없으면 불가).
4. **Tiptap body 검증 깊이** -- Tiptap JSON 구조를 서버에서 deep-validate할 것인가? 추천: 하지 않는다. string max length만 체크하고, Tiptap이 생성한 JSON은 신뢰한다. XSS는 렌더링 시 Tiptap이 처리한다.
5. **동시 편집** -- 현재 스코프 외. 단순 last-write-wins로 시작.
