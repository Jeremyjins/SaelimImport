# Phase 9: PDF Generation - Research Notes (v2)

**Updated:** 2026-03-06
**Status:** Implementation-Ready Research
**Scope:** react-pdf v4 API, 무역서류 표준, 다운로드 UX, 로고 통합, SSR 호환성

---

## 1. International Trade Document Standards

### 1.1 Purchase Order (PO)
- **방향:** Buyer -> Supplier (구매 의사 표시)
- **레이아웃:** Portrait A4
- **필수:** PO No, Date, Seller/Buyer info, Payment/Delivery Terms, Line Items, Total
- **프로젝트 매핑:** `POWithOrgs` 타입이 모든 필드 포함

### 1.2 Proforma Invoice (PI)
- **방향:** Supplier -> Buyer (선적 전 가격 확인)
- **PO와 차이:** PI No/Date, PO 참조번호 추가
- **프로젝트 매핑:** `PIWithOrgs` 타입

### 1.3 Commercial Invoice (CI)
- **방향:** Shipper -> Consignee (세관 신고용)
- **추가 섹션:** Vessel/Voyage/ETD/ETA, Weight Summary, Signature
- **한국 세관:** CI 원본 + 사본 2부, HS Code, 원산지
- **프로젝트 매핑:** `ShippingWithOrgs` 타입

### 1.4 Packing List (PL)
- CI와 동일 헤더, **가격 열 제외**, 중량/수량 중심
- **프로젝트 매핑:** `ShippingWithOrgs` (다른 열 선택)

### 1.5 Stuffing List (SL)
- 컨테이너 단위 적입 상세, 50-200+ 행
- **프로젝트 매핑:** `StuffingList` + `StuffingRollDetail[]`

### 1.6 Invoice (비용 인보이스)
- GV -> Saelim 비용 청구, KRW 통화, All-English 라벨
- **프로젝트 매핑:** `CustomsDetail` + `FeeBreakdown`

---

## 2. @react-pdf/renderer v4 API Details (추가 조사)

### 2.1 v4 Breaking Changes
- **ESM 전용:** v4.0.0부터 CommonJS exports 제거. CJS 필요 시 v3.4.5 고정.
- Saelim 프로젝트: Vite ESM 환경 -> **문제 없음**.

### 2.2 pdf() 함수 시그니처
```typescript
const blob = await pdf(<PODocument data={po} />).toBlob();  // Browser
const buffer = await pdf(<PODocument data={po} />).toBuffer(); // Node (not CF Workers)
```

### 2.3 usePDF 훅 (비권장)
```typescript
const [instance, updateInstance] = usePDF({ document: <MyDoc /> });
// instance: { loading, blob, url, error }
```
마운트 즉시 생성 시작 -> 클릭 트리거 패턴에 부적합. `pdf().toBlob()` 사용.

### 2.4 wrap / break / minPresenceAhead

| Prop | 동작 |
|------|------|
| `wrap={false}` | 이 View가 페이지 경계에서 분리되지 않음 (통째로 다음 페이지) |
| `break` | 이 View 이전에 강제 페이지 브레이크 |
| `fixed` | 모든 페이지에서 반복 (헤더/푸터) |
| `minPresenceAhead={n}` | n 포인트 이상 공간 없으면 페이지 이동 |

**minPresenceAhead 주의:** 중첩 View + Row/Column에서 무한 루프/잘못된 분리 버그 다수 (Issue #2659, #2595).
-> SL 테이블 행: `minPresenceAhead` 대신 각 행에 `wrap={false}` 적용이 안전.

### 2.5 Image src 타입
- URL 문자열: 지원 (`"/images/gv-logo.png"`)
- base64 data URI: 지원 (`"data:image/png;base64,..."`)
- ArrayBuffer: 지원
- **SVG data URI: 미지원** -> SVG 로고는 PNG 변환 필요

### 2.6 페이지 번호 render prop
```tsx
<Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
```
- `totalPages`는 `<Text render>` 에서만 사용 가능
- `<View render>`에는 `pageNumber`만 있음, `totalPages` 없음

### 2.7 StyleSheet 미지원 속성
- `display: grid`, CSS 변수, pseudo-class/element
- `box-shadow`, `transform`, `overflow: hidden` (클리핑 제한)
- grid 대신 **flexbox** 사용

### 2.8 lineHeight 버그
v4.1.3에서 lineHeight 버그 보고 (Issue #2988). 사용 최소화 또는 충분한 테스트.

---

## 3. PDF Download UX - 브라우저 호환성

### 3.1 `<a download>` + click() 호환성

| 환경 | 동작 | 비고 |
|------|------|------|
| Desktop Chrome/Firefox/Safari | 정상 다운로드 | - |
| Android Chrome | 정상 다운로드 | - |
| iOS Safari | **새 탭에서 열림** | download 속성 무시 |

### 3.2 iOS Safari 이슈
- 비동기 콜백 내 `a.click()`이 "사용자 제스처" 요건 미충족 -> 팝업 차단 가능
- iOS 18.2 이후 blob URL 저장 문제 보고
- **실용적 해결:** 표준 `<a download>` 패턴 사용. iOS에서 새 탭 폴백 허용.
- Saelim 주 사용자: GV PC 사용자 -> iOS 베스트에포트 대응 충분.

### 3.3 Firefox 호환성
`document.body.appendChild(a)` + `removeChild(a)` 추가 필요:
```typescript
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
URL.revokeObjectURL(url);
```

---

## 4. Company Logo Integration

### 4.1 파일 형식
- **PNG 권장** (react-pdf Image 완벽 지원)
- JPG: 지원
- SVG 파일: **미지원** (react-pdf Image에서 직접 삽입 불가)
- SVG -> PNG 변환 필요

### 4.2 저장 위치
`public/images/gv-logo.png` (정적 에셋)
- Vite가 public/ 파일을 루트에서 서빙
- CORS 문제 없음
- react-pdf Image: `<Image src="/images/gv-logo.png" />`

### 4.3 해상도
- 240x80px (2x retina) 권장
- 파일 크기: ~10-30KB
- 더 큰 해상도 불필요 (PDF에서 작게 표시)

### 4.4 로고 없을 때 Fallback
```tsx
{logoSrc ? (
  <Image src={logoSrc} style={{ width: 120, height: 40 }} />
) : (
  <Text style={styles.companyName}>GV INTERNATIONAL</Text>
)}
```

---

## 5. React.lazy SSR 동작 (기존 코드 확인)

### 5.1 기존 ContentEditor 패턴 확인
`app/components/content/content-section.tsx` (line 18):
```typescript
const ContentEditor = React.lazy(() =>
  import("./content-editor").then((m) => ({ default: m.ContentEditor }))
);
```

CF Workers SSR에서 작동하는 이유:
1. SSR 시 `<Suspense fallback>` 상태 HTML 출력
2. 클라이언트 hydration 후 실제 모듈 로드
3. Named export -> `.then((m) => ({ default: m.X }))` 패턴

### 5.2 PDF 권장 패턴: Click Handler 내 Dynamic Import

ContentEditor와 달리, PDF는 UI 렌더링이 아닌 blob 생성이므로:
```typescript
async function handleDownload() {
  const { pdf } = await import("@react-pdf/renderer");
  const { PODocument } = await import("~/components/pdf/po-document");
  const blob = await pdf(<PODocument data={po} />).toBlob();
  // ...
}
```

버튼 UI는 즉시 렌더, 900KB chunk는 클릭 시에만 로드.

---

## 6. Library Comparison (Updated)

| 기준 | @react-pdf/renderer | pdf-lib | pdfmake | jsPDF | CF Browser Rendering |
|------|---------------------|---------|---------|-------|---------------------|
| CF Workers (서버) | BLOCKED (WASM) | Works | Works | Uncertain | Works (별도과금) |
| 브라우저 (클라이언트) | Excellent | Works | Works | Works | N/A |
| React 통합 | Native JSX | 없음 | 없음 | 없음 | HTML 템플릿 |
| Bundle (gzip) | ~900 KB | ~350 KB | ~984 KB | ~120 KB | 0 |
| 개발 편의성 | 높음 (JSX) | 낮음 (좌표) | 중간 (JSON) | 중간 | 중간 (HTML) |

**최종 선택: @react-pdf/renderer, 클라이언트 전용**

---

## Sources

- [@react-pdf/renderer npm](https://www.npmjs.com/package/@react-pdf/renderer)
- [react-pdf Advanced docs](https://react-pdf.org/advanced)
- [react-pdf Styling docs](https://react-pdf.org/styling)
- [react-pdf SVG docs](https://react-pdf.org/svg)
- [react-pdf Components docs](https://react-pdf.org/components)
- [minPresenceAhead Issue #2659](https://github.com/diegomura/react-pdf/issues/2659)
- [minPresenceAhead Issue #2595](https://github.com/diegomura/react-pdf/issues/2595)
- [totalPages in View Issue #3006](https://github.com/diegomura/react-pdf/issues/3006)
- [lineHeight bug Issue #2988](https://github.com/diegomura/react-pdf/issues/2988)
- [react-pdf v4 CJS removed Issue #2907](https://github.com/diegomura/react-pdf/issues/2907)
- [SVG in react-pdf Discussion #2097](https://github.com/diegomura/react-pdf/discussions/2097)
- [iOS Safari download workaround 2025](https://www.simon-neutert.de/2025/js-safari-media-download/)
- [iOS Safari window.open analysis 2025](https://dontpaniclabs.com/blog/post/2025/07/29/understanding-window-open-behavior-on-ios-safari/)
- [CF Vite Plugin GA](https://developers.cloudflare.com/changelog/post/2025-04-08-vite-plugin/)
- [Common Export Documents](https://www.trade.gov/common-export-documents)
- [Incoterms 2020](https://www.trade.gov/know-your-incoterms)
