# Phase 9: PDF Generation - 종합 브레인스토밍

**Date:** 2026-03-06
**Status:** Implementation-Ready Brainstorming
**Prerequisite:** Phase 2-8 완료 (모든 문서 모듈)
**참조:** `.claude/docs/PDF_RESEARCH_RESULT.md` (기초 리서치)

---

## 1. Executive Summary

6개 무역서류(PO, PI, CI, PL, SL, Invoice)의 PDF 생성 기능 구현.

**핵심 결정:**
- `@react-pdf/renderer v4.3.2` 클라이언트(브라우저) 전용
- All-English PDF (무역서류 표준 + 한국어 폰트 이슈 완전 회피)
- Helvetica 기본 내장 폰트 (추가 파일 0KB, 설정 0줄)
- Dynamic `import()` in click handler (React.lazy가 아닌 imperative 패턴)
- 기존 loaderData 직접 사용 (추가 서버 라우트/DB 변경 없음)

---

## 2. Agent Team & File Ownership

| # | Role | File | 주요 분석 내용 |
|---|------|------|--------------|
| 1 | **Architect** | [architect-notes.md](../brainstorm/phase9/architect-notes.md) | 컴포넌트 아키텍처, 데이터 플로우, 통합 전략, Phase 분할 |
| 2 | **Frontend Dev** | [frontend-notes.md](../brainstorm/phase9/frontend-notes.md) | react-pdf API, 6개 템플릿 레이아웃, 공통 컴포넌트 코드, UX |
| 3 | **Perf Analyzer** | [perf-notes.md](../brainstorm/phase9/perf-notes.md) | 번들 격리, 런타임 성능, lazy loading, 메모리 관리 |
| 4 | **Researcher** | [research-notes.md](../brainstorm/phase9/research-notes.md) | react-pdf v4 API, 무역서류 표준, 다운로드 UX, iOS 호환성 |
| 5 | **Code Reviewer** | [code-review-notes.md](../brainstorm/phase9/code-review-notes.md) | 기존 코드 패턴, 통합 포인트, 잠재 이슈 |

**제외:** backend-dev (서버 변경 없음), tester (브레인스토밍 단계), security-reviewer (새 공격 표면 없음)

---

## 3. Technical Architecture

### 3.1 File Structure

```
app/
  components/pdf/
    shared/
      pdf-styles.ts           # StyleSheet.create (Helvetica, A4, typography)
      pdf-header.tsx           # Logo + title + doc no + date
      pdf-footer.tsx           # Page number (render prop, fixed), company info
      pdf-table.tsx            # Generic table (columns + data + totalRow)
      pdf-parties.tsx          # Two-column: Seller/Buyer or Shipper/Consignee
      pdf-terms.tsx            # Payment/Delivery/Port terms row
      pdf-utils.ts             # PDF-specific formatters + triggerDownload
    po-document.tsx            # PO PDF template
    pi-document.tsx            # PI PDF template
    ci-document.tsx            # CI PDF template
    pl-document.tsx            # PL PDF template
    sl-document.tsx            # SL PDF template (per-container)
    invoice-document.tsx       # Customs Invoice PDF template
  hooks/
    use-pdf-download.ts        # Loading state + error handling hook
```

**Flat 구조 근거:** 13개 파일 — `templates/` 하위 폴더 불필요. 기존 `components/{domain}/` 패턴과 일치.

### 3.2 Dependency Graph

```
use-pdf-download.ts (hook)
  -> dynamic import("@react-pdf/renderer")
  -> dynamic import("[po|pi|ci|pl|sl|invoice]-document.tsx")

po/pi-document.tsx
  -> shared/pdf-header, pdf-parties, pdf-terms, pdf-table, pdf-footer, pdf-utils

ci-document.tsx
  -> shared/pdf-header, pdf-parties, pdf-terms, pdf-table, pdf-footer, pdf-utils
  (+ shipping info section)

pl-document.tsx
  -> same as CI (가격 열 제외, weight summary 추가)

sl-document.tsx
  -> shared/pdf-header, pdf-table, pdf-footer, pdf-utils
  (NO pdf-parties, NO pdf-terms)

invoice-document.tsx
  -> shared/pdf-header, pdf-footer, pdf-utils
  (NO pdf-parties, NO pdf-terms, custom fee table)
```

### 3.3 Data Flow (No DTO, Direct Pass-Through)

```
사용자: 상세 페이지 DropdownMenu에서 "PDF 다운로드" 클릭
  -> usePDFDownload hook: setLoading(true)
  -> dynamic import("@react-pdf/renderer") + import("~/components/pdf/[type]-document")
  -> pdf(<Document data={loaderData} />).toBlob()
  -> triggerDownload(blob, filename)
  -> toast.success() / toast.error()
  -> setLoading(false)
```

**핵심:** 추가 서버 라우트, fetch, Supabase 쿼리 없음. 기존 loaderData 100% 재사용.

### 3.4 Props Type Mapping

| Document | Props Type | 비고 |
|----------|-----------|------|
| PO | `{ data: POWithOrgs }` | 직접 전달 |
| PI | `{ data: PIWithOrgs }` | 직접 전달 |
| CI | `{ data: ShippingWithOrgs }` | 직접 전달 |
| PL | `{ data: ShippingWithOrgs }` | CI와 동일 데이터, 다른 열 |
| SL | `{ data: ShippingWithOrgs; stuffingList: StuffingList }` | 컨테이너 선택 |
| Invoice | `{ data: CustomsDetail }` | 직접 전달 |

**중간 DTO 불필요:** 타입이 안정적(Phase 2-7 완료), 읽기 전용, TypeScript가 필드 변경 감지.

---

## 4. Integration Strategy

### 4.1 PDF 버튼 배치: DropdownMenu 항목

모든 상세 페이지의 기존 액션 DropdownMenu에 PDF 다운로드 항목 추가.

**근거:**
- PDF 다운로드는 2차 액션 (매번 사용하지 않음)
- Header에 별도 버튼 추가 시 모바일 오버플로우 위험
- "PI 작성", "통관 생성" 등 기존 액션과 동일한 패턴
- DropdownMenu가 모바일 반응형을 자동 처리

### 4.2 페이지별 통합 계획

| Page | Route | Data | PDF Actions | 위치 |
|------|-------|------|-------------|------|
| PO Detail | `_layout.po.$id.tsx` | `po: POWithOrgs` | "PDF 다운로드" | DropdownMenu item |
| PI Detail | `_layout.pi.$id.tsx` | `pi: PIWithOrgs` | "PDF 다운로드" | DropdownMenu item |
| Shipping Detail | `_layout.shipping.$id.tsx` | `shipping: ShippingWithOrgs` | "CI 다운로드" / "PL 다운로드" / "SL 다운로드" | Flat DropdownMenu items |
| Customs Detail | `_layout.customs.$id.tsx` | `customs: CustomsDetail` | "인보이스 다운로드" | DropdownMenu item |

### 4.3 Shipping 3종 PDF 처리

Flat DropdownMenuItem 3개 (Sub-menu 불필요):
```
수정
복제
---
CI 다운로드
PL 다운로드
SL 다운로드        (stuffing_lists가 있을 때만 표시)
---
통관 생성
---
삭제
```

SL은 모든 컨테이너를 1개 PDF로 합침 (컨테이너별 `<View break>`로 페이지 분리).

### 4.4 usePDFDownload Hook

```typescript
// app/hooks/use-pdf-download.ts
export function usePDFDownload() {
  const [loading, setLoading] = useState(false);

  const download = useCallback(async (
    generatePDF: () => Promise<Blob>,
    filename: string
  ) => {
    setLoading(true);
    try {
      const blob = await generatePDF();
      triggerDownload(blob, filename);
      toast.success("PDF가 다운로드되었습니다.");
    } catch {
      toast.error("PDF 생성에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, download };
}
```

**사용 예시 (PO Detail):**
```typescript
const { loading: isPDFLoading, download: downloadPDF } = usePDFDownload();

async function handlePDFDownload() {
  await downloadPDF(async () => {
    const [{ pdf }, { PODocument }] = await Promise.all([
      import("@react-pdf/renderer"),
      import("~/components/pdf/po-document"),
    ]);
    return pdf(<PODocument data={po} />).toBlob();
  }, `PO_${po.po_no}.pdf`);
}
```

---

## 5. 6개 Document Template 레이아웃

### 5.1 PO / PI (거의 동일)

```
+----------------------------------------------------------+
|  [Logo]                           PURCHASE ORDER          |
|                                   No: PO-2601-001         |
|                                   Date: Mar 15, 2026      |
+----------------------------------------------------------+
|  SUPPLIER                    |  BUYER                     |
|  CHP Co., Ltd.               |  Saelim Co., Ltd.         |
|  123 Industrial Road         |  456 Business Ave          |
+----------------------------------------------------------+
|  Payment: T/T 30 days   |  Delivery: CIF               |
|  Loading: Keelung       |  Discharge: Busan             |
+----------------------------------------------------------+
| No | Product      | GSM | Width | Qty(KG) | Price | Amt  |
|----|--------------|-----|-------|---------|-------|------|
|  1 | Glassine Ppr |  40 |   780 |  12,000 | 1.20  |14,400|
|                                    TOTAL    USD 25,200.00 |
+----------------------------------------------------------+
|  GV International Co., Ltd.            Page 1 / 1         |
+----------------------------------------------------------+
```

PI 차이: 제목 "PROFORMA INVOICE", PI No/Date, PO Ref 표시.

### 5.2 CI (Commercial Invoice)

PO와 동일한 구조에 **Shipping Info** 섹션 추가:
```
|  Vessel: Ever Given    |  Voyage: V.025E               |
|  Ship Date: Mar 18     |  ETD: Mar 19  |  ETA: Mar 25  |
```
+ Weight Summary (Gross/Net/Package)
+ Signature Block ("Authorized Signature")

### 5.3 PL (Packing List)

CI와 동일 레이아웃, **가격 열(Unit Price, Amount) 제외**. 중량 중심.

### 5.4 SL (Stuffing List)

```
+----------------------------------------------------------+
|  [Logo]                         STUFFING LIST             |
|  Container: CNTR12345         Seal: SEAL789               |
+----------------------------------------------------------+
| Roll | Product | GSM | Width | Length | Net Wt | Gross Wt |
|------|---------|-----|-------|--------|--------|----------|
|    1 | Glassine|  40 |   780 |  3,200 |  500.0 |    510.5 |
|  ... |   ...   | ... |   ... |    ... |    ... |      ... |
|   24 | Glassine|  40 |   780 |  3,180 |  498.0 |    508.2 |
|                    TOTAL: 24 rolls  | 12,000  |   12,250 |
+----------------------------------------------------------+
```

50-200+ 행 -> 자동 페이지네이션. 헤더 행 `fixed` prop으로 매 페이지 반복.
각 컨테이너 `<View break>`로 새 페이지 시작.

### 5.5 Invoice (Customs Cost)

```
+----------------------------------------------------------+
|                  CUSTOMS CLEARANCE INVOICE                 |
|  Reference: CI-2601-001  |  Vessel: Ever Given            |
+----------------------------------------------------------+
|  Category        |  Supply Amount  |  VAT    |  Total     |
|------------------|----------------|---------|------------|
|  Transport Fee   |      500,000   |  50,000 |    550,000 |
|  Customs Duty    |    1,200,000   |       0 |  1,200,000 |
|  VAT (Import)    |            0   | 120,000 |    120,000 |
|  Others          |      100,000   |  10,000 |    110,000 |
|  GRAND TOTAL     |    1,800,000   | 180,000 |  1,980,000 |
+----------------------------------------------------------+
|  Payment Status: PAID / UNPAID                            |
+----------------------------------------------------------+
```

KRW 통화 (소수점 없음). `calcTotalFees()` 재사용 가능.

---

## 6. Shared Components Design

### 6.1 pdf-styles.ts
- A4 페이지: padding 40pt, paddingBottom 60pt (footer 공간)
- 기본 폰트: `Helvetica` (Regular, Bold, Oblique, BoldOblique)
- 기본 크기: 9pt (본문), 18pt (제목), 8pt (라벨), 7pt (footer)
- 색상: zinc-900 (본문), zinc-500 (라벨), zinc-300 (테두리), zinc-100 (헤더 배경)

### 6.2 pdf-utils.ts (PDF 전용 포맷터)

| 함수 | 입력 | 출력 | 비고 |
|------|------|------|------|
| `formatPdfDate` | `"2026-03-15"` | `"Mar 15, 2026"` | en-US 로케일 (ko-KR 아님!) |
| `formatPdfCurrency` | `25200, "USD"` | `"USD 25,200.00"` | KRW: 소수점 없음 |
| `formatPdfNumber` | `12000, 0` | `"12,000"` | 수량/중량용 |
| `formatPdfWeight` | `12500.5` | `"12,500.500 KG"` | 3자리 소수 |
| `formatPdfDateFile` | `"2026-03-15"` | `"20260315"` | 파일명용 |
| `triggerDownload` | `blob, filename` | void | Blob URL -> `<a>` click |

**핵심:** `lib/format.ts`의 `formatDate`(ko-KR)를 PDF에서 사용 금지. 별도 정의.

### 6.3 pdf-table.tsx

```typescript
export interface PDFColumn {
  key: string;
  label: string;
  width: string;        // "20%"
  align?: "left" | "center" | "right";
}

interface PDFTableProps {
  columns: PDFColumn[];
  data: Record<string, string | number>[];
  totalRow?: Record<string, string>;
}
```

- 헤더 행: `fixed` prop (매 페이지 반복)
- 데이터 행: `wrap={false}` (행 중간 분할 방지)
- Total 행: `wrap={false}` + bold 스타일

### 6.4 pdf-header.tsx

```typescript
interface PDFHeaderProps {
  title: string;          // "PURCHASE ORDER"
  docNo: string;          // "PO-2601-001"
  date?: string;          // "Mar 15, 2026"
  logoSrc?: string;       // "/images/gv-logo.png"
  subtitle?: string;      // "Ref: PI-2601-001"
  extraFields?: Array<{ label: string; value: string }>;
}
```

Logo: `public/images/gv-logo.png` (PNG, 240x80px). Fallback: 텍스트 "GV INTERNATIONAL".

---

## 7. Performance & Bundle Strategy

### 7.1 Critical: vite.config.ts 설정 (MUST)

```typescript
// @react-pdf/renderer가 서버 번들에 포함되면 앱 전체 크래시
ssr: {
  noExternal: ["@react-pdf/renderer"],
},
optimizeDeps: {
  exclude: ["@react-pdf/renderer"],
},
```

### 7.2 Bundle Impact

| Bundle | Impact |
|--------|--------|
| SSR (server) | **+0 KB** (dynamic import 격리) |
| Client initial | **+0 KB** (lazy chunk) |
| Client PDF chunk | **~900 KB gzip** (클릭 시 1회 로드) |
| Font | **0 KB** (Helvetica 내장) |

### 7.3 Runtime Performance

| 시나리오 | 첫 클릭 | 이후 클릭 |
|---------|--------|---------|
| Desktop | 700-1500ms | 200-500ms |
| Mobile (high) | 800-2000ms | 300-800ms |
| SL 200+ rows | 1000-3000ms | 500-2000ms |

### 7.4 Lazy Loading 패턴: Dynamic Import in Click Handler

ContentEditor와 다른 점:
- ContentEditor: `React.lazy()` + `<Suspense>` (컴포넌트 렌더링 지연)
- PDF: `await import()` in click handler (blob 생성, DOM 렌더링 없음)
- 버튼 UI 즉시 표시, chunk는 클릭 시에만 로드

### 7.5 Post-Build 검증 (MUST)

```bash
grep -r "yoga\|react-pdf" dist/_worker.js | head -5
# 결과 없어야 함 (서버 번들 오염 없음)
```

---

## 8. Code Review 핵심 발견

### 8.1 Must Fix
- `formatDate` (ko-KR) -> PDF에서 사용 금지, `formatPdfDate` (en-US) 별도 정의
- `@react-pdf/renderer` 미설치 -> Phase 9-A 시작 전 설치
- `console.error` 코드 예시 -> 커밋 코드에서 제거

### 8.2 Should Fix
- Shipping DropdownMenu: flat 항목 (Sub-menu 불필요)
- notes 필드: 모든 PDF 템플릿에서 제외 확인
- `formatPdfNumber()` 별도 정의 (currency formatter 해킹 대신)
- SL multi-container: `<View break>` 로 페이지 분리

### 8.3 Positive (변경 불필요)
- `Download`, `FileDown` 아이콘 이미 `icons.tsx`에 존재
- `DropdownMenuSub`/`SubTrigger`/`SubContent` 이미 구현됨
- `calcTotalFees()` 순수 함수 -> Invoice에서 직접 import 가능
- 4개 loader 모두 org 데이터(`name_en`, `address_en`) 이미 포함
- 중간 변환 타입 불필요 (기존 타입 직접 사용)

---

## 9. Research 핵심 발견

### 9.1 react-pdf v4 API
- v4: ESM 전용 (CJS 제거) -> Vite 프로젝트 호환
- `pdf().toBlob()` 방식 권장 (`usePDF` 훅은 마운트 즉시 생성 시작)
- `minPresenceAhead`: 중첩 View에서 무한 루프 버그 -> 각 행 `wrap={false}` 사용
- SVG Image: 미지원 -> 로고는 PNG 사용
- `totalPages`: `<Text render>` 에서만 가능 (`<View render>` 미지원)

### 9.2 iOS Safari 다운로드
- `<a download>` + click(): Desktop/Android 완벽, iOS Safari 새 탭 폴백
- Saelim 주 사용자: GV PC -> iOS 베스트에포트 충분
- Firefox 호환: `document.body.appendChild(a)` 필요

### 9.3 회사 로고
- `public/images/gv-logo.png` (PNG, 240x80px, ~10-30KB)
- SVG 로고 있으면 PNG 변환 필요

---

## 10. Implementation Phase Plan

### Phase 9-A: Foundation + PO/PI

**새 파일 (10개):**
1. `app/components/pdf/shared/pdf-styles.ts`
2. `app/components/pdf/shared/pdf-utils.ts` (formatters + triggerDownload)
3. `app/components/pdf/shared/pdf-header.tsx`
4. `app/components/pdf/shared/pdf-footer.tsx`
5. `app/components/pdf/shared/pdf-parties.tsx`
6. `app/components/pdf/shared/pdf-terms.tsx`
7. `app/components/pdf/shared/pdf-table.tsx`
8. `app/components/pdf/po-document.tsx`
9. `app/components/pdf/pi-document.tsx`
10. `app/hooks/use-pdf-download.ts`

**수정 파일 (4개):**
11. `package.json` -> `@react-pdf/renderer` 추가
12. `vite.config.ts` -> SSR exclusion 설정
13. `app/routes/_layout.po.$id.tsx` -> PDF menu item + hook
14. `app/routes/_layout.pi.$id.tsx` -> PDF menu item + hook

**검증:**
- PO/PI PDF 다운로드 정상 동작
- 파일명 규칙 적용
- 서버 번들 오염 없음 확인
- 로딩 상태 + toast 피드백

### Phase 9-B: CI + PL + SL (Shipping Documents)

**새 파일 (3개):**
1. `app/components/pdf/ci-document.tsx`
2. `app/components/pdf/pl-document.tsx`
3. `app/components/pdf/sl-document.tsx`

**수정 파일 (1개):**
4. `app/routes/_layout.shipping.$id.tsx` -> CI/PL/SL menu items

**검증:**
- CI: 선적 정보 + 서명 블록
- PL: 가격 열 제외, 중량 요약
- SL: 50+ 행 페이지네이션, multi-container 페이지 분리
- 헤더 행 매 페이지 반복 (fixed prop)

### Phase 9-C: Customs Invoice

**새 파일 (1개):**
1. `app/components/pdf/invoice-document.tsx`

**수정 파일 (1개):**
2. `app/routes/_layout.customs.$id.tsx` -> invoice menu item

**검증:**
- KRW 포맷 (소수점 없음)
- Fee breakdown 테이블
- Payment status 표시
- `calcTotalFees()` 재사용

**참고:** 9-C는 9-B와 독립적이므로 병렬 진행 가능.

---

## 11. File Naming Convention

```
PO_{po_no}.pdf                    -> PO_GVPO2601-001.pdf
PI_{pi_no}.pdf                    -> PI_GVPI2601-001.pdf
CI_{ci_no}.pdf                    -> CI_GVCI2601-001.pdf
PL_{pl_no}.pdf                    -> PL_GVPL2601-001.pdf
SL_{sl_no}_{cntr_no}.pdf          -> SL_SL-001_CNTR12345.pdf
Invoice_{customs_no}.pdf          -> Invoice_C-2601-001.pdf
```

문서 번호에 이미 연월 인코딩됨 -> 날짜 접미사 불필요.

---

## 12. Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Server bundle WASM contamination | **Critical** | vite.config.ts SSR exclusion + post-build grep 검증 |
| SL 200+ rows main thread blocking | Medium | Loading indicator; Web Worker는 향후 필요 시 |
| iOS Safari download fallback | Low | 새 탭 열기 허용; 주 사용자 PC |
| Logo image missing | Low | Text fallback "GV INTERNATIONAL" |
| react-pdf lineHeight bug (v4.1.3) | Low | lineHeight 사용 최소화 |
| notes 필드 한국어 | None | PDF에서 notes 제외 (내부 메모) |
| 한국어 폰트 렌더링 | **None** | All-English 결정으로 완전 회피 |

---

## 13. Open Questions (구현 시 결정)

1. **Logo 파일:** GV International PNG 로고 준비 필요. 없으면 텍스트 fallback.
2. **CI Shipping Info 레이아웃:** parties와 terms 사이 별도 섹션 vs terms에 통합 -> 별도 섹션 권장.
3. **SL roll_details 빈 데이터:** 빈 roll_details 시 "No roll details available" 표시.
4. **Invoice 제목:** "CUSTOMS CLEARANCE INVOICE" 권장 (more formal).
5. **회사 연락처:** PDF header/footer에 전화/팩스 포함 여부 -> Phase 9-A 생략, 필요 시 추가.

---

## 14. Trade-offs Summary

| Decision | Chosen | Alternative | Rationale |
|----------|--------|-------------|-----------|
| Data mapping | Direct pass-through | DTO layer | Types stable, DTO adds boilerplate |
| Button placement | DropdownMenu items | Separate buttons | Consistent, saves space, mobile-friendly |
| Lazy loading | Dynamic import() in handler | React.lazy + Suspense | PDF is imperative (blob), not rendered |
| Logo source | public/ static asset | Supabase Storage | One logo, never changes |
| File structure | Flat under pdf/ | Nested templates/ | 13 files, nesting unnecessary |
| Font | Helvetica (built-in) | Custom Inter/Noto | Zero config, All-English |
| SL granularity | Combined PDF (page break/container) | Separate per container | Single download, simpler UX |
| Phase order | 9-A -> 9-B -> 9-C | CI first | PO/PI simplest, validates shared components |
| Utility file | pdf-utils.ts (separate) | Reuse lib/format.ts | PDF needs locale-independent formatting |
| Hook vs function | usePDFDownload hook | Standalone function | Hook manages loading state |
| Shipping PDF menu | Flat items | Sub-menu | Simpler interaction, 7 total items acceptable |

---

## 15. Supabase 관련 사항

**DB 변경: 없음.** Phase 9는 순수 프론트엔드 작업.
- 새 테이블/컬럼/마이그레이션 불필요
- RLS 정책 변경 불필요
- 기존 loaderData가 모든 PDF 데이터 제공

**향후 서버사이드 확장 시 (배치 내보내기, 이메일 첨부):**
- Supabase Edge Function + pdf-lib 또는 CF Browser Rendering 고려
- KV 캐싱: `pdf:{type}:{id}:{updated_at}` 키

---

## 16. Estimated Effort

| Phase | Files | Effort | Notes |
|-------|-------|--------|-------|
| 9-A | 14 (10 new, 4 modified) | 1 session | Shared infra + PO/PI (거의 동일) |
| 9-B | 4 (3 new, 1 modified) | 1 session | CI/PL 유사, SL 독립 |
| 9-C | 2 (1 new, 1 modified) | 0.5 session | Custom layout, 간단한 문서 |
| **Total** | **~20 files** | **~2.5 sessions** | 9-C는 9-B와 병렬 가능 |
