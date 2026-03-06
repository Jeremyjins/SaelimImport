# Phase 5: Shipping Documents - Frontend/UI Notes

## 1. Component File Structure

```
app/
  types/
    shipping.ts                          # ShippingLineItem, ShippingWithOrgs, ShippingListItem,
                                         # ShippingEditData, SourcePI, StuffingList, RollDetail
  loaders/
    shipping.server.ts                   # loader (목록), shippingFormLoader (폼용), createShippingAction
    shipping.$id.server.ts               # loader + shippingEditLoader + action (update/delete/clone/toggle)
    shipping.schema.ts                   # Zod 스키마 (lineItemSchema 재사용, shippingSchema, stuffingSchema)

  routes/
    _layout.shipping.tsx                 # 선적서류 목록 (기존 placeholder 대체)
    _layout.shipping.new.tsx             # 선적서류 작성
    _layout.shipping.$id.tsx             # 선적서류 상세
    _layout.shipping.$id.edit.tsx        # 선적서류 수정

  components/
    shipping/
      shipping-form.tsx                  # 작성/수정 공용 폼 (PI 참조 프리필)
      shipping-detail-info.tsx           # 상세 기본정보 + 거래조건 + 선적정보 카드
      shipping-detail-items.tsx          # 품목 내역 읽기전용 (Desktop 테이블 + Mobile 카드)
      shipping-line-items.tsx            # 품목 편집기 (PILineItems 패턴 재사용)
      shipping-weight-summary.tsx        # 중량/포장 요약 카드 (gross, net, packages)
      stuffing-section.tsx               # 스터핑 리스트 전체 섹션 (컨테이너 목록 래퍼)
      stuffing-container-card.tsx        # 개별 컨테이너 카드 (Collapsible, 롤 상세 테이블)
      stuffing-container-form.tsx        # 컨테이너 추가/수정 다이얼로그 폼
      stuffing-roll-table.tsx            # 롤 상세 테이블 (Desktop 테이블 + Mobile 카드)
      stuffing-csv-upload.tsx            # CSV 업로드 다이얼로그 (파일 선택 + 미리보기 + 확인)
```

### 설명

| 컴포넌트 | 역할 |
|---------|------|
| `shipping-form.tsx` | PI 참조 프리필, 선적정보 섹션 추가. PIForm 구조 확장 |
| `shipping-detail-info.tsx` | 3개 카드: 기본정보, 거래조건, 선적정보. InfoRow 패턴 재사용 |
| `shipping-detail-items.tsx` | PIDetailItems와 동일 구조 (판매단가 라벨) |
| `shipping-weight-summary.tsx` | gross/net weight, package count. 스터핑에서 자동합산 표시 |
| `stuffing-section.tsx` | Shipping Detail 내부 섹션. 컨테이너 CRUD + CSV 업로드 버튼 |
| `stuffing-container-card.tsx` | Collapsible 컨테이너 카드. 헤더: SL No, CNTR No, Seal No, 롤 수, 중량 |
| `stuffing-container-form.tsx` | Dialog 기반. SL/CNTR/Seal 입력 + 롤 상세 테이블 편집 |
| `stuffing-roll-table.tsx` | 롤 번호, 품목, GSM, 폭, 길이, 순중량, 총중량 열 |
| `stuffing-csv-upload.tsx` | Dialog: 파일 선택 -> 파싱 -> 미리보기 테이블 -> 오류 표시 -> 확인/취소 |


---

## 2. Form Layout Design

### 2.1 Shipping Form 섹션 구조

```
┌─────────────────────────────────────────────┐
│  PI 참조 안내 배너 (from_pi 있을 때)           │
│  "PI {pi_no}에서 정보를 가져왔습니다."          │
└─────────────────────────────────────────────┘

┌── grid-cols-1 md:grid-cols-2 gap-6 ─────────┐
│ ┌─────────────────┐ ┌─────────────────────┐  │
│ │ 기본 정보        │ │ 거래 당사자          │  │
│ │  CI 일자 *       │ │  송하인(Shipper) *   │  │
│ │  참조번호        │ │  수하인(Consignee) * │  │
│ │  PI 참조 (select)│ │                     │  │
│ └─────────────────┘ └─────────────────────┘  │
│ ┌─────────────────┐ ┌─────────────────────┐  │
│ │ 거래 조건        │ │ 선적 정보            │  │
│ │  통화 *          │ │  선박명 (Vessel)     │  │
│ │  결제조건        │ │  항차 (Voyage)       │  │
│ │  인도조건        │ │  출항예정일 (ETD)     │  │
│ │  선적항          │ │  도착예정일 (ETA)     │  │
│ │  양륙항          │ │  선적일 (Ship Date)  │  │
│ └─────────────────┘ └─────────────────────┘  │
└─────────────────────────────────────────────┘

┌─ 품목 내역 Card (full width) ───────────────┐
│  PILineItems 패턴 동일 (shipping-line-items)  │
└─────────────────────────────────────────────┘

┌─ 중량/포장 Card (full width) ───────────────┐
│  grid-cols-3: 총중량 | 순중량 | 포장수        │
│  (자동 계산 표시 + 수동 override 가능)         │
└─────────────────────────────────────────────┘

┌─ 비고 Card ─────────────────────────────────┐
│  Textarea                                    │
└─────────────────────────────────────────────┘

┌─ 버튼 ──────────────────────────────────────┐
│                         [취소]  [작성/수정]   │
└─────────────────────────────────────────────┘
```

### 2.2 Mobile Layout

모바일에서는 `grid-cols-1`로 모든 카드가 세로 스택. 기존 PI/PO Form과 동일 패턴.

### 2.3 Dual Document Number (CI/PL)

- CI No, PL No 모두 서버에서 `generate_doc_number('CI', ref_date)`, `generate_doc_number('PL', ref_date)`로 자동 생성
- 생성 폼에서는 CI No/PL No 입력란 없음 (서버 자동 발번)
- 수정 폼에서도 CI No/PL No 읽기 전용 표시 (수정 불가)
- 상세 페이지 Header에 "CI-2603-001 / PL-2603-001" 형태로 dual display

```tsx
// Header title 패턴
<Header title={`${shipping.ci_no} / ${shipping.pl_no}`} backTo="/shipping">
```

### 2.4 PI Reference Select

PI 참조는 PI Form의 PO 참조와 동일 패턴:
- `?from_pi=uuid` query parameter로 PI에서 직접 생성 지원
- Select 드롭다운에 active PI 목록 표시 (pi_no로 정렬)
- 선택 시 currency, payment_term, delivery_term, loading_port, discharge_port, details 프리필
- hidden input `name="pi_id"` 전송
- 참조 PI 있을 때 파란색 배너 표시


---

## 3. Stuffing List UI Patterns

### 3.1 Dialog-Based Editing (추천)

인라인 편집 대신 **Dialog 기반 편집** 채택 이유:
- 롤 상세 테이블이 많은 열(7열)을 가져 인라인 편집 시 모바일에서 불가능
- Dialog로 분리하면 롤 데이터 검증 후 한번에 저장 가능
- CSV 업로드도 Dialog 내에서 통합 가능

### 3.2 Container Accordion/Collapsible Pattern

```
┌─ 스터핑 리스트 Card ────────────────────────────────────────┐
│ CardHeader: "스터핑 리스트"  [CSV 업로드]  [컨테이너 추가]      │
├─────────────────────────────────────────────────────────────┤
│ ┌─ Collapsible Container #1 ──────────────────────────────┐ │
│ │ ▼ SL-001 | CNTR: ABCU1234567 | Seal: K12345            │ │
│ │   Roll: 1-50 (50롤) | 순중량: 12,500 KG                 │ │
│ │ ┌─ CollapsibleContent ────────────────────────────────┐ │ │
│ │ │  Roll No | 품목 | GSM | 폭 | 길이 | 순중량 | 총중량   │ │ │
│ │ │  1       | GP   | 50  | 787| 8000 | 245.3 | 250.1   │ │ │
│ │ │  2       | GP   | 50  | 787| 8200 | 251.5 | 256.2   │ │ │
│ │ │  ...                                                │ │ │
│ │ │  합계                     | 12,500 | 12,750           │ │ │
│ │ └─────────────────────────────────────────────────────┘ │ │
│ │                                    [수정]  [삭제]        │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ Collapsible Container #2 ──────────────────────────────┐ │
│ │ ► SL-002 | CNTR: BCDU7654321 | Seal: K67890            │ │
│ │   Roll: 51-100 (50롤) | 순중량: 12,300 KG               │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ 전체 합계: 100롤 | 순중량: 24,800 KG | 총중량: 25,500 KG     │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 Container Header Summary

각 컨테이너 Collapsible trigger에 요약 정보 표시:
- SL No, Container No, Seal No
- Roll No Range (e.g., "1-50")
- Roll count (e.g., "50롤")
- Net weight sum (e.g., "12,500 KG")

```tsx
// stuffing-container-card.tsx 헤더 구조
<CollapsibleTrigger className="w-full">
  <div className="flex items-center justify-between p-4">
    <div className="flex items-center gap-3">
      {isOpen ? <ChevronDown /> : <ChevronRight />}
      <div>
        <div className="font-medium text-sm">{container.sl_no}</div>
        <div className="text-xs text-zinc-500">
          CNTR: {container.cntr_no} | Seal: {container.seal_no}
        </div>
      </div>
    </div>
    <div className="text-right text-xs text-zinc-500">
      <div>{rollCount}롤 ({container.roll_no_range})</div>
      <div>순중량: {formatWeight(netWeightSum)}</div>
    </div>
  </div>
</CollapsibleTrigger>
```

### 3.4 Roll Details Table Within Container

Desktop: 전체 7열 테이블
Mobile: 카드 형태로 변환 (PIDetailItems Mobile 패턴 참고)

```
Desktop (hidden md:block):
┌────┬──────┬─────┬──────┬───────┬────────┬────────┐
│ #  │ 품목  │ GSM │ 폭mm │ 길이m  │ 순중량  │ 총중량  │
├────┼──────┼─────┼──────┼───────┼────────┼────────┤
│ 1  │ GP   │ 50  │ 787  │ 8000  │ 245.30 │ 250.10 │
│ 2  │ GP   │ 50  │ 787  │ 8200  │ 251.50 │ 256.20 │
└────┴──────┴─────┴──────┴───────┴────────┴────────┘

Mobile (md:hidden):
┌─────────────────────────────────────┐
│ #1 GP                     250.10 KG│
│    50gsm, 787mm | 8,000m           │
│    순중량: 245.30 KG                │
├─────────────────────────────────────┤
│ #2 GP                     256.20 KG│
│    50gsm, 787mm | 8,200m           │
│    순중량: 251.50 KG                │
└─────────────────────────────────────┘
```

### 3.5 Stuffing Actions (CRUD)

스터핑 CRUD는 **fetcher.submit** 패턴 사용 (페이지 리로드 없이):

```
_action: "stuffing_create"   → Dialog 저장 시
_action: "stuffing_update"   → Dialog 수정 저장 시
_action: "stuffing_delete"   → AlertDialog 확인 시
_action: "stuffing_csv"      → CSV 업로드 확인 시
```

이 intent들은 shipping.$id.server.ts의 action에서 처리.
content_ intent 라우팅과 동일 패턴으로 `if (intent?.startsWith("stuffing_"))` 분기.


---

## 4. CSV Upload Component Design

### 4.1 Flow: 파일 선택 -> 파싱 -> 미리보기 -> 확인

```
[CSV 업로드] 버튼 클릭
       │
       ▼
┌─ Dialog ────────────────────────────────────────┐
│ Step 1: 파일 선택                                │
│  ┌──────────────────────────────────┐            │
│  │  📎 CSV 파일을 선택하세요          │            │
│  │  [파일 선택]                      │            │
│  └──────────────────────────────────┘            │
│  ○ 기존 데이터에 추가 (append)                     │
│  ● 기존 데이터 교체 (replace)                      │
│                                    [취소]        │
└─────────────────────────────────────────────────┘
       │ 파일 선택 후 즉시 파싱
       ▼
┌─ Dialog (expanded) ─────────────────────────────┐
│ Step 2: 미리보기 & 검증                           │
│  파일: rolls_container1.csv (2.3 KB)             │
│  파싱 결과: 50행 성공, 2행 오류                     │
│                                                  │
│  ⚠ 오류 행:                                      │
│  ┌──────────────────────────────────────────┐    │
│  │ 행 12: 순중량이 비어 있습니다              │    │
│  │ 행 35: GSM 값이 숫자가 아닙니다            │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  미리보기 (처음 10행):                             │
│  ┌────┬──────┬─────┬──────┬───────┬──────┬─────┐│
│  │Roll│ 품목  │ GSM │ 폭   │ 길이  │순중량│총중량││
│  │ 1  │ GP   │ 50  │ 787  │ 8000 │245.3│250.1││
│  │ 2  │ GP   │ 50  │ 787  │ 8200 │251.5│256.2││
│  │... │      │     │      │      │     │     ││
│  └────┴──────┴─────┴──────┴───────┴──────┴─────┘│
│  (50행 중 10행 표시)                               │
│                                                  │
│                       [취소]  [50행 업로드 확인]    │
└─────────────────────────────────────────────────┘
```

### 4.2 CSV 파싱 (클라이언트)

- 클라이언트에서 FileReader + 직접 CSV 파싱 (외부 라이브러리 없이)
- 또는 가벼운 `papaparse` 사용 검토 (번들 크기 ~6KB gzipped)
- 첫 행을 헤더로 인식. 영문 헤더 허용:
  `Roll No, Product Name, GSM, Width(mm), Length(m), Net Weight(kg), Gross Weight(kg)`
- 한국어 헤더도 매핑 지원:
  `롤번호, 품목명, GSM, 폭(mm), 길이(m), 순중량(kg), 총중량(kg)`

### 4.3 검증 규칙

```typescript
// 각 행에 대한 검증
const rollDetailSchema = z.object({
  roll_no: z.number().int().positive("롤 번호는 양의 정수여야 합니다"),
  product_name: z.string().min(1, "품목명은 필수입니다"),
  gsm: z.number().positive("GSM은 양수여야 합니다"),
  width_mm: z.number().positive("폭은 양수여야 합니다"),
  length_m: z.number().positive("길이는 양수여야 합니다"),
  net_weight_kg: z.number().positive("순중량은 양수여야 합니다"),
  gross_weight_kg: z.number().positive("총중량은 양수여야 합니다"),
});
```

### 4.4 오류 표시

- 오류가 있는 행은 빨간색 배경으로 강조
- 오류 메시지는 행 번호 + 필드명 + 사유 형태
- 오류 행이 있어도 나머지 행은 업로드 가능 (옵션: "오류 행 제외하고 업로드")
- 전체 행에 오류가 있으면 확인 버튼 비활성화

### 4.5 Append vs Replace 옵션

```tsx
<RadioGroup value={mode} onValueChange={setMode}>
  <div className="flex items-center gap-2">
    <RadioGroupItem value="replace" id="replace" />
    <Label htmlFor="replace">기존 데이터 교체</Label>
  </div>
  <div className="flex items-center gap-2">
    <RadioGroupItem value="append" id="append" />
    <Label htmlFor="append">기존 데이터에 추가</Label>
  </div>
</RadioGroup>
```

### 4.6 CSV Template Download

CSV 업로드 다이얼로그에 "템플릿 다운로드" 링크 제공:
```tsx
<a href="/templates/stuffing-template.csv" download className="text-xs text-blue-600 hover:underline">
  CSV 템플릿 다운로드
</a>
```
또는 클라이언트에서 Blob으로 동적 생성 (public 디렉토리 불필요):
```tsx
function downloadTemplate() {
  const header = "Roll No,Product Name,GSM,Width(mm),Length(m),Net Weight(kg),Gross Weight(kg)\n";
  const sample = "1,Glassine Paper,50,787,8000,245.30,250.10\n";
  const blob = new Blob([header + sample], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  // trigger download...
}
```


---

## 5. Mobile Responsiveness Strategy

### 5.1 Shipping Detail Mobile Layout

PI Detail과 동일 패턴. 세로 스택으로 카드 배치:

```
Mobile (< 768px):
┌─ Header ────────────────────────┐
│ CI-2603-001 / PL-2603-001  [⋮]  │
│ [진행] [완료 처리]                │
└─────────────────────────────────┘
┌─ 기본 정보 Card ─────────────────┐
│ CI 번호, PL 번호, 일자, 참조 PI   │
└─────────────────────────────────┘
┌─ 거래 조건 Card ─────────────────┐
│ 송하인, 수하인, 통화, 조건들       │
└─────────────────────────────────┘
┌─ 선적 정보 Card ─────────────────┐
│ 선박, 항차, ETD, ETA, 선적일      │
└─────────────────────────────────┘
┌─ 중량/포장 요약 Card ──────────── ┐
│ 총중량 | 순중량 | 포장수            │
└─────────────────────────────────┘
┌─ 품목 내역 Card (모바일 카드뷰) ── ┐
│ ...                               │
└─────────────────────────────────┘
┌─ 스터핑 리스트 Card ─────────────┐
│ 컨테이너 아코디언 (세로 스택)       │
└─────────────────────────────────┘
┌─ 메모 & 첨부파일 & 댓글 ──────── ┐
│ ContentSection                   │
└─────────────────────────────────┘
```

### 5.2 Stuffing List Mobile View

컨테이너 카드는 Desktop/Mobile 동일하게 Collapsible 사용.
롤 상세는 **모바일에서 카드 형태로 변환** (7열 테이블은 모바일에서 불가):

```tsx
// Mobile roll card
<div className="md:hidden flex flex-col divide-y">
  {rolls.map((roll) => (
    <div key={roll.roll_no} className="p-3">
      <div className="flex justify-between">
        <span className="text-sm font-medium">#{roll.roll_no} {roll.product_name}</span>
        <span className="text-sm font-semibold tabular-nums">{roll.gross_weight_kg} KG</span>
      </div>
      <div className="text-xs text-zinc-400 mt-0.5">
        {roll.gsm}gsm, {roll.width_mm}mm | {roll.length_m.toLocaleString()}m
      </div>
      <div className="text-xs text-zinc-400">
        순중량: {roll.net_weight_kg} KG
      </div>
    </div>
  ))}
</div>
```

### 5.3 CSV Upload Dialog on Mobile

Dialog는 모바일에서 전체 화면으로 표시되므로 별도 처리 불필요.
미리보기 테이블은 `overflow-x-auto`로 가로 스크롤 지원.

### 5.4 Stuffing Container Form on Mobile

Dialog 내부 폼은 모바일에서 세로 스택. 롤 편집 테이블은 Sheet로 대체하거나
Dialog 내에서 `overflow-y-auto max-h-[60vh] pb-32` 적용.

```tsx
// Dialog content with scroll for mobile
<DialogContent className="max-h-[90vh] overflow-y-auto">
  <div className="pb-32"> {/* scroll accessibility */}
    {/* form fields + roll table */}
  </div>
</DialogContent>
```


---

## 6. State Management

### 6.1 Stuffing List Local State Before Save

스터핑 리스트는 서버 데이터 기반. CRUD는 즉시 서버 반영 (fetcher.submit).
로컬 상태로 임시 관리하지 않음 (PO/PI line items와 다름).

이유:
- 스터핑은 컨테이너 단위로 독립적 (품목과 달리 전체를 한번에 제출하지 않음)
- CSV 업로드로 대량 데이터가 들어오므로 메모리 부담
- 컨테이너 추가/수정/삭제는 각각 독립 action

```
사용자 흐름:
1. [컨테이너 추가] → Dialog 열림 → SL/CNTR/Seal 입력 + 롤 데이터 입력/CSV 업로드
2. [저장] → fetcher.submit({ _action: "stuffing_create", data: JSON.stringify(...) })
3. 서버 응답 → 페이지 리로드 → 새 컨테이너 표시
```

### 6.2 CSV Parse -> Preview -> Confirm Flow

```typescript
// stuffing-csv-upload.tsx 상태 관리

type UploadStep = "select" | "preview";

interface CSVUploadState {
  step: UploadStep;
  file: File | null;
  mode: "append" | "replace";
  parsedRows: RollDetail[];       // 성공적으로 파싱된 행
  errors: CSVRowError[];          // 오류 행
  isProcessing: boolean;          // 파싱 중
}

interface CSVRowError {
  rowIndex: number;               // 원본 CSV 행 번호
  field: string;                  // 오류 필드명
  message: string;                // 오류 메시지
  rawData: Record<string, string>;// 원본 데이터
}
```

### 6.3 Container Form State

```typescript
// stuffing-container-form.tsx 상태 관리

interface ContainerFormState {
  sl_no: string;
  cntr_no: string;
  seal_no: string;
  rolls: RollDetail[];            // 롤 상세 배열
}

// RollDetail은 stuffing_lists.roll_details JSONB 내부 아이템
interface RollDetail {
  roll_no: number;
  product_name: string;
  gsm: number;
  width_mm: number;
  length_m: number;
  net_weight_kg: number;
  gross_weight_kg: number;
}
```

### 6.4 Roll Editing Within Dialog

Dialog 내에서 롤 데이터는 로컬 state로 관리 (useState).
Dialog 닫기 전 저장 시 JSON 직렬화하여 fetcher.submit.

```tsx
// 롤 편집: 테이블 + 행 추가/삭제 (PILineItems 패턴)
const [rolls, setRolls] = useState<RollRow[]>(initialRolls);

function handleSave() {
  fetcher.submit({
    _action: isEdit ? "stuffing_update" : "stuffing_create",
    stuffing_id: isEdit ? container.id : undefined,
    sl_no,
    cntr_no,
    seal_no,
    roll_details: JSON.stringify(rolls),
    roll_no_range: `${rolls[0]?.roll_no}-${rolls[rolls.length - 1]?.roll_no}`,
  }, { method: "post" });
  onClose();
}
```


---

## 7. Reusable Components from Existing Modules

### 7.1 Direct Reuse (변경 없이)

| 컴포넌트 | 사용 위치 |
|---------|----------|
| `DocStatusBadge` | 목록, 상세 Header |
| `ContentSection` | 상세 페이지 하단 (contentType="shipping") |
| `Header` | 모든 페이지 (backTo prop) |
| `PageContainer` | 모든 페이지 (fullWidth for list) |
| `formatDate`, `formatCurrency`, `formatWeight` | 전체 |

### 7.2 Pattern Reuse (구조만 참고, 새 컴포넌트)

| 패턴 소스 | 새 컴포넌트 | 차이점 |
|----------|-----------|--------|
| `PIForm` | `ShippingForm` | 선적정보 섹션 추가, dual doc number |
| `PIDetailInfo` + InfoRow | `ShippingDetailInfo` | 3개 카드 (기본+거래+선적), 참조 PI 링크 |
| `PIDetailItems` | `ShippingDetailItems` | 동일 구조 |
| `PILineItems` | `ShippingLineItems` | 거의 동일 (판매단가 라벨) |
| `PI List Page` | `Shipping List Page` | ci_no/pl_no dual 표시, vessel 열 추가 |

### 7.3 Potential Shared Components (향후 추출 고려)

지금은 복사+수정으로 진행하되, Phase 6+ 에서 공통 패턴이 확정되면 추출:

- `DocumentForm` — PO/PI/Shipping 공용 폼 래퍼 (거래조건, 품목 부분)
- `DocumentDetailInfo` — InfoRow + 카드 그리드 패턴
- `DocumentLineItems` — 품목 편집기 공용 (ProductSelect + Qty + Price + Amount)
- `DocumentDetailItems` — 품목 읽기전용 테이블

### 7.4 New shadcn/ui Components Needed

```
shadcn/ui 이미 설치됨:
  button, card, input, label, select, table, tabs, badge,
  textarea, alert-dialog, dropdown-menu, collapsible, dialog,
  sonner (toast)

추가 필요:
  radio-group    — CSV 업로드 append/replace 선택
  separator      — 선적정보 카드 내 구분선 (선택적)
  scroll-area    — 롤 상세 테이블 스크롤 (선택적, overflow-auto로 대체 가능)
```

### 7.5 New Icons Needed

```typescript
// icons.tsx에 추가할 아이콘
export {
  // 기존 아이콘들...
  Anchor,          // 선박/선적 관련
  Container,       // 컨테이너 (없으면 Box 사용)
  FileUp,          // CSV 업로드
  TableProperties, // 스터핑 리스트 아이콘 (없으면 FileSpreadsheet 사용)
} from "lucide-react";
```

실제로 lucide-react에서 확인 필요. 없으면 기존 아이콘으로 대체:
- Ship (이미 있음) → 선적 관련
- FileSpreadsheet (이미 있음) → CSV/스터핑
- Upload (이미 있음) → CSV 업로드
- Box (이미 있음) → 컨테이너


---

## 8. UI Text (Korean Labels)

### 8.1 Page Titles

```
목록:    "선적서류"
작성:    "선적서류 작성"
상세:    Header에 "{ci_no} / {pl_no}"
수정:    "선적서류 수정 — {ci_no}"
```

### 8.2 Card Section Titles

```
"기본 정보"
"거래 당사자"
"거래 조건"
"선적 정보"
"중량 / 포장"
"품목 내역"
"스터핑 리스트"
"비고"
"메모 & 첨부파일 & 댓글"
```

### 8.3 Field Labels

```
기본 정보:
  CI 번호        ci_no
  PL 번호        pl_no
  CI 일자        ci_date
  참조번호       ref_no
  참조 PI        pi_id (select)

거래 당사자:
  송하인         shipper_id (Shipper)
  수하인         consignee_id (Consignee)

거래 조건:
  통화           currency
  결제조건       payment_term
  인도조건       delivery_term
  선적항         loading_port
  양륙항         discharge_port

선적 정보:
  선박명         vessel
  항차           voyage
  출항예정일     etd
  도착예정일     eta
  선적일         ship_date

중량 / 포장:
  총중량 (KG)    gross_weight
  순중량 (KG)    net_weight
  포장수         package_no

품목 내역:
  품목           product_name
  수량 (KG)      quantity_kg
  판매단가       unit_price
  금액           amount

스터핑 리스트:
  SL 번호        sl_no
  컨테이너 번호   cntr_no
  씰 번호        seal_no
  롤 번호 범위   roll_no_range

롤 상세:
  롤 번호        roll_no
  품목명         product_name
  GSM            gsm
  폭 (mm)        width_mm
  길이 (m)       length_m
  순중량 (KG)    net_weight_kg
  총중량 (KG)    gross_weight_kg
```

### 8.4 Button Labels

```
"선적서류 작성"     — Header 새 문서 버튼
"작성"             — 폼 제출 (생성)
"수정"             — 폼 제출 (수정) + 드롭다운 메뉴
"복제"             — 드롭다운 메뉴
"삭제"             — 드롭다운 메뉴
"취소"             — 폼 취소, AlertDialog 취소
"완료 처리"        — 상태 토글 (process → complete)
"진행으로 변경"     — 상태 토글 (complete → process)
"컨테이너 추가"     — 스터핑 섹션
"컨테이너 수정"     — 컨테이너 카드
"컨테이너 삭제"     — 컨테이너 카드 AlertDialog
"CSV 업로드"       — 스터핑 섹션
"업로드 확인"       — CSV Dialog
"템플릿 다운로드"   — CSV Dialog
"품목 추가"        — 라인 아이템 편집기
"통관 작성"        — 상세 페이지 크로스모듈 (Phase 7)
```

### 8.5 Placeholder Text

```
"CI번호 또는 PL번호 검색..."   — 목록 검색
"PI 선택"                     — PI 참조 드롭다운
"송하인 선택"                  — Shipper 드롭다운
"수하인 선택"                  — Consignee 드롭다운
"예: EVER GIVEN"              — 선박명
"예: 0001E"                   — 항차
"추가 사항을 입력하세요"        — 비고 Textarea
"CSV 파일을 선택하세요"         — CSV 업로드
"품목 선택"                    — 라인 아이템 품목 드롭다운
```

### 8.6 Empty States & Messages

```
"등록된 선적서류가 없습니다."     — 빈 목록
"검색 결과가 없습니다."          — 검색 결과 없음
"등록된 컨테이너가 없습니다."     — 빈 스터핑 리스트
"선적서류를 삭제하시겠습니까?"    — 삭제 AlertDialog title
"{ci_no}를 삭제합니다. 연결된 통관 정보도 함께 삭제되며 복구할 수 없습니다." — 삭제 설명
"컨테이너를 삭제하시겠습니까?"    — 컨테이너 삭제 AlertDialog
```

### 8.7 Toast Messages

```
toast.success("선적서류가 생성되었습니다.")
toast.success("선적서류가 수정되었습니다.")
toast.success("선적서류가 삭제되었습니다.")
toast.success("선적서류가 복제되었습니다.")
toast.success("컨테이너가 추가되었습니다.")
toast.success("컨테이너가 수정되었습니다.")
toast.success("컨테이너가 삭제되었습니다.")
toast.success("CSV 업로드가 완료되었습니다. {n}개 롤이 추가되었습니다.")
toast.error("CSV 파싱 오류: {message}")
```


---

## 9. Design Considerations

### 9.1 Weight Auto-Calculation Display

중량/포장 카드에서 스터핑 데이터로부터 자동 계산된 값을 표시:

```tsx
// shipping-weight-summary.tsx
<Card>
  <CardHeader>
    <CardTitle className="text-base">중량 / 포장</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="grid grid-cols-3 gap-4">
      <div>
        <span className="text-xs text-zinc-500">총중량</span>
        <div className="text-lg font-semibold tabular-nums">{formatWeight(grossWeight)}</div>
        {stuffingGrossWeight !== grossWeight && (
          <span className="text-xs text-amber-600">스터핑 합계: {formatWeight(stuffingGrossWeight)}</span>
        )}
      </div>
      <div>
        <span className="text-xs text-zinc-500">순중량</span>
        <div className="text-lg font-semibold tabular-nums">{formatWeight(netWeight)}</div>
      </div>
      <div>
        <span className="text-xs text-zinc-500">포장수</span>
        <div className="text-lg font-semibold tabular-nums">{packageNo ?? "-"}</div>
        {stuffingRollCount > 0 && stuffingRollCount !== packageNo && (
          <span className="text-xs text-amber-600">스터핑 롤 수: {stuffingRollCount}</span>
        )}
      </div>
    </div>
  </CardContent>
</Card>
```

불일치 시 amber 색상으로 경고. 수동 override 값과 자동 합산 값 비교.

폼에서:
- 중량/포장 Input은 수동 입력 가능
- 스터핑 데이터가 있으면 "스터핑에서 자동 계산" 버튼 제공 (향후)
- 생성 시에는 스터핑이 없으므로 수동 입력만

### 9.2 Dual Document Number Display

```tsx
// 목록 페이지 Desktop 테이블
<TableHead>CI / PL 번호</TableHead>
<TableCell>
  <div className="font-medium">{item.ci_no}</div>
  <div className="text-xs text-zinc-400">{item.pl_no}</div>
</TableCell>

// 목록 페이지 Mobile 카드
<div className="flex items-center justify-between mb-2">
  <div>
    <span className="font-semibold text-sm">{item.ci_no}</span>
    <span className="text-xs text-zinc-400 ml-1.5">/ {item.pl_no}</span>
  </div>
  <DocStatusBadge status={item.status} />
</div>

// 상세 페이지 Header
<Header title={`${shipping.ci_no} / ${shipping.pl_no}`} backTo="/shipping">

// 상세 기본정보 카드
<InfoRow label="CI 번호" value={shipping.ci_no} />
<InfoRow label="PL 번호" value={shipping.pl_no} />
```

### 9.3 Status Badge Colors

기존 DocStatusBadge 그대로 사용:
- `process` → `default` variant (primary 색상)
- `complete` → `secondary` variant (회색)

### 9.4 Cross-Module Navigation

```tsx
// 상세 페이지: 참조 PI 링크 (pi-detail-info.tsx의 참조 PO 링크와 동일)
{shipping.pi && (
  <InfoRow label="참조 PI">
    <Link
      to={`/pi/${shipping.pi_id}`}
      className="text-sm font-medium text-blue-600 hover:underline"
    >
      {shipping.pi.pi_no}
    </Link>
  </InfoRow>
)}

// PI 상세 페이지에서 연결 선적서류 목록 추가 (Phase 3-B의 PO→PI 패턴)
// pi.$id.server.ts loader에 shipping docs 조회 추가
// _layout.pi.$id.tsx에 "선적서류" 카드 추가:
<Card>
  <CardHeader>
    <CardTitle className="text-base">연결 선적서류</CardTitle>
  </CardHeader>
  <CardContent>
    {shippingDocs.map(doc => (
      <Link to={`/shipping/${doc.id}`} className="...">
        {doc.ci_no} / {doc.pl_no} — {formatDate(doc.ci_date)}
      </Link>
    ))}
  </CardContent>
</Card>

// 상세 페이지 드롭다운에 "통관 작성" 메뉴 (Phase 7에서 활성화)
<DropdownMenuItem disabled>
  <Landmark className="mr-2 h-4 w-4" />
  통관 작성
</DropdownMenuItem>
```

### 9.5 PI Detail → Shipping 생성 링크

PO Detail에서 "PI 작성" 드롭다운이 있는 것처럼, PI Detail에서 "선적서류 작성":

```tsx
// PI Detail 드롭다운에 추가
<DropdownMenuItem asChild>
  <Link to={`/shipping/new?from_pi=${pi.id}`}>
    <Ship className="mr-2 h-4 w-4" />
    선적서류 작성
  </Link>
</DropdownMenuItem>
```

### 9.6 List Page Table Columns

```
Desktop 테이블:
┌──────────────┬─────────┬───────────┬──────────┬────────┬────────────┬──────┐
│ CI / PL 번호  │ CI 일자  │ PI 번호    │ 송하인    │ 선박명  │ 총액(우정렬)│ 상태  │
├──────────────┼─────────┼───────────┼──────────┼────────┼────────────┼──────┤
│ CI-2603-001  │ 26.03.01│ PI-2603-01│ GV Int'l │ EVER   │ $12,500.00 │ 진행  │
│ PL-2603-001  │         │           │          │ GIVEN  │            │      │
└──────────────┴─────────┴───────────┴──────────┴────────┴────────────┴──────┘
```

### 9.7 Route Configuration Update

```typescript
// app/routes.ts 추가 필요
route("shipping/new", "routes/_layout.shipping.new.tsx"),
route("shipping/:id", "routes/_layout.shipping.$id.tsx"),
route("shipping/:id/edit", "routes/_layout.shipping.$id.edit.tsx"),
```

### 9.8 Stuffing List 전체 합계 표시

스터핑 섹션 하단에 전체 컨테이너 합산 표시:

```tsx
<div className="flex gap-4 px-4 py-3 bg-zinc-50 text-sm">
  <span>전체: <strong>{totalContainers}개</strong> 컨테이너</span>
  <span>|</span>
  <span><strong>{totalRolls}</strong>롤</span>
  <span>|</span>
  <span>순중량: <strong>{formatWeight(totalNetWeight)}</strong></span>
  <span>|</span>
  <span>총중량: <strong>{formatWeight(totalGrossWeight)}</strong></span>
</div>
```


---

## 10. Implementation Sub-Phases (권장)

### Phase 5-A: 목록 + 작성
- `app/types/shipping.ts`
- `app/loaders/shipping.schema.ts`
- `app/loaders/shipping.server.ts` (loader + formLoader + createAction)
- `app/routes/_layout.shipping.tsx` (목록 — placeholder 대체)
- `app/routes/_layout.shipping.new.tsx`
- `app/components/shipping/shipping-form.tsx`
- `app/components/shipping/shipping-line-items.tsx`
- `app/routes.ts` 업데이트

### Phase 5-B: 상세 + 수정 + CRUD
- `app/loaders/shipping.$id.server.ts`
- `app/routes/_layout.shipping.$id.tsx`
- `app/routes/_layout.shipping.$id.edit.tsx`
- `app/components/shipping/shipping-detail-info.tsx`
- `app/components/shipping/shipping-detail-items.tsx`
- `app/components/shipping/shipping-weight-summary.tsx`
- Clone, Delete, Toggle Status actions
- PI Detail 크로스모듈 (연결 선적서류 + "선적서류 작성" 링크)

### Phase 5-C: 스터핑 리스트
- `app/components/shipping/stuffing-section.tsx`
- `app/components/shipping/stuffing-container-card.tsx`
- `app/components/shipping/stuffing-container-form.tsx`
- `app/components/shipping/stuffing-roll-table.tsx`
- `app/components/shipping/stuffing-csv-upload.tsx`
- Stuffing CRUD actions in shipping.$id.server.ts
- radio-group shadcn/ui 설치
- Weight auto-calculation 표시


---

## 11. Type Definitions Preview

```typescript
// app/types/shipping.ts

import type { DocStatus } from "~/types/common";

export interface RollDetail {
  roll_no: number;
  product_name: string;
  gsm: number;
  width_mm: number;
  length_m: number;
  net_weight_kg: number;
  gross_weight_kg: number;
}

export interface StuffingList {
  id: string;
  sl_no: string | null;
  cntr_no: string | null;
  seal_no: string | null;
  roll_no_range: string | null;
  roll_details: RollDetail[];
  created_at: string | null;
  updated_at: string | null;
}

export interface ShippingLineItem {
  product_id: string;
  product_name: string;
  gsm: number | null;
  width_mm: number | null;
  quantity_kg: number;
  unit_price: number;
  amount: number;
}

export interface ShippingWithOrgs {
  id: string;
  ci_no: string;
  pl_no: string;
  ci_date: string;
  ref_no: string | null;
  pi_id: string | null;
  shipper_id: string;
  consignee_id: string;
  currency: string;
  amount: number | null;
  payment_term: string | null;
  delivery_term: string | null;
  loading_port: string | null;
  discharge_port: string | null;
  vessel: string | null;
  voyage: string | null;
  etd: string | null;
  eta: string | null;
  ship_date: string | null;
  gross_weight: number | null;
  net_weight: number | null;
  package_no: number | null;
  details: ShippingLineItem[];
  notes: string | null;
  status: DocStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  shipper: { id: string; name_en: string; name_ko: string | null; address_en: string | null } | null;
  consignee: { id: string; name_en: string; name_ko: string | null; address_en: string | null } | null;
  pi: { pi_no: string } | null;
  stuffing_lists: StuffingList[];
}

export interface ShippingListItem {
  id: string;
  ci_no: string;
  pl_no: string;
  ci_date: string;
  status: DocStatus;
  currency: string;
  amount: number | null;
  vessel: string | null;
  shipper: { name_en: string } | null;
  consignee: { name_en: string } | null;
  pi: { pi_no: string } | null;
}

export interface ShippingEditData {
  id: string;
  ci_no: string;
  pl_no: string;
  ci_date: string;
  ref_no: string | null;
  pi_id: string | null;
  shipper_id: string;
  consignee_id: string;
  currency: string;
  payment_term: string | null;
  delivery_term: string | null;
  loading_port: string | null;
  discharge_port: string | null;
  vessel: string | null;
  voyage: string | null;
  etd: string | null;
  eta: string | null;
  ship_date: string | null;
  gross_weight: number | null;
  net_weight: number | null;
  package_no: number | null;
  notes: string | null;
  status: DocStatus;
  details: ShippingLineItem[];
}

export interface SourcePI {
  id: string;
  pi_no: string;
  currency: string;
  payment_term: string | null;
  delivery_term: string | null;
  loading_port: string | null;
  discharge_port: string | null;
  details: ShippingLineItem[];
}
```


---

## 12. Supabase Query Patterns

### 12.1 List Loader

```typescript
// FK join 패턴 (PI list loader와 동일)
const { data } = await supabase
  .from("shipping_documents")
  .select(`
    id, ci_no, pl_no, ci_date, status, currency, amount, vessel,
    shipper:organizations!shipper_id(name_en),
    consignee:organizations!consignee_id(name_en),
    pi:proforma_invoices!pi_id(pi_no)
  `)
  .is("deleted_at", null)
  .order("created_at", { ascending: false });
```

### 12.2 Detail Loader

```typescript
// shipping + stuffing_lists 동시 조회
const [shippingResult, stuffingResult, contentResult] = await Promise.all([
  supabase
    .from("shipping_documents")
    .select(`
      *,
      shipper:organizations!shipper_id(id, name_en, name_ko, address_en),
      consignee:organizations!consignee_id(id, name_en, name_ko, address_en),
      pi:proforma_invoices!pi_id(pi_no)
    `)
    .eq("id", id)
    .is("deleted_at", null)
    .single(),
  supabase
    .from("stuffing_lists")
    .select("*")
    .eq("shipping_doc_id", id)
    .order("sl_no"),
  loadContent("shipping", id, supabase),
]);
```

### 12.3 Form Loader (shippers/consignees)

```typescript
// Shipper = seller type (GV), Consignee = buyer type (Saelim)
const [shippersResult, consigneesResult, productsResult, pisResult] = await Promise.all([
  supabase.from("organizations").select("id, name_en, name_ko")
    .in("type", ["seller"]).is("deleted_at", null),
  supabase.from("organizations").select("id, name_en, name_ko")
    .in("type", ["buyer"]).is("deleted_at", null),
  supabase.from("products").select("id, name, gsm, width_mm")
    .is("deleted_at", null),
  supabase.from("proforma_invoices").select("id, pi_no")
    .is("deleted_at", null).order("pi_no"),
]);
```
