# Phase 9-C Implementation Plan: Customs Invoice PDF

**Date:** 2026-03-06
**Status:** Completed
**Ref:** `.claude/docs/PROJECT_INIT_BRAINSTORMING_PHASE_9.md`

---

## Agent Team

| # | Role | 담당 영역 |
|---|------|----------|
| 1 | **Frontend Dev** | invoice-document.tsx PDF 템플릿 |
| 2 | **Code Reviewer** | customs route 통합, 기존 패턴 준수 |

제외: backend-dev (서버 변경 없음), architect (Phase 9-A 구조 재사용), security-reviewer (PDF 읽기 전용), tester/perf-analyzer (단순 문서, 브레인스토밍 완료)

---

## File Ownership

| Agent | Files |
|-------|-------|
| Frontend Dev | `app/components/pdf/invoice-document.tsx` |
| Code Reviewer | `app/routes/_layout.customs.$id.tsx` |

---

## Task List

### T1: Invoice Document (Customs Clearance Invoice)
- [x] `app/components/pdf/invoice-document.tsx`
  - Title: "CUSTOMS CLEARANCE INVOICE"
  - docNo: `customs_no`, date: `customs_date`
  - Subtitle: "Ref CI: {ci_no}" (연결된 shipping이 있을 때)
  - extraFields: Vessel (있을 때만)
  - Fee table: Category | Supply Amount | VAT | Total (모두 KRW, 소수점 없음)
    - Transport Fee (운송비)
    - Customs Duty (관세)
    - VAT / Import Tax (부가세)
    - Others (기타, etc_desc 있으면 부제로 표시)
    - GRAND TOTAL (totalRow, calcTotalFees 재사용)
  - Payment Status block: PAID / UNPAID (fee_received 기반)
  - PDFHeader, PDFFooter (shared 컴포넌트 재사용)
  - 커스텀 fee table (PDFTable 대신 직접 구성 — 4컬럼 고정)

### T2: Customs Route Integration
- [x] `app/routes/_layout.customs.$id.tsx`
  - `usePDFDownload` hook import 추가
  - `FileDown` icon import 추가
  - DropdownMenuItem "인보이스 다운로드" 추가 (수정 아래, 삭제 위)
  - 파일명: `Invoice_{customs_no}.pdf` (customs_no 없으면 `Invoice_customs.pdf`)
  - `isPDFLoading` 시 DropdownMenuItem disabled

---

## Key Design Decisions

### Invoice PDF 구조
```
+----------------------------------------------------------+
| [LOGO]              CUSTOMS CLEARANCE INVOICE             |
|                     No: C-2601-001                        |
|                     Date: Mar 15, 2026                    |
|                     Ref CI: GVCI2601-001                  |
+----------------------------------------------------------+
| Category             | Supply Amt | VAT     | Total       |
|----------------------|------------|---------|-------------|
| Transport Fee        |    500,000 |  50,000 |     550,000 |
| Customs Duty         |  1,200,000 |       0 |   1,200,000 |
| VAT / Import Tax     |          0 | 120,000 |     120,000 |
| Others               |    100,000 |  10,000 |     110,000 |
|                      | 1,800,000  | 180,000 |   1,980,000 |  ← GRAND TOTAL
+----------------------------------------------------------+
|  Payment Status: PAID                                     |
+----------------------------------------------------------+
|  GV International Co., Ltd.              Page 1 / 1      |
+----------------------------------------------------------+
```

### KRW 포맷
- `formatPdfNumber(amount, 0)` — 개별 셀 (KRW prefix 없음)
- 컬럼 헤더에 "(KRW)" 표기로 통화 명시
- null FeeBreakdown → 0 표시 (행 항상 표시)

### Fee Table 구성
- PDFTable 미사용 → 4컬럼 고정 커스텀 View (헤더 fixed 불필요, 항상 4행)
- styles.tableHeader / tableRow / tableTotalRow 재사용
- "Others" 행: etc_desc 있으면 `Others (etc_desc)` 표시

### Payment Status Block
- fee_received: true → "PAID" (green badge 스타일)
- fee_received: false/null → "UNPAID" (neutral)
- View wrap={false} (페이지 분리 방지)

### DropdownMenu 구조 (최종)
```
통관서류 수정
---
인보이스 다운로드
---
통관서류 삭제
```

---

## Implementation Notes

### CustomsDetail 필드 매핑
- `customs_no` → docNo
- `customs_date` → date
- `shipping.ci_no` → Ref CI (subtitle)
- `shipping.vessel` → extraField (있을 때만)
- `transport_fee` → Transport Fee 행
- `customs_fee` → Customs Duty 행
- `vat_fee` → VAT / Import Tax 행
- `etc_fee` + `etc_desc` → Others 행
- `fee_received` → Payment Status
- `calcTotalFees()` from `~/lib/customs-utils` → GRAND TOTAL 행

### react-pdf 주의사항
- `wrap={false}` → Payment Status block (페이지 분리 방지)
- fee table은 항상 4행 이하 → fixed 헤더 불필요
- KRW 소수점 없음: `formatPdfNumber(val ?? 0, 0)`
