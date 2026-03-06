# Phase 1 구현검증 개선 실행 보고서

**Date:** 2026-03-06
**Status:** 완료
**범위:** Phase 1 분석 보고서(`PROJECT_INIT_ANALYZE_PHASE_1.md`) 기반 개선항목 실행

---

## 에이전트 팀 구성

| # | 역할 | 담당 | 비고 |
|---|------|------|------|
| Leader | **리더 (Claude Code)** | 전체 조율, 직접 구현 | 단독 구현 (팀원 위임 불필요) |
| - | Backend Dev | `settings.users/organizations/products.server.ts` | 리더가 직접 수행 |
| - | Frontend Dev | `_layout.settings.*.tsx` | 리더가 직접 수행 |

> **팀원 제외 근거:** 분석 보고서에 수정 방안이 명확히 명세되어 있고, 파일 수가 적어 단독 구현 가능. Supabase MCP는 DB 변경 없으므로 불필요.

---

## 구현 결과

### Critical 이슈 (2건) - 모두 완료

#### C-1: 사용자 삭제 검증 부재 → 수정 완료
**파일:** `app/loaders/settings.users.server.ts`

- UUID 형식 검증 추가 (`deleteSchema` with `z.string().uuid()`)
- 자기 자신 삭제 방지 (`user_id === user.id` 체크)
- `requireGVUser`에서 `user` 디스트럭처링으로 현재 사용자 ID 획득

```typescript
// 추가된 코드
const deleteSchema = z.object({
  user_id: z.string().uuid("올바른 사용자 ID가 아닙니다."),
});

// 자기 자신 삭제 방지
if (user_id === user.id) {
  return data({ success: false, error: "자기 자신은 삭제할 수 없습니다." }, { status: 403, ... });
}
```

#### C-2: 초대 플로우 비원자성 → 수정 완료
**파일:** `app/loaders/settings.users.server.ts`

3단계 순차 실행에 보상 트랜잭션 추가:
- Step 2 실패 시 → `adminClient.auth.admin.deleteUser(userId)` 롤백
- Step 3 실패 시 → `adminClient.auth.admin.deleteUser(userId)` 롤백 (CASCADE로 profile 자동 정리)
- Step 3에서 `supabase` → `adminClient` 변경 (M-3 동시 수정)

---

### Must Fix 이슈 (3건) - 모두 완료

#### M-1: 다이얼로그 성공 후 자동 닫힘 미구현 → 수정 완료
**파일:** `_layout.settings.organizations.tsx`, `_layout.settings.products.tsx`, `_layout.settings.users.tsx`

3개 파일 모두에 `useRef` + `useEffect` 패턴 적용:
```typescript
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

#### M-2: update 액션 id 누락 시 false success → 수정 완료
**파일:** `settings.organizations.server.ts`, `settings.products.server.ts`

```typescript
// 변경 전: } else if (_action === "update" && id) { ... }
// 변경 후: 명시적 에러 반환
} else if (_action === "update") {
  if (!id) {
    return data({ success: false, error: "수정할 항목의 ID가 필요합니다." }, { status: 400 });
  }
  ...
}
```

#### M-3: user_profiles insert에 RLS 클라이언트 사용 → 수정 완료
**파일:** `settings.users.server.ts`

C-2 수정 시 함께 처리: `supabase.from("user_profiles").insert(...)` → `adminClient.from("user_profiles").insert(...)`

---

### Should Fix 이슈 (7건) - 완료

#### S-1: org_type 서버 측 파생 → 수정 완료
**파일:** `settings.users.server.ts`, `_layout.settings.users.tsx`

- 서버: `inviteSchema`에서 `org_type` 필드 제거, `org_id`로 DB 조회하여 파생
- 클라이언트: `<input type="hidden" name="org_type">` 전송 코드 제거
- `ORG_TYPE_MAP: { seller→"gv", buyer→"saelim", supplier→"supplier" }` 서버에 정의

```typescript
const { data: orgData } = await adminClient.from("organizations")
  .select("type").eq("id", org_id).is("deleted_at", null).single();
const org_type = ORG_TYPE_MAP[orgData.type] ?? "supplier";
```

#### S-2: role 필드 enum 제한 → 수정 완료
**파일:** `settings.users.server.ts`

```typescript
// 변경 전: role: z.string().default("member")
// 변경 후:
role: z.enum(["admin", "member"]).default("member")
```

#### S-3: Supabase 에러 메시지 제네릭화 → 수정 완료
**파일:** 모든 server 파일

500 에러는 사용자 친화적 메시지로 대체:
- `"서버 오류"` → `"저장에 실패했습니다."`, `"삭제에 실패했습니다."`, `"초대 발송에 실패했습니다."` 등
- 400 검증 에러는 Zod 메시지 그대로 반환 (스키마 정보 미포함)

#### S-4: Zod 숫자 필드 타입 누수 → 수정 완료
**파일:** `settings.products.server.ts`

```typescript
// 변경 전: z.coerce.number().int().positive().optional().or(z.literal(""))
// 변경 후:
const optionalPositiveInt = z.preprocess(
  (v) => (v === "" || v === undefined ? undefined : v),
  z.coerce.number().int().positive().optional()
);
```
파싱 후 `gsm ?? null` 패턴으로 DB insert 처리 (타입 누수 제거)

#### S-5: delete 액션 UUID 검증 → 수정 완료
**파일:** `settings.organizations.server.ts`, `settings.products.server.ts`

```typescript
const deleteSchema = z.object({ id: z.string().uuid("올바른 ID가 아닙니다.") });
const parsed = deleteSchema.safeParse({ id: formData.get("id") });
```

#### S-6: `as Org` / `as Product` 타입 캐스팅 제거 → 수정 완료
**파일:** 3개 route 파일

```typescript
// loader 반환 타입에서 파생
type Org = ReturnType<typeof useLoaderData<typeof loader>>["orgs"][number];
type Product = ReturnType<typeof useLoaderData<typeof loader>>["products"][number];
type LoaderData = ReturnType<typeof useLoaderData<typeof loader>>;
type User = LoaderData["users"][number];
type Org = LoaderData["orgs"][number];
```
`as Org`, `as Product`, `as User`, `as Org[]` 캐스팅 전체 제거

#### S-7: OrgType에 "supplier" 누락 → 수정 완료
**파일:** `app/types/common.ts`

```typescript
// 변경 전: export type OrgType = "gv" | "saelim";
// 변경 후:
export type OrgType = "gv" | "saelim" | "supplier";
```

---

## 파일 소유권 (변경 파일)

| 파일 | 수정 항목 |
|------|----------|
| `app/loaders/settings.users.server.ts` | C-1, C-2, M-3, S-1, S-2, S-3 |
| `app/loaders/settings.organizations.server.ts` | M-2, S-3, S-5 |
| `app/loaders/settings.products.server.ts` | M-2, S-3, S-4, S-5 |
| `app/routes/_layout.settings.organizations.tsx` | M-1, S-6, I-3 |
| `app/routes/_layout.settings.products.tsx` | M-1, S-6, I-3 |
| `app/routes/_layout.settings.users.tsx` | M-1, S-1(client), S-6 |
| `app/types/common.ts` | S-7 |

---

## 미처리 항목 (Info/후속)

| # | 내용 | 이유 |
|---|------|------|
| I-1 | `listUsers()` 페이지네이션 | 소규모 운영 중, Phase 후속 대응 |
| I-2 | 로그인 rate limiting | Cloudflare Rules 또는 KV - Phase 10 범위 |
| I-4 | `signature_image_url` CRUD UI | Phase 4+ 범위 |
| I-5 | Settings 모바일 반응형 | Phase 10 범위 |
| I-6 | `ActionResult<T>` 미사용 타입 | 후속 사용 예정, 보존 |

---

## 검증

- `npm run typecheck` 실행 결과: **오류 없음** ✅
- Supabase DB 변경: **없음** (코드 레벨 수정만)
- 브레이킹 체인지: **없음** (API 인터페이스 동일)

---

## Phase 2 진행 준비

모든 Critical/Must Fix 이슈 해결 완료. Phase 2 (PO 모듈) 즉시 착수 가능.
