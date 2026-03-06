# Phase 5-A Implementation Plan: Shipping Documents — List + Create

**Date:** 2026-03-06
**Status:** 완료 (2026-03-06)
**Scope:** 선적서류 목록 페이지 + 작성 페이지 (CI/PL dual document)

---

## Agent Team

| # | Role | Scope |
|---|------|-------|
| 1 | **Architect** | Phase 구조, 데이터 플로우, 라우팅, DB 검증 |
| 2 | **Backend Dev** | loaders/shipping.server.ts, schema.ts, types |
| 3 | **Frontend Dev** | shipping-form, shipping-line-items, list page, new page |
| 4 | **Security Reviewer** | RLS 확인, 입력 검증, requireGVUser |

---

## DB 사전 작업

### stuffing_lists 보안 강화 (Phase 5-C 전 필요)
```sql
ALTER TABLE stuffing_lists
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);
```

### DB 상태 확인 결과
- [x] shipping_documents: RLS 활성 (gv_all + saelim_read)
- [x] stuffing_lists: RLS 활성 (gv_all)
- [x] generate_doc_number: 'CI' doc_type 지원 → 'GVCI{YYMM}-{SEQ}'
- [x] shipping_documents 컬럼: ci_no, pl_no, ci_date, pi_id, shipper_id, consignee_id, vessel, voyage, etd, eta, ship_date, net_weight, gross_weight, package_no, deleted_at, created_by 모두 존재

---

## Task List

### Phase 5-A Tasks

| # | Task | File | Status |
|---|------|------|--------|
| 1 | DB Migration: stuffing_lists에 deleted_at, created_by 추가 | Supabase MCP | ✅ 완료 |
| 2 | TypeScript 타입 정의 | `app/types/shipping.ts` | ✅ 완료 |
| 3 | Zod 스키마 | `app/loaders/shipping.schema.ts` | ✅ 완료 |
| 4 | List loader + Form loader + Create action | `app/loaders/shipping.server.ts` | ✅ 완료 |
| 5 | 품목 편집기 컴포넌트 | `app/components/shipping/shipping-line-items.tsx` | ✅ 완료 |
| 6 | 작성/수정 공용 폼 | `app/components/shipping/shipping-form.tsx` | ✅ 완료 |
| 7 | 목록 페이지 (placeholder 대체) | `app/routes/_layout.shipping.tsx` | ✅ 완료 |
| 8 | 작성 페이지 | `app/routes/_layout.shipping.new.tsx` | ✅ 완료 |
| 9 | 라우트 추가 | `app/routes.ts` | ✅ 완료 |

---

## File Ownership (Phase 5-A)

| Agent | Files |
|-------|-------|
| Backend Dev | `app/types/shipping.ts`, `app/loaders/shipping.schema.ts`, `app/loaders/shipping.server.ts` |
| Frontend Dev | `app/components/shipping/shipping-line-items.tsx`, `app/components/shipping/shipping-form.tsx`, `app/routes/_layout.shipping.tsx`, `app/routes/_layout.shipping.new.tsx` |
| Architect | `app/routes.ts` |

---

## Implementation Details

### Types (app/types/shipping.ts)
- `ShippingLineItem` — PI와 동일 구조 재사용
- `ShippingListItem` — 목록용 (ci_no, pl_no, ci_date, status, vessel, amount, shipper, consignee, pi)
- `ShippingWithOrgs` — 상세용 (전체 필드 + org join + pi join)
- `ShippingEditData` — 수정 폼용
- `SourcePI` — PI에서 Shipping 생성 시 참조 데이터

### Schema (app/loaders/shipping.schema.ts)
- `lineItemSchema` — po.schema에서 재사용 (export)
- `shippingSchema` — ci_date, ship_date, vessel, voyage, etd, eta, shipper_id, consignee_id, pi_id, currency, terms, ports, weights

### Server (app/loaders/shipping.server.ts)
- `loader` — 목록 조회 (org join + pi join, soft delete 제외)
- `shippingFormLoader` — 폼용 데이터 (shippers, consignees, products, pis, sourcePI)
- `createShippingAction` — CI/PL번호 생성, DB insert, delivery link

### Form (app/components/shipping/shipping-form.tsx)
- 4 Card 섹션: 기본정보 / 거래당사자 / 거래조건 / 선적정보
- PI 참조 배너 (from_pi 있을 때)
- ShippingLineItems 품목 편집기
- 비고 Textarea

### List Page (app/routes/_layout.shipping.tsx)
- Tabs (전체/진행/완료), 검색 (ci_no/pl_no)
- Desktop: CI/PL No, CI Date, PI No, 송하인, 선박명, 총액, 상태
- Mobile: 카드 (CI/PL No + Status, 선박명, 총액)

---

## Key Decisions

1. **CI/PL 번호**: `generate_doc_number('CI', ci_date)` → 'GVCI2603-001', PL은 string replace → 'GVPL2603-001'
2. **Delivery link**: create 시 `deliveries WHERE pi_id = shipping.pi_id` 업데이트
3. **PI 참조 프리필**: `?from_pi=uuid` → supplier_id→shipper_id, buyer_id→consignee_id, details 복사
4. **중량 필드**: 폼에서 수동 입력 가능 (gross_weight, net_weight, package_no)
5. **org 타입**: shipper = seller (GV), consignee = buyer (Saelim) — PI와 동일

---

## Phase 5-B Tasks (Next)

| # | Task | File | Status |
|---|------|------|--------|
| B-1 | 상세/수정 loader + action | `app/loaders/shipping.$id.server.ts` | 미시작 |
| B-2 | 기본정보 카드 | `app/components/shipping/shipping-detail-info.tsx` | 미시작 |
| B-3 | 품목 읽기전용 | `app/components/shipping/shipping-detail-items.tsx` | 미시작 |
| B-4 | 상세 페이지 | `app/routes/_layout.shipping.$id.tsx` | 미시작 |
| B-5 | 수정 페이지 | `app/routes/_layout.shipping.$id.edit.tsx` | 미시작 |
| B-6 | PI 상세 크로스모듈 | `app/loaders/pi.$id.server.ts`, `app/routes/_layout.pi.$id.tsx` | 미시작 |
