# Phase 6-A 구현 계획 및 현황

**Date:** 2026-03-06
**Phase:** 6-A - 오더관리 목록 + 생성
**Status:** ✅ 완료

---

## 에이전트 팀 구성

| # | Role | 담당 파일 | 역할 |
|---|------|-----------|------|
| 1 | **Architect** | `app/types/order.ts`, `app/loaders/orders.schema.ts`, `app/routes.ts` | 타입/스키마 설계, 라우트 구성 |
| 2 | **Backend Dev** | `app/loaders/orders.server.ts`, `app/lib/order-sync.server.ts` | 로더/액션, cascade link, sync 헬퍼 |
| 3 | **Frontend Dev** | `app/routes/_layout.orders.tsx`, `app/components/orders/order-create-dialog.tsx`, `app/components/orders/order-cy-warning.tsx` | 목록 페이지, 생성 다이얼로그, CY 배지 |
| 4 | **DB Engineer** | Supabase Migration | status 컬럼 추가, 인덱스 생성 |

*제외: Tester, Perf-analyzer, Security-reviewer, Code-reviewer (Phase 6-A 범위 한정)*

---

## DB 사전 작업

### ✅ Migration: `add_orders_status_and_indexes`

```sql
-- orders.status 컬럼 추가
ALTER TABLE orders ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'process'
  CHECK (status = ANY (ARRAY['process'::text, 'complete'::text]));

-- PO당 활성 오더 1개 제약 (partial unique)
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_po_id_unique
  ON orders(po_id) WHERE deleted_at IS NULL AND po_id IS NOT NULL;

-- 목록 성능 인덱스
CREATE INDEX IF NOT EXISTS idx_orders_created_at
  ON orders(created_at DESC) WHERE deleted_at IS NULL;
```

**확인 사항:**
- ✅ RLS 활성화: `gv_all` 정책 (GV 유저만 전체 접근)
- ✅ Saelim 정책 없음 (마진 노출 방지)
- ✅ FK ON DELETE SET NULL (기존 설정 유지)
- ✅ `contents.type` CHECK에 `'order'` 이미 포함

---

## 구현 태스크

### Task 1: TypeScript Types ✅
**파일:** `app/types/order.ts`
- [x] `OrderListItem` - 목록용 타입 (5개 FK join refs 포함)
- [x] `OrderDetail` - 상세용 타입 (extends OrderListItem + FK id 필드)
- [x] `OrderPORef`, `OrderPIRef`, `OrderShippingRef`, `OrderCustomsRef`, `OrderDeliveryRef`
- [x] `CascadeLinkResult` - cascade link 결과
- [x] `CYStatus` - "pending" | "ok" | "warning" | "overdue"

### Task 2: Zod Schemas ✅
**파일:** `app/loaders/orders.schema.ts`
- [x] `createOrderSchema` - po_id(uuid), saelim_no(optional, max50)
- [x] `updateFieldsSchema` - Phase 6-B용 (사전 작성)
- [x] `linkDocumentSchema` - Phase 6-B용 (사전 작성)
- [x] `unlinkDocumentSchema` - Phase 6-B용 (사전 작성)

### Task 3: Backend Loader + Action ✅
**파일:** `app/loaders/orders.server.ts`
- [x] `loader` - orders 5개 FK JOIN 목록 쿼리
- [x] FK JOIN alias cast (`as unknown as OrderListItem[]`)
- [x] `cascadeLink()` - PO→PI→(Shipping+Delivery)→Customs 3단계 자동 연결
  - Exactly-1 Rule: 후보 2개 이상이면 null 유지
  - Step 2 병렬화 (Promise.all)
- [x] `action` - `_action: "create"` 처리
  - PO 존재 검증
  - 중복 오더 체크 (application-level)
  - DB unique index 중복 에러(23505) 처리
  - 생성 후 `/orders/:id` redirect

### Task 4: Order Sync Helpers ✅
**파일:** `app/lib/order-sync.server.ts`
- [x] `syncCustomsFeeToOrder()` - Phase 7에서 사용
- [x] `syncDeliveryDateToOrder()` - Phase 8에서 사용
- [x] `linkCustomsToOrder()` - Phase 7에서 사용

### Task 5: CY Warning Badge ✅
**파일:** `app/components/orders/order-cy-warning.tsx`
- [x] `calcCY()` - arrival_date ~ customs_date 일수 계산 (클라이언트)
- [x] D-N 도착예정 (pending)
- [x] CY N일 (14일 중) green (ok, 0-10일)
- [x] CY N일 (N일 남음) amber (warning, 11-14일)
- [x] CY N일 (N일 초과) red (overdue, 14일+)
- [x] arrival_date 없으면 미표시

### Task 6: Order Create Dialog ✅
**파일:** `app/components/orders/order-create-dialog.tsx`
- [x] PO 드롭다운 (이미 오더가 있는 PO 제외)
- [x] 세림번호 입력 (optional, max 50)
- [x] useFetcher로 POST /orders (action)
- [x] 서버 에러 표시
- [x] 제출 중 로딩 상태

### Task 7: Orders List Page ✅
**파일:** `app/routes/_layout.orders.tsx`
- [x] Header "오더관리" + "오더 생성" 버튼
- [x] Tabs: 전체/진행/완료 (status filter)
- [x] 검색: saelim_no, po_no, pi_no, ci_no
- [x] Desktop 테이블: 세림번호 | PO | PI | CI | 선박명 | ETA | CY | 상태
- [x] Mobile 카드: 세림번호 + 상태 + PO/PI + vessel + ETA + CY
- [x] 클릭 → `/orders/:id` navigate
- [x] `OrderCreateDialog` 연동
- [x] `loader` + `action` export

### Task 8: Detail Page Placeholder ✅
**파일:** `app/routes/_layout.orders.$id.tsx`
- [x] Phase 6-B 구현 예정 placeholder

### Task 9: Route Config 업데이트 ✅
**파일:** `app/routes.ts`
- [x] `route("orders/:id", "routes/_layout.orders.$id.tsx")` 추가

### Task 10: Icons 추가 ✅
**파일:** `app/components/ui/icons.tsx`
- [x] Calendar, Link2, Unlink, Clock, RefreshCw 추가 (Phase 6-B에서 사용)

---

## 파일 목록 (Phase 6-A)

### 신규 파일
| 파일 | 담당 | 상태 |
|------|------|------|
| `app/types/order.ts` | Architect | ✅ |
| `app/loaders/orders.schema.ts` | Architect | ✅ |
| `app/loaders/orders.server.ts` | Backend Dev | ✅ |
| `app/lib/order-sync.server.ts` | Backend Dev | ✅ |
| `app/components/orders/order-cy-warning.tsx` | Frontend Dev | ✅ |
| `app/components/orders/order-create-dialog.tsx` | Frontend Dev | ✅ |
| `app/routes/_layout.orders.$id.tsx` | Frontend Dev | ✅ (placeholder) |

### 수정 파일
| 파일 | 변경 내용 | 상태 |
|------|-----------|------|
| `app/routes/_layout.orders.tsx` | Placeholder → 목록 페이지 전체 교체 | ✅ |
| `app/routes.ts` | `orders/:id` 라우트 추가 | ✅ |
| `app/components/ui/icons.tsx` | Calendar, Link2, Unlink, Clock, RefreshCw 추가 | ✅ |

---

## 검증

### Typecheck
- ✅ `npm run typecheck` 오류 없음
- FK JOIN alias TypeScript 오류 → `as unknown as OrderListItem[]` 캐스팅으로 해결

### 주요 설계 결정
1. **Cascade Link**: Exactly-1 Rule - 후보가 정확히 1개일 때만 자동 연결 (90%+ 케이스)
2. **Available PO 필터링**: 로더에서 서버사이드로 필터링 (클라이언트 단순화)
3. **CY 계산**: 클라이언트사이드 (실시간 "오늘" 기준 정확)
4. **중복 오더 방지**: application-level check + DB partial unique index 이중 보호

---

## Phase 6-B 준비사항
- `app/routes/_layout.orders.$id.tsx` placeholder 존재
- `app/loaders/orders.$id.server.ts` 생성 필요
- `app/components/orders/order-date-timeline.tsx` 생성 필요
- `app/components/orders/order-doc-links.tsx` 생성 필요
- `app/components/orders/order-inline-fields.tsx` 생성 필요
- `updateFieldsSchema`, `linkDocumentSchema`, `unlinkDocumentSchema` 이미 준비됨
