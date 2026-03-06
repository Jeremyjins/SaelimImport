# Phase 9-A Implementation Plan: PDF Generation Foundation + PO/PI

**Date:** 2026-03-06
**Status:** In Progress
**Ref:** `.claude/docs/PROJECT_INIT_BRAINSTORMING_PHASE_9.md`

---

## Agent Team

| # | Role | 담당 영역 |
|---|------|----------|
| 1 | **Architect** | 파일 구조, 번들 전략, 통합 설계 |
| 2 | **Frontend Dev** | react-pdf 컴포넌트 구현, 레이아웃 |
| 3 | **Code Reviewer** | 기존 코드 패턴 준수, 타입 안전성 |

제외: backend-dev (서버 변경 없음), tester, security-reviewer, perf-analyzer, researcher (브레인스토밍에서 충분히 분석 완료)

---

## File Ownership

| Agent | Files |
|-------|-------|
| Architect | `vite.config.ts`, `package.json` |
| Frontend Dev | `app/components/pdf/shared/*.ts(x)`, `app/components/pdf/po-document.tsx`, `app/components/pdf/pi-document.tsx`, `app/hooks/use-pdf-download.ts` |
| Code Reviewer | `app/routes/_layout.po.$id.tsx`, `app/routes/_layout.pi.$id.tsx` |

---

## Task List

### T1: Package Install + vite.config.ts
- [x] `@react-pdf/renderer` npm 설치
- [x] `vite.config.ts` SSR exclusion + optimizeDeps.exclude 추가

### T2: Shared PDF Foundation (7 files)
- [x] `app/components/pdf/shared/pdf-styles.ts` - StyleSheet (A4, Helvetica, colors)
- [x] `app/components/pdf/shared/pdf-utils.ts` - formatPdfDate, formatPdfCurrency, formatPdfNumber, triggerDownload
- [x] `app/components/pdf/shared/pdf-header.tsx` - Doc header (logo text, title, no, date)
- [x] `app/components/pdf/shared/pdf-footer.tsx` - Fixed footer (company, page x/y)
- [x] `app/components/pdf/shared/pdf-parties.tsx` - Two-column party block
- [x] `app/components/pdf/shared/pdf-terms.tsx` - 4-column terms row
- [x] `app/components/pdf/shared/pdf-table.tsx` - Generic table (columns, data, totalRow)

### T3: Hook
- [x] `app/hooks/use-pdf-download.ts` - loading state + download + toast

### T4: PO/PI Document Templates
- [x] `app/components/pdf/po-document.tsx` - PO PDF (PURCHASE ORDER)
- [x] `app/components/pdf/pi-document.tsx` - PI PDF (PROFORMA INVOICE)

### T5: Route Integration
- [x] `app/routes/_layout.po.$id.tsx` - PDF 다운로드 DropdownMenuItem 추가
- [x] `app/routes/_layout.pi.$id.tsx` - PDF 다운로드 DropdownMenuItem 추가

---

## Key Decisions

### Architecture
- `@react-pdf/renderer`: Client-side only (CF Workers WASM 제약)
- Dynamic `import()` in click handler (React.lazy 아님 - PDF는 DOM 렌더링 없음)
- loaderData 직접 전달 (DTO 없음, 추가 서버 라우트 없음)
- Helvetica 기본 내장 폰트 (추가 파일 0KB)
- All-English PDF (무역 표준 + 한국어 폰트 이슈 완전 회피)

### Bundle Impact
- SSR 번들: +0KB (dynamic import 격리)
- Client initial: +0KB (lazy chunk)
- Client PDF chunk: ~900KB gzip (클릭 시 1회)

### vite.config.ts 설정
```typescript
ssr: { noExternal: ["@react-pdf/renderer"] },
optimizeDeps: { exclude: ["@react-pdf/renderer"] }
```

### PDF 레이아웃 (PO/PI 동일 구조)
```
[GV INTERNATIONAL]           [PURCHASE ORDER]
                              No: PO-2601-001
                              Date: Mar 15, 2026
----------------------------------------------------------
[SUPPLIER]           | [BUYER]
CHP Co., Ltd.        | Saelim Co., Ltd.
123 Industrial Road  | 456 Business Ave
----------------------------------------------------------
[PAYMENT TERM] [DELIVERY TERM] [LOADING PORT] [DISCHARGE]
----------------------------------------------------------
No | Product | GSM | Width(mm) | Qty(KG) | Unit Price | Amount
...
                               TOTAL    USD 25,200.00
----------------------------------------------------------
GV International Co., Ltd.              Page 1 / 1
```

### Column Widths (PO/PI)
- No: 5%, Product: 27%, GSM: 8%, Width: 10%, Qty: 15%, Unit Price: 15%, Amount: 20%

### File Naming
- PO: `PO_{po_no}.pdf` → `PO_GVPO2601-001.pdf`
- PI: `PI_{pi_no}.pdf` → `PI_GVPI2601-001.pdf`

### DropdownMenu 통합 위치
- 기존 액션 DropdownMenu에 separator + PDF item 추가 (삭제 위)
- `FileDown` 아이콘 사용 (이미 icons.tsx에 존재)

---

## Post-Build Verification

```bash
grep -r "yoga\|react-pdf" dist/_worker.js | head -5
# 결과 없어야 함 (서버 번들 오염 없음)
```

---

## Implementation Notes

### react-pdf v4 API
- `Document`, `Page`, `View`, `Text`, `Image`, `StyleSheet` from `@react-pdf/renderer`
- `pdf(element).toBlob()` → `Promise<Blob>`
- `<View fixed>` → 매 페이지 반복 (footer)
- `<View wrap={false}>` → 행 중간 분할 방지
- `<Text render={({ pageNumber, totalPages }) => ...} />` → 페이지 번호
- SVG 미지원 → 로고는 PNG 또는 텍스트 fallback ("GV INTERNATIONAL")

### TypeScript Notes
- `react-pdf` 스타일 배열: `style={[baseStyle, { width: "20%" }]}` ✓
- `pdf()` 타입: `(element: ReactElement) => { toBlob(): Promise<Blob> }`
- 동적 import 경로: Vite 정적 분석으로 타입 추론 가능
