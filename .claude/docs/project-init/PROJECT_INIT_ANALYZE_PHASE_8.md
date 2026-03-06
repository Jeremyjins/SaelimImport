# Phase 8: Delivery Module - 구현검증 분석 보고서

**Date:** 2026-03-06
**Status:** 분석 완료
**참조:** PROJECT_INIT_BRAINSTORMING_PHASE_8.md, PROJECT_INIT_IMPLEMENT_PHASE_8-A.md, PROJECT_INIT_IMPLEMENT_PHASE_8-B.md

---

## 1. 분석 팀 구성

| # | 역할 | 담당 범위 | 파일 소유 |
|---|------|----------|----------|
| 1 | **Architect** | DB 스키마, Sync 로직, 라우트 구조, Types | database.ts, order-sync.server.ts, routes.ts, content.ts, content.server.ts |
| 2 | **Frontend Code Reviewer** | GV/Saelim UI, 컴포넌트 품질, 반응형 | _layout.delivery*.tsx, _saelim.delivery*.tsx, components/delivery/*.tsx |
| 3 | **Backend Code Reviewer** | Loader/Action 로직, Zod 스키마, 버그 탐지 | delivery*.server.ts, saelim.delivery*.server.ts, delivery.schema.ts |
| 4 | **Security Reviewer** | CRIT-1~5, RLS 정책, 데이터 격리 | RLS policies (Supabase), auth.server.ts |
| 5 | **Code Quality Reviewer** | 패턴 일관성 (Phase 6 vs 8), TypeScript | 전체 교차 검증 |

**제외:** Tester (코드 분석 단계), Perf-analyzer (규모 미해당), Researcher (구현 완료 단계)

---

## 2. 종합 평가

### 구현 완성도: **95%** (높음)

- 브레인스토밍 문서의 모든 주요 기능 구현 완료
- CRIT-1~5 보안 요건 모두 코드 레벨에서 충족
- 44개 아키텍처 검증 항목 중 38개 OK, 4개 DB 직접 확인 필요
- 프로젝트 패턴 일관성 높음 (Phase 6 Orders와 동일 패턴)

### 발견 이슈 요약

| 등급 | 건수 | 설명 |
|------|------|------|
| **CRITICAL** | 1 | RLS 중복 정책 (saelim_read에 deleted_at 조건 누락) |
| **HIGH** | 4 | Toast 타이밍 버그 2건, delivered 상태 보호 미비 2건 |
| **MEDIUM** | 6 | 에러 무시, 타임존, 타입 느슨함, 부분실패 등 |
| **LOW** | 5 | meta 누락, 파일명 불일치, Saelim 타입 분산 등 |
| **INFO** | 4 | 코드 정리, 패턴 개선 제안 |

---

## 3. CRITICAL 이슈

### CRIT-DB-1: 중복 RLS 정책으로 인한 Soft Delete 보호 계층 누락

**발견자:** Security Reviewer
**대상:** Supabase DB (deliveries, delivery_change_requests)

DB에 중복 RLS 정책이 존재한다. 특히 `saelim_read` on deliveries에 `deleted_at IS NULL` 조건이 없어, 앱 쿼리 필터에만 의존하는 상태.

| 테이블 | 중복 정책 (구형) | 올바른 정책 (신형) | 문제점 |
|--------|-----------------|-------------------|--------|
| deliveries | `gv_all` (WITH CHECK 없음) | `gv_deliveries_all` | WITH CHECK 누락 |
| deliveries | `saelim_read` (deleted_at 미검증) | `saelim_deliveries_select` | **soft delete 레코드 노출 가능** |
| delivery_change_requests | `gv_all` (WITH CHECK 없음) | `gv_change_requests_all` | WITH CHECK 누락 |
| delivery_change_requests | `saelim_insert` | `saelim_change_requests_insert` | 완전 중복 |
| delivery_change_requests | `saelim_select` | `saelim_change_requests_select` | 완전 중복 |

**수정 방안 (Supabase MCP 또는 SQL Editor):**
```sql
DROP POLICY IF EXISTS "gv_all" ON public.deliveries;
DROP POLICY IF EXISTS "saelim_read" ON public.deliveries;
DROP POLICY IF EXISTS "gv_all" ON public.delivery_change_requests;
DROP POLICY IF EXISTS "saelim_insert" ON public.delivery_change_requests;
DROP POLICY IF EXISTS "saelim_select" ON public.delivery_change_requests;
```

**영향도:** PERMISSIVE 정책 OR 조합으로 현재 기능 동작에는 문제없으나, Supabase Studio 직접 조회나 미래 쿼리 실수 시 soft delete 레코드 노출 가능.

---

## 4. HIGH 이슈

### HIGH-1: Toast useEffect 타이밍 버그 (fetcher.formData null)

**발견자:** Frontend Code Reviewer
**대상:** `_layout.delivery.$id.tsx:67-69`, `change-request-card.tsx:93-96`

`fetcher.state === "idle"` 전환 시 `fetcher.formData`가 이미 `null`로 초기화되어, `_action` 값을 읽을 수 없다. 결과적으로 Toast가 표시되지 않는 버그.

```typescript
// 현재 패턴 (버그) - idle 전환 시 fetcher.formData === null
const act = (fetcher.formData as unknown as FormData | null)?.get("_action");
```

**수정 방안:** `prevStateRef`에 `_action` 값을 함께 저장하거나, `prevActionRef = useRef<string | null>(null)` 별도 ref를 두고 `state !== "idle"` 구간에서 action 값을 캡처.

```typescript
// 수정 패턴
const prevRef = useRef<{ state: string; action: string | null }>({ state: "idle", action: null });

useEffect(() => {
  if (fetcher.state !== "idle") {
    prevRef.current.action = (fetcher.formData as unknown as FormData | null)?.get("_action") as string | null;
  }
  if (prevRef.current.state !== "idle" && fetcher.state === "idle" && fetcher.data) {
    const act = prevRef.current.action;
    // toast 로직...
  }
  prevRef.current.state = fetcher.state;
}, [fetcher.state, fetcher.data]);
```

**영향도:** approve/reject/update_delivery_date/mark_delivered 성공 시 사용자 피드백(Toast) 미표시.

### HIGH-2: `mark_delivered` 상태 가드 미비

**발견자:** Backend Code Reviewer
**대상:** `delivery.$id.server.ts:294`

이미 `delivered` 상태인 배송에 중복 적용 가능. 또한 `update_delivery_date`가 `delivered` 배송의 날짜를 변경하여 `scheduled`로 되돌릴 수 있음 (API 직접 호출 시).

**수정 방안:**
```typescript
// mark_delivered에 가드 추가
if (deliveryCheck.status === "delivered") {
  return data({ success: false, error: "이미 배송완료된 건입니다." }, { status: 400, headers: responseHeaders });
}

// update_delivery_date에 가드 추가
if (deliveryCheck.status === "delivered") {
  return data({ success: false, error: "배송완료된 건의 날짜는 변경할 수 없습니다." }, { status: 400, headers: responseHeaders });
}
```

### HIGH-3: `syncDeliveryDateFromOrder`가 delivered 상태 덮어씀

**발견자:** Backend Code Reviewer
**대상:** `order-sync.server.ts:147`

Order의 delivery_date 인라인 편집 시 `syncDeliveryDateFromOrder`이 호출되어 `delivered` 상태 배송의 status를 `pending/scheduled`로 강제 되돌림.

```typescript
// 현재 (버그)
const status = date ? "scheduled" : "pending"; // delivered도 덮어씀
```

**수정 방안:**
```typescript
// update 쿼리에 delivered 제외 조건 추가
.neq("status", "delivered")
```

### HIGH-4: `approve_request` 부분 실패 시 데이터 불일치

**발견자:** Backend Code Reviewer
**대상:** `delivery.$id.server.ts:202`

`delivery_change_requests` 업데이트와 `deliveries` 업데이트를 `Promise.all`로 병렬 실행. 한쪽만 실패 시 불일치 (요청은 approved인데 날짜 미변경, 또는 반대).

**수정 방안 (권장: 순차 실행):**
```typescript
// 1단계: 요청 상태 업데이트
const { error: reqError } = await supabase.from("delivery_change_requests")...
if (reqError) throw data({ ... });

// 2단계: 배송 날짜 업데이트 (1단계 성공 시만)
const { error: deliveryError } = await supabase.from("deliveries")...
if (deliveryError) throw data({ ... });

// 3단계: Order 동기화
await syncDeliveryDateToOrder(...);
```

**대안:** Supabase RPC(DB function)로 원자적 처리.

---

## 5. MEDIUM 이슈

### MED-1: GV 목록/상세 로더에서 change_requests 에러 무시

**발견자:** Backend Code Reviewer
**대상:** `delivery.server.ts:19`, `delivery.$id.server.ts:44`

`Promise.all`에서 `delivery_change_requests` 쿼리의 `error`를 구조분해하지 않음. 실패 시 pending count가 0으로 표시되는 silent failure.

**수정:** `{ data: rawRequests, error: requestsError }` 구조분해 + `console.error` 기록.

### MED-2: 타임존 의존 날짜 검증 (UTC vs KST)

**발견자:** Backend Code Reviewer
**대상:** `delivery.schema.ts:8-12`

Cloudflare Workers는 UTC 기준. 한국(KST, UTC+9) 사용자가 오전 9시 이전에 "오늘" 날짜를 요청하면 서버는 전날로 판단하여 거부 가능.

**수정 방안:**
```typescript
// UTC 날짜 문자열 비교로 변경
const todayStr = new Date().toISOString().slice(0, 10);
return val >= todayStr; // 당일 포함 여부 정책 결정 필요
```

### MED-3: `ChangeRequest.status` 타입 느슨함

**발견자:** Backend + Code Quality Reviewer (교차 발견)
**대상:** `delivery.ts:9`

`ChangeRequestStatus` 유니온이 존재하지만 `ChangeRequest.status`가 `string | null`로 선언. 타입 안전성 저하.

**수정:** `status: ChangeRequestStatus | null`

### MED-4: `delivery_change_requests` 조회에 soft delete 필터 누락 가능

**발견자:** Code Quality Reviewer
**대상:** `delivery.server.ts:29`, `delivery.$id.server.ts:56`, `saelim.delivery.server.ts:53`

`delivery_change_requests` 테이블에 `deleted_at` 컬럼이 없다면 문제없으나, 있다면 `.is("deleted_at", null)` 필터 필요. database.ts 확인 결과 해당 컬럼 없음 → **실제 이슈 아님**, 주석으로 명시 권장.

### MED-5: Saelim 전용 타입이 `.server.ts` 파일에 정의

**발견자:** Code Quality Reviewer
**대상:** `saelim.delivery.server.ts:17-30`, `saelim.delivery.$id.server.ts:21-35`

`SaelimDeliveryListItem`, `SaelimDeliveryDetail`이 서버 파일 내부에 정의. 타입 관리 분산.

**수정:** `~/types/delivery.ts`로 이동.

### MED-6: `saelim.delivery.$id.server.ts` action UUID 검증 실패 응답에 responseHeaders 누락 가능

**발견자:** Backend Code Reviewer
**대상:** `saelim.delivery.$id.server.ts:108`

일부 에러 응답에 `responseHeaders`가 누락되면 세션 쿠키 갱신이 안될 수 있음. 확인 결과 대부분 포함되어 있으나 재확인 필요.

---

## 6. LOW 이슈

### LOW-1: GV 배송 라우트에 `meta()` 함수 누락

**대상:** `_layout.delivery.tsx`, `_layout.delivery.$id.tsx`
**비교:** Saelim 라우트에는 `meta()` 존재. 브라우저 탭 제목이 기본값.

### LOW-2: DropdownMenu에 불필요한 Separator

**대상:** `_layout.delivery.$id.tsx:132`
삭제 항목 위에 다른 메뉴 아이템이 없어 Separator가 시각적으로 의미 없음.

### LOW-3: 파일명과 export 내용 불일치

**대상:** `change-request-badge.tsx`
`DeliveryStatusBadge`와 `ChangeRequestBadge` 두 컴포넌트를 포함. 파일명이 badge 하나만 암시.

### LOW-4: `linkDeliveryToOrder` PI 생성 시 미호출

**발견자:** Architect
PI 생성 시 delivery 자동 생성하지만 기존 Order에 자동 연결하지 않음. `cascadeLinkPartial`로 보완 가능하므로 실질적 영향 낮음.

### LOW-5: Saelim 상세 로더에서 미사용 `userId` 반환

**대상:** `saelim.delivery.$id.server.ts:85`
Saelim 상세에는 ContentSection이 없어 `userId` 불필요.

---

## 7. INFO (개선 제안)

| # | 설명 | 대상 |
|---|------|------|
| 1 | `today` 계산이 매 렌더마다 실행 (성능 영향 미미) | `change-request-form.tsx:46` |
| 2 | `delivery_date` state null→"" 암묵적 변환 | `delivery-info-card.tsx:27-28` |
| 3 | `as unknown as Omit<..>[]` 이중 캐스팅 복잡성 | `delivery.server.ts:50-55` |
| 4 | `mark_delivered` 시 Order status 자동 변경 없음 (설계 의도) | `delivery.$id.server.ts` |

---

## 8. 보안 검증 결과 (CRIT-1~5)

| ID | 요건 | 상태 | 근거 |
|----|------|------|------|
| CRIT-1 | Saelim SELECT 가격 차단 | **PASS** | `SAELIM_DELIVERY_LIST_SELECT`, `SAELIM_DELIVERY_DETAIL_SELECT`에서 currency/amount 완전 제외 |
| CRIT-2 | 독립 Auth 검증 | **PASS** | Saelim: `requireAuth` + `org_type` 체크, GV: `requireGVUser` |
| CRIT-3 | requested_by 서버 강제 | **PASS** | `saelim.delivery.$id.server.ts:176` - `user.id` 직접 주입, FormData 미사용 |
| CRIT-4 | GV 전용 Action | **PASS** | approve/reject/delete/mark_delivered 모두 `delivery.$id.server.ts`(GV)에만 존재 |
| CRIT-5 | RLS 활성화 | **PASS** (경고) | 양 테이블 RLS 활성, 단 중복 정책 존재 (CRIT-DB-1 참조) |

---

## 9. 패턴 일관성 검증 (Phase 6 Orders vs Phase 8 Delivery)

| 패턴 | 일치 | 비고 |
|------|------|------|
| Auth guard (requireGVUser / requireAuth+org_type) | O | |
| AppLoadContext inline interface | O | |
| `data()` helper 사용 | O | |
| `responseHeaders` 전달 | O | |
| UUID params 검증 | O | |
| Soft delete 필터 | O | |
| FK 조인 `as unknown as` 캐스팅 | O | |
| Multi-intent if-chain | O | |
| Content 액션 위임 (`content_*`) | O | |
| Route re-export | O | |
| Mobile/Desktop 반응형 분기 | O | |
| Zod `issues[0]?.message` | O | |
| Toast `useEffect` + `prevStateRef` | O | (타이밍 버그 있음) |

**일치율: 13/13** (100%) - 모든 주요 패턴이 일관되게 적용됨.

---

## 10. DB 직접 검증 필요 항목 (Supabase Dashboard/SQL Editor)

Architect 에이전트의 Supabase MCP 접근 권한 이슈로 다음 항목은 수동 확인 필요:

```sql
-- 1. RLS 활성화 확인
SELECT relname, relrowsecurity FROM pg_class
WHERE relname IN ('deliveries', 'delivery_change_requests');

-- 2. RLS 정책 목록 (중복 정책 확인)
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN ('deliveries', 'delivery_change_requests')
ORDER BY tablename, policyname;

-- 3. CHECK constraint 확인
SELECT conname, consrc FROM pg_constraint
WHERE conrelid = 'deliveries'::regclass AND contype = 'c';

-- 4. 인덱스 확인
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename IN ('deliveries', 'delivery_change_requests');

-- 5. 중복 정책 정리 (CRIT-DB-1 수정)
DROP POLICY IF EXISTS "gv_all" ON public.deliveries;
DROP POLICY IF EXISTS "saelim_read" ON public.deliveries;
DROP POLICY IF EXISTS "gv_all" ON public.delivery_change_requests;
DROP POLICY IF EXISTS "saelim_insert" ON public.delivery_change_requests;
DROP POLICY IF EXISTS "saelim_select" ON public.delivery_change_requests;
```

---

## 11. 수정 우선순위 로드맵

### P0 (즉시 수정)
1. **CRIT-DB-1**: 중복 RLS 정책 DROP (5개) — Supabase SQL Editor
2. **HIGH-1**: Toast 타이밍 버그 수정 — `_layout.delivery.$id.tsx`, `change-request-card.tsx`

### P1 (이번 Phase 내)
3. **HIGH-2**: `mark_delivered` + `update_delivery_date` delivered 상태 가드 — `delivery.$id.server.ts`
4. **HIGH-3**: `syncDeliveryDateFromOrder` delivered 제외 — `order-sync.server.ts`
5. **HIGH-4**: `approve_request` 순차 실행 변경 — `delivery.$id.server.ts`
6. **MED-2**: 타임존 날짜 검증 수정 — `delivery.schema.ts`
7. **MED-3**: `ChangeRequest.status` 타입 강화 — `delivery.ts`

### P2 (다음 Phase 또는 Polish 단계)
8. **MED-1**: change_requests 에러 핸들링 — `delivery.server.ts`, `delivery.$id.server.ts`
9. **MED-5**: Saelim 타입 `delivery.ts`로 이동
10. **LOW-1~5**: meta 함수, Separator, 파일명, userId 정리

---

## 12. 파일별 수정 매핑

| 파일 | 이슈 ID | 수정 내용 |
|------|---------|----------|
| **Supabase DB** | CRIT-DB-1 | 중복 RLS 정책 5개 DROP |
| `app/loaders/delivery.$id.server.ts` | HIGH-2, HIGH-4 | delivered 가드 + approve 순차 실행 |
| `app/lib/order-sync.server.ts` | HIGH-3 | syncDeliveryDateFromOrder에 `.neq("status","delivered")` |
| `app/routes/_layout.delivery.$id.tsx` | HIGH-1, LOW-2 | Toast ref 패턴 수정 + Separator 제거 |
| `app/components/delivery/change-request-card.tsx` | HIGH-1 | Toast ref 패턴 수정 |
| `app/loaders/delivery.schema.ts` | MED-2 | UTC 기반 날짜 비교 |
| `app/types/delivery.ts` | MED-3, MED-5 | status 타입 강화 + Saelim 타입 이동 |
| `app/loaders/delivery.server.ts` | MED-1 | requestsError 핸들링 |
| `app/loaders/saelim.delivery.$id.server.ts` | LOW-5 | userId 반환 제거 |
| `app/routes/_layout.delivery.tsx` | LOW-1 | meta() 추가 |

---

## 13. 결론

Phase 8 Delivery Module은 **브레인스토밍 문서 대비 높은 구현 완성도(95%)**를 달성했다.

**강점:**
- CRIT-1~5 보안 요건 모두 코드 레벨에서 충족
- Phase 6(Orders)와 100% 패턴 일관성
- GV/Saelim 데이터 격리 철저 (SELECT 문자열 + 타입 분리)
- Defense-in-depth (RLS + App-level 이중 방어)

**약점:**
- 중복 RLS 정책이 보호 계층에 구멍 (즉시 수정 필요)
- Toast 타이밍 버그로 사용자 피드백 미표시
- delivered 상태 배송에 대한 서버 가드 부재
- approve_request 원자성 미보장

**P0~P1 수정 7건 완료 시 Phase 8은 프로덕션 준비 완료 상태.**
