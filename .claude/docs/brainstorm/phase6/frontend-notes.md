# Phase 6: Order Management - Frontend Dev Notes

## 1. Overview

Order(오더)는 기존 PO/PI/Shipping/Customs/Delivery 모듈과 근본적으로 다른 성격의 페이지다.
기존 모듈은 각각 자체 데이터(품목, 금액, 조건 등)가 풍부하지만, Order는 **자체 고유 데이터가 적고 JOIN 데이터가 핵심**이다.
따라서 List/Detail 페이지 설계가 기존 패턴을 따르되, "연결 허브" 역할에 맞는 UI가 필요하다.

### 기존 모듈 대비 차이점

| 항목 | PO/PI/Shipping | Order |
|------|----------------|-------|
| 자체 필드 | 많음 (품목, 금액, 조건) | 적음 (세림번호, 날짜 3개, 통관비수령) |
| 목록 주요 정보 | 자체 번호, 금액, 상태 | 세림번호 + JOIN된 문서번호들 + 날짜들 |
| 상세 핵심 UI | Info Cards + Line Items | 문서 링크 그리드 + 날짜 타임라인 |
| 생성 방식 | 별도 페이지 (new) | Dialog (필드가 적음) |
| 수정 방식 | 별도 edit 페이지 | Inline 수정 (필드 소수) |
| Content | Tiptap + 첨부 | Tiptap + 첨부 (동일) |

---

## 2. Route Structure

```
app/routes.ts 추가:
  route("orders", "routes/_layout.orders.tsx"),           // 기존 (목록)
  route("orders/:id", "routes/_layout.orders.$id.tsx"),   // 신규 (상세)

별도 new/edit 페이지 불필요:
  - 생성: Dialog (목록 페이지 내)
  - 수정: Inline (상세 페이지 내)
```

---

## 3. Order List Page (`_layout.orders.tsx`)

### 3-1. Header

```
<Header title="오더관리">
  <Button size="sm" onClick={openCreateDialog}>
    <Plus /> 오더 생성
  </Button>
</Header>
```

기존 PO/PI/Shipping과 동일한 Header 패턴이나, `Link to="/orders/new"` 대신 Dialog 트리거.

### 3-2. Filter Tabs

```
전체 (N) | 진행 (N) | 완료 (N)
```

- **완료 기준**: Order 자체에 `status` 컬럼이 없으므로 두 가지 방안:
  - A안) `orders.status` 컬럼 추가 (수동 토글) -- 기존 패턴과 일관성 좋음
  - B안) 연결된 모든 문서가 complete일 때 자동 완료 -- 계산 비용 있음
  - **권장: A안** (수동 status 컬럼). 서버에서 계산 필요 없고 기존 DocStatusBadge 재사용 가능

### 3-3. Search

```
<Input placeholder="세림번호 또는 PO번호 검색..." />
```

검색 대상: `saelim_no`, JOIN된 `po.po_no`, `pi.pi_no`, `shipping.ci_no`

### 3-4. Desktop Table

Order 목록은 컬럼이 많으므로 테이블이 넓어진다. 핵심 컬럼만 선별:

| 컬럼 | 필드 | 너비 참고 |
|------|------|-----------|
| 세림번호 | `saelim_no` | font-medium |
| PO 번호 | `po.po_no` | text-zinc-500 |
| PI 번호 | `pi.pi_no` | text-zinc-500, 없으면 "-" |
| CI 번호 | `shipping.ci_no` | text-zinc-500, 없으면 "-" |
| 선박명 | `shipping.vessel` | text-zinc-500, 없으면 "-" |
| ETA | `shipping.eta` | text-zinc-500 |
| 통관비 수령 | `customs_fee_received` | Check/X 아이콘 |
| 상태 | `status` | DocStatusBadge |

```tsx
<TableHead>세림번호</TableHead>
<TableHead>PO</TableHead>
<TableHead>PI</TableHead>
<TableHead>CI</TableHead>
<TableHead>선박명</TableHead>
<TableHead>ETA</TableHead>
<TableHead>통관비</TableHead>
<TableHead>상태</TableHead>
```

정렬: 기본 `created_at DESC`. 추후 ETA순 정렬 옵션 고려 가능.

### 3-5. Mobile Cards

```tsx
<Link to={`/orders/${order.id}`} className="block rounded-lg border bg-white p-4 hover:bg-zinc-50">
  <div className="flex items-center justify-between mb-1">
    <span className="font-semibold text-sm">{order.saelim_no}</span>
    <DocStatusBadge status={order.status} />
  </div>
  <div className="text-xs text-zinc-500 flex gap-2 mb-1">
    <span>PO: {order.po?.po_no ?? "-"}</span>
    <span>|</span>
    <span>PI: {order.pi?.pi_no ?? "-"}</span>
  </div>
  <div className="text-xs text-zinc-500 flex gap-2">
    {order.shipping?.vessel && <span>{order.shipping.vessel}</span>}
    {order.shipping?.eta && (
      <>
        <span>|</span>
        <span>ETA: {formatDate(order.shipping.eta)}</span>
      </>
    )}
  </div>
</Link>
```

### 3-6. Loader Data Shape

```typescript
interface OrderListItem {
  id: string;
  saelim_no: string;
  status: DocStatus;
  customs_fee_received: boolean;
  advice_date: string | null;
  arrival_date: string | null;
  delivery_date: string | null;
  created_at: string;
  po: { po_no: string } | null;
  pi: { pi_no: string } | null;
  shipping: { ci_no: string; vessel: string | null; eta: string | null } | null;
  customs: { id: string } | null;   // Phase 7 이후
  delivery: { id: string } | null;  // Phase 8 이후
}
```

---

## 4. Order Create Dialog

### 4-1. 근거

Order 생성에 필요한 필드가 2-3개뿐이므로 별도 페이지(`/orders/new`)는 과도하다.
Dialog에서 PO 선택 + 세림번호 입력만으로 생성 가능.

### 4-2. UI 구조

```tsx
<Dialog open={showCreate} onOpenChange={setShowCreate}>
  <DialogContent className="sm:max-w-md">
    <DialogHeader>
      <DialogTitle>오더 생성</DialogTitle>
      <DialogDescription>
        PO를 선택하고 세림번호를 입력하세요.
      </DialogDescription>
    </DialogHeader>

    <div className="flex flex-col gap-4">
      {/* PO 선택 */}
      <div className="space-y-2">
        <Label htmlFor="po_id">PO 선택</Label>
        <Select value={poId} onValueChange={setPoId}>
          <SelectTrigger>
            <SelectValue placeholder="PO를 선택하세요" />
          </SelectTrigger>
          <SelectContent>
            {availablePos.map(po => (
              <SelectItem key={po.id} value={po.id}>
                {po.po_no}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 세림번호 */}
      <div className="space-y-2">
        <Label htmlFor="saelim_no">세림번호</Label>
        <Input
          id="saelim_no"
          value={saelimNo}
          onChange={(e) => setSaelimNo(e.target.value)}
          placeholder="예: SL-2026-001"
        />
      </div>
    </div>

    <DialogFooter>
      <Button variant="outline" onClick={() => setShowCreate(false)}>
        취소
      </Button>
      <Button onClick={handleCreate} disabled={!poId || !saelimNo || isCreating}>
        {isCreating && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
        생성
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### 4-3. Cascade Link 동작

PO 선택 시, 해당 PO에 연결된 PI가 있으면 자동으로 `pi_id`도 설정.
PI에 연결된 Shipping이 있으면 `shipping_doc_id`도 설정.
이 cascade는 서버 action에서 처리 (클라이언트는 PO만 선택).

### 4-4. Action

```typescript
// fetcher.submit
fetcher.submit(
  { _action: "create", po_id: poId, saelim_no: saelimNo },
  { method: "post" }
);
```

성공 시 서버에서 `redirect(`/orders/${newId}`)` 반환.

### 4-5. Available POs

Loader에서 아직 Order에 연결되지 않은 PO 목록을 함께 로드:

```typescript
// loader return
{ orders: OrderListItem[], availablePos: { id: string; po_no: string }[] }
```

---

## 5. Order Detail Page (`_layout.orders.$id.tsx`) -- 핵심 페이지

### 5-1. Header

```tsx
<Header title={order.saelim_no} backTo="/orders">
  <div className="flex items-center gap-2">
    <DocStatusBadge status={optimisticStatus} />
    <Button variant="outline" size="sm" onClick={handleToggle}>
      {optimisticStatus === "process" ? "완료 처리" : "진행으로 변경"}
    </Button>
    <DropdownMenu>
      {/* 삭제 */}
    </DropdownMenu>
  </div>
</Header>
```

기존 PO/Shipping 상세 Header 패턴과 동일. 단, "수정" 링크 대신 Inline 수정이므로 드롭다운에서 수정 제거.

### 5-2. Page Layout

```tsx
<PageContainer>
  <div className="flex flex-col gap-6">
    {/* 1. 날짜 타임라인 */}
    <OrderDateTimeline order={order} />

    {/* 2. 문서 링크 카드 그리드 */}
    <OrderDocLinks order={order} />

    {/* 3. 주요 정보 (Inline 수정) */}
    <OrderInlineFields order={order} />

    {/* 4. Content 섹션 */}
    <ContentSection
      content={content}
      contentType="order"
      parentId={order.id}
      currentUserId={userId}
    />

    {/* 5. 메타 정보 */}
    <div className="flex gap-4 text-xs text-zinc-400">
      <span>작성: {formatDate(order.created_at)}</span>
      <span>수정: {formatDate(order.updated_at)}</span>
    </div>
  </div>
</PageContainer>
```

---

## 6. Component Design

### 6-1. `order-date-timeline.tsx` -- 날짜 흐름 시각화

핵심 UX 컴포넌트. 오더의 진행 상황을 한눈에 파악.

**날짜 포인트 (6단계)**:

| 순서 | 라벨 | 출처 |
|------|------|------|
| 1 | 어드바이스일 | `order.advice_date` |
| 2 | ETD (출항일) | `order.shipping?.etd` |
| 3 | ETA (도착 예정일) | `order.shipping?.eta` |
| 4 | 도착일 | `order.arrival_date` |
| 5 | 통관일 | `order.customs?.customs_date` (Phase 7) |
| 6 | 배송일 | `order.delivery_date` |

**Desktop (md:block)**: 수평 타임라인

```tsx
<Card>
  <CardHeader>
    <CardTitle className="text-base">진행 현황</CardTitle>
  </CardHeader>
  <CardContent>
    {/* Desktop: 수평 스텝 */}
    <div className="hidden md:flex items-center justify-between relative">
      {/* 연결선 */}
      <div className="absolute top-4 left-0 right-0 h-0.5 bg-zinc-200" />

      {steps.map((step, i) => (
        <div key={step.key} className="relative flex flex-col items-center gap-1.5 z-10">
          {/* 원형 인디케이터 */}
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium",
            step.date
              ? "bg-emerald-500 text-white"       // 완료
              : step.isNext
                ? "bg-blue-500 text-white"         // 다음 단계
                : "bg-zinc-100 text-zinc-400"      // 미도달
          )}>
            {step.date ? <Check className="h-4 w-4" /> : i + 1}
          </div>
          {/* 라벨 */}
          <span className="text-xs text-zinc-500">{step.label}</span>
          {/* 날짜 */}
          <span className="text-xs font-medium tabular-nums">
            {step.date ? formatDate(step.date) : "-"}
          </span>
        </div>
      ))}
    </div>

    {/* Mobile: 세로 스텝 */}
    <div className="md:hidden flex flex-col gap-3">
      {steps.map((step, i) => (
        <div key={step.key} className="flex items-center gap-3">
          <div className={cn("w-6 h-6 rounded-full ...", ...)}>
            ...
          </div>
          <div className="flex-1">
            <span className="text-sm">{step.label}</span>
          </div>
          <span className="text-sm tabular-nums">
            {step.date ? formatDate(step.date) : "-"}
          </span>
        </div>
      ))}
    </div>
  </CardContent>
</Card>
```

**CY 체류일 경고**: 타임라인 하단에 별도 배지로 표시.

### 6-2. `order-cy-warning.tsx` -- CY 체류일 경고

CY(Container Yard) 체류일 = `customs_date - arrival_date` (또는 ETA 사용).
체류일이 길면 추가 비용 발생하므로 경고 필요.

```tsx
interface OrderCYWarningProps {
  arrivalDate: string | null;  // arrival_date 또는 shipping.eta
  customsDate: string | null;  // customs.customs_date
}

function calcCYDays(arrival: string | null, customs: string | null): number | null {
  if (!arrival || !customs) return null;
  const diff = new Date(customs).getTime() - new Date(arrival).getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function OrderCYWarning({ arrivalDate, customsDate }: OrderCYWarningProps) {
  const days = calcCYDays(arrivalDate, customsDate);

  if (days === null) return null; // 날짜 미입력 시 표시 안함

  const variant = days <= 10 ? "success" : days <= 14 ? "warning" : "danger";
  const colors = {
    success: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warning: "bg-amber-50 text-amber-700 border-amber-200",
    danger:  "bg-red-50 text-red-700 border-red-200",
  };

  return (
    <div className={cn("inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium", colors[variant])}>
      <Container className="h-3.5 w-3.5" />
      CY 체류 {days}일
      {days > 14 && <AlertCircle className="h-3.5 w-3.5" />}
    </div>
  );
}
```

**표시 위치**: 타임라인 카드 하단 or 헤더 영역

### 6-3. `order-doc-links.tsx` -- 문서 링크 카드 그리드

5개 문서(PO/PI/Shipping/Customs/Delivery) 연결 상태를 카드로 표시.

```tsx
const DOC_CONFIGS = [
  { key: "po",       label: "구매주문 (PO)",  icon: ShoppingCart, path: "/po" },
  { key: "pi",       label: "견적서 (PI)",     icon: FileText,    path: "/pi" },
  { key: "shipping", label: "선적서류",        icon: Ship,        path: "/shipping" },
  { key: "customs",  label: "통관",            icon: Landmark,    path: "/customs" },
  { key: "delivery", label: "배송",            icon: Truck,       path: "/delivery" },
] as const;
```

**Desktop**: `grid grid-cols-5 gap-3` (5열 균등)
**Tablet**: `grid grid-cols-3 gap-3` (3열, 2행)
**Mobile**: `grid grid-cols-1 gap-3` (세로 스택)

```tsx
<div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
  {DOC_CONFIGS.map(config => {
    const doc = order[config.key];
    const isLinked = !!doc;

    return (
      <Card key={config.key} className={cn(!isLinked && "opacity-50")}>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <config.icon className="h-4 w-4 text-zinc-500" />
            <span className="text-xs font-medium text-zinc-500">{config.label}</span>
          </div>

          {isLinked ? (
            <>
              <p className="text-sm font-semibold truncate">{doc.number}</p>
              <div className="flex items-center justify-between mt-2">
                <DocStatusBadge status={doc.status} />
                <Link to={`${config.path}/${doc.id}`}>
                  <Button variant="ghost" size="sm" className="h-7 text-xs">
                    상세 보기
                  </Button>
                </Link>
              </div>
            </>
          ) : (
            <div className="text-center py-2">
              <p className="text-xs text-zinc-400">미연결</p>
              {/* Phase 7/8 미구현 모듈은 버튼 비활성화 */}
              <Button
                variant="outline"
                size="sm"
                className="mt-2 h-7 text-xs"
                disabled={config.key === "customs" || config.key === "delivery"}
                onClick={() => handleLink(config.key)}
              >
                연결
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  })}
</div>
```

**연결 동작**:
- PI 연결: PO에 연결된 PI 자동 링크 (또는 선택 Dialog)
- Shipping 연결: PI에 연결된 Shipping 자동 링크 (또는 선택 Dialog)
- Customs/Delivery: Phase 7/8 구현 후 활성화

### 6-4. `order-inline-fields.tsx` -- Inline 수정 필드

Order 고유 필드가 적으므로 별도 edit 페이지 대신 Inline 수정.

```tsx
<Card>
  <CardHeader>
    <CardTitle className="text-base">오더 정보</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <InlineField
        label="세림번호"
        value={order.saelim_no}
        fieldName="saelim_no"
        type="text"
      />
      <InlineField
        label="어드바이스일"
        value={order.advice_date}
        fieldName="advice_date"
        type="date"
      />
      <InlineField
        label="도착일"
        value={order.arrival_date}
        fieldName="arrival_date"
        type="date"
      />
      <InlineField
        label="배송일"
        value={order.delivery_date}
        fieldName="delivery_date"
        type="date"
      />
      <div className="flex items-center justify-between">
        <Label className="text-sm text-zinc-500">통관비 수령</Label>
        <Switch
          checked={order.customs_fee_received}
          onCheckedChange={handleFeeToggle}
        />
      </div>
    </div>
  </CardContent>
</Card>
```

**InlineField 내부 동작**:
- 기본: 텍스트 표시 + 연필 아이콘
- 클릭 시: Input으로 전환
- Enter 또는 blur 시: `fetcher.submit({ _action: "update_field", field, value })`
- 취소: Escape 키

```tsx
function InlineField({ label, value, fieldName, type }: InlineFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const fetcher = useFetcher();

  function handleSave() {
    if (draft !== (value ?? "")) {
      fetcher.submit(
        { _action: "update_field", field: fieldName, value: draft },
        { method: "post" }
      );
    }
    setEditing(false);
  }

  return (
    <div className="space-y-1">
      <Label className="text-xs text-zinc-500">{label}</Label>
      {editing ? (
        <Input
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); }
          }}
          autoFocus
          className="h-8"
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="flex items-center gap-1.5 text-sm hover:text-zinc-700 group w-full text-left"
        >
          <span>{type === "date" ? formatDate(value) : (value || "-")}</span>
          <Pencil className="h-3 w-3 text-zinc-300 group-hover:text-zinc-500" />
        </button>
      )}
    </div>
  );
}
```

### 6-5. `order-create-dialog.tsx`

위 Section 4 참조. List 페이지에서 사용.

### 6-6. `order-detail-header.tsx` (Optional)

Header 영역이 복잡해질 경우 분리 가능하나, 기존 패턴에서는 route 파일에 직접 작성.
CY 경고 배지를 Header에 표시할 경우 분리 권장:

```tsx
<Header title={order.saelim_no} backTo="/orders">
  <div className="flex items-center gap-2">
    <OrderCYWarning
      arrivalDate={order.arrival_date}
      customsDate={order.customs?.customs_date}
    />
    <DocStatusBadge status={optimisticStatus} />
    <Button variant="outline" size="sm" onClick={handleToggle}>
      {optimisticStatus === "process" ? "완료 처리" : "진행으로 변경"}
    </Button>
    ...
  </div>
</Header>
```

---

## 7. Component File Structure

```
app/components/orders/
  order-create-dialog.tsx      # Dialog: PO 선택 + 세림번호 입력
  order-doc-links.tsx          # 5개 문서 연결 카드 그리드
  order-date-timeline.tsx      # 6단계 날짜 타임라인 (수평/세로)
  order-cy-warning.tsx         # CY 체류일 경고 배지
  order-inline-fields.tsx      # Inline 수정 가능 필드들

app/types/order.ts             # OrderListItem, OrderWithDocs 타입
app/loaders/orders.server.ts   # 목록 loader + create action
app/loaders/orders.$id.server.ts  # 상세 loader + update/delete actions
```

---

## 8. TypeScript Types

```typescript
// app/types/order.ts

import type { DocStatus } from "~/types/common";

export interface OrderListItem {
  id: string;
  saelim_no: string;
  status: DocStatus;
  customs_fee_received: boolean;
  advice_date: string | null;
  arrival_date: string | null;
  delivery_date: string | null;
  created_at: string;
  po: { id: string; po_no: string } | null;
  pi: { id: string; pi_no: string } | null;
  shipping: {
    id: string;
    ci_no: string;
    vessel: string | null;
    eta: string | null;
    etd: string | null;
  } | null;
  customs: { id: string; customs_date: string | null; status: DocStatus } | null;
  delivery: { id: string; status: DocStatus } | null;
}

export interface OrderWithDocs {
  id: string;
  saelim_no: string;
  status: DocStatus;
  customs_fee_received: boolean;
  advice_date: string | null;
  arrival_date: string | null;
  delivery_date: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  po: {
    id: string;
    po_no: string;
    po_date: string;
    status: DocStatus;
    currency: string;
    amount: number | null;
  } | null;
  pi: {
    id: string;
    pi_no: string;
    pi_date: string;
    status: DocStatus;
    currency: string;
    amount: number | null;
  } | null;
  shipping: {
    id: string;
    ci_no: string;
    pl_no: string;
    ci_date: string;
    status: DocStatus;
    vessel: string | null;
    eta: string | null;
    etd: string | null;
    currency: string;
    amount: number | null;
  } | null;
  customs: {
    id: string;
    customs_date: string | null;
    status: DocStatus;
  } | null;
  delivery: {
    id: string;
    status: DocStatus;
  } | null;
}
```

---

## 9. Korean Labels Reference

| English | Korean | 사용처 |
|---------|--------|--------|
| Order Management | 오더관리 | Header title, sidebar |
| Create Order | 오더 생성 | Button, Dialog title |
| Saelim No | 세림번호 | Table header, form label |
| Advice Date | 어드바이스일 | Timeline step, form label |
| ETD | 출항일 | Timeline step |
| ETA | 도착 예정일 | Timeline step, table |
| Arrival Date | 도착일 | Timeline step, form label |
| Customs Date | 통관일 | Timeline step |
| Delivery Date | 배송일 | Timeline step, form label |
| CY Free Time | CY 무료기간 | Warning label |
| CY Days | CY 체류 N일 | Warning badge |
| Customs Fee Received | 통관비 수령 | Switch label, table |
| Not Linked | 미연결 | Doc link card |
| Link | 연결 | Button |
| View Detail | 상세 보기 | Button |
| Progress | 진행 현황 | Timeline card title |
| Purchase Order (PO) | 구매주문 (PO) | Doc link card |
| Proforma Invoice (PI) | 견적서 (PI) | Doc link card |
| Shipping Docs | 선적서류 | Doc link card |
| Customs | 통관 | Doc link card |
| Delivery | 배송 | Doc link card |
| Mark Complete | 완료 처리 | Button |
| Change to In Progress | 진행으로 변경 | Button |
| Delete | 삭제 | Button |
| No registered orders | 등록된 오더가 없습니다 | Empty state |
| No search results | 검색 결과가 없습니다 | Empty state |

---

## 10. Responsive Design Specifics

### List Page

| 영역 | Mobile | Desktop (md:) |
|------|--------|---------------|
| Layout | `PageContainer fullWidth` | 동일 |
| Filter | 세로 스택 | `sm:flex-row` |
| Table | `md:hidden` (카드 표시) | `hidden md:block` |
| Cards | 표시 | `md:hidden` |

### Detail Page

| 영역 | Mobile | Desktop (md:) |
|------|--------|---------------|
| Layout | `PageContainer` (standard) | 동일 |
| Timeline | 세로 스텝 | 수평 스텝 `hidden md:flex` / `md:hidden` |
| Doc Links | `grid-cols-1` | `md:grid-cols-3 lg:grid-cols-5` |
| Inline Fields | `grid-cols-1` | `md:grid-cols-2` |
| Content | 전폭 | 동일 |

### Dialog (Create)

`sm:max-w-md` -- 모바일에서 전폭, 태블릿 이상에서 고정폭.

---

## 11. Icons Required

기존 `icons.tsx`에서 사용 가능한 아이콘:

| Icon | 용도 |
|------|------|
| `ShoppingCart` | PO 문서 카드 |
| `FileText` | PI 문서 카드 |
| `Ship` | Shipping 문서 카드 |
| `Landmark` | Customs 문서 카드 |
| `Truck` | Delivery 문서 카드 |
| `Plus` | 생성 버튼 |
| `Pencil` | Inline 수정 |
| `Trash2` | 삭제 |
| `Check` | 타임라인 완료 표시, 통관비 수령 |
| `X` | 미수령 |
| `AlertCircle` | CY 경고 |
| `Container` | CY 체류 |
| `Loader2` | 로딩 스피너 |
| `MoreHorizontal` | 드롭다운 트리거 |
| `Search` | 검색 입력 |

추가 필요 아이콘:

| Icon | 용도 | lucide 이름 |
|------|------|-------------|
| `Calendar` | 날짜 관련 UI | `Calendar` |
| `Link2` | 문서 연결 | `Link2` |
| `Unlink` | 연결 해제 | `Unlink` |
| `Clock` | 타임라인 진행 중 | `Clock` |

```tsx
// icons.tsx에 추가
export { Calendar, Link2, Unlink, Clock } from "lucide-react";
```

---

## 12. Actions Summary

### List Page Actions (`orders.server.ts`)

| `_action` | 설명 | 입력 |
|-----------|------|------|
| `create` | 오더 생성 | `po_id`, `saelim_no` |

### Detail Page Actions (`orders.$id.server.ts`)

| `_action` | 설명 | 입력 |
|-----------|------|------|
| `toggle_status` | 진행/완료 토글 | `current_status` |
| `update_field` | 단일 필드 수정 | `field`, `value` |
| `link_doc` | 문서 연결 | `doc_type`, `doc_id` |
| `unlink_doc` | 문서 연결 해제 | `doc_type` |
| `delete` | 오더 삭제 (soft) | - |
| `content_*` | Content 시스템 | (기존 패턴) |

---

## 13. Edge Cases & Phase 7/8 Considerations

### 13-1. Customs/Delivery 미구현 상태

Phase 7(Customs), Phase 8(Delivery)이 아직 구현되지 않은 상태에서:

- **Doc Links 카드**: Customs/Delivery 카드는 표시하되 "연결" 버튼 `disabled`
- **Timeline**: 통관일/배송일 스텝은 표시하되 항상 미완료("-") 상태
- **CY Warning**: `customs_date`가 null이면 CY 경고 미표시
- **DB**: `customs_id`, `delivery_id` 컬럼은 존재하나 항상 null

구현 방법: `DOC_CONFIGS`에 `enabled: boolean` 추가하여 미구현 모듈 제어

```tsx
const DOC_CONFIGS = [
  { key: "po",       label: "구매주문 (PO)",  icon: ShoppingCart, path: "/po",       enabled: true },
  { key: "pi",       label: "견적서 (PI)",     icon: FileText,    path: "/pi",       enabled: true },
  { key: "shipping", label: "선적서류",        icon: Ship,        path: "/shipping", enabled: true },
  { key: "customs",  label: "통관",            icon: Landmark,    path: "/customs",  enabled: false },
  { key: "delivery", label: "배송",            icon: Truck,       path: "/delivery", enabled: false },
];
```

### 13-2. Order에 PO만 연결된 경우

- PI/Shipping/Customs/Delivery 모두 "미연결"
- Timeline에서 어드바이스일/도착일/배송일은 Order 자체 필드이므로 독립 표시 가능
- ETD/ETA/통관일은 연결 문서 의존이므로 "-" 표시

### 13-3. 날짜 누락 시 CY 계산

- `arrival_date`와 `customs_date` 모두 필요
- 하나라도 null이면 CY 경고 미표시 (null 반환)
- `arrival_date` 대신 `shipping.eta`를 fallback으로 사용하는 것도 고려
  - 우선순위: `arrival_date` > `shipping.eta`

### 13-4. 삭제된 연결 문서

- PO가 삭제(soft delete)된 경우: Order의 `po_id`는 남아있으나 JOIN 결과 null
- UI에서 "삭제된 문서" 표시 필요 여부 → 일단 "미연결"과 동일 처리

### 13-5. 동일 PO로 복수 Order 생성 방지

- DB에서 `po_id` UNIQUE 제약을 걸지 않으면 동일 PO에 여러 Order 가능
- UI에서는 이미 연결된 PO를 `availablePos`에서 제외하여 방지
- 서버에서도 중복 체크 필요

---

## 14. Loader Data Requirements

### List Page Loader

```typescript
// orders.server.ts loader
return data({
  orders: OrderListItem[],
  availablePos: { id: string; po_no: string }[],
  error?: string,
});
```

Supabase 쿼리:
```typescript
const { data: orders } = await supabase
  .from("orders")
  .select(`
    id, saelim_no, status, customs_fee_received,
    advice_date, arrival_date, delivery_date, created_at,
    po:po_id ( id, po_no ),
    pi:pi_id ( id, pi_no ),
    shipping:shipping_doc_id ( id, ci_no, vessel, eta, etd ),
    customs:customs_id ( id, customs_date, status ),
    delivery:delivery_id ( id, status )
  `)
  .is("deleted_at", null)
  .order("created_at", { ascending: false });
```

### Detail Page Loader

```typescript
// orders.$id.server.ts loader
return data({
  order: OrderWithDocs,
  content: ContentItem | null,
  userId: string,
});
```

---

## 15. Shared Component Reuse

기존 공유 컴포넌트 재사용 목록:

| 컴포넌트 | 위치 | 용도 |
|----------|------|------|
| `DocStatusBadge` | `shared/doc-status-badge.tsx` | 상태 배지 (목록, 상세, 문서카드) |
| `ContentSection` | `content/content-section.tsx` | Tiptap + 첨부 + 댓글 |
| `Header` | `layout/header.tsx` | 페이지 헤더 |
| `PageContainer` | `layout/page-container.tsx` | 페이지 컨테이너 |
| `formatDate` | `lib/format.ts` | 날짜 포맷 |
| `formatCurrency` | `lib/format.ts` | 통화 포맷 |

신규 shadcn/ui 컴포넌트 (미설치 시):

| 컴포넌트 | 용도 |
|----------|------|
| `Dialog` | 오더 생성 Dialog |
| `Select` | PO 선택 드롭다운 |
| `Switch` | 통관비 수령 토글 |
| `Label` | Form labels |

기존 설치 여부 확인 필요: `app/components/ui/` 디렉토리 내 dialog, select, switch, label 존재 확인.

---

## 16. Implementation Priority

Phase 6 프론트엔드 구현 순서:

1. **Types** (`app/types/order.ts`) -- 타입 정의 먼저
2. **List Page** (`_layout.orders.tsx`) -- 기본 목록 + 필터 + 검색
3. **Create Dialog** (`order-create-dialog.tsx`) -- 생성 플로우
4. **Detail Page** (`_layout.orders.$id.tsx`) -- 상세 뷰 골격
5. **Doc Links** (`order-doc-links.tsx`) -- 문서 연결 카드
6. **Timeline** (`order-date-timeline.tsx`) -- 날짜 타임라인
7. **Inline Fields** (`order-inline-fields.tsx`) -- Inline 수정
8. **CY Warning** (`order-cy-warning.tsx`) -- CY 체류 경고
9. **Content 연동** -- 기존 ContentSection 연결
10. **Icons 추가** -- Calendar, Link2, Unlink, Clock

서버(loader/action)와 프론트엔드 병행 개발 가능. 타입 정의 후 독립 작업.
