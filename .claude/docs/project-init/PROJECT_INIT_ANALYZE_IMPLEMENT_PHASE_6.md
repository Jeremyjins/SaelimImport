# Phase 6: Order Management - 구현검증 개선 실행 보고서

**Date:** 2026-03-06
**Status:** 완료
**Base Doc:** `PROJECT_INIT_ANALYZE_PHASE_6.md`

---

## 에이전트 팀 구성

| # | Role | 담당 이슈 | 파일 소유권 |
|---|------|----------|------------|
| 1 | **Architect** | M2 리팩토링 설계 (cascadeLink 통합) | `order-sync.server.ts` |
| 2 | **Backend Dev** | H1, M1, H2, M2, M3, L1 구현 | `order-sync.server.ts`, `orders.server.ts`, `orders.$id.server.ts` |
| 3 | **Frontend Dev** | L3 수정 | `order-date-timeline.tsx` |

**제외:** Tester, Perf-analyzer, Security Reviewer, Code Reviewer, Researcher (이번 단계 불필요)

---

## 구현 완료 항목

### HIGH (2건) — 완료

#### H1. `order-sync.server.ts` try/catch 추가 ✅
- **파일:** `app/lib/order-sync.server.ts`
- **변경:** 4개 함수(`syncCustomsFeeToOrder`, `syncDeliveryDateToOrder`, `linkCustomsToOrder`, `linkDeliveryToOrder`) 모두 try/catch + console.error 래핑
- **결과:** sync 실패 시 호출측 액션이 중단되지 않음 (best-effort 패턴 보장)

#### H2. `link_document` tableName 타입 캐스팅 개선 ✅
- **파일:** `app/loaders/orders.$id.server.ts`
- **변경:** `tableName as "proforma_invoices"` → `supabase.from(tableName as any) as any`
- `DOC_TYPE_TO_TABLE` 상수를 별도 분리하여 가독성 향상
- **결과:** 잘못된 스키마 참조 없이 런타임 안전성 유지

---

### MEDIUM (3건) — 완료

#### M1. `link_document` 중복 연결 방지 ✅
- **파일:** `app/loaders/orders.$id.server.ts` (link_document 핸들러)
- **변경:** 대상 문서가 다른 활성 오더에 연결되어 있는지 사전 확인
```typescript
const { count: existingLink } = await supabase
  .from("orders")
  .select("id", { count: "exact", head: true })
  .eq(fkCol, doc_id)
  .is("deleted_at", null)
  .neq("id", id); // 현재 오더 제외
if (existingLink && existingLink > 0) {
  return data({ success: false, error: "이미 다른 오더에 연결된 서류입니다." }, { status: 400 });
}
```
- **결과:** 동일 서류의 다중 오더 연결 차단 (SS11 요구사항 충족)

#### M2. cascadeLink 중복 코드 통합 ✅
- **파일:** `app/lib/order-sync.server.ts` (신규 export), `app/loaders/orders.server.ts`, `app/loaders/orders.$id.server.ts`
- **변경:**
  - `order-sync.server.ts`에 `cascadeLinkFull`, `cascadeLinkPartial` 함수 추가
  - `orders.server.ts`: 로컬 `cascadeLink` 제거 → `cascadeLinkFull` import
  - `orders.$id.server.ts`: 로컬 `cascadeLinkPartial` 제거 → 공유 함수 import (L1 이중 캐스팅 동시 해결)
- **결과:** DRY 원칙 적용, 단일 진실 원천으로 유지보수성 향상

#### M3. `availablePos` DB 레벨 필터링 ✅
- **파일:** `app/loaders/orders.server.ts`
- **변경:** 전체 조회 후 메모리 필터 → `.not("id", "in", "(uuid,uuid,...)")` DB 쿼리 (빈 배열 예외처리 포함)
```typescript
if (usedPoIds.length > 0) {
  posQuery = posQuery.not("id", "in", `(${usedPoIds.join(",")})`);
}
```
- **결과:** 불필요한 데이터 전송 제거, PO 수 증가에 선형 확장

---

### LOW (일부 처리)

#### L1. `refresh_links` 이중 캐스팅 제거 ✅
- M2 통합 과정에서 자동 해결 (`cascadeLinkPartial` 공유 함수 사용으로 불필요한 캐스팅 제거)

#### L3. `key={i}` → `key={step.label}` ✅
- **파일:** `app/components/orders/order-date-timeline.tsx`
- Desktop(line 63), Mobile(line 88) 두 곳 모두 수정

#### L2. `fetcher.formData as unknown as FormData | null` — 유지
- MEMORY.md 확인: React Router 7에서 `fetcher.formData`가 `never` 타입이므로 이 캐스팅은 **필수**. 수정 불필요.

#### L4, L5, L6, L7 — 다음 단계
- L4 (미구현 버튼): Phase 7/8 구현 후 제거
- L5 (variant 충돌 가능성): 실제 렌더링 문제 없음, 낮은 우선순위
- L6 (날짜 유효성): Phase 7 시작 시 schema 개선
- L7 (UUID 직접입력 UX): Phase 7/8 이후 Select 컴포넌트로 개선

---

## TypeScript 컴파일 결과

```
✅ npx tsc -b → 에러 없음 (0 errors)
```

---

## DB 수동 확인 항목 (Supabase Dashboard)

MCP 권한 이슈로 코드상에서 검증 불가한 항목. Phase 7 시작 전 확인 권장:

```sql
-- 1. orders 테이블 컬럼 및 status 컬럼
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'orders' ORDER BY ordinal_position;

-- 2. RLS 정책
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'orders';

-- 3. 인덱스 (partial unique index)
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'orders';

-- 4. FK 제약조건 (ON DELETE SET NULL)
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'orders'::regclass;

-- 5. contents.type CHECK에 'order' 포함 확인
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'contents'::regclass AND contype = 'c';
```

---

## 변경 파일 요약

| 파일 | 변경 유형 | 이슈 |
|------|----------|------|
| `app/lib/order-sync.server.ts` | 기능 추가 (try/catch + cascadeLink 통합) | H1, M2 |
| `app/loaders/orders.server.ts` | 리팩토링 (cascadeLinkFull import, DB 필터) | M2, M3 |
| `app/loaders/orders.$id.server.ts` | 보안/품질 개선 (중복체크, 캐스팅, 통합) | H2, M1, M2, L1 |
| `app/components/orders/order-date-timeline.tsx` | 경미한 수정 (key prop) | L3 |

---

## 다음 단계

Phase 7 (Customs Management) 진행 가능.
잔여 이슈: L4(미구현 버튼), L6(날짜 유효성) → Phase 7 구현 시 함께 처리.
