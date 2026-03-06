# Phase 1 구현검증 분석 보고서

**Date:** 2026-03-06
**Status:** 분석 완료
**범위:** Phase 1 Foundation - Settings CRUD (Organizations, Products, Users)

---

## 에이전트 팀 구성

| # | 역할 | 담당 파일 | 분석 범위 |
|---|------|----------|----------|
| 1 | **Architect** | (리뷰) | 설계문서 vs 구현 정합성, 스키마 완전성, Phase 2 준비도 |
| 2 | **Code Reviewer** | (리뷰) | 코드 품질, 패턴, 버그, TypeScript, UX |
| 3 | **Security Reviewer** | (리뷰) | Auth, 입력검증, Admin Client, 데이터 노출, CSRF |
| 리더 | **직접 검증** | Supabase MCP | DB 스키마, RLS, RPC, 시드데이터, FK cascade |

> **제외 팀원:** Frontend Dev (코드 리뷰에서 커버), Backend Dev (Architect+Security에서 커버), Tester (테스트 없음), Perf-analyzer (CRUD 단계 시기상조), Researcher (조사 불필요)

---

## 1. 전체 요약

### 평가 결과

| 영역 | 등급 | 비고 |
|------|------|------|
| 설계문서 정합성 | **A** | 모든 Phase 1 태스크 완료, 편차는 개선 방향 |
| DB 스키마 | **A** | 15개 테이블 + RLS + RPC 완전 구현 |
| 서버/클라이언트 분리 | **A** | .server.ts 패턴 일관 적용 |
| 코드 품질 | **B** | 일관된 패턴, 일부 버그 존재 |
| 보안 | **B-** | 기본 인증 견고, 일부 Critical 이슈 |
| Phase 2 준비도 | **A** | PO 모듈 즉시 착수 가능 |

### 발견 이슈 요약

| 심각도 | 건수 | 주요 내용 |
|--------|------|----------|
| **Critical** | 2 | 사용자 삭제 검증 부재, 초대 플로우 비원자성 |
| **Must Fix** | 4 | 다이얼로그 미닫힘, update 시 id 누락 무시, profile insert RLS 문제 |
| **Should Fix** | 7 | Zod 스키마 개선, org_type 서버 검증, 에러메시지 노출 등 |
| **Info/Nit** | 6 | 페이지네이션, 역할 기반 필터링, 소프트삭제 문구 등 |

---

## 2. Supabase DB 직접 검증 결과

### 2.1 테이블 & RLS

| 테이블 | RLS | 정책 수 | 행 수 | 비고 |
|--------|-----|---------|-------|------|
| organizations | ✅ | 2 (gv_all, saelim_read) | 3 | CHP, GV, Saelim 시드 |
| products | ✅ | 2 (gv_all, saelim_read) | 0 | |
| user_profiles | ✅ | 2 (gv_all, saelim_read_own) | 1 | Jeremy (GV Admin) |
| purchase_orders | ✅ | 1 (gv_all) | 0 | Saelim 접근 차단 ✅ |
| proforma_invoices | ✅ | 1 (gv_all) | 0 | |
| shipping_documents | ✅ | 2 (gv_all, saelim_read) | 0 | |
| deliveries | ✅ | 2 (gv_all, saelim_read) | 0 | |
| delivery_change_requests | ✅ | 3 (gv_all, saelim_insert, saelim_select) | 0 | |
| customs | ✅ | 1 (gv_all) | 0 | |
| orders | ✅ | 1 (gv_all) | 0 | |
| stuffing_lists | ✅ | 1 (gv_all) | 0 | |
| contents | ✅ | 1 (gv_all) | 0 | |
| comments | ✅ | 1 (gv_all) | 0 | |
| content_attachments | ✅ | 1 (gv_all) | 0 | |
| document_sequences | ✅ | 1 (gv_all) | 0 | |

### 2.2 RPC 함수

| 함수 | 상태 | 비고 |
|------|------|------|
| `generate_doc_number(doc_type, ref_date)` | ✅ | `pg_advisory_xact_lock` 사용 동시성 안전 |
| `get_user_org_type()` | ✅ | `app_metadata.org_type` 기반 RLS 헬퍼 |
| `get_user_org_id()` | ✅ | `app_metadata.org_id` 기반 RLS 헬퍼 |

### 2.3 마이그레이션

10개 마이그레이션 적용 완료:
```
001_extensions_and_helpers → 002_core_tables → 003_document_tables →
004_content_system → 005_delivery_changes → 006_rls_policies →
007_rpc_functions → 008_indexes → 009_storage_buckets → 010_seed_data
```

### 2.4 FK Cascade 검증

| FK | 타입 | 의미 |
|----|------|------|
| `user_profiles_id_fkey` → `auth.users.id` | **CASCADE** | auth.users 삭제 시 profile 자동 삭제 ✅ |
| `user_profiles_org_id_fkey` → `organizations.id` | NO ACTION | 조직 삭제 시 프로필 보존 (소프트삭제이므로 OK) |

### 2.5 시드 데이터

| 조직 | type | name_en |
|------|------|---------|
| CHP | supplier | Chung Hwa Pulp Corporation |
| GV | seller | GV International Co., Ltd. |
| Saelim | buyer | Saelim Co., Ltd. |

사용자: Jeremy (GV Admin) - org_id = GV International

---

## 3. 설계문서 vs 구현 정합성 (Architect)

### 일치 항목

- ✅ Phase 1 DoD 7개 항목 모두 완료
- ✅ DB 스키마가 브레인스토밍 문서와 완전 일치
- ✅ 모든 FK 관계 정확 (orders → PO/PI/Shipping/Customs/Delivery)
- ✅ `app_metadata` 사용 (user_metadata 대신) — 보안 개선
- ✅ TanStack Query 대신 React Router fetcher 사용 — 결정 반영
- ✅ JSONB 패턴 (details, fees) 적용
- ✅ CHECK 제약조건 (org type, doc status) 적용

### 긍정적 편차

| 항목 | 계획 | 구현 | 평가 |
|------|------|------|------|
| RLS 헬퍼 | JWT 직접 참조 | `get_user_org_type()` 함수 | 👍 더 깔끔 |
| app_metadata | user_metadata | app_metadata | 👍 보안 강화 |
| 문서번호 생성 | serializable txn | advisory lock | 👍 동시성 안전 |

### Phase 2 준비도

| 요구사항 | 상태 |
|----------|------|
| purchase_orders 테이블 | ✅ 모든 필드 정의됨 |
| generate_doc_number RPC | ✅ 동작 확인 |
| document_sequences 테이블 | ✅ 복합 PK (prefix, yymm) |
| 상수 (CURRENCIES, PORTS 등) | ✅ `constants.ts` |
| 재사용 패턴 (multi-intent, dialog, Zod) | ✅ Phase 1에서 검증됨 |

---

## 4. 이슈 상세

### Critical

#### C-1: 사용자 삭제 시 검증 부재
**파일:** `app/loaders/settings.users.server.ts:110-119`
**심각도:** Critical

```typescript
// 현재 코드 - user_id 검증 없음
const user_id = formData.get("user_id") as string;
if (!user_id) { ... }
const { error } = await adminClient.auth.admin.deleteUser(user_id);
```

**문제:**
- UUID 형식 검증 없음
- 자기 자신 삭제 가능 (모든 관리자 계정 삭제 가능)
- admin 권한 계층 검사 없음
- 비가역적 hard delete (auth.users에서 영구 삭제)

**수정 방안:**
```typescript
// 1. UUID 검증
const deleteSchema = z.object({ user_id: z.string().uuid() });
const parsed = deleteSchema.safeParse({ user_id: formData.get("user_id") });

// 2. 자기 자신 삭제 방지
if (parsed.data.user_id === user.id) {
  return data({ success: false, error: "자기 자신은 삭제할 수 없습니다." }, { status: 403 });
}
```

> **참고:** `user_profiles` 정리는 FK CASCADE로 자동 처리됨 (검증 완료)

---

#### C-2: 초대 플로우 비원자성 (부분 실패 시 고아 계정)
**파일:** `app/loaders/settings.users.server.ts:76-105`
**심각도:** Critical

3단계 순차 실행에 롤백 없음:
```
Step 1: inviteUserByEmail  → 성공 (커밋됨)
Step 2: updateUserById     → 실패 시 → org_type 없는 계정 생성됨
Step 3: user_profiles.insert → 실패 시 → 프로필 없는 계정 생성됨
```

**위험:**
- Step 2 실패: `org_type` 미설정 → `requireGVUser`에서 `undefined !== "gv"` → `/saelim/delivery`로 리다이렉트 → **의도치 않은 Saelim 포탈 접근**
- Step 3 실패: 프로필 없는 GV 사용자 → 설정 페이지에서 이름/조직 null 표시

**수정 방안:**
```typescript
// 보상 트랜잭션: 실패 시 Step 1 롤백
const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, { data: { name } });
if (inviteError) return data({ success: false, error: inviteError.message }, ...);

const userId = inviteData.user.id;

const { error: metaError } = await adminClient.auth.admin.updateUserById(userId, {
  app_metadata: { org_type, org_id },
});
if (metaError) {
  await adminClient.auth.admin.deleteUser(userId); // 롤백
  return data({ success: false, error: metaError.message }, ...);
}

// Step 3도 adminClient 사용 (RLS 우회)
const { error: profileError } = await adminClient.from("user_profiles").insert({ id: userId, name, org_id, role });
if (profileError) {
  await adminClient.auth.admin.deleteUser(userId); // 롤백 (CASCADE로 profile도 정리)
  return data({ success: false, error: profileError.message }, ...);
}
```

---

### Must Fix

#### M-1: 다이얼로그 성공 후 자동 닫힘 미구현
**파일:** `_layout.settings.organizations.tsx`, `_layout.settings.products.tsx`
**심각도:** Must Fix (UX 버그)

fetcher.Form 제출 성공 후 다이얼로그가 열린 채로 유지됨. 배경의 리스트는 revalidation으로 갱신되지만, 다이얼로그에는 이전 defaultValue가 남아있음.

**수정 방안:**
```typescript
// 각 Dialog 컴포넌트에 추가
const prevState = useRef(fetcher.state);
useEffect(() => {
  if (prevState.current !== "idle" && fetcher.state === "idle") {
    if (fetcher.data && !("error" in fetcher.data)) {
      onClose();
    }
  }
  prevState.current = fetcher.state;
}, [fetcher.state, fetcher.data, onClose]);
```

---

#### M-2: update 액션에서 id 누락 시 무시 (false success)
**파일:** `settings.organizations.server.ts:84`, `settings.products.server.ts:79`
**심각도:** Must Fix

```typescript
// _action === "update" && id가 없으면 아무것도 안 하고 success: true 반환
} else if (_action === "update" && id) { ... }
return data({ success: true }, { headers: responseHeaders });
```

**수정 방안:**
```typescript
if (_action === "update" && !id) {
  return data({ success: false, error: "수정할 항목의 ID가 필요합니다." }, { status: 400, headers: responseHeaders });
}
```

---

#### M-3: user_profiles insert에 RLS 클라이언트 사용
**파일:** `settings.users.server.ts:96`
**심각도:** Must Fix

```typescript
// 현재: 세션 사용자(관리자)의 supabase 클라이언트로 다른 사용자의 프로필 생성
const { error: profileError } = await supabase.from("user_profiles").insert({ id: userId, ... });
```

RLS `gv_all` 정책이 `get_user_org_type() = 'gv'`이므로 GV 관리자의 세션으로는 작동하지만, 원칙적으로 adminClient(service_role)를 사용해야 안전.

**수정 방안:** `supabase` → `adminClient` 변경

---

### Should Fix

#### S-1: org_type을 클라이언트 폼에서 직접 수신
**파일:** `settings.users.server.ts:87-89`
**심각도:** Should Fix (보안)

`org_type`이 hidden input에서 직접 전송됨 → GV 사용자가 DevTools로 `org_type: "gv"`를 설정하여 누구나 GV 권한 부여 가능.

**수정 방안:** `org_type`을 서버에서 `org_id` 기반으로 파생:
```typescript
const org = await adminClient.from("organizations").select("type").eq("id", org_id).single();
const orgTypeMap: Record<string, string> = { seller: "gv", buyer: "saelim", supplier: "supplier" };
const org_type = orgTypeMap[org.data.type] ?? "supplier";
```

---

#### S-2: role 필드에 임의 문자열 허용
**파일:** `settings.users.server.ts:12`
**심각도:** Should Fix

```typescript
// 현재
role: z.string().default("member"),
// 수정
role: z.enum(["admin", "member"]).default("member"),
```

---

#### S-3: Supabase 에러 메시지 클라이언트 노출
**파일:** 모든 loader 파일
**심각도:** Should Fix

DB 스키마 정보가 포함된 에러 메시지가 그대로 UI에 표시됨.

**수정 방안:** 500 에러는 제네릭 메시지 반환, 원본은 서버 로그에 기록.

---

#### S-4: Zod 숫자 필드 타입 누수
**파일:** `settings.products.server.ts:10-11`
**심각도:** Should Fix

```typescript
// 현재: 파싱 결과 타입이 number | "" | undefined
gsm: z.coerce.number().int().positive().optional().or(z.literal(""))

// 수정: 깔끔한 전처리
gsm: z.preprocess(
  (v) => (v === "" || v === undefined ? undefined : v),
  z.coerce.number().int().positive().optional()
)
```

---

#### S-5: delete 액션 Zod 검증 부재
**파일:** `settings.organizations.server.ts:45-58`, `settings.products.server.ts:41-54`
**심각도:** Should Fix

delete 분기에서 `id`를 UUID 검증 없이 직접 사용. Supabase가 잘못된 UUID를 거부하지만, 에러 메시지가 그대로 노출됨.

---

#### S-6: `as Org` / `as Product` 타입 캐스팅
**파일:** 모든 settings route 파일
**심각도:** Should Fix

loader 데이터와 로컬 타입 간 불일치를 숨김. Supabase 스키마 변경 시 감지 불가.

**수정 방안:**
```typescript
type Org = ReturnType<typeof useLoaderData<typeof loader>>["orgs"][number];
```

---

#### S-7: OrgType에 "supplier" 누락
**파일:** `app/types/common.ts:1`
**심각도:** Should Fix

```typescript
// 현재
export type OrgType = "gv" | "saelim";
// 수정
export type OrgType = "gv" | "saelim" | "supplier";
```

---

### Info / 참고사항

| # | 내용 | 위치 |
|---|------|------|
| I-1 | `listUsers()` 페이지네이션 없음 (현재 소규모 OK, 확장 시 대응 필요) | users.server.ts:25 |
| I-2 | 로그인 rate limiting 없음 (Supabase 글로벌 제한만 의존) | auth.server.ts |
| I-3 | 소프트삭제 확인 문구 "되돌릴 수 없습니다" → 실제로는 소프트삭제 | organizations/products route |
| I-4 | `signature_image_url` DB에 존재하나 CRUD UI 미노출 (Phase 4+ 범위) | organizations |
| I-5 | Settings 페이지 모바일 반응형 미적용 (Phase 10 범위) | 모든 settings route |
| I-6 | `ActionResult<T>` 타입 정의되었으나 미사용 | common.ts |

---

## 5. 보안 통과 항목

- ✅ 모든 loader/action에서 `requireGVUser` 최상단 호출
- ✅ `supabase.auth.getUser()`로 서버 측 JWT 검증 (클라이언트 디코딩 아님)
- ✅ `app_metadata` 사용 (사용자가 직접 수정 불가)
- ✅ Admin client가 팩토리 함수로 생성 (모듈 수준 싱글턴 아님)
- ✅ `dangerouslySetInnerHTML` 미사용
- ✅ 사용자 입력이 React 텍스트 노드로 렌더링 (XSS 방지)
- ✅ 로그인 에러 메시지 제네릭 (이메일 열거 방지)
- ✅ Zod `safeParse` 사용 (unhandled exception 방지)
- ✅ `_saelim.tsx` 레이아웃에서 Saelim 사용자만 접근 허용
- ✅ 15개 전체 테이블 RLS 활성화
- ✅ service_role_key가 .server.ts 파일에서만 사용

---

## 6. Phase 2 진행 전 권장 조치

### 필수 (Phase 2 시작 전)

1. **C-1 수정:** 사용자 삭제 UUID 검증 + 자기 삭제 방지
2. **C-2 수정:** 초대 플로우 보상 트랜잭션 + adminClient 사용
3. **M-1 수정:** 다이얼로그 자동 닫힘 useEffect 추가
4. **M-2 수정:** update 시 id 누락 명시적 에러 반환

### 권장 (Phase 2와 병행 가능)

5. **S-1:** org_type 서버 측 파생
6. **S-2:** role enum 제한
7. **S-3:** 에러 메시지 제네릭화
8. **S-4:** Zod preprocess 패턴 적용

### 후속 (Phase 2 이후)

9. 모바일 반응형 설정 페이지 (Phase 10)
10. signature_image_url CRUD (Phase 4+)
11. 로그인 rate limiting (Cloudflare KV 또는 Rules)
12. 프로덕션 빌드에서 service_role_key 미노출 검증 CI 추가

---

## 7. 파일 소유권 매핑 (수정 대상)

| 파일 | 수정 항목 | 담당 |
|------|----------|------|
| `app/loaders/settings.users.server.ts` | C-1, C-2, M-3, S-1, S-2 | Backend Dev |
| `app/loaders/settings.organizations.server.ts` | M-2, S-5 | Backend Dev |
| `app/loaders/settings.products.server.ts` | M-2, S-4, S-5 | Backend Dev |
| `app/routes/_layout.settings.organizations.tsx` | M-1, S-6 | Frontend Dev |
| `app/routes/_layout.settings.products.tsx` | M-1, S-6 | Frontend Dev |
| `app/routes/_layout.settings.users.tsx` | S-6 | Frontend Dev |
| `app/types/common.ts` | S-7 | Backend Dev |
