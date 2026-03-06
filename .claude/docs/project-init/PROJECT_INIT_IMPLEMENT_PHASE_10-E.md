# Phase 10-E: Code Quality & Data Integrity - Implementation Plan

**Date:** 2026-03-06
**Status:** In Progress
**Brainstorming Ref:** `.claude/docs/PROJECT_INIT_BRAINSTORMING_PHASE_10.md` § Phase 10-E
**Dependencies:** None (parallel with 10-A)

---

## Scope

| ID | Priority | Description |
|----|----------|-------------|
| P1-5 | High | SYNC-1: PO/PI/Shipping 삭제 시 연결된 Order FK 해제 |
| P3-4 | Low | parseJSONBField 공유 헬퍼 추출 |
| P3-5 | Low | validateOrgExists 공유 헬퍼 추출 |

---

## Agent Team

| Role | 담당 |
|------|------|
| Backend Dev | SYNC-1 fix (order-sync.server.ts, po/pi/shipping delete actions) |
| Code Reviewer | form-utils.server.ts helper 설계 |

---

## File Ownership

| File | 작업 내용 |
|------|----------|
| `app/lib/order-sync.server.ts` | unlinkPOFromOrder, unlinkPIFromOrder, unlinkShippingFromOrder 추가 |
| `app/lib/form-utils.server.ts` | 신규: parseJSONBField, validateOrgExists 헬퍼 |
| `app/loaders/po.$id.server.ts` | delete 액션에서 unlinkPOFromOrder 호출 |
| `app/loaders/pi.$id.server.ts` | delete 액션에서 unlinkPIFromOrder 호출 |
| `app/loaders/shipping.$id.server.ts` | delete 액션에서 unlinkShippingFromOrder 호출 |

---

## Tasks

### Task 1: SYNC-1 - order-sync.server.ts에 unlink 함수 추가
- [x] `unlinkPOFromOrder(supabase, poId)` - fire-and-forget
- [x] `unlinkPIFromOrder(supabase, piId)` - fire-and-forget
- [x] `unlinkShippingFromOrder(supabase, shippingId)` - fire-and-forget

### Task 2: SYNC-1 - PO delete에 unlink 적용
- [x] `po.$id.server.ts` delete 액션에서 soft-delete 성공 후 `unlinkPOFromOrder` 호출

### Task 3: SYNC-1 - PI delete에 unlink 적용
- [x] `pi.$id.server.ts` delete 액션에서 soft-delete 성공 후 `unlinkPIFromOrder` 호출

### Task 4: SYNC-1 - Shipping delete에 unlink 적용
- [x] `shipping.$id.server.ts` delete 액션에서 soft-delete 성공 후 `unlinkShippingFromOrder` 호출

### Task 5: form-utils.server.ts 헬퍼 생성 (P3-4, P3-5)
- [x] `parseJSONBField<T>(formData, schema, fieldName?)` 유틸리티
- [x] `validateOrgExists(supabase, orgId)` 유틸리티

---

## Design Decisions

### SYNC-1 패턴: fire-and-forget
PO/PI/Shipping 삭제 시 Order unlink는 non-blocking. 이미 soft-delete 완료 후 실행되므로,
unlink 실패 시 console.error만 출력하고 redirect는 정상 진행.
(Customs/Delivery unlink와 달리 삭제 선행 조건이 아님)

### PI delete 시 delivery_id orphan
PI 삭제 시 연결된 delivery도 soft-delete되지만 orders.delivery_id는 별도 처리되지 않음.
`unlinkPIFromOrder`는 orders.pi_id = null만 처리. delivery_id orphan은 delivery delete 흐름에서 처리됨.
(현재 10-E 스코프 밖 - 향후 개선 가능)

### form-utils.server.ts - 헬퍼만 생성, 기존 코드 리팩토링 없음
P3 우선순위 항목. 신규 유틸 파일 생성 후, 신규 기능 개발 시 활용. 기존 6개 중복 블록 리팩토링은 별도 스프린트.

---

## Implementation Notes

### unlinkPOFromOrder
- `orders.po_id = null` WHERE `orders.po_id = poId`
- `deleted_at` 필터 없음 (orders는 deleted_at으로 별도 관리)

### unlinkPIFromOrder
- `orders.pi_id = null` WHERE `orders.pi_id = piId`

### unlinkShippingFromOrder
- `orders.shipping_doc_id = null` WHERE `orders.shipping_doc_id = shippingId`
- 기존 delivery unlink (deliveries.shipping_doc_id = null)와 구분됨

---

## Completion Summary

**완료일:** 2026-03-06

### 변경 파일
1. **`app/lib/order-sync.server.ts`** - unlinkPOFromOrder, unlinkPIFromOrder, unlinkShippingFromOrder 3개 함수 추가
2. **`app/lib/form-utils.server.ts`** - 신규 생성 (parseJSONBField, validateOrgExists)
3. **`app/loaders/po.$id.server.ts`** - delete 액션에 unlinkPOFromOrder 호출 추가
4. **`app/loaders/pi.$id.server.ts`** - delete 액션에 unlinkPIFromOrder 호출 추가
5. **`app/loaders/shipping.$id.server.ts`** - delete 액션에 unlinkShippingFromOrder 호출 추가

### 효과
- PO 삭제 시 연결된 Order의 po_id가 자동으로 null 처리됨
- PI 삭제 시 연결된 Order의 pi_id가 자동으로 null 처리됨
- Shipping 삭제 시 연결된 Order의 shipping_doc_id가 자동으로 null 처리됨
- 고아 FK 참조 문제(SYNC-1) 해결
