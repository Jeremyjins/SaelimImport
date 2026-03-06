# Phase 7: Customs Management - Comprehensive Brainstorming

**Date:** 2026-03-06
**Status:** Brainstorming Complete
**Next Step:** Phase 7-A 구현 시작

---

## 1. Agent Team & File Ownership

| # | Role | File | Scope |
|---|------|------|-------|
| 1 | **Architect** | [architect-notes.md](../brainstorm/phase7/architect-notes.md) | 전체 아키텍처, 구현 단계, 라우트 구조, 타입 정의, Order 통합 |
| 2 | **Frontend Dev** | [frontend-notes.md](../brainstorm/phase7/frontend-notes.md) | UI 컴포넌트, 비용 입력 폼, 비용 요약, 반응형 |
| 3 | **Backend Dev** | [backend-notes.md](../brainstorm/phase7/backend-notes.md) | Loader/Action, Zod 스키마, JSONB 비용 검증, Order Sync |
| 4 | **Security Reviewer** | [security-notes.md](../brainstorm/phase7/security-notes.md) | RLS 확인, 입력 검증, Saelim 접근 차단, 인덱스 |
| 5 | **Researcher** | [research-notes.md](../brainstorm/phase7/research-notes.md) | 한국 통관 비용 구조, 세금계산서 표준, 도메인 지식 |

**제외:** Tester (코드 없음), Perf-analyzer (시기상조), Code-reviewer (코드 없음)

---

## 2. Phase 7 Overview

Customs(통관)는 Shipping Document에서 파생되어 통관 비용을 관리하는 모듈.

- **핵심 역할**: 선적서류 기반으로 통관 레코드 생성, 4가지 비용(운송비/관세/부가세/기타) 관리
- **비용 구조**: 각 비용은 JSONB `{supply, vat, total}` (한국 세금계산서 표준 대응)
- **Order 연동**: 생성 시 자동 연결, fee_received 양방향 sync
- **GV 전용**: Saelim 접근 불가 (비용 = 민감 데이터)

### 기존 모듈 대비 비교

| 항목 | PO/PI/Shipping | Order | Customs |
|------|----------------|-------|---------|
| 자체 필드 | 많음 (품목, 금액, 조건) | 적음 (날짜 3개, 토글 1개) | 중간 (비용 4개 JSONB + 기본정보) |
| 생성 방식 | 별도 `/new` 페이지 | Dialog (필드 소수) | **별도 `/new` 페이지** |
| 수정 방식 | 별도 `/edit` 페이지 | Inline 수정 | **별도 `/edit` 페이지** |
| 문서번호 | 자동 생성 (GVPO, GVCI) | 없음 | **사용자 입력** (외부 번호) |
| Status | process/complete | process/complete | **없음** (fee_received 기반) |

---

## 3. Implementation Sub-phases

### Phase 7-A: Types + Schema + List + Create

**Scope:**
- TypeScript 타입 정의 (`app/types/customs.ts`)
- Zod 검증 스키마 (`app/loaders/customs.schema.ts`)
- 비용 합계 유틸 (`app/lib/customs-utils.ts`)
- 목록 페이지 (필터: 전체/미수령/수령완료, 검색, 테이블/카드)
- 생성 페이지 (Shipping Doc 선택 + 기본정보 + 비용 입력)
- Shipping 참조 생성 (`?from_shipping=uuid`)
- Order 자동 연결 (`linkCustomsToOrder`)
- `routes.ts` 라우트 추가

**신규 파일:**

| File | Description |
|------|-------------|
| `app/types/customs.ts` | FeeBreakdown, CustomsListItem, CustomsDetail, SourceShipping |
| `app/lib/customs-utils.ts` | calcTotalFees 비용 합계 헬퍼 (공용) |
| `app/loaders/customs.schema.ts` | feeBreakdownSchema, customsCreateSchema, customsUpdateSchema |
| `app/loaders/customs.server.ts` | List loader + Form loader + Create action |
| `app/routes/_layout.customs.new.tsx` | 생성 페이지 |
| `app/components/customs/customs-form.tsx` | 생성/수정 공용 폼 |
| `app/components/customs/customs-fee-input.tsx` | Fee 그룹 입력 (supply/vat/total 자동계산) |

**수정 파일:**

| File | Change |
|------|--------|
| `app/routes.ts` | `customs/new`, `customs/:id`, `customs/:id/edit` 3개 라우트 추가 |
| `app/routes/_layout.customs.tsx` | placeholder -> 실제 목록 페이지 |
| `app/components/ui/icons.tsx` | Receipt, CheckCircle2 아이콘 추가 |

### Phase 7-B: Detail + Edit + Delete + Sync

**Scope:**
- 상세 페이지 (기본정보 카드 + 비용 요약 4열 그리드 + Content)
- 수정 페이지 (CustomsForm 재사용)
- fee_received 토글 + Order 양방향 sync
- Soft delete + Order customs_id 해제
- Content 시스템 연동 (type="customs")

**신규 파일:**

| File | Description |
|------|-------------|
| `app/loaders/customs.$id.server.ts` | Detail loader + Multi-intent action |
| `app/routes/_layout.customs.$id.tsx` | 상세 페이지 |
| `app/routes/_layout.customs.$id.edit.tsx` | 수정 페이지 |
| `app/components/customs/customs-detail-info.tsx` | 기본정보 카드 (통관번호, 통관일, 선적서류 링크, fee_received 토글) |
| `app/components/customs/customs-fee-summary.tsx` | 비용 요약 카드 (4열 그리드 + 총합) |

**수정 파일:**

| File | Change |
|------|--------|
| `app/lib/order-sync.server.ts` | `unlinkCustomsFromOrder` 함수 추가 |

### Phase 7-C: Cross-Module Links + Polish

**Scope:**
- Shipping 상세 페이지에 "통관 생성" 버튼 추가
- Order 상세의 Customs 카드에 상세 링크 추가
- 모바일 대응 최적화
- 에지 케이스 처리

**수정 파일:**

| File | Change |
|------|--------|
| `app/routes/_layout.shipping.$id.tsx` | "통관 생성" 버튼 추가 |
| `app/routes/_layout.orders.$id.tsx` | Customs 카드 클릭 -> `/customs/{id}` 이동 |

---

## 4. Key Architectural Decisions

### D1: 별도 페이지 CRUD (Order 패턴 아님)

Customs는 4개 fee JSONB x 2 sub-fields = 8개 숫자 입력 + customs_no/customs_date/etc_desc.
Inline 수정으로는 필드가 너무 많음. PO/PI/Shipping과 동일한 표준 4-라우트 CRUD 패턴 적용.

### D2: Fee total 서버 재계산

`total = supply + vat`은 서버 action에서 반드시 재계산. 클라이언트 값 신뢰 금지.
```typescript
const computeTotal = (supply: number, vat: number) =>
  Math.round((supply + vat) * 100) / 100;
```

### D3: 문서번호 자동 생성 없음

`customs_no`는 관세청에서 부여하는 외부 번호 (14자리). 사용자 직접 입력, nullable.
`generate_doc_number` RPC 미사용. 통관 초기 단계에서 번호 미확정 가능.

### D4: Shipping:Customs = 실무 1:1

DB FK에 UNIQUE 없으므로 1:N 가능하지만, application-level 중복 체크로 1:1 안내.
이미 Customs가 있는 Shipping Doc은 생성 Form에서 필터링.

### D5: Status 컬럼 없음 -> fee_received 기반 필터

customs 테이블에 status 없음. DocStatusBadge 대신 fee_received boolean 기반:
- 탭: 전체 / 미수령 / 수령완료
- 배지: 수령완료(green) / 미수령(outline)

### D6: Delete 시 Order 정리

Customs soft delete 시 Order의 `customs_id = null`, `customs_fee_received = null` 정리.
`unlinkCustomsFromOrder` 신규 함수 1개 추가.

### D7: customs_no/customs_date Order 동기화 불필요

Order 상세에서 customs 데이터를 FK JOIN으로 조회하므로 별도 sync 컬럼 불필요.
Read-Through 패턴으로 항상 최신값 표시.

---

## 5. Route Structure

```typescript
// app/routes.ts 변경
route("customs", "routes/_layout.customs.tsx"),          // 이미 존재 (placeholder 교체)
route("customs/new", "routes/_layout.customs.new.tsx"),  // + 추가
route("customs/:id", "routes/_layout.customs.$id.tsx"),  // + 추가
route("customs/:id/edit", "routes/_layout.customs.$id.edit.tsx"), // + 추가
```

PO/PI/Shipping과 동일한 표준 CRUD 4-라우트 패턴.

---

## 6. TypeScript Types Summary

```typescript
// app/types/customs.ts
FeeBreakdown          // JSONB: { supply, vat, total }
CustomsListItem       // 목록: id, customs_no, dates, 4x fee, fee_received + shipping join
CustomsDetail         // 상세: extends CustomsListItem + shipping_doc_id, created_by, updated_at
SourceShipping        // 참조 생성 프리필: id, ci_no, vessel, eta

// app/lib/customs-utils.ts
calcTotalFees()       // 4개 fee 합산 -> { totalSupply, totalVat, grandTotal }
```

---

## 7. Zod Schemas Summary

```typescript
// app/loaders/customs.schema.ts
feeBreakdownSchema    // { supply: nonneg max 999M, vat: nonneg max 999M }
customsCreateSchema   // shipping_doc_id(uuid), customs_no(max50), customs_date(ISO)
customsUpdateSchema   // customs_no, customs_date, etc_desc (all optional)
```

### Fee FormData 파싱 전략

비용은 flat key로 전달, 서버에서 JSONB로 변환:
```
transport_fee_supply=100000 → { supply: 100000, vat: 10000, total: 110000 }
transport_fee_vat=10000
```

또는 JSON string으로 전달 후 서버에서 `JSON.parse` -> `feeBreakdownSchema.safeParse` -> total 재계산.

---

## 8. Supabase Query Patterns

### 목록 SELECT

```sql
id, customs_no, customs_date, fee_received,
transport_fee, customs_fee, vat_fee, etc_fee,
created_at,
shipping:shipping_documents!shipping_doc_id(id, ci_no, vessel, eta)
```

### 상세 SELECT

```sql
id, customs_no, customs_date, shipping_doc_id,
transport_fee, customs_fee, vat_fee, etc_fee, etc_desc,
fee_received, created_by, created_at, updated_at,
shipping:shipping_documents!shipping_doc_id(
  id, ci_no, pl_no, vessel, voyage, eta, etd, status,
  pi:proforma_invoices!pi_id(pi_no)
)
```

### Form Loader (Available Shipping Docs)

```typescript
// 이미 customs가 있는 shipping_doc 제외
const { data: allDocs } = await supabase
  .from("shipping_documents").select("id, ci_no, ci_date, vessel")
  .is("deleted_at", null).order("ci_date", { ascending: false });

const { data: usedDocs } = await supabase
  .from("customs").select("shipping_doc_id").is("deleted_at", null);

const usedIds = new Set(usedDocs.map(d => d.shipping_doc_id).filter(Boolean));
const available = allDocs.filter(doc => !usedIds.has(doc.id));
```

---

## 9. UI Design Summary

### 목록 페이지

- Header: "통관관리" + "통관서류 작성" 버튼
- Tabs: 전체/미수령/수령완료 (fee_received 기반)
- 검색: customs_no, ci_no
- Desktop 테이블: 통관번호 | 통관일 | 선적서류 | 운송비 | 관세 | 부가세 | 총비용 | 수령
- Mobile 카드: 통관번호 + 수령 배지 + CI번호 + 통관일 + 총비용

### 생성/수정 폼 (CustomsForm)

```
md:grid-cols-2 레이아웃:
+-------------+-----------+
| 기본 정보   | 운송비    |
+-------------+-----------+
| 관세        | 부가세    |
+-------------+-----------+
| 기타비용 (full width)   |
+-------------------------+
| 총 비용 합계            |
+-------------------------+
| [취소]          [작성]  |
+-------------------------+
```

Fee 입력 컴포넌트 (`customs-fee-input.tsx`):
- supply + vat 입력 -> total 실시간 자동계산 (useState)
- flat FormData key: `{prefix}_supply`, `{prefix}_vat`

### 상세 페이지

```
Header: 통관번호 + fee_received 배지 + 액션 드롭다운(수정/삭제)

Section 1: 기본 정보 카드
  통관번호 | 통관일 | 선적서류(링크) | 비용수령 토글

Section 2: 비용 요약 (grid-cols-2 md:grid-cols-4)
  운송비 | 관세 | 부가세 | 기타비용
  각각: 공급가액 / 부가세 / 합계
  하단: 총 비용 합계 바

Section 3: Content (메모 & 첨부)

Section 4: 메타 (작성일, 수정일)
```

---

## 10. Actions Summary

### 생성 (`customs.server.ts`)

| `_action` | 설명 | Sync |
|-----------|------|------|
| `create` | Shipping 선택 + 기본정보 + 비용 -> insert | linkCustomsToOrder |

### 상세 (`customs.$id.server.ts`)

| `_action` | 설명 | Sync |
|-----------|------|------|
| `update` | 기본정보 수정 (customs_no, customs_date, etc_desc) | 없음 (JOIN 조회) |
| `update_fees` | 비용 4종 JSONB 수정 (total 서버 재계산) | 없음 |
| `toggle_fee_received` | fee_received 반전 (DB 현재값 기반) | syncCustomsFeeToOrder |
| `delete` | soft delete | unlinkCustomsFromOrder |
| `content_*` | 메모/첨부/댓글 (handleContentAction 위임) | 없음 |

---

## 11. Order Integration Summary

### 기존 구현 (order-sync.server.ts - Phase 6에서 작성)

| 함수 | 호출 시점 |
|------|-----------|
| `linkCustomsToOrder(supabase, shippingDocId, customsId)` | Customs 생성 후 |
| `syncCustomsFeeToOrder(supabase, customsId, value)` | fee_received 토글 시 |

### Phase 7에서 추가

| 함수 | 호출 시점 |
|------|-----------|
| `unlinkCustomsFromOrder(supabase, customsId)` | Customs 삭제 시 |

```typescript
// order-sync.server.ts에 추가
export async function unlinkCustomsFromOrder(supabase, customsId) {
  await supabase
    .from("orders")
    .update({ customs_id: null, customs_fee_received: false, updated_at: ... })
    .eq("customs_id", customsId)
    .is("deleted_at", null);
}
```

### Read-Through 패턴 (추가 sync 불필요)

- customs_no, customs_date: Order 상세에서 FK JOIN으로 조회 -> 별도 sync 컬럼 없음
- CY 경고 배지: customs_date 입력 시 자동 반영 (별도 코드 불필요)

---

## 12. Security Checklist

### DB 사전 작업 (코드 작성 전 - Supabase MCP로 실행)

- [x] customs RLS 활성화 확인 (`relrowsecurity = true`)
- [x] `gv_all` 정책 확인 (`get_user_org_type() = 'gv'`)
- [x] Saelim 정책 없음 확인 (비용 노출 방지)
- [ ] `idx_orders_customs_id` 인덱스 추가 (CRITICAL)
- [ ] `idx_customs_deleted_at` 부분 인덱스 추가 (RECOMMENDED)

```sql
-- Phase 7 구현 전 실행
CREATE INDEX idx_orders_customs_id ON public.orders USING btree (customs_id)
WHERE deleted_at IS NULL;

CREATE INDEX idx_customs_deleted_at ON public.customs (created_at DESC)
WHERE deleted_at IS NULL;
```

### Application 보안

- [ ] 모든 loader/action에 `requireGVUser()` 사용
- [ ] URL param `$id` UUID 검증 (z.string().uuid())
- [ ] `responseHeaders` 모든 data()/redirect()에 전달
- [ ] JSONB fee 서버사이드 검증 (feeBreakdownSchema)
- [ ] total 서버사이드 재계산 (supply + vat)
- [ ] `customs_no`, `etc_desc`에 sanitizeFormulaInjection 적용
- [ ] `shipping_doc_id` 존재 + 미삭제 확인
- [ ] `fee_received` 토글: DB 현재값 읽기 후 반전 (클라이언트 값 무시)
- [ ] `toggle_fee_received` 시 syncCustomsFeeToOrder 호출
- [ ] Customs 삭제 시 unlinkCustomsFromOrder 호출

---

## 13. Korean Labels Reference

| English | Korean |
|---------|--------|
| Customs Management | 통관관리 |
| Create Customs | 통관서류 작성 |
| Edit Customs | 통관서류 수정 |
| Customs No | 통관번호 |
| Customs Date | 통관일 |
| Shipping Document | 선적서류 |
| Transport Fee | 운송비 |
| Customs Fee | 관세 |
| VAT Fee | 부가세 |
| Other Fee | 기타비용 |
| Fee Description | 비용 설명 |
| Supply Amount | 공급가액 |
| VAT Amount | 부가세 |
| Total | 합계 |
| Grand Total | 총 비용 합계 |
| Fee Received | 비용수령 |
| Received | 수령완료 |
| Not Received | 미수령 |
| All | 전체 |
| Search Placeholder | 통관번호 또는 CI번호 검색... |
| Empty State | 등록된 통관서류가 없습니다. |
| Delete Confirm Title | 통관서류를 삭제하시겠습니까? |
| Delete Confirm Desc | 삭제된 통관서류는 복구할 수 없습니다. |

---

## 14. Edge Cases & Notes

1. **Shipping 없이 Customs 생성 불가**: shipping_doc_id는 필수 (Zod required UUID). `/customs/new`에서 Shipping 선택 드롭다운 제공.
2. **동일 Shipping에 Customs 중복**: Application-level 중복 체크. 경고 후 차단. FormLoader에서 이미 사용된 Shipping 필터링.
3. **비용 전체 0원**: 허용 (통관 초기 단계에서 비용 미확정 가능). fee null 유지.
4. **Customs 삭제 후 Order**: Order.customs_id = null, customs_fee_received = null 정리.
5. **Shipping 삭제된 Customs**: FK 존재하므로 JOIN 시 데이터 유지. 실무상 Shipping 삭제 시 Customs도 삭제 권장.
6. **KRW 소수점**: `Math.round` 적용. 원화이므로 소수점 없음이 일반적.
7. **vat_fee.vat = 0 정상**: 수입 부가세는 그 자체가 세금이므로 부가세 필드가 0인 것이 일반 케이스.
8. **customs_no 길이**: 관세청 14자리이지만 내부 관리 코드 겸용 가능 -> max(50) 충분.
9. **from_shipping 프리필**: `/customs/new?from_shipping={uuid}` -> Shipping 자동 선택 + 일부 정보 표시.

---

## 15. Performance Summary

| 동작 | 예상 지연 | 비고 |
|------|----------|------|
| 목록 (1 JOIN, 100행) | < 30ms | Single SQL, JSONB 전체 반환 |
| 상세 (2 JOIN, 1행) | < 15ms | customs + shipping + pi |
| FormLoader (2 쿼리) | < 30ms | shipping 전체 + customs shipping_doc_id |
| Create (3 쿼리) | < 100ms | 존재확인 + 중복체크 + insert + linkOrder |
| fee_received 토글 | < 50ms | read + update + syncOrder |
| 비용 합계 계산 | < 1ms | Client-side (calcTotalFees) |

No pagination needed initially. 500 customs records까지 문제 없음.

---

## 16. Domain Knowledge Summary (Researcher)

### 한국 세금계산서 표준과 JSONB 구조

`{supply, vat, total}` 구조가 한국 부가가치세법 제32조 세금계산서 표준과 1:1 대응:
- supply = 공급가액
- vat = 세액
- total = 합계금액

### 통관번호 체계

관세청 수입신고번호: `[신고인부호 5자리][년도 2자리][일련번호 7자리]` = 14자리.
UNI-PASS에서 자동 채번, 사용자 직접 입력 방식 적합.

### CY Free Time 연결

customs_date 입력 -> CY 체류일 계산 종료 -> Order CY 배지 자동 확정.
Read-Through JOIN으로 별도 코드 불필요.

---

## 17. Detailed Notes by Team Member

각 팀원별 상세 분석은 아래 파일 참조:
- [Architect Notes](../brainstorm/phase7/architect-notes.md) - 전체 아키텍처, 구현 순서, 타입 정의, 데이터 플로우
- [Frontend Dev Notes](../brainstorm/phase7/frontend-notes.md) - UI 컴포넌트, 비용 입력/요약, 반응형, 한국어 라벨
- [Backend Dev Notes](../brainstorm/phase7/backend-notes.md) - Loader/Action 코드, Zod 스키마, JSONB 검증, Sync 통합
- [Security Review Notes](../brainstorm/phase7/security-notes.md) - RLS 확인, 인덱스, 보안 체크리스트, 입력 검증
- [Research Notes](../brainstorm/phase7/research-notes.md) - 한국 통관 비용 구조, 세금계산서 표준, 도메인 지식
