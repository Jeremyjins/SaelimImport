# Phase 9-B Implementation Plan: CI + PL + SL (Shipping Documents)

**Date:** 2026-03-06
**Status:** Completed
**Ref:** `.claude/docs/PROJECT_INIT_BRAINSTORMING_PHASE_9.md`

---

## Agent Team

| # | Role | 담당 영역 |
|---|------|----------|
| 1 | **Frontend Dev** | CI/PL/SL document templates, Shipping route 통합 |
| 2 | **Code Reviewer** | 기존 패턴 준수, 타입 안전성, ShippingWithOrgs 호환성 |

제외: backend-dev (서버 변경 없음), architect (Phase 9-A 구조 재사용), security-reviewer (PDF는 읽기 전용), tester/perf-analyzer (브레인스토밍에서 분석 완료)

---

## File Ownership

| Agent | Files |
|-------|-------|
| Frontend Dev | `app/components/pdf/ci-document.tsx`, `app/components/pdf/pl-document.tsx`, `app/components/pdf/sl-document.tsx` |
| Code Reviewer | `app/routes/_layout.shipping.$id.tsx` |

---

## Task List

### T1: CI Document (Commercial Invoice)
- [x] `app/components/pdf/ci-document.tsx`
  - Title: "COMMERCIAL INVOICE", docNo: `ci_no`, date: `ci_date`
  - Shipper/Consignee parties (not Supplier/Buyer)
  - Ref: PI no if available (`subtitle`)
  - Terms row (payment, delivery, loading, discharge)
  - Shipping Info section: Vessel, Voyage, Ship Date, ETD, ETA
  - Product table (same columns as PO/PI: No, Product, GSM, Width, Qty, Unit Price, Amount)
  - Weight Summary section: Gross Weight, Net Weight, Packages
  - Signature block: "Authorized Signature"

### T2: PL Document (Packing List)
- [x] `app/components/pdf/pl-document.tsx`
  - Title: "PACKING LIST", docNo: `pl_no`, date: `ci_date`
  - Shipper/Consignee parties
  - Ref: CI no (`subtitle`)
  - Terms row (payment, delivery, loading, discharge)
  - Shipping Info section (same as CI)
  - Product table WITHOUT price columns: No(5%), Product(38%), GSM(10%), Width(12%), Qty(KG)(35%)
  - Weight Summary section: Gross Weight, Net Weight, Packages
  - Signature block

### T3: SL Document (Stuffing List)
- [x] `app/components/pdf/sl-document.tsx`
  - Per-container iteration with `<View break>` between containers
  - Each container: Header (SL No, Container No, Seal No, Roll Range)
  - Table: Roll No(6%), Product(26%), GSM(8%), Width(10%), Length(10%), Net Wt(18%), Gross Wt(18%), Pkg(4%)
  - Total row per container: roll count + total net/gross weight
  - Empty roll_details fallback: "No roll details available"
  - File naming: `SL_{ci_no}_{cntr_no}.pdf` (all containers in one PDF)

### T4: Shipping Route Integration
- [x] `app/routes/_layout.shipping.$id.tsx`
  - Import `usePDFDownload` hook
  - Import `FileDown` icon
  - Add 3 DropdownMenuItems: "CI 다운로드", "PL 다운로드", "SL 다운로드"
  - SL item: only show when `shipping.stuffing_lists.length > 0`
  - Separator before CI/PL/SL group (after clone/customs items)
  - Separator before delete item
  - Loading state disabled on all dropdown items when isPDFLoading

---

## Key Design Decisions

### CI Shipping Info Section
별도 `View` 섹션 (terms와 table 사이):
```
Vessel: Ever Given    | Voyage: V.025E
Ship Date: Mar 18     | ETD: Mar 19 | ETA: Mar 25
```

### PL vs CI 차이
- PL columns: Unit Price, Amount 제거 → Qty(KG) 컬럼이 넓어짐
- PL totalRow: qty 합산 (amount 없음) + weight summary

### SL Multi-Container
- `stuffing_lists` 배열 순회
- 첫 번째 제외 모든 `<View break>` → 새 페이지 시작
- `roll_details` 빈 배열이면 "No roll details available" 행 표시

### File Naming
- CI: `CI_{ci_no}.pdf`
- PL: `PL_{pl_no}.pdf`
- SL: `SL_{ci_no}_ALL.pdf` (모든 컨테이너 포함)

### DropdownMenu 구조 (최종)
```
수정
복제
통관 생성
---
CI 다운로드
PL 다운로드
SL 다운로드  (stuffing_lists > 0 시에만)
---
삭제
```

---

## Implementation Notes

### ShippingWithOrgs 필드 매핑
- `ci_no` → CI document no
- `pl_no` → PL document no
- `ci_date` → date for both CI and PL
- `shipper` → left party (SHIPPER)
- `consignee` → right party (CONSIGNEE)
- `vessel`, `voyage`, `ship_date`, `etd`, `eta` → Shipping Info
- `gross_weight`, `net_weight`, `package_no` → Weight Summary
- `stuffing_lists[].roll_details` → SL roll rows
- `stuffing_lists[].cntr_no`, `sl_no`, `seal_no` → SL header

### react-pdf v4 주의사항
- `<View break>` 대신 `<View break={true}>` 사용 필요 (JSX에서 속성값 명시)
- `fixed` 테이블 헤더: `<View style={...} fixed>` → SL에서 컨테이너별 헤더는 fixed 사용 불가, 각 컨테이너 내 반복
- 숫자 합산: `roll_details.reduce()` 인라인 계산
