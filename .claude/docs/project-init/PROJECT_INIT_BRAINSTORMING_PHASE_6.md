# Phase 6: Order Management - Comprehensive Brainstorming

**Date:** 2026-03-06
**Status:** Brainstorming Complete
**Next Step:** Phase 6-A 구현 시작

---

## 1. Agent Team & File Ownership

| # | Role | File | Scope |
|---|------|------|-------|
| 1 | **Architect** | [architect-notes.md](../brainstorm/phase6/architect-notes.md) | 전체 아키텍처, 구현 단계, 데이터 플로우, 라우팅, CY 계산 |
| 2 | **Frontend Dev** | [frontend-notes.md](../brainstorm/phase6/frontend-notes.md) | 컴포넌트 설계, 타임라인 UI, 문서 링크 그리드, Inline 수정, 반응형 |
| 3 | **Backend Dev** | [backend-notes.md](../brainstorm/phase6/backend-notes.md) | 로더/액션, Zod 스키마, Cascade Link, 동기화 헬퍼, Supabase 쿼리 |
| 4 | **Security Reviewer** | [security-notes.md](../brainstorm/phase6/security-notes.md) | RLS 정책, 입력 검증, 마진 노출 방지, 데이터 격리 |
| 5 | **Researcher** | [research-notes.md](../brainstorm/phase6/research-notes.md) | CY 무료기간, PostgREST 성능, 타임라인 UI, Inline 편집 패턴 |

**제외:** Tester (코드 없음), Perf-analyzer (시기상조), Code-reviewer (코드 없음)

---

## 2. Phase 6 Overview

Order(오더)는 기존 PO/PI/Shipping/Customs/Delivery 모듈과 근본적으로 다른 **집계 허브**.

- **문서가 아닌 관리 뷰**: 자체 품목/금액 없음. 5개 모듈의 FK를 모아서 하나의 거래를 추적
- **자체 고유 데이터**: saelim_no(세림번호), advice_date, arrival_date, delivery_date, customs_fee_received
- **핵심 가치**: "내 오더가 지금 어디에 있는가?" 를 한눈에 파악

### 기존 모듈 대비 차이점

| 항목 | PO/PI/Shipping | Order |
|------|----------------|-------|
| 자체 필드 | 많음 (품목, 금액, 조건) | 적음 (번호, 날짜 3개, 토글 1개) |
| 생성 방식 | 별도 `/new` 페이지 | **Dialog** (필드 소수) |
| 수정 방식 | 별도 `/edit` 페이지 | **Inline** 수정 (상세 페이지 내) |
| 상세 핵심 UI | Info Cards + Line Items | **문서 링크 그리드 + 날짜 타임라인** |
| Content | Tiptap + 첨부 | 동일 (type="order") |

---

## 3. Implementation Sub-phases

### Phase 6-A: 목록 + 생성

**Scope:**
- Order 목록 페이지 (필터/검색/테이블/카드)
- Dialog 기반 Order 생성 (PO 선택 + 세림번호 입력)
- Auto-Cascade Link (PO→PI→Shipping→Customs/Delivery 자동 연결)
- CY Free Time 배지 (목록에서도 표시)

**신규 파일:**

| File | Description |
|------|-------------|
| `app/types/order.ts` | OrderListItem, OrderDetail, CascadeLinkResult 타입 |
| `app/loaders/orders.schema.ts` | Zod: createOrder, updateFields, linkDocument, unlinkDocument |
| `app/loaders/orders.server.ts` | 목록 loader + create action |
| `app/components/orders/order-create-dialog.tsx` | PO 선택 Dialog |
| `app/components/orders/order-cy-warning.tsx` | CY 체류일 경고 배지 |

**수정 파일:**

| File | Change |
|------|--------|
| `app/routes/_layout.orders.tsx` | Placeholder → 목록 페이지 전체 교체 |
| `app/routes.ts` | `orders/:id` 라우트 추가 |
| `app/components/ui/icons.tsx` | Calendar, Link2, Unlink, Clock 아이콘 추가 |

### Phase 6-B: 상세 + Inline 수정 + 문서 링크

**Scope:**
- Order 상세 페이지 (Dashboard 스타일)
- 날짜 타임라인 시각화 (6단계: 어드바이스→출항→도착예정→도착→통관→배송)
- 5개 문서 링크 카드 그리드 (PO/PI/Shipping/Customs/Delivery)
- Inline 수정: saelim_no, advice_date, arrival_date, delivery_date, customs_fee_received
- 수동 문서 연결/해제 (link/unlink actions)
- Content 시스템 연동 (type="order")

**신규 파일:**

| File | Description |
|------|-------------|
| `app/loaders/orders.$id.server.ts` | 상세 loader + update/link/unlink/delete/content actions |
| `app/components/orders/order-date-timeline.tsx` | 6단계 날짜 타임라인 (수평/세로 반응형) |
| `app/components/orders/order-doc-links.tsx` | 5개 문서 연결 카드 그리드 |
| `app/components/orders/order-inline-fields.tsx` | Inline 수정 가능 필드들 |
| `app/routes/_layout.orders.$id.tsx` | 상세 페이지 |

### Phase 6-C: Cross-Module Sync (Optional, Phase 7/8 이후 추가)

**Scope:**
- Shipping 수정 시 → Order vessel/etd/eta 자동 반영
- Customs 생성 시 → Order customs_id 자동 연결
- Delivery date 변경 시 → Order delivery_date 동기화

**파일:**

| File | Change |
|------|--------|
| `app/lib/order-sync.server.ts` | syncCustomsFeeToOrder, syncDeliveryDateToOrder, linkCustomsToOrder |
| `app/loaders/shipping.$id.server.ts` | 수정 시 order sync 추가 (향후) |

---

## 4. Key Architectural Decisions

### D1: Dialog 생성 (별도 페이지 X)

Order 생성에 필요한 필드가 2개(PO 선택, 세림번호)뿐. Dialog가 적합.

### D2: Inline 수정 (Edit 페이지 X)

Order 고유 필드가 5개(간단한 날짜/텍스트/토글). fetcher.submit로 즉시 저장.

### D3: Read-Through Joins (Write-Through Sync 대신)

Order 상세/목록 loader가 FK JOIN으로 최신 데이터를 직접 읽음. arrival_date, delivery_date는 수동 오버라이드용.
- 장점: 항상 최신, sync 코드 불필요, orders 테이블 가벼움
- 단점: 목록에서도 5개 JOIN 필요 (성능 OK: < 50ms for 100 rows)

### D4: Auto-Cascade "Exactly 1" Rule

PO→PI→Shipping→Customs 체인에서 각 단계에 후보가 **정확히 1개**일 때만 자동 연결.
- 1:N인 경우(복수 PI 등) → null 남기고 수동 연결
- 일반적 1:1 케이스 90%+ 자동 처리

### D5: CY Free Time 클라이언트 계산

`arrival_date` ~ `customs_date` (또는 오늘) 사이 일수 계산. Client-side로 실시간 "오늘" 기준 정확.

### D6: `status` 컬럼 추가 권장

현재 `orders` 테이블에 `status` 컬럼 없음. 기존 DocStatusBadge/필터 탭 패턴과 일관성을 위해 추가 권장:
```sql
ALTER TABLE orders ADD COLUMN status TEXT NOT NULL DEFAULT 'process';
```

---

## 5. Route Structure

```typescript
// app/routes.ts 추가
route("orders/:id", "routes/_layout.orders.$id.tsx"),

// 기존
// route("orders", "routes/_layout.orders.tsx"),  -- 이미 존재

// 불필요
// orders/new  → Dialog 방식
// orders/:id/edit  → Inline 수정
```

---

## 6. TypeScript Types Summary

```typescript
// app/types/order.ts
OrderListItem       // 목록: id, saelim_no, dates, customs_fee_received + 5개 FK join refs
OrderDetail         // 상세: extends OrderListItem + created_by, updated_at
OrderPORef          // PO 참조: id, po_no, po_date, status, currency, amount
OrderPIRef          // PI 참조: id, pi_no, pi_date, status, currency, amount
OrderShippingRef    // Shipping 참조: id, ci_no, vessel, voyage, etd, eta, status
OrderCustomsRef     // Customs 참조: id, customs_no, customs_date, fee_received
OrderDeliveryRef    // Delivery 참조: id, delivery_date
CascadeLinkResult   // 내부: pi_id, shipping_doc_id, delivery_id, customs_id (all nullable)
CYStatus            // "pending" | "ok" | "warning" | "overdue"
```

---

## 7. Zod Schemas Summary

```typescript
// app/loaders/orders.schema.ts
createOrderSchema     // po_id(uuid), saelim_no(optional, max50)
updateFieldsSchema    // saelim_no, advice_date, arrival_date, delivery_date (all optional, ISO date)
linkDocumentSchema    // doc_type(enum: pi/shipping/customs/delivery), doc_id(uuid)
unlinkDocumentSchema  // doc_type(enum)
```

---

## 8. Supabase Query Patterns

### 목록 (5 FK JOINs)

```typescript
supabase.from("orders").select(
  "id, saelim_no, advice_date, arrival_date, delivery_date, customs_fee_received, created_at, " +
  "po:purchase_orders!po_id(id, po_no, po_date, status, currency, amount), " +
  "pi:proforma_invoices!pi_id(id, pi_no, pi_date, status, currency, amount), " +
  "shipping:shipping_documents!shipping_doc_id(id, ci_no, vessel, voyage, etd, eta, status), " +
  "customs:customs!customs_id(id, customs_no, customs_date, fee_received), " +
  "delivery:deliveries!delivery_id(id, delivery_date)"
).is("deleted_at", null).order("created_at", { ascending: false });
```

### Auto-Cascade Link

```
PO → query PI where po_id (latest by date, limit 1)
  → parallel: query Shipping where pi_id + query Delivery where pi_id
    → query Customs where shipping_doc_id
```

총 3 sequential round (step 2 병렬). 150-300ms.

---

## 9. UI Design Summary

### 목록 페이지

- Header: "오더관리" + "오더 생성" 버튼 (Dialog 트리거)
- Tabs: 전체/진행/완료 (status 필터)
- 검색: saelim_no, po_no, pi_no, ci_no
- Desktop 테이블: 세림번호 | PO | PI | CI | 선박명 | ETA | 통관비 | 상태
- Mobile 카드: 세림번호 + 상태 + PO/PI + vessel + ETA

### 생성 Dialog

- PO 드롭다운 (이미 Order가 있는 PO 제외)
- 세림번호 입력 (optional)
- 제출 → 서버에서 cascade link → redirect to detail

### 상세 페이지 (핵심)

```
Header: 세림번호 + 상태 배지 + CY 경고 + 액션 버튼

Section 1: 날짜 타임라인 (6단계)
  어드바이스 → ETD → ETA → 도착 → 통관 → 배송
  Desktop: 수평, Mobile: 세로

Section 2: 문서 링크 카드 그리드 (5개)
  PO | PI | Shipping | Customs | Delivery
  연결됨: 문서번호 + 상태 + 링크, 미연결: "미연결" + "연결" 버튼
  Desktop: 5열, Tablet: 3열, Mobile: 1열

Section 3: 오더 정보 (Inline 수정)
  세림번호, 어드바이스일, 도착일, 배송일, 통관비 수령

Section 4: Content (기존 Tiptap + 첨부 + 댓글)

Section 5: 메타 (작성일, 수정일)
```

### CY 체류일 경고 배지

| 상태 | 색상 | 표시 예 |
|------|------|---------|
| pending | Gray | `D-3 도착예정` |
| ok (0-10일) | Green | `CY 5일 (14일 중)` |
| warning (11-14일) | Amber | `CY 12일 (2일 남음)` |
| overdue (14일+) | Red | `CY 18일 (4일 초과)` |

---

## 10. Actions Summary

### 목록 (`orders.server.ts`)

| `_action` | 설명 |
|-----------|------|
| `create` | PO 선택 → cascade link → order 생성 |

### 상세 (`orders.$id.server.ts`)

| `_action` | 설명 |
|-----------|------|
| `update_fields` | saelim_no, advice_date, arrival_date, delivery_date 일괄 수정 |
| `toggle_status` | process ↔ complete |
| `toggle_customs_fee` | customs_fee_received 토글 (+ customs bidirectional sync) |
| `link_document` | doc_type + doc_id → FK 연결 |
| `unlink_document` | doc_type → FK null 처리 |
| `refresh_links` | cascade 재실행 (null FK만 채움) |
| `delete` | soft delete → redirect /orders |
| `content_*` | 기존 content system 패턴 |

---

## 11. Security Checklist (Critical Items)

### DB 사전 작업 (코드 작성 전)

- [ ] `orders` RLS 활성화 확인 + `gv_all` 정책 확인
- [ ] Saelim 정책 없음 확인 (마진 노출 방지)
- [ ] `orders(po_id)` UNIQUE 제약조건 추가
- [ ] `orders.status` 컬럼 추가 (`TEXT NOT NULL DEFAULT 'process'`)
- [ ] FK ON DELETE SET NULL 확인
- [ ] 부분 인덱스 추가: `idx_orders_po_id WHERE deleted_at IS NULL`

### 애플리케이션 보안

- [ ] 모든 loader/action에 `requireGVUser()` 사용
- [ ] URL param `$id` UUID 검증
- [ ] `responseHeaders` 모든 `data()`/`redirect()`에 전달
- [ ] `po_id` 중복 오더 체크 (application + DB unique)
- [ ] `doc_type` enum 검증 (테이블명 인젝션 방지)
- [ ] link 시 대상 문서 존재 + 미연결 확인
- [ ] unlink은 FK null만 (linked doc 삭제 금지)
- [ ] `customs_fee_received` 토글은 DB에서 현재값 읽기 (client 값 무시)

---

## 12. Cross-Module Integration

### Phase 5 (Shipping) → Order

- **결론: sync 불필요**. Read-Through JOIN(D3)으로 vessel/etd/eta 항상 최신값 표시.
- `orders.advice_date`/`arrival_date`는 사용자 수동 입력 필드 (shipping.etd/eta와 별개).

### Phase 7 (Customs) → Order

Customs 모듈 구현 시 `app/loaders/customs.server.ts`에 다음 호출 추가:

```typescript
import { linkCustomsToOrder, syncCustomsFeeToOrder } from "~/lib/order-sync.server";

// Customs create action에서:
await linkCustomsToOrder(supabase, shippingDocId, newCustomsId);

// Customs toggle_fee action에서:
await syncCustomsFeeToOrder(supabase, customsId, newFeeReceivedValue);
```

### Phase 8 (Delivery) → Order

Delivery 모듈 구현 시 `app/loaders/delivery.server.ts`에 다음 호출 추가:

```typescript
import { linkDeliveryToOrder, syncDeliveryDateToOrder } from "~/lib/order-sync.server";

// Delivery create action에서:
await linkDeliveryToOrder(supabase, shippingDocId, newDeliveryId);

// Delivery update (date 변경) action에서:
await syncDeliveryDateToOrder(supabase, deliveryId, newDeliveryDate);
```

### Sync 헬퍼 (`app/lib/order-sync.server.ts`) - Phase 6-C에서 완성

| 함수 | 호출 시점 | Phase |
|------|-----------|-------|
| `linkCustomsToOrder(supabase, shippingDocId, customsId)` | Customs 생성 후 | 7 |
| `syncCustomsFeeToOrder(supabase, customsId, value)` | Customs fee_received 토글 시 | 7 |
| `linkDeliveryToOrder(supabase, shippingDocId, deliveryId)` | Delivery 생성 후 | 8 |
| `syncDeliveryDateToOrder(supabase, deliveryId, date)` | Delivery date 수정 시 | 8 |

**best-effort 패턴**: sync 실패해도 원본 CRUD 롤백 없음 (console.error만 기록).
**Exactly-1 안전장치**: 모든 link 함수는 `is("xxx_id", null)` 조건으로 기존 연결 덮어쓰기 방지.

---

## 13. Korean Labels Reference

| English | Korean |
|---------|--------|
| Order Management | 오더관리 |
| Create Order | 오더 생성 |
| Saelim No | 세림번호 |
| Advice Date | 어드바이스일 |
| Arrival Date | 도착일 |
| Delivery Date | 배송일 |
| CY Free Time | CY 프리타임 |
| CY Days | CY 체류 N일 |
| Customs Fee Received | 통관비 수령 |
| Linked Documents | 연결 서류 |
| Link | 연결 |
| Unlink | 연결 해제 |
| Not Linked | 미연결 |
| Purchase Order (PO) | 구매주문 (PO) |
| Proforma Invoice (PI) | 견적서 (PI) |
| Shipping Documents | 선적서류 |
| Customs | 통관 |
| Delivery | 배송 |
| Progress | 진행 현황 |
| Mark Complete | 완료 처리 |
| Change to In Progress | 진행으로 변경 |

---

## 14. Edge Cases & Notes

1. **PO with no PI**: Order에 PO만 연결 가능. PI는 나중에 수동/자동 연결.
2. **Multiple PIs for one PO**: Auto-cascade가 최신 PI 선택. 사용자가 수동 변경 가능.
3. **Customs/Delivery 미구현**: Doc Links 카드 표시하되 "연결" 버튼 disabled. `DOC_CONFIGS.enabled: false`.
4. **CY 계산 날짜 누락**: arrival_date/customs_date 하나라도 없으면 경고 미표시.
5. **Deleted linked doc**: FK 남아있으나 JOIN null → UI에서 "미연결" 처리.
6. **Cascade re-run**: "새로고침" 버튼으로 null FK만 재탐색 (`refresh_links` action).
7. **Order 삭제 시**: 연결된 PO/PI/Shipping 등에 영향 없음 (order는 추적 래퍼일 뿐).
8. **saelim_no 유일성**: DB 제약 없음 (포맷 비표준). 중복 허용.

---

## 15. Performance Summary

| 동작 | 예상 지연 | 비고 |
|------|----------|------|
| 목록 (5 JOIN, 100행) | < 50ms | Single SQL |
| 상세 (5 JOIN, 1행) | < 20ms | Single SQL |
| Cascade link (3 round) | 150-300ms | Sequential, step 2 병렬 |
| CY 계산 | < 1ms | Client-side |
| Inline 수정 | < 50ms | Single UPDATE |

No pagination needed initially. 500 orders까지 문제 없음.

---

## 16. Detailed Notes by Team Member

각 팀원별 상세 분석은 아래 파일 참조:
- [Architect Notes](../brainstorm/phase6/architect-notes.md) - 전체 아키텍처, 구현 순서, CY 계산, 타입 정의
- [Frontend Dev Notes](../brainstorm/phase6/frontend-notes.md) - UI 컴포넌트, 타임라인, 문서 링크, Inline 수정, 반응형
- [Backend Dev Notes](../brainstorm/phase6/backend-notes.md) - 로더/액션 코드, Cascade Link, Sync 헬퍼, Supabase 쿼리
- [Security Review Notes](../brainstorm/phase6/security-notes.md) - RLS, 입력 검증, 마진 노출 방지, 보안 체크리스트
- [Research Notes](../brainstorm/phase6/research-notes.md) - CY 무료기간, PostgREST 성능, 타임라인 UI 패턴
