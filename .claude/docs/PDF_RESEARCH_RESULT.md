# Phase 9: PDF Generation - Research Result

**Date:** 2026-03-06
**Research Depth:** Exhaustive
**Agents Used:** researcher, architect, frontend-dev, perf-analyzer

---

## Executive Summary

PDF 생성을 위한 기술 조사 결과, **@react-pdf/renderer v4.3.2를 클라이언트(브라우저) 전용으로 사용**하는 것이 최적의 방법으로 결론.

- CF Workers 서버사이드에서는 yoga-layout WASM 제약으로 @react-pdf/renderer 실행 불가
- 브라우저에서는 WASM 제약 없이 완벽 동작
- 기존 detail page의 loaderData를 그대로 사용 → 추가 서버 라우트 불필요
- React.lazy() 동적 임포트로 번들 영향 0 (Tiptap과 동일 패턴)
- **All-English PDF 결정:** 6개 무역서류 모두 영어 전용 → 한국어 폰트 이슈 완전 회피
- 폰트: react-pdf 기본 Helvetica (추가 폰트 파일 0KB, 설정 0줄)

---

## 1. 기술 결정 사항

### 1.1 라이브러리 선택

| 결정 항목 | 선택 | 근거 |
|-----------|------|------|
| PDF 라이브러리 | @react-pdf/renderer v4.3.2 | React 컴포넌트 모델, JSX 기반, 활발한 유지보수 |
| 렌더링 위치 | Client-side only (브라우저) | CF Workers WASM 제약 회피, 서버 부하 0 |
| 폰트 | Helvetica (react-pdf 기본 내장) | 추가 파일 0KB, All-English이므로 한국어 폰트 불필요 |
| 테이블 구현 | Manual View/Text grid | 완전한 레이아웃 제어, 추가 의존성 없음 |
| 번들 전략 | React.lazy() 동적 임포트 | 초기 번들 영향 0, 클릭 시에만 ~900KB 로드 |
| 생성 API | `pdf().toBlob()` | 비동기, 로딩/에러 상태 완전 제어 |
| UX | 직접 다운로드 (프리뷰 없음) | 간단, 메모리 절약, OS PDF 뷰어에서 확인 |

### 1.2 CF Workers 호환성 분석

| 라이브러리 | 서버사이드 (CF Workers) | 클라이언트 (브라우저) | Gzip 크기 |
|-----------|----------------------|---------------------|----------|
| @react-pdf/renderer | **BLOCKED** (yoga WASM) | **Works** | ~900 KB |
| pdfmake | Works | Works | ~984 KB |
| pdf-lib | Works | Works | ~350 KB |
| jsPDF | Uncertain | Works | ~120 KB |
| CF Browser Rendering | Works (별도 과금) | N/A | 0 |

**@react-pdf/renderer가 CF Workers에서 안되는 이유:**
- `@react-pdf/layout` → `yoga-layout` → emscripten `SINGLE_FILE=1`
- WASM 바이너리를 base64로 인라인하여 런타임에 `new WebAssembly.Module(buffer)` 호출
- CF Workers V8 isolate가 동적 WASM 생성 차단: "Wasm code generation disallowed by embedder"
- 브라우저에서는 WASM 네이티브 지원으로 문제 없음

### 1.3 대안 순위

| 순위 | 방법 | 적용 시나리오 |
|------|------|-------------|
| 1 | @react-pdf/renderer (클라이언트) | **기본 선택** - 모든 6개 문서 |
| 2 | CF Browser Rendering REST API | 서버사이드 필요 시 (배치 내보내기, 이메일 첨부) |
| 3 | pdf-lib (서버) | 최소 번들(350KB), 좌표 기반 레이아웃 (개발 노력 큼) |
| 4 | CSS @media print | 임시 해결책 ("충분히 좋은" PDF 허용 시) |

---

## 2. 폰트 전략: All-English vs Korean

### 2.0 결정: All-English PDF (권장)

**핵심 발견:** 6개 문서 모두 영어 전용으로 작성 가능하며, 이 경우 한국어 폰트 이슈를 완전히 회피할 수 있음.

#### 문서별 언어 분석

| 문서 | 현재 데이터 언어 | 한국어 필요 여부 | 영어 전환 가능 |
|------|----------------|----------------|--------------|
| PO | 영어 (name_en, address_en, product_name, Incoterms) | 불필요 | 이미 영어 |
| PI | 영어 (PO와 동일 구조) | 불필요 | 이미 영어 |
| CI | 영어 (국제 세관 서류 표준) | 불필요 | 이미 영어 |
| PL | 영어 (CI와 동일 헤더) | 불필요 | 이미 영어 |
| SL | 영어 (기술 데이터: 롤번호, 중량) | 불필요 | 이미 영어 |
| Invoice | 한국어 라벨 계획 (공급가액/세액/합계) | **유일하게 한국어** | **영어 전환 가능** |

#### DB 필드 확인: 영어 데이터 이미 존재

```
organizations:
  name_en: string     (필수) ← 모든 회사명 영어 존재
  address_en: string  (선택) ← 영문 주소 존재

POLineItem / PILineItem / ShippingLineItem:
  product_name: string ← "Glassine Paper" 등 영어

payment_term: "T/T 30 days" ← 영어
delivery_term: "CIF" ← 영어 (Incoterms)
loading_port: "Keelung" ← 로마자
discharge_port: "Busan" ← 로마자
vessel: "Ever Given" ← 영어
```

#### Invoice 문서 영어 전환

비용 인보이스는 법정 세금계산서가 아닌 **내부 비용 요약 문서**이므로 영어 전환 가능:

| 한국어 라벨 | 영어 라벨 |
|------------|----------|
| 구분 | Category |
| 공급가액 | Supply Amount |
| 세액 | VAT |
| 합계 | Total |
| 운송비 | Transport Fee |
| 관세 | Customs Duty |
| 부가세 | VAT (Import) |
| 기타 | Others |
| 입금완료 | Paid |
| 미입금 | Unpaid |

#### `notes` 필드 처리

`notes` 필드(PO/PI/Shipping)에 한국어가 포함될 수 있으나:
- **Option A (권장):** PDF에서 notes 섹션 제외 - 공식 무역서류에 내부 메모 불필요
- **Option B:** notes 포함하되, 한국어 미렌더링 감수 (글자 누락/박스 표시)
- **Option C:** notes에 한국어가 있을 경우에만 경고 표시 후 제외

**권장: Option A** - notes는 내부 참고용이며 공식 PDF에 포함할 필요 없음.

### 2.1 All-English 접근 시 Pros & Cons

#### Pros

| 항목 | 상세 |
|------|------|
| **한국어 폰트 리스크 완전 제거** | react-pdf CJK 이슈 (#806, #862, #2681, #3172) 완전 회피 |
| **폰트 크기 대폭 감소** | ~500KB/weight (Korean subset) → **~20-50KB** (Latin-only, 또는 기본 Helvetica 0KB) |
| **pyftsubset 도구 불필요** | 폰트 서브세팅 단계 자체가 제거됨 |
| **첫 클릭 속도 향상** | 폰트 다운로드 80-300ms → ~0ms (기본 폰트) 또는 ~20ms (커스텀 Latin) |
| **구현 단순화** | Font.register, hyphenation callback 등 한국어 관련 설정 불필요 |
| **국제 무역 표준 준수** | PO/PI/CI/PL/SL은 원래 영어가 표준 |
| **Phase 9-A 폰트 검증 단계 제거** | 조기 검증 불필요 → 바로 템플릿 구현 가능 |
| **서버사이드 확장 용이** | 향후 pdf-lib 서버사이드 전환 시에도 CJK 문제 없음 |

#### Cons

| 항목 | 상세 | 심각도 |
|------|------|--------|
| Invoice 영어화 | 비용 인보이스 라벨이 영어로 변경됨 | **낮음** - 내부 문서, 법적 요구 없음 |
| notes 미포함 | PDF에 notes 섹션 미포함 | **낮음** - 내부 메모, 공식 서류에 불필요 |
| 향후 한국어 요구 시 재작업 | 한국어 PDF 요구 발생 시 폰트 전략 재구현 | **낮음** - 현재 요구사항에 없음 |
| Saelim 사용자 가독성 | Saelim 담당자가 영어 Invoice 읽어야 함 | **매우 낮음** - 숫자 중심, 4행 테이블 |

### 2.2 폰트 전략 (All-English)

#### Option A: react-pdf 기본 폰트 (Helvetica) - 가장 간단

```typescript
// 별도 Font.register() 불필요!
// react-pdf 기본 내장 폰트: Courier, Helvetica, Times-Roman
const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",  // 기본 제공, 추가 파일 불필요
    fontSize: 9,
  },
  bold: {
    fontFamily: "Helvetica-Bold",
  },
});
```

- 추가 폰트 파일: **0 KB**
- 추가 설정: **없음**
- 품질: 깨끗하고 전문적 (Helvetica는 비즈니스 문서 표준)

#### Option B: 커스텀 Latin 폰트 (Inter 등) - 더 나은 디자인

```typescript
import { Font } from "@react-pdf/renderer";

Font.register({
  family: "Inter",
  fonts: [
    { src: "/fonts/Inter-Regular.ttf", fontWeight: 400 },
    { src: "/fonts/Inter-Bold.ttf", fontWeight: 700 },
  ],
});
```

- Inter static TTF: **~100KB/weight** (Latin subset)
- Pretendard 기반이 Inter이므로 웹 UI와 일관된 디자인

#### 권장: Option A (Helvetica)

추가 폰트 파일 0KB, 설정 0줄, 즉시 사용 가능. 무역서류에 Helvetica는 업계 표준.

### 2.3 한국어 폰트 전략 (폴백, 필요 시에만)

All-English 결정 후에도, 향후 한국어 PDF가 필요할 경우를 위한 참고:

- Noto Sans KR static TTF subset (~500KB/weight)
- `Font.register()` + `Font.registerHyphenationCallback(word => [word])`
- react-pdf 알려진 이슈: #806, #862, #1837, #2681, #3172
- 해결 조건: language-specific Noto Sans KR (NOT CJK combined), static TTF, 사전 등록

---

## 3. 무역서류 표준 양식

### 3.1 6개 문서 유형 분석

#### Purchase Order (PO) - 구매주문서
- **방향:** Buyer(Saelim) → Supplier(CHP)
- **용도:** 구매 의사 표시
- **레이아웃:** Portrait A4
- **구조:**
  - Header: "PURCHASE ORDER", PO No, Date, Validity
  - Parties: Supplier(왼쪽) / Buyer info + PO 정보(오른쪽)
  - Terms: Payment, Delivery(Incoterms), Loading/Discharge Port
  - Table: Product | GSM | Width(mm) | Qty(KG) | Unit Price | Amount
  - Total: Currency + Total Amount
  - Notes
- **데이터 소스:** `POWithOrgs` (loaderData 그대로 사용)

#### Proforma Invoice (PI) - 견적 송장
- **방향:** Supplier(CHP) → Buyer(GV/Saelim)
- **용도:** 선적 전 가격 확인
- **레이아웃:** PO와 거의 동일
- **차이점:** PI No, PI Date, PO 참조번호 추가
- **데이터 소스:** `PIWithOrgs`

#### Commercial Invoice (CI) - 상업 송장
- **방향:** Shipper → Consignee (세관 신고용)
- **용도:** 통관 시 필수 서류
- **레이아웃:** Portrait A4
- **구조:**
  - Header: "COMMERCIAL INVOICE", CI No, Date
  - Parties: Shipper / Consignee (각각 주소 포함)
  - Shipping: Vessel, Voyage, Ship Date, ETD, ETA
  - Terms: Payment, Delivery, Loading/Discharge Port
  - Table: Product | GSM | Width(mm) | Qty(KG) | Unit Price | Amount
  - Weight Summary: Gross Weight, Net Weight, Package Count
  - Signature Block
- **데이터 소스:** `ShippingWithOrgs`
- **한국 세관 요구:** CI 원본 + 사본 2부 제출, HS Code, 원산지 포함

#### Packing List (PL) - 포장 명세서
- **방향:** CI와 동일
- **용도:** 물리적 포장 정보
- **레이아웃:** CI와 동일한 헤더, **가격 열 제외**
- **차이점:** 가격 미표시, 중량/수량 중심
- **데이터 소스:** `ShippingWithOrgs` (동일 데이터, 다른 열 표시)

#### Stuffing List (SL) - 적입 명세서
- **방향:** 컨테이너 단위 상세
- **용도:** 개별 롤 레벨 정보
- **레이아웃:** Portrait A4 (많은 행 → 페이지네이션 필요)
- **구조:**
  - Header: "STUFFING LIST", SL No
  - Container Info: CNTR No, Seal No, Roll Range
  - Table: Roll No | Product | GSM | Width(mm) | Length(M) | Net Wt | Gross Wt
  - Totals: Total Rolls, Total Net/Gross Weight
- **데이터 소스:** `StuffingList` + `StuffingRollDetail[]` (ShippingWithOrgs 내 중첩)
- **주의:** 50-200+ 행 가능 → `wrap` prop 활용한 페이지 분할 테스트 필요

#### Invoice (Cost Summary) - 통관비용 인보이스
- **방향:** GV → Saelim
- **용도:** 통관비 및 기타경비 청구
- **레이아웃:** Portrait A4, **All-English 라벨**
- **구조:**
  - Header: "COST INVOICE" / "CUSTOMS CLEARANCE INVOICE"
  - Reference: CI No, Vessel, ETA
  - Fee Table (English labels):
    - Category | Supply Amount | VAT | Total
    - Transport Fee | Customs Duty | VAT (Import) | Others
  - Grand Total
  - Payment Status: Paid / Unpaid
- **데이터 소스:** `CustomsDetail` + `FeeBreakdown` JSONB
- **참고:** 법정 세금계산서가 아닌 내부 비용 요약 문서 → 영어 라벨 사용

### 3.2 공통 구조 (Shared Components)

모든 무역서류가 공유하는 4개 섹션:
1. **Header** - 회사 로고, 문서 제목, 문서 번호, 날짜
2. **Parties** - Seller/Buyer 또는 Shipper/Consignee 정보 블록
3. **Terms** - Payment Term, Delivery Term, Port 정보
4. **Line Items Table** - 품목 테이블 (열 구성만 다름)
5. **Footer** - 페이지 번호, 회사 정보

### 3.3 Incoterms (무역조건)

- 대만-한국 글라신지 무역: 주로 **CIF** 또는 **CFR** 사용
- CIF: 보험 포함, CFR: 보험 미포함
- 모든 5개 무역서류(PO, PI, CI, PL, SL)에 표시

---

## 4. 성능 분석

### 4.1 클라이언트 사이드 성능 (권장 방식)

| 지표 | 첫 클릭 | 이후 (캐시됨) |
|------|--------|-------------|
| 라이브러리 로드 | 500-1,200ms (chunk 다운로드) | ~0ms (브라우저 캐시) |
| 폰트 다운로드 | ~0ms (Helvetica 기본 내장) | ~0ms |
| PDF 생성 시간 | 200-800ms (디바이스 의존) | 200-800ms |
| **총 소요 시간** | **~700-2,000ms** | **~200-800ms** |
| 모바일 (중급) | ~1,000-3,000ms | ~400-1,200ms |
| 서버 부하 | 0 | 0 |

### 4.2 번들 사이즈 영향

- 현재 SSR 번들: ~500-600 KB gzip
- @react-pdf/renderer 추가: **서버 번들 영향 0** (클라이언트 전용 lazy chunk)
- 클라이언트 lazy chunk: ~900 KB gzip (PDF 클릭 시에만 로드)
- 폰트 파일: 0 KB (Helvetica 기본 내장, All-English)

### 4.3 메모리/CPU 제약 (서버사이드 참고)

- CF Workers 메모리: 128MB → 클라이언트 생성이므로 해당 없음
- CF Workers CPU: 30s → 클라이언트 생성이므로 해당 없음
- 브라우저: 제한 없음 (일반적인 2페이지 문서에 충분)

### 4.4 캐싱 전략 (향후 서버사이드 확장 시)

```
요청 → Supabase에서 updated_at 조회
     → 캐시 키: pdf:ci:{id}:{updated_at_ts}
     → KV.get(key)
         HIT  → PDF 즉시 반환 (0ms 생성)
         MISS → 폰트 로드 → PDF 생성 → KV.put(key, pdf, TTL 24h) → 반환
```

- 무역서류는 확정 후 거의 변경 없음 → 캐싱 효과 높음
- 명시적 캐시 무효화 불필요 (updated_at 기반 키 자동 변경)

---

## 5. 구현 아키텍처

### 5.1 파일 구조

```
app/
  components/
    pdf/
      shared/
        pdf-styles.ts         # 공통 StyleSheet 정의 (Helvetica 기본 폰트)
        pdf-header.tsx        # 문서 헤더 (로고, 제목, 문서번호)
        pdf-footer.tsx        # 페이지 번호, 회사 정보
        pdf-table.tsx         # 재사용 테이블 (View/Text grid)
        pdf-parties.tsx       # Seller/Buyer 정보 블록
        pdf-terms.tsx         # Payment/Delivery 조건 블록
        pdf-utils.ts          # 통화/날짜/중량 포맷팅
      po-document.tsx         # PO PDF 템플릿
      pi-document.tsx         # PI PDF 템플릿
      ci-document.tsx         # CI PDF 템플릿
      pl-document.tsx         # PL PDF 템플릿
      sl-document.tsx         # SL PDF 템플릿
      invoice-document.tsx    # 비용 인보이스 PDF 템플릿
      pdf-download-button.tsx # 다운로드 버튼 (loading state 포함)
```

### 5.2 데이터 플로우

```
사용자가 상세 페이지에서 "PDF 다운로드" 클릭
  → React.lazy()로 PDF 모듈 동적 로드 (첫 클릭 시 1회)
  → 기존 loaderData에서 데이터 전달 (추가 fetch 없음)
  → pdf(<PODocument data={po} />).toBlob()
  → Blob URL 생성 → <a> 태그로 다운로드 트리거
  → URL.revokeObjectURL() 정리
```

**핵심:** 새로운 서버 라우트나 API 엔드포인트 불필요. 기존 상세 페이지 로더가 이미 모든 데이터를 제공.

### 5.3 통합 포인트 (기존 페이지에 버튼 추가)

| 페이지 | 버튼 | 데이터 타입 |
|--------|------|------------|
| `/po/:id` | PO PDF 다운로드 | `POWithOrgs` |
| `/pi/:id` | PI PDF 다운로드 | `PIWithOrgs` |
| `/shipping/:id` | CI / PL / SL 다운로드 (드롭다운) | `ShippingWithOrgs` |
| `/customs/:id` | 비용 인보이스 다운로드 | `CustomsDetail` |

### 5.4 Lazy Loading 패턴 (Tiptap 선례 동일)

```tsx
// 상세 페이지에서
const PDFDownloadButton = React.lazy(
  () => import("~/components/pdf/pdf-download-button")
);

<Suspense fallback={<Button disabled>PDF</Button>}>
  <PDFDownloadButton
    generatePDF={() => pdf(<PODocument data={po} />).toBlob()}
    filename={`PO_${po.po_no}_${po.po_date.replace(/-/g, "")}.pdf`}
  />
</Suspense>
```

### 5.5 파일 명명 규칙

```
PO_{po_no}_{YYYYMMDD}.pdf         → PO_PO-2601-001_20260115.pdf
PI_{pi_no}_{YYYYMMDD}.pdf         → PI_PI-2601-001_20260115.pdf
CI_{ci_no}_{YYYYMMDD}.pdf         → CI_CI-2601-001_20260115.pdf
PL_{pl_no}_{YYYYMMDD}.pdf         → PL_PL-2601-001_20260115.pdf
SL_{sl_no}_{cntr_no}.pdf          → SL_SL-001_CNTR12345.pdf
Invoice_{customs_no}.pdf          → Invoice_C-2601-001.pdf
```

---

## 6. 구현 단계 (Phase 9 하위 분할)

### Phase 9-A: 기반 구축 + PO/PI
1. `@react-pdf/renderer` 설치
2. `pdf-styles.ts` - 공통 A4 페이지, Helvetica 폰트, 마진, 타이포그래피
3. Shared components: pdf-header, pdf-footer, pdf-table, pdf-parties, pdf-terms, pdf-utils
4. `pdf-download-button.tsx` - 로딩/에러 상태 포함
5. `po-document.tsx` - PO PDF 템플릿
6. `pi-document.tsx` - PI PDF 템플릿 (PO와 거의 동일)
7. PO/PI 상세 페이지에 다운로드 버튼 통합

### Phase 9-B: 선적서류 템플릿 (CI + PL + SL)
8. `ci-document.tsx` - 선적 상세 섹션 추가
9. `pl-document.tsx` - 가격 열 제외, 중량 중심
10. `sl-document.tsx` - 롤 상세 테이블, 컨테이너 정보
11. Shipping 상세 페이지에 드롭다운 메뉴 (CI/PL/SL 3개 버튼)

### Phase 9-C: 비용 인보이스 템플릿
12. `invoice-document.tsx` - 영어 비용 테이블 (Supply Amount/VAT/Total)
13. Customs 상세 페이지에 다운로드 버튼
14. 전체 문서 최종 검증

---

## 7. 리스크 및 완화 방안

| 리스크 | 영향 | 완화 방안 |
|--------|------|----------|
| ~~한국어 폰트 렌더링 실패~~ | ~~높음~~ | **제거됨** - All-English 결정으로 한국어 폰트 불필요 |
| SL 200+ 행 페이지네이션 | 낮음 | `wrap` prop 테스트, 필요 시 페이지 강제 분할 |
| 첫 클릭 지연 (~1초) | 낮음 | 로딩 인디케이터 표시 (폰트 다운로드 없으므로 지연 감소) |
| 회사 로고 로딩 | 낮음 | `public/images/` 정적 에셋 사용 (Supabase URL 아님) |
| react-pdf 번들 크기 | 낮음 | React.lazy() 동적 임포트, 초기 번들 영향 0 |
| notes 한국어 미지원 | 매우 낮음 | PDF에서 notes 섹션 제외 (내부 메모, 공식 서류에 불필요) |

---

## 8. 에이전트별 상세 노트 참조

| 에이전트 | 파일 | 주요 내용 |
|---------|------|----------|
| architect | `.claude/docs/brainstorm/phase9/architect-notes.md` | 5가지 아키텍처 옵션 비교, 데이터 플로우, 순위 추천 |
| frontend-dev | `.claude/docs/brainstorm/phase9/frontend-notes.md` | react-pdf API, 컴포넌트 트리, 코드 예제, UX 패턴 |
| perf-analyzer | `.claude/docs/brainstorm/phase9/perf-notes.md` | 런타임 분석, 번들 크기, 폰트 성능, 캐싱 전략 |
| researcher | `.claude/docs/brainstorm/phase9/research-notes.md` | 무역서류 표준, 라이브러리 비교, SSR+Edge 모범사례 |

---

## 9. Sources (종합)

### CF Workers & WASM
- [CF Workers WASM Docs](https://developers.cloudflare.com/workers/runtime-apis/webassembly/)
- [CF Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)
- [CF Workers Node.js Compat](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)
- [Yoga in CF Workers 2025](https://pmil.me/en/posts/yoga-in-cloudflare-workers)
- [react-pdf CF Workers Issue #2757](https://github.com/diegomura/react-pdf/issues/2757)

### PDF Libraries
- [@react-pdf/renderer npm](https://www.npmjs.com/package/@react-pdf/renderer)
- [react-pdf.org Fonts](https://react-pdf.org/fonts)
- [react-pdf.org Advanced](https://react-pdf.org/advanced)
- [pdfmake on CF Workers](https://gist.github.com/daliborgogic/1bfa57ce0e0f3cdcd75bf8998442f775)
- [pdf-lib docs](https://pdf-lib.js.org/)
- [PDF Libraries Comparison 2025](https://joyfill.io/blog/comparing-open-source-pdf-libraries-2025-edition)

### Korean Font Issues (react-pdf)
- [Issue #806 - Korean font](https://github.com/diegomura/react-pdf/issues/806)
- [Issue #862 - Korean rendering](https://github.com/diegomura/react-pdf/issues/862)
- [Issue #2681 - Korean blank screen](https://github.com/diegomura/react-pdf/issues/2681)
- [Issue #3172 - Non-English text](https://github.com/diegomura/react-pdf/issues/3172)

### Trade Documents
- [Common Export Documents - trade.gov](https://www.trade.gov/common-export-documents)
- [Commercial Invoice & Packing List - Flexport](https://www.flexport.com/help/24-commercial-invoice-packing-list/)
- [Proforma Invoice - IncoDocs](https://incodocs.com/blog/what-is-proforma-invoice/)
- [Incoterms 2020 - trade.gov](https://www.trade.gov/know-your-incoterms)
- [Korean Customs Clearance - KOTRA](https://www.investkorea.org/file/ik-en/252025Customs_Clearance_in_Korea.pdf)

### CF Browser Rendering (대안)
- [CF Browser Rendering PDF Generation](https://developers.cloudflare.com/browser-rendering/how-to/pdf-generation/)
- [Generate PDFs on CF Workers - Forme](https://www.formepdf.com/blog/pdf-cloudflare-workers)

### Fonts
- [Pretendard Repository](https://github.com/orioncactus/pretendard)
- [Noto Sans KR - Google Fonts](https://fonts.google.com/noto/specimen/Noto+Sans+KR)
- [fonttools pyftsubset](https://fonttools.readthedocs.io/en/stable/subset/)
