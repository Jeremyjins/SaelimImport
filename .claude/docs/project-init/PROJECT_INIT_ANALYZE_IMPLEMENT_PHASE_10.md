# Phase 10: Polish & QA - 구현검증 개선 실행 보고서

**Date:** 2026-03-06
**Based on:** PROJECT_INIT_ANALYZE_PHASE_10.md
**Result:** 416/416 tests PASS

---

## 실행 팀 구성

| 역할 | 담당 |
|------|------|
| Architect / Lead | 분석문서 검토, 우선순위 결정, file ownership 할당 |
| Backend Dev | order-sync.server.ts SF-8, 테스트 mock 업데이트 |
| Frontend Dev | PO/PI/Shipping 상세, Saelim 포털, 목록 페이지, customs 컴포넌트 |
| Tester | vitest 실행 및 검증 |

---

## 수정 항목 전체 목록

### MUST FIX (3건) - 완료

| # | 파일 | 수정 내용 |
|---|------|----------|
| MF-1 | `app/routes/_layout.po.$id.tsx:78` | `fetcher.formData?.get` → `(fetcher.formData as unknown as FormData \| null)?.get` |
| MF-2 | `app/routes/_layout.pi.$id.tsx:87` | 동일 fetcher cast 수정 |
| MF-3 | `app/routes/_layout.shipping.$id.tsx:91` | 동일 fetcher cast 수정 |

### SHOULD FIX (8건) - 완료

| # | 파일 | 수정 내용 |
|---|------|----------|
| SF-1 | `app/components/customs/customs-detail-info.tsx:24` | `text-sm font-semibold text-zinc-700` → `text-base` (CardTitle 표준화) |
| SF-2 | `app/components/customs/customs-fee-summary.tsx:69` | 동일 CardTitle 표준화 |
| SF-3 | `app/routes/_layout.po.$id.tsx` | 하단 메타 `text-zinc-400` → `text-zinc-500` |
| SF-4 | `app/routes/_layout.shipping.$id.tsx` | 동일 |
| SF-5 | `app/routes/_layout.po.$id.tsx` | fetcherError 인라인 div → `<ErrorBanner>` + import 추가 |
| SF-6 | `app/routes/_layout.pi.$id.tsx` | 동일 |
| SF-7 | `app/routes/_layout.shipping.$id.tsx` | 동일 |
| SF-8 | `app/lib/order-sync.server.ts` | `unlinkPOFromOrder`, `unlinkPIFromOrder`, `unlinkShippingFromOrder` 각각 `.is("deleted_at", null)` 추가 |

### NIT (10건) - 완료

| # | 파일 | 수정 내용 |
|---|------|----------|
| N-1 | `app/routes/_saelim.delivery.$id.tsx:37` | `space-y-6` → `flex flex-col gap-6` |
| N-1b | `app/routes/_saelim.delivery.$id.tsx:58` | `space-y-4` → `flex flex-col gap-4` |
| N-2 | `app/routes/_saelim.delivery.tsx:64` | `space-y-6` → `flex flex-col gap-6` |
| N-3 | `app/routes/_saelim.delivery.tsx` | loaderError 인라인 div → `<ErrorBanner>` + import 추가 |
| N-4a | `app/routes/_layout.customs.tsx:174` | customs_no placeholder `text-zinc-400` → `text-zinc-500` |
| N-4b | `app/routes/_layout.customs.tsx:177` | 날짜 메타 `text-zinc-400` → `text-zinc-500` |
| N-4c | `app/routes/_layout.customs.tsx:250` | 모바일 카드 placeholder `text-zinc-400` → `text-zinc-500` |
| N-5a | `app/routes/_layout.orders.tsx:153` | 날짜 메타 `text-zinc-400` → `text-zinc-500` |
| N-5b | `app/routes/_layout.orders.tsx:216` | 세림번호 placeholder `text-zinc-400` → `text-zinc-500` |
| N-6a | `app/routes/_layout.shipping.tsx:149` | pl_no 텍스트 `text-zinc-400` → `text-zinc-500` |
| N-6b | `app/routes/_layout.shipping.tsx:200` | 모바일 카드 pl_no `text-zinc-400` → `text-zinc-500` |
| N-7a | `app/routes/_layout.pi.$id.tsx:234` | 빈상태 텍스트 `text-zinc-400` → `text-zinc-500` |
| N-7b | `app/routes/_layout.pi.$id.tsx:255` | pl_no 메타 `text-zinc-400` → `text-zinc-500` |
| N-7c | `app/routes/_layout.pi.$id.tsx:289` | 하단 메타 `text-zinc-400` → `text-zinc-500` |
| N-8a | `app/routes/_saelim.delivery.$id.tsx:89` | eta 표시 `text-zinc-400` → `text-zinc-500` |
| N-8b | `app/routes/_saelim.delivery.$id.tsx:150` | 요청일 텍스트 `text-zinc-400` → `text-zinc-500` |

---

## 테스트 수정

**파일:** `app/lib/__tests__/order-sync.server.test.ts`

- `createSimpleUpdateSupabase` 팩토리: `.eq()` 이후 `.is()` 체인 지원 추가
  - `const is = vi.fn().mockResolvedValue(result);`
  - `const eq = vi.fn().mockReturnValue({ is });`
- `unlinkPOFromOrder`, `unlinkPIFromOrder`, `unlinkShippingFromOrder` 테스트에 `is("deleted_at", null)` 호출 검증 추가

---

## 최종 결과

| 항목 | 이전 | 이후 |
|------|------|------|
| MUST FIX | 3건 잔존 | **0건** |
| SHOULD FIX | 8건 잔존 | **0건** |
| NIT | 10건 잔존 | **0건** |
| Tests | 416 PASS | **416 PASS** |

---

## 미결 항목 (향후 작업)

1. **Supabase DB 인덱스 검증** - `pg_indexes` 조회로 성능 인덱스 확인
2. **RLS 정책 감사** - `pg_policies` 조회로 보안 정책 전수 검토
3. **로더/액션 통합 테스트** - 서버 파일 커버리지 50% 목표
4. **N-9**: `parseJSONBField` 기존 6곳 리팩토링 (form-utils.server.ts 활용)
5. **N-10**: `_layout.home.tsx` `useLoaderData vs Route.ComponentProps` 스타일 통일
