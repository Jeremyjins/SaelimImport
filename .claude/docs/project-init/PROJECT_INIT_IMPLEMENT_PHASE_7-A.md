# Phase 7-A Implementation Plan: Types + Schema + List + Create

**Date:** 2026-03-06
**Status:** IN PROGRESS
**Branch:** main

---

## Overview

Customs(통관) 모듈의 첫 번째 구현 단계.
- TypeScript 타입 정의
- Zod 검증 스키마
- 비용 합계 유틸
- 목록 페이지 (필터: 전체/미수령/수령완료, 검색, 테이블/카드)
- 생성 페이지 (Shipping Doc 선택 + 기본정보 + 비용 입력)
- Order 자동 연결

---

## Agent Team

| Role | Scope |
|------|-------|
| Architect | 전체 설계, 타입, 라우트 구조 |
| Backend Dev | Loader/Action, Zod 스키마, DB 쿼리, Order Sync |
| Frontend Dev | List UI, CustomsForm, CustomsFeeInput 컴포넌트 |
| Security Reviewer | RLS, 인덱스, 입력 검증 |

---

## DB Migrations

- [x] `idx_orders_customs_id` - Supabase MCP로 적용 완료
- [x] `idx_customs_deleted_at` - Supabase MCP로 적용 완료

---

## File Ownership

| File | Agent | Status |
|------|-------|--------|
| `app/types/customs.ts` | Architect | [x] |
| `app/lib/customs-utils.ts` | Backend Dev | [x] |
| `app/loaders/customs.schema.ts` | Backend Dev | [x] |
| `app/loaders/customs.server.ts` | Backend Dev | [x] |
| `app/routes/_layout.customs.tsx` | Frontend Dev | [x] |
| `app/routes/_layout.customs.new.tsx` | Frontend Dev | [x] |
| `app/components/customs/customs-fee-input.tsx` | Frontend Dev | [x] |
| `app/components/customs/customs-form.tsx` | Frontend Dev | [x] |
| `app/routes.ts` | Architect | [x] |
| `app/components/ui/icons.tsx` | Frontend Dev | [x] |
| `app/lib/order-sync.server.ts` | Backend Dev | [x] |
| `app/routes/_layout.customs.$id.tsx` | Frontend Dev | [x] (placeholder) |
| `app/routes/_layout.customs.$id.edit.tsx` | Frontend Dev | [x] (placeholder) |

---

## Tasks

### Task 1: TypeScript Types [app/types/customs.ts] ✅
- [x] FeeBreakdown interface { supply, vat, total }
- [x] CustomsShippingRef - 목록용 shipping join
- [x] CustomsListItem - 목록 아이템
- [x] CustomsDetail - 상세 (Phase 7-B에서 사용)
- [x] SourceShipping - ?from_shipping 프리필용
- [x] AvailableShipping - 폼 드롭다운용

### Task 2: Fee Utility [app/lib/customs-utils.ts] ✅
- [x] calcTotalFees(transport, customs, vat, etc) → { totalSupply, totalVat, grandTotal }
- [x] computeFeeTotal(supply, vat) → number (서버 재계산용)

### Task 3: Zod Schema [app/loaders/customs.schema.ts] ✅
- [x] feeBreakdownSchema
- [x] customsCreateSchema (shipping_doc_id UUID required + fee flat fields)
- [x] customsUpdateSchema (Phase 7-B 대비)

### Task 4: Server Loader/Action [app/loaders/customs.server.ts] ✅
- [x] loader - 목록 조회 (fee_received 필터, not_received = NULL or false)
- [x] customsFormLoader - 생성 폼용 (availableShippings, fromShipping, UUID 선검증)
- [x] action - create (중복체크 + insert + fee total 서버 재계산 + linkCustomsToOrder)

### Task 5: Routes [app/routes.ts] ✅
- [x] customs/new 라우트 추가
- [x] customs/:id 라우트 추가 (placeholder)
- [x] customs/:id/edit 라우트 추가 (placeholder)

### Task 6: List Page [app/routes/_layout.customs.tsx] ✅
- [x] placeholder 교체
- [x] Tabs: 전체/미수령/수령완료
- [x] 검색: customs_no, ci_no
- [x] Desktop 테이블 (9열)
- [x] Mobile 카드
- [x] FeeReceivedBadge 컴포넌트

### Task 7: Create Page [app/routes/_layout.customs.new.tsx] ✅
- [x] Header (backTo=/customs) + PageContainer
- [x] customsFormLoader as loader, action 연결
- [x] CustomsForm 렌더링

### Task 8: Fee Input Component [app/components/customs/customs-fee-input.tsx] ✅
- [x] supply + vat 입력
- [x] total 실시간 자동계산 (useState)
- [x] flat FormData key: {prefix}_supply, {prefix}_vat
- [x] onTotalChange 콜백 (CustomsForm 총합계용)

### Task 9: Customs Form [app/components/customs/customs-form.tsx] ✅
- [x] md:grid-cols-2 레이아웃 (기본정보 + 운송비 / 관세 + 부가세)
- [x] 기본정보 카드 (선적서류 선택, 통관번호, 통관일)
- [x] 4개 fee input (운송비/관세/부가세/기타비용)
- [x] 총비용 합계 실시간 표시 (feeTotals useState)
- [x] 취소/작성 버튼
- [x] 선적서류 없을 시 버튼 disabled

### Task 10: Icons [app/components/ui/icons.tsx] ✅
- [x] Receipt, CheckCircle2, ToggleLeft, ToggleRight 추가

### Task 11: Order Sync [app/lib/order-sync.server.ts] ✅
- [x] unlinkCustomsFromOrder 함수 추가

### DB Indexes ✅
- [x] idx_orders_customs_id (Supabase MCP 적용)
- [x] idx_customs_deleted_at (Supabase MCP 적용)

---

## Key Decisions

1. **formLoader naming**: `customsFormLoader` (shipping 모듈 패턴 준수)
2. **fee flat fields**: FormData에서 flat key (`transport_supply`, `transport_vat` 등)로 전송
3. **total 재계산**: 서버에서 `Math.round((supply + vat) * 100) / 100` 재계산 (클라이언트 무시)
4. **not_received 필터**: `.or("fee_received.is.null,fee_received.eq.false")` - NULL 포함
5. **Grand total 표시**: CustomsForm에서 useState로 4개 fee 상태 관리, 실시간 합계

---

## Implementation Notes

- DB: customs 테이블 컬럼 = transport_fee, customs_fee, vat_fee, etc_fee (JSONB), fee_received (bool)
- 목록 SELECT: shipping:shipping_documents!shipping_doc_id(id, ci_no, vessel, eta)
- 생성 후 redirect: /customs/{id} (Phase 7-B에서 상세 페이지 구현)
