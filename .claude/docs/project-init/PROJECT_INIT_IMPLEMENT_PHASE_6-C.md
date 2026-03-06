# Phase 6-C 구현 계획 및 현황

**Date:** 2026-03-06
**Phase:** 6-C - Cross-Module Sync
**Status:** ✅ 완료 (현재 구현 가능한 범위)

---

## 에이전트 팀 구성

| # | Role | 담당 파일 | 역할 |
|---|------|-----------|------|
| 1 | **Architect** | 구현계획 문서, 브레인스토밍 업데이트 | 동기화 아키텍처 설계, Phase 7/8 연동 명세 |
| 2 | **Backend Dev** | `app/lib/order-sync.server.ts` | 동기화 헬퍼 함수 추가 |

*제외: Frontend Dev (UI 없음), DB Engineer (마이그레이션 없음), Security Reviewer (기존 패턴 동일), Tester*

---

## 범위 분석

Phase 6-C는 브레인스토밍에서 "Optional, Phase 7/8 이후 추가"로 표시된 단계.
**현재 구현 가능한 항목**과 **Phase 7/8 이후 구현 항목**을 분리하여 진행.

### 아키텍처 결정 D3 재확인

Order 모듈은 **Read-Through JOINs** 방식을 사용 (Write-Through Sync 대신).
- `orders.arrival_date`: 사용자가 직접 입력하는 실제 도착일 (shipping.eta와 별개)
- `orders.advice_date`: 사용자가 직접 입력하는 어드바이스일 (shipping.etd와 별개)
- Order 목록/상세에서 vessel, etd, eta는 shipping JOIN으로 항상 최신값 표시

따라서 Shipping 수정 시 Order 필드 sync가 불필요 → 이미 충족됨.

---

## 구현 태스크

### Task 1: 구현계획 문서 작성 ✅

**파일:** `.claude/docs/PROJECT_INIT_IMPLEMENT_PHASE_6-C.md`

### Task 2: order-sync.server.ts 헬퍼 추가 ✅

**파일:** `app/lib/order-sync.server.ts`

**기존 (Phase 6-A에서 생성):**
- `syncCustomsFeeToOrder(supabase, customsId, value)` - Phase 7에서 호출
- `syncDeliveryDateToOrder(supabase, deliveryId, date)` - Phase 8에서 호출
- `linkCustomsToOrder(supabase, shippingDocId, customsId)` - Phase 7에서 호출

**추가 (Phase 6-C):**
- `linkDeliveryToOrder(supabase, shippingDocId, deliveryId)` - Phase 8에서 호출
  - Delivery 생성 시 연결된 Order에 delivery_id 설정
  - Exactly-1 Rule: orders.shipping_doc_id = shippingDocId인 Order에만 설정

### Task 3: 브레인스토밍 문서 업데이트 ✅

**파일:** `.claude/docs/PROJECT_INIT_BRAINSTORMING_PHASE_6.md`

Phase 7/8에서 order-sync.server.ts 함수를 호출해야 하는 시점을 상세 명세.

---

## 파일 목록 (Phase 6-C)

### 수정 파일

| 파일 | 변경 내용 | 상태 |
|------|-----------|------|
| `app/lib/order-sync.server.ts` | `linkDeliveryToOrder` 헬퍼 추가 | ✅ |
| `.claude/docs/PROJECT_INIT_BRAINSTORMING_PHASE_6.md` | Phase 7/8 연동 명세 상세화 | ✅ |

---

## Phase 7/8 구현 시 호출 위치

### Phase 7: Customs 모듈

```typescript
// app/loaders/customs.server.ts - create action
import { linkCustomsToOrder, syncCustomsFeeToOrder } from "~/lib/order-sync.server";

// Customs 생성 후:
await linkCustomsToOrder(supabase, shippingDocId, newCustomsId);

// Customs fee_received 토글 시:
await syncCustomsFeeToOrder(supabase, customsId, newValue);
```

### Phase 8: Delivery 모듈

```typescript
// app/loaders/delivery.server.ts - create action
import { linkDeliveryToOrder, syncDeliveryDateToOrder } from "~/lib/order-sync.server";

// Delivery 생성 후:
await linkDeliveryToOrder(supabase, shippingDocId, newDeliveryId);

// Delivery date 변경 시:
await syncDeliveryDateToOrder(supabase, deliveryId, newDate);
```

---

## 설계 결정

1. **Read-Through 우선**: Order 목록/상세의 vessel, etd, eta, customs_no, delivery_date는 FK JOIN으로 읽음. sync 불필요.
2. **Write-Through는 예외적으로**: orders.customs_fee_received, orders.delivery_date는 Orders 테이블에 중복 저장. 이유: 목록 필터링 성능 + 기록 목적.
3. **linkDeliveryToOrder 추가**: Delivery → Order 연결은 Delivery 생성 시 발생하는 유일한 신규 케이스.
4. **DB ON DELETE SET NULL**: 문서 삭제 시 FK null 처리는 DB 레벨에서 자동 처리. 별도 unlink 헬퍼 불필요.

---

## 보안 검토

- 기존 함수 패턴 동일: Supabase RLS + `deleted_at IS NULL` 필터 적용
- `linkDeliveryToOrder`: `is("delivery_id", null)` 조건으로 기존 연결 덮어쓰기 방지
- best-effort 패턴 유지: sync 실패해도 원본 CRUD는 롤백하지 않음
