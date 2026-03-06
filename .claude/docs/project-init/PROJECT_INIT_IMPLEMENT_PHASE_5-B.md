# Phase 5-B Implementation Plan: Shipping Documents — Detail + Edit + Cross-Module

**Date:** 2026-03-06
**Status:** 구현 완료
**Scope:** 선적서류 상세/수정 페이지 + PI 크로스모듈 연동

---

## Agent Team

| # | Role | Scope |
|---|------|-------|
| 1 | **Architect** | 데이터 플로우, 파일 소유권, 라우팅 확인 |
| 2 | **Backend Dev** | shipping.$id.server.ts (loader/editLoader/action) |
| 3 | **Frontend Dev** | detail-info/items/weight-summary 컴포넌트, detail/edit 라우트, PI 크로스모듈 UI |
| 4 | **Security Reviewer** | requireGVUser, UUID 검증, complete 상태 차단 |

---

## File Ownership

| Agent | Files |
|-------|-------|
| Backend Dev | `app/loaders/shipping.$id.server.ts` |
| Frontend Dev | `app/components/shipping/shipping-detail-info.tsx`, `app/components/shipping/shipping-detail-items.tsx`, `app/components/shipping/shipping-weight-summary.tsx`, `app/routes/_layout.shipping.$id.tsx`, `app/routes/_layout.shipping.$id.edit.tsx`, `app/routes/_layout.pi.$id.tsx` |
| Backend Dev (cross-module) | `app/loaders/pi.$id.server.ts` |

---

## Task List

| # | Task | File | Status |
|---|------|------|--------|
| B-1 | 상세/수정 loader + 전체 action | `app/loaders/shipping.$id.server.ts` | ✅ 완료 |
| B-2 | 기본정보 + 거래조건 + 선적정보 카드 | `app/components/shipping/shipping-detail-info.tsx` | ✅ 완료 |
| B-3 | 품목 읽기전용 테이블 | `app/components/shipping/shipping-detail-items.tsx` | ✅ 완료 |
| B-4 | 중량/포장 요약 카드 | `app/components/shipping/shipping-weight-summary.tsx` | ✅ 완료 |
| B-5 | 상세 페이지 (placeholder 교체) | `app/routes/_layout.shipping.$id.tsx` | ✅ 완료 |
| B-6 | 수정 페이지 (placeholder 교체) | `app/routes/_layout.shipping.$id.edit.tsx` | ✅ 완료 |
| B-7 | PI loader: 연결 선적서류 조회 추가 | `app/loaders/pi.$id.server.ts` | ✅ 완료 |
| B-8 | PI 상세: 선적서류 작성 버튼 + 연결 카드 | `app/routes/_layout.pi.$id.tsx` | ✅ 완료 |

---

## Implementation Details

### B-1: `app/loaders/shipping.$id.server.ts`

#### loader
- requireGVUser, UUID 검증
- shipping_documents SELECT (전체 필드 + org join + pi join)
- loadContent(supabase, "shipping", id) 병렬
- 반환: { shipping, content, userId }

#### shippingEditLoader
- requireGVUser, UUID 검증
- shipping_documents SELECT (폼 필드)
- 병렬: shippers(seller), consignees(buyer), products, pis
- 반환: { shipping, shippers, consignees, products, pis }

#### action (intents)
- `content_*` → handleContentAction("shipping")
- `update` → complete 차단 → details/schema 검증 → 교차검증(net≤gross) → org 검증 → 서버사이드 amount 재계산 → DB update → redirect /shipping/:id
- `delete` → soft delete → deliveries.shipping_doc_id = null (unlink) → redirect /shipping
- `clone` → 원본 조회 → generate_doc_number(CI, today) → PL 치환 → insert(pi_id=null) → redirect /shipping/:id/edit
- `toggle_status` → process↔complete 토글 → data({ success: true })

### B-2: `app/components/shipping/shipping-detail-info.tsx`

3열 그리드 (1열 모바일):
- **기본 정보**: CI No, PL No, CI Date, Ship Date, 참조번호, 참조 PI (blue link)
- **거래 조건**: 송하인, 수하인, 통화, 결제조건, 인도조건, 선적항, 양륙항
- **선적 정보**: 선박명, 항차, ETD, ETA

### B-3: `app/components/shipping/shipping-detail-items.tsx`

PIDetailItems 패턴 동일 (ShippingLineItem 타입 사용):
- Desktop 테이블: #, 품목, 수량(KG), 판매단가, 금액
- Mobile 카드 목록
- 합계 행

### B-4: `app/components/shipping/shipping-weight-summary.tsx`

단일 카드:
- 총중량(KG), 순중량(KG), 포장수 — 3열 그리드
- null인 경우 "-" 표시

### B-5: `app/routes/_layout.shipping.$id.tsx`

PI 상세 패턴 그대로:
- Header: CI No / PL No, DocStatusBadge, 상태토글 버튼, 드롭다운(수정/복제/삭제)
- ShippingDetailInfo (3카드)
- ShippingDetailItems (품목)
- ShippingWeightSummary (중량)
- 비고 카드 (notes 있을 때)
- ContentSection("shipping")
- 메타 정보 (작성/수정일)
- 삭제 AlertDialog

### B-6: `app/routes/_layout.shipping.$id.edit.tsx`

PI edit 패턴:
- shippingEditLoader + action export
- Header: "선적서류 수정 — {ci_no}"
- ShippingForm(defaultValues, actionName="update", cancelTo=/shipping/:id)

### B-7: PI Loader cross-module

pi.$id.server.ts loader에 Promise.all 항목 추가:
```
shipping_documents WHERE pi_id = id, is deleted_at null
SELECT id, ci_no, pl_no, ci_date, status, vessel
ORDER BY ci_date DESC
```
반환: `{ ..., linkedShippingDocs }`

### B-8: PI Detail cross-module UI

PI 상세 드롭다운:
- DropdownMenuSeparator → "선적서류 작성" 링크 (`/shipping/new?from_pi={pi.id}`)

PI 상세 페이지 하단 (ContentSection 위):
- 연결 선적서류 카드 (linkedShippingDocs.length > 0 || 항상 표시)
- 테이블: CI/PL No, CI Date, 선박명, 상태
- 없는 경우: "연결된 선적서류가 없습니다" 메시지

---

## Security Checklist

- [x] requireGVUser: 모든 loader/action
- [x] UUID 검증: z.string().uuid()
- [x] complete 상태 수정/삭제 차단: update action
- [x] net_weight <= gross_weight: 교차 검증
- [x] org 활성 검증: shipper_id, consignee_id
- [x] Amount 서버사이드 재계산
- [x] responseHeaders: 모든 data()/redirect()에 전달
- [x] Delivery unlink: delete 시 shipping_doc_id = null (hard delete 아님)
