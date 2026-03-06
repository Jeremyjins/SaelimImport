# Phase 9: PDF Generation - Code Review Notes

**Date:** 2026-03-06
**Role:** Code Reviewer
**Scope:** 기존 코드 패턴 분석, PDF 통합 포인트 식별, 잠재적 이슈 사전 발견

---

## 1. Must Fix (Before Implementation)

### 1.1 [pdf-utils.ts] formatDate 로케일 불일치

`app/lib/format.ts`의 `formatDate()`는 한국어 로케일(`ko-KR`) 출력: `"2026. 01. 15."` 형식.
PDF는 All-English이므로 `en-US` 로케일 필요.

**결정:** `pdf-utils.ts`에 독립적인 `formatPdfDate()` 정의. `lib/format.ts` import 금지.
```typescript
export function formatPdfDate(date: string | null): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "2-digit",
  });
}
```

### 1.2 [@react-pdf/renderer 미설치]

`package.json`에 `@react-pdf/renderer` 없음. Phase 9-A 시작 전 설치 필수:
```bash
npm install @react-pdf/renderer@4.3.2
```

### 1.3 [console.error 제거]

Frontend-notes 코드 예시에 `console.error("PDF generation error:", err)` 포함.
프로젝트 표준: 커밋 코드에 디버그 로그 금지. `toast.error`만으로 충분.

---

## 2. Should Fix

### 2.1 [shipping.$id.tsx] Flat DropdownMenuItems 권장

Shipping 상세 페이지에 CI/PL/SL PDF 추가 시, `DropdownMenuSub` 중첩 대신 **flat 항목** 권장.
- 현재 메뉴: 수정 / 복제 / 통관 생성 / 삭제 (4개)
- 추가: CI 다운로드 / PL 다운로드 / SL 다운로드 (3개)
- 총 7개 → flat 메뉴로 충분. Sub-menu hover 인터랙션 불필요.

`DropdownMenuSub`/`DropdownMenuSubTrigger`/`DropdownMenuSubContent`는 `app/components/ui/dropdown-menu.tsx`에 이미 구현되어 있으나, 이 경우에는 불필요.

### 2.2 [All Templates] notes 필드 제외 확인

PDF_RESEARCH_RESULT.md 결정: notes를 PDF에서 제외 (Option A).
Frontend-notes의 PODocument 예시에 `{data.notes && ...}` 조건부 섹션이 있음 → 모순.
**모든 템플릿에서 notes 섹션 제거 필요.**

### 2.3 [pdf-utils.ts] pdfNumber 함수 필요

Frontend-notes 예시에서 수량 열에 `pdfCurrency().replace(/[A-Z]/g, "").trim()` 사용 → 취약.
**별도 `formatPdfNumber()` 함수 정의:**
```typescript
export function formatPdfNumber(value: number | null, decimals = 0): string {
  if (value == null) return "-";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: decimals,
  }).format(value);
}
```

### 2.4 [sl-document.tsx] Multi-container 페이지 분리

`StuffingList[]`의 각 컨테이너를 `<View break>` 로 분리하여 컨테이너별 새 페이지 시작.
물리적 스터핑 리스트 관행과 일치.

---

## 3. Nit (Optional)

### 3.1 [po.$id.tsx, pi.$id.tsx] 모바일 헤더 버튼 크기
Header에 이미 3개 요소 (badge + toggle + dropdown). PDF 버튼 추가 시 좁은 화면 오버플로우 가능.
→ PDF는 DropdownMenu 내 항목으로 추가하면 문제 없음 (별도 버튼 불필요).

### 3.2 [pdf-table.tsx] 타입 안전성
`data: Record<string, string | number>[]` 는 약한 타입. 각 문서별 named row 인터페이스 정의 권장:
```typescript
type POTableRow = { no: number; product: string; gsm: string; ... };
```

### 3.3 [pdf-footer.tsx] 회사명 상수화
`"GV International Co., Ltd."` → `pdf-utils.ts`에 `GV_COMPANY_NAME` 상수 정의.

### 3.4 [Pre-existing] getProductSpec 중복
`po-detail-items.tsx`, `pi-detail-items.tsx`, `shipping-detail-items.tsx`에 동일한 `getProductSpec()` 복사.
PDF에서는 `pdf-utils.ts`에 독립 `formatPdfProductSpec()` 정의 (기존 컴포넌트 import 금지 — React/DOM 의존성).

---

## 4. Positive Findings

### 4.1 React.lazy 패턴 선례
`content-section.tsx`의 ContentEditor lazy loading이 PDF와 동일한 패턴. PDF download button이 default export면 `.then()` 어댑터 불필요:
```typescript
const PDFButton = React.lazy(() => import("~/components/pdf/pdf-download-button"));
```

### 4.2 아이콘 이미 존재
`app/components/ui/icons.tsx`에 `Download`, `FileDown` 이미 export됨. 추가 작업 불필요.

### 4.3 DropdownMenuSub 구현 완료
`dropdown-menu.tsx`에 Sub/SubTrigger/SubContent 완전 구현. 필요 시 zero-cost 사용 가능.

### 4.4 타입 직접 사용 가능
`POWithOrgs`, `PIWithOrgs`, `ShippingWithOrgs`, `CustomsDetail` 모두 PDF props로 직접 사용 가능.
`ShippingWithOrgs`에 `stuffing_lists: StuffingList[]` + `roll_details: StuffingRollDetail[]` 중첩 포함.
중간 변환 타입 불필요.

### 4.5 calcTotalFees 재사용
`app/lib/customs-utils.ts`의 `calcTotalFees()`는 순수 함수. Invoice PDF에서 직접 import 가능.

### 4.6 formatWeight 재사용 가능
`app/lib/format.ts`의 `formatWeight()`는 `"1,234.567 KG"` 형식 → 영어 호환. PDF에서 동일 로직 사용 가능.
(다만 의존성 분리를 위해 `pdf-utils.ts`에 복제 권장)

### 4.7 Loader 변경 불필요
4개 상세 페이지 loader 모두 organization 데이터(`name_en`, `address_en`)를 FK join으로 이미 포함.
PDF 데이터 공급을 위한 추가 loader 수정 불필요.

---

## 5. Integration Summary

| Page | Route File | Data | PDF Types | Placement |
|------|-----------|------|-----------|-----------|
| PO | `_layout.po.$id.tsx` | `po: POWithOrgs` | PO PDF | DropdownMenu item |
| PI | `_layout.pi.$id.tsx` | `pi: PIWithOrgs` | PI PDF | DropdownMenu item |
| Shipping | `_layout.shipping.$id.tsx` | `shipping: ShippingWithOrgs` | CI/PL/SL | Flat DropdownMenu items |
| Customs | `_layout.customs.$id.tsx` | `customs: CustomsDetail` | Invoice | DropdownMenu item |

---

## Sources
- Code review of existing routes, components, types, and utilities in the Saelim codebase
