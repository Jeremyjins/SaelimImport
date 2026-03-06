# Phase 7: Customs Management - Frontend UI Design Notes

## 1. Component Tree

```
app/
  routes/
    _layout.customs.tsx              # 목록 페이지 (Header + Tabs + Table/Cards)
    _layout.customs.new.tsx          # 생성 페이지 (Header backTo + CustomsForm)
    _layout.customs.$id.tsx          # 상세 페이지 (Info + Fee Summary + Content)
    _layout.customs.$id.edit.tsx     # 수정 페이지 (CustomsForm with defaultValues)
  loaders/
    customs.server.ts                # 목록 loader
    customs.new.server.ts            # 생성 loader (선적서류 후보 목록) + action
    customs.$id.server.ts            # 상세 loader + actions (toggle, delete, clone)
    customs.schema.ts                # Zod 스키마 (공유)
  components/
    customs/
      customs-form.tsx               # 생성/수정 공유 폼 (Form 기반)
      customs-fee-input.tsx          # Fee 그룹 입력 (supply/vat/total 자동계산)
      customs-detail-info.tsx        # 상세: 기본정보 카드 (customs_no, date, shipping link)
      customs-fee-summary.tsx        # 상세: 4개 비용 시각화 카드
      customs-fee-received-toggle.tsx # fee_received 토글 (Switch 스타일)
  types/
    customs.ts                       # CustomsListItem, CustomsDetail, FeeBreakdown 등
```

## 2. 목록 페이지 UI 설계

### Route: `_layout.customs.tsx`
기존 shipping/orders 목록 패턴 동일 적용.

### Desktop 테이블 컬럼

| 컬럼 | 필드 | 정렬 | 비고 |
|------|------|------|------|
| 통관번호 | customs_no | left | font-medium, 없으면 "-" |
| 통관일 | customs_date | left | formatDate, text-zinc-500 |
| 선적서류 | shipping_doc.ci_no | left | text-zinc-500, 없으면 "미연결" (text-zinc-300) |
| 운송비 | transport_fee.total | right | formatCurrency(KRW), tabular-nums |
| 관세 | customs_fee.total | right | formatCurrency(KRW) |
| 부가세 | vat_fee.total | right | formatCurrency(KRW) |
| 총비용 | 합산 | right | font-semibold, 4개 total 합 |
| 수령 | fee_received | center | Check(green) / X(zinc-300) 아이콘 |

> 참고: customs 테이블에 status 컬럼 없음. 목록 탭 필터를 fee_received 기준으로 대체:
> - 전체 (N) / 미수령 (N) / 수령완료 (N)

### Mobile 카드 레이아웃

```
┌──────────────────────────────────────────┐
│ [통관번호]                  [수령 Badge] │
│ CI: [ci_no]  |  [통관일]                 │
│                                          │
│                         총 ₩1,234,567 ── │
└──────────────────────────────────────────┘
```

- 상단: 통관번호 (font-semibold) + 수령상태 Badge
- 중간: 선적서류 CI번호 + 통관일 (text-xs text-zinc-500)
- 하단: 총비용 (text-right font-medium tabular-nums)

### 검색
- placeholder: `"통관번호 또는 CI번호 검색..."`
- 검색 대상: customs_no, shipping_doc.ci_no

### 탭 필터 (fee_received 기준)
- status 대신 fee_received boolean 기반 필터:
  - `all` → 전체
  - `pending` → fee_received = false (미수령)
  - `received` → fee_received = true (수령완료)

### 빈 상태
- "등록된 통관서류가 없습니다."
- 검색 시: "검색 결과가 없습니다."

## 3. 생성 폼 레이아웃

### Route: `_layout.customs.new.tsx`
- Header: title="통관서류 작성", backTo="/customs"
- Body: `<CustomsForm />`

### CustomsForm 필드 그룹

#### Card 1: 기본 정보
```
┌─────────────────────────────────┐
│ 기본 정보                       │
├─────────────────────────────────┤
│ 통관일 *          [date input]  │
│ 참조 선적서류     [Select]      │
│   → 선적서류 목록 (ci_no 표시)  │
│   → "선택 안 함" 옵션 포함      │
└─────────────────────────────────┘
```

- 통관일(customs_date): type="date", required, 기본값 today
- 참조 선적서류(shipping_doc_id): Select (ci_no 목록), "__none__" 기본값

#### Card 2: 운송비 (transport_fee)
```
┌─────────────────────────────────┐
│ 운송비                          │
├─────────────────────────────────┤
│ 공급가액       [number input]   │
│ 부가세         [number input]   │
│ 합계           ₩ 123,456 (자동) │
└─────────────────────────────────┘
```

#### Card 3: 관세 (customs_fee)
동일 supply/vat/total 구조

#### Card 4: 부가세 (vat_fee)
동일 supply/vat/total 구조

#### Card 5: 기타비용 (etc_fee)
```
┌─────────────────────────────────┐
│ 기타비용                        │
├─────────────────────────────────┤
│ 설명           [text input]     │
│ 공급가액       [number input]   │
│ 부가세         [number input]   │
│ 합계           ₩ 0 (자동)       │
└─────────────────────────────────┘
```

#### 카드 배치
```
md:grid-cols-2 레이아웃:
┌────────────┬────────────┐
│ 기본 정보  │ 운송비     │
├────────────┼────────────┤
│ 관세       │ 부가세     │
├────────────┴────────────┤
│ 기타비용 (full width)   │
└─────────────────────────┘
```

- 기본정보 + 운송비: 1행
- 관세 + 부가세: 2행
- 기타비용: 3행 full-width (etc_desc 추가 필드 포함)

#### 하단 총합 요약 (폼 하단, Card 외)
```
┌─────────────────────────────────────────┐
│ 총 비용 합계                            │
│ 운송비 ₩xxx + 관세 ₩xxx + 부가세 ₩xxx  │
│ + 기타 ₩xxx = 총합 ₩X,XXX,XXX          │
└─────────────────────────────────────────┘
```

#### 액션 버튼
- 취소 (outline, Link to="/customs")
- 작성 (primary, submit)

## 4. 상세 페이지 섹션 레이아웃

### Route: `_layout.customs.$id.tsx`

#### Header
- title: customs_no (없으면 "통관서류")
- backTo: "/customs"
- 우측: fee_received Badge + 액션 드롭다운 (수정/복제/삭제)

#### Section 1: 기본 정보 카드
```
┌───────────────────────────────────────┐
│ 기본 정보                             │
├───────────────────────────────────────┤
│ 통관번호    CU-2601-0001              │
│ 통관일      2026. 01. 15.             │
│ 선적서류    CI-2601-0001 (링크)        │
│ 비용수령    [Switch 토글] 수령완료/미수령│
└───────────────────────────────────────┘
```

- fee_received 토글: orders의 CustomsFeeToggle 패턴 재사용
- 선적서류: Link to `/shipping/${shipping_doc_id}` (blue-600 hover:underline)

#### Section 2: 비용 요약 (CustomsFeeSummary)
```
┌──────────┬──────────┬──────────┬──────────┐
│  운송비  │   관세   │  부가세  │ 기타비용 │  ← md:grid-cols-4
├──────────┼──────────┼──────────┼──────────┤
│ 공급가액 │ 공급가액 │ 공급가액 │ 공급가액 │
│ ₩100,000 │ ₩200,000 │ ₩300,000 │ ₩50,000  │
│          │          │          │          │
│ 부가세   │ 부가세   │ 부가세   │ 부가세   │
│ ₩10,000  │ ₩20,000  │ ₩30,000  │ ₩5,000   │
│          │          │          │          │
│ 합계     │ 합계     │ 합계     │ 합계     │
│ ₩110,000 │ ₩220,000 │ ₩330,000 │ ₩55,000  │
└──────────┴──────────┴──────────┴──────────┘
┌─────────────────────────────────────────────┐
│ 총 비용 합계: ₩715,000                      │
└─────────────────────────────────────────────┘
```

- Mobile: grid-cols-2 (2x2)
- 각 카드: CardTitle(비용명) + 3행(공급가액/부가세/합계)
- 기타비용 카드에 etc_desc 표시
- 하단 총합: bg-zinc-50 또는 border-t로 구분

#### Section 3: Content (메모 & 첨부)
- `<ContentSection contentType="customs" parentId={customs.id} />`

#### Section 4: 메타 정보
- 작성일 / 수정일 (text-xs text-zinc-400)

## 5. Fee 입력 컴포넌트 설계

### `customs-fee-input.tsx`

```tsx
interface FeeInputProps {
  /** 비용 그룹 이름 (운송비, 관세, 부가세, 기타비용) */
  label: string;
  /** form name prefix (transport_fee, customs_fee, vat_fee, etc_fee) */
  namePrefix: string;
  /** 기본값 */
  defaultValues?: { supply?: number; vat?: number };
  /** 기타비용 전용: 설명 필드 포함 여부 */
  showDescription?: boolean;
  /** 기타비용 설명 기본값 */
  defaultDescription?: string;
}
```

#### 자동계산 로직
- `supply` + `vat` → `total` (useState로 실시간 계산)
- total은 읽기 전용 표시 (hidden input으로 전송)
- supply/vat 변경 시 `onChange`에서 합산

#### FormData 전송 형식
```
transport_fee_supply=100000
transport_fee_vat=10000
```
→ server에서 JSONB `{supply: 100000, vat: 10000, total: 110000}` 변환

#### UI
```tsx
<Card>
  <CardHeader>
    <CardTitle className="text-base">{label}</CardTitle>
  </CardHeader>
  <CardContent className="flex flex-col gap-4">
    {showDescription && (
      <div className="flex flex-col gap-1.5">
        <Label>설명</Label>
        <Input name="etc_desc" />
      </div>
    )}
    <div className="flex flex-col gap-1.5">
      <Label>공급가액</Label>
      <Input type="number" name={`${namePrefix}_supply`} />
    </div>
    <div className="flex flex-col gap-1.5">
      <Label>부가세</Label>
      <Input type="number" name={`${namePrefix}_vat`} />
    </div>
    <div className="flex items-center justify-between pt-2 border-t">
      <span className="text-sm text-zinc-500">합계</span>
      <span className="text-sm font-semibold tabular-nums">
        {formatCurrency(total, "KRW")}
      </span>
      <input type="hidden" name={`${namePrefix}_total`} value={total} />
    </div>
  </CardContent>
</Card>
```

## 6. 한국어 라벨 매핑

### 목록 페이지
| Key | Label |
|-----|-------|
| page_title | 통관관리 |
| create_button | 통관서류 작성 |
| tab_all | 전체 |
| tab_pending | 미수령 |
| tab_received | 수령완료 |
| search_placeholder | 통관번호 또는 CI번호 검색... |
| empty | 등록된 통관서류가 없습니다. |
| empty_search | 검색 결과가 없습니다. |

### 생성/수정 페이지
| Key | Label |
|-----|-------|
| create_title | 통관서류 작성 |
| edit_title | 통관서류 수정 |
| card_basic | 기본 정보 |
| label_customs_date | 통관일 |
| label_shipping_doc | 참조 선적서류 |
| select_none | 선적서류 선택 안 함 |
| card_transport | 운송비 |
| card_customs | 관세 |
| card_vat | 부가세 |
| card_etc | 기타비용 |
| label_supply | 공급가액 |
| label_vat | 부가세 |
| label_total | 합계 |
| label_etc_desc | 설명 |
| label_total_sum | 총 비용 합계 |
| btn_cancel | 취소 |
| btn_create | 작성 |
| btn_save | 저장 |

### 상세 페이지
| Key | Label |
|-----|-------|
| label_customs_no | 통관번호 |
| label_customs_date | 통관일 |
| label_shipping_doc | 선적서류 |
| label_fee_received | 비용수령 |
| fee_received_yes | 수령 완료 |
| fee_received_no | 미수령 |
| action_edit | 수정 |
| action_clone | 복제 |
| action_delete | 삭제 |
| delete_title | 통관서류를 삭제하시겠습니까? |
| delete_desc | 삭제된 통관서류는 복구할 수 없습니다. |

### Toast 메시지
| Context | Message |
|---------|---------|
| toggle_fee | 비용수령 상태가 변경되었습니다. |
| clone_success | 통관서류가 복제되었습니다. |
| delete_success | (redirect, toast 불필요) |

## 7. 아이콘 추가 목록 (icons.tsx)

현재 icons.tsx에 이미 `Landmark` (통관 사이드바)가 있음. 추가 필요 아이콘:

```typescript
// Customs module icons
Receipt,        // 비용 요약 카드 제목 아이콘
CircleDollarSign, // 비용 관련 (대안: Banknote, Coins)
CheckCircle2,   // fee_received = true 표시
XCircle,        // fee_received = false 표시 (또는 기존 X 사용)
```

> 최소 추가 원칙: 기존 `Check`, `X`, `Landmark` 등으로 커버 가능한 경우 추가하지 않음.
> 실제 구현 시 필요한 것만 추가.

**확정 추가 목록:**
- `Receipt` - 통관 비용 관련 아이콘 (비용 요약 카드 등)
- `CheckCircle2` - 수령완료 배지 표시 (목록 테이블)
- `CircleDot` - 미수령 상태 표시 (대안)

## 8. 반응형 전략

### 목록 페이지
- **Desktop** (`hidden md:block`): Table with 8 columns
- **Mobile** (`md:hidden`): 카드 목록 (Link 또는 button 클릭으로 상세 이동)

### 생성/수정 폼
- `grid grid-cols-1 md:grid-cols-2 gap-6`
- 기본정보 + 운송비 1행, 관세 + 부가세 2행
- 기타비용: `md:col-span-2` (full width)
- 액션 버튼: `flex justify-end gap-3`

### 상세 페이지
- 기본정보 카드: 단일 Card (full width)
- 비용 요약: `grid grid-cols-2 md:grid-cols-4 gap-4`
  - Mobile 2x2, Desktop 1x4
- 총합 바: full width

### Fee 입력 컴포넌트 (개별 카드)
- 카드 내부는 단일 컬럼 (flex-col gap-4)
- 합계 줄: border-t 상단 + flex justify-between

## 9. TypeScript 타입 설계

### `app/types/customs.ts`

```typescript
/** JSONB fee breakdown */
export interface FeeBreakdown {
  supply: number;
  vat: number;
  total: number;
}

/** 목록용 (join shipping_doc ci_no) */
export interface CustomsListItem {
  id: string;
  customs_no: string | null;
  customs_date: string | null;
  transport_fee: FeeBreakdown | null;
  customs_fee: FeeBreakdown | null;
  vat_fee: FeeBreakdown | null;
  etc_fee: FeeBreakdown | null;
  etc_desc: string | null;
  fee_received: boolean | null;
  created_at: string | null;
  shipping_doc: {
    id: string;
    ci_no: string;
  } | null;
}

/** 상세용 (full join) */
export interface CustomsDetail extends CustomsListItem {
  updated_at: string | null;
  shipping_doc: {
    id: string;
    ci_no: string;
    pl_no: string;
    ci_date: string;
    vessel: string | null;
  } | null;
}
```

## 10. Loader/Action 설계 요약

### customs.server.ts (목록)
- **loader**: customs 전체 목록 + shipping_doc join (ci_no)
- **action 없음** (생성은 별도 /new 라우트)

### customs.new.server.ts (생성)
- **loader**: 선적서류 목록 (id, ci_no) - Select 후보
- **action**: FormData → FeeBreakdown 변환 → insert → redirect `/customs/${id}`
  - generate_doc_number("CU", customs_date) 로 customs_no 자동생성

### customs.$id.server.ts (상세)
- **loader**: customs 단건 + shipping_doc join + content
- **actions**:
  - `toggle_fee_received` - fee_received 토글
  - `toggle_status` → 불필요 (customs에 status 없음)
  - `update` (edit 페이지에서 사용) - 전체 필드 업데이트
  - `clone` - 복제 후 redirect
  - `delete` - soft delete 후 redirect `/customs`
  - `content_*` - ContentSection 관련 (handleContentAction)

## 11. Status vs Fee Received 결정

customs 테이블에는 `status` 컬럼이 없다. 기존 PO/PI/Shipping의 process/complete 패턴 대신:

**fee_received boolean 기반 필터링:**
- DocStatusBadge 대신 커스텀 배지 사용
  - `fee_received = true` → Badge variant="secondary" "수령완료" (or green)
  - `fee_received = false/null` → Badge variant="outline" "미수령"
- 목록 탭: "전체 / 미수령 / 수령완료"

**대안: status 컬럼 추가**
- customs에도 status 추가하면 기존 DocStatusBadge 재사용 가능
- 하지만 통관서류의 실제 워크플로우에서 process/complete 구분이 의미적으로 적합한지 검토 필요
- fee_received가 이미 핵심 상태 역할을 하므로, status 추가 없이 fee_received 기반으로 진행 권장

## 12. 기존 컴포넌트 재사용 목록

| 컴포넌트 | 용도 | 비고 |
|---------|------|------|
| Header | 모든 페이지 상단 | title, backTo |
| PageContainer | 레이아웃 래퍼 | fullWidth (목록), 일반 (상세/폼) |
| Tabs/TabsList/TabsTrigger | 목록 필터 탭 | |
| Table 계열 | Desktop 목록 | |
| Card/CardHeader/CardContent | 폼 그룹, 상세 섹션 | |
| Input/Label/Select | 폼 필드 | |
| Button | 액션 버튼 | |
| DropdownMenu 계열 | 상세 페이지 액션 | |
| AlertDialog 계열 | 삭제 확인 | |
| ContentSection | 메모/첨부 | contentType="customs" |
| formatDate | 날짜 포매팅 | |
| formatCurrency | 금액 포매팅 | KRW 고정 |

## 13. 구현 순서 권장

1. **Phase 7-A**: 타입 + 목록 페이지 + loader
2. **Phase 7-B**: 생성 폼 + FeeInput 컴포넌트 + action
3. **Phase 7-C**: 상세 페이지 + FeeSummary + fee_received 토글 + Content
4. **Phase 7-D**: 수정 페이지 + 복제/삭제 + 라우트 등록 + 사이드바 연결
