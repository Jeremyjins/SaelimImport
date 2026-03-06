# Phase 2: PO Module - Frontend Brainstorming

## Overview

PO(Purchase Order) 모듈은 Settings CRUD 패턴(Dialog 기반)에서 벗어나, 별도 페이지 기반의 생성/상세/편집 플로우를 도입하는 첫 문서 모듈이다. PI, Shipping 등 후속 모듈의 기준 패턴이 된다.

---

## 1. Route Structure

```
routes.ts 추가분:
route("po", "routes/_layout.po.tsx"),              // 리스트 (기존)
route("po/new", "routes/_layout.po.new.tsx"),       // 생성
route("po/:id", "routes/_layout.po.$id.tsx"),       // 상세
route("po/:id/edit", "routes/_layout.po.$id.edit.tsx"), // 편집
```

Server loaders:
```
app/loaders/po.server.ts          // list loader + create/delete actions
app/loaders/po.detail.server.ts   // detail loader + status toggle action
app/loaders/po.form.server.ts     // shared form loader (orgs, products) + create/update actions
```

---

## 2. PO List Page (`_layout.po.tsx`)

### Header
```tsx
<Header title="구매주문">
  <Button size="sm" asChild>
    <Link to="/po/new">
      <Plus className="h-4 w-4 mr-1" />
      PO 작성
    </Link>
  </Button>
</Header>
```

### Status Filter Tabs
shadcn `Tabs` 컴포넌트를 사용하되, URL searchParams로 상태를 관리한다. 이 패턴은 PI/Shipping에서도 재사용한다.

```tsx
// URL: /po?status=process or /po?status=complete or /po (전체)
const [searchParams, setSearchParams] = useSearchParams();
const currentStatus = searchParams.get("status") ?? "all";

<Tabs value={currentStatus} onValueChange={(v) => {
  const params = new URLSearchParams(searchParams);
  if (v === "all") params.delete("status");
  else params.set("status", v);
  setSearchParams(params);
}}>
  <TabsList>
    <TabsTrigger value="all">전체 ({counts.all})</TabsTrigger>
    <TabsTrigger value="process">진행 ({counts.process})</TabsTrigger>
    <TabsTrigger value="complete">완료 ({counts.complete})</TabsTrigger>
  </TabsList>
</Tabs>
```

**Decision: Client-side filter vs Server-side filter**
- 초기 PO 수가 적으므로(수십~수백) 전체 로드 후 클라이언트 필터링
- loader에서 전체 반환, 컴포넌트에서 `useMemo`로 필터링
- 나중에 데이터가 많아지면 searchParams를 loader에 전달하여 서버 필터로 전환

### Search
PO번호 또는 공급자명 검색. 간단한 클라이언트 필터:
```tsx
const [search, setSearch] = useState("");
// toolbar area
<div className="relative">
  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
  <Input
    placeholder="PO 번호 검색..."
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    className="pl-9 w-[200px] md:w-[300px]"
  />
</div>
```

### Desktop Table View (`hidden md:block`)

| PO No | 일자 | 공급자 | 통화 | 총액 | 상태 | 관리 |
|-------|------|--------|------|------|------|------|
| PO-2026-001 | 2026.03.01 | CHP | USD | $12,500.00 | 진행 | ... |

```tsx
<div className="hidden md:block">
  <div className="rounded-lg border">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>PO No.</TableHead>
          <TableHead>일자</TableHead>
          <TableHead>공급자</TableHead>
          <TableHead>통화</TableHead>
          <TableHead className="text-right">총액</TableHead>
          <TableHead>상태</TableHead>
          <TableHead className="w-[80px]">관리</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filteredPOs.map((po) => (
          <TableRow key={po.id} className="cursor-pointer" onClick={() => navigate(`/po/${po.id}`)}>
            <TableCell className="font-medium">{po.po_number}</TableCell>
            <TableCell>{formatDate(po.po_date)}</TableCell>
            <TableCell>{po.supplier_name}</TableCell>
            <TableCell>{po.currency}</TableCell>
            <TableCell className="text-right">{formatCurrency(po.total_amount, po.currency)}</TableCell>
            <TableCell><POStatusBadge status={po.status} /></TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild><Link to={`/po/${po.id}/edit`}>수정</Link></DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleClone(po.id)}>복제</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onClick={() => setDeletePO(po)}>삭제</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
</div>
```

**Row click**: 테이블 행 클릭 시 상세 페이지로 이동. Actions 드롭다운은 `onClick stopPropagation`.

### Mobile Card View (`md:hidden`)

```tsx
<div className="md:hidden flex flex-col gap-3">
  {filteredPOs.map((po) => (
    <Link key={po.id} to={`/po/${po.id}`} className="block">
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="font-medium text-sm">{po.po_number}</span>
          <POStatusBadge status={po.status} />
        </div>
        <div className="text-xs text-muted-foreground mb-1">
          {po.supplier_name} | {formatDate(po.po_date)}
        </div>
        <div className="text-sm font-semibold text-right">
          {formatCurrency(po.total_amount, po.currency)}
        </div>
      </Card>
    </Link>
  ))}
</div>
```

### Empty State
```tsx
<div className="text-center py-16">
  <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
  <h3 className="mt-4 text-sm font-semibold">구매주문이 없습니다</h3>
  <p className="mt-1 text-sm text-muted-foreground">
    새 구매주문을 작성하여 시작하세요.
  </p>
  <Button size="sm" className="mt-4" asChild>
    <Link to="/po/new">
      <Plus className="h-4 w-4 mr-1" />
      PO 작성
    </Link>
  </Button>
</div>
```

### Sort
기본 정렬: `po_date DESC` (최신순). Loader에서 정렬하여 반환. 클라이언트 추가 정렬은 Phase 2에서는 불필요.

---

## 3. PO Create Page (`_layout.po.new.tsx`)

### Page Structure
```tsx
<Header title="구매주문 작성">
  {/* 빈 영역 - submit 버튼은 폼 하단에 배치 */}
</Header>
<PageContainer>
  <POForm
    orgs={orgs}
    products={products}
    onCancel={() => navigate("/po")}
  />
</PageContainer>
```

### Loader
form loader가 organizations(supplier/buyer 목록)와 products 목록을 반환:
```typescript
// loaders/po.form.server.ts
export async function loader({ request, context }: LoaderFunctionArgs) {
  await requireAuth(request, context);
  const supabase = createSupabaseClient(request, context);
  const [orgs, products] = await Promise.all([
    supabase.from("organizations").select("id, name_en, type").is("deleted_at", null),
    supabase.from("products").select("id, name, gsm, width_mm").is("deleted_at", null),
  ]);
  return data({ orgs: orgs.data ?? [], products: products.data ?? [] });
}
```

---

## 4. PO Detail Page (`_layout.po.$id.tsx`)

### Header
```tsx
<Header title={po.po_number}>
  <POStatusBadge status={po.status} />
  <Button variant="outline" size="sm" onClick={handleStatusToggle}>
    {po.status === "process" ? "완료 처리" : "진행으로 변경"}
  </Button>
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" size="sm">
        <MoreHorizontal className="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem asChild><Link to={`/po/${po.id}/edit`}>수정</Link></DropdownMenuItem>
      <DropdownMenuItem onClick={handleClone}>복제</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem className="text-destructive" onClick={() => setShowDelete(true)}>삭제</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</Header>
```

### Info Section - Desktop (2-column grid)
```tsx
<div className="hidden md:grid md:grid-cols-2 gap-6">
  <Card>
    <CardHeader><CardTitle className="text-sm">기본 정보</CardTitle></CardHeader>
    <CardContent className="grid gap-3 text-sm">
      <InfoRow label="PO 번호" value={po.po_number} />
      <InfoRow label="일자" value={formatDate(po.po_date)} />
      <InfoRow label="유효기간" value={formatDate(po.validity)} />
      <InfoRow label="참조번호" value={po.ref_no ?? "-"} />
    </CardContent>
  </Card>
  <Card>
    <CardHeader><CardTitle className="text-sm">거래 조건</CardTitle></CardHeader>
    <CardContent className="grid gap-3 text-sm">
      <InfoRow label="공급자" value={po.supplier_name} />
      <InfoRow label="구매자" value={po.buyer_name} />
      <InfoRow label="결제조건" value={po.payment_term} />
      <InfoRow label="인도조건" value={po.delivery_term} />
      <InfoRow label="선적항" value={po.loading_port} />
      <InfoRow label="양륙항" value={po.discharge_port} />
    </CardContent>
  </Card>
</div>
```

### Info Section - Mobile (single column, stacked cards)
```tsx
<div className="md:hidden flex flex-col gap-4">
  {/* 같은 Card 구조, 단일 컬럼 */}
</div>
```

### InfoRow Helper
```tsx
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
```

### Line Items Table
Desktop과 Mobile 모두 Table로 표시 (가로 스크롤 허용):
```tsx
<Card>
  <CardHeader>
    <CardTitle className="text-sm">품목 내역</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]">#</TableHead>
            <TableHead>품목</TableHead>
            <TableHead className="text-right">수량 (KG)</TableHead>
            <TableHead className="text-right">단가</TableHead>
            <TableHead className="text-right">금액</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {po.details.map((item, i) => (
            <TableRow key={i}>
              <TableCell>{i + 1}</TableCell>
              <TableCell>{item.product_name} ({item.gsm}gsm, {item.width_mm}mm)</TableCell>
              <TableCell className="text-right">{formatWeight(item.quantity_kg)}</TableCell>
              <TableCell className="text-right">{formatCurrency(item.unit_price, po.currency)}</TableCell>
              <TableCell className="text-right font-medium">{formatCurrency(item.amount, po.currency)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <tfoot>
          <TableRow>
            <TableCell colSpan={4} className="text-right font-semibold">합계</TableCell>
            <TableCell className="text-right font-semibold">
              {formatCurrency(po.total_amount, po.currency)}
            </TableCell>
          </TableRow>
        </tfoot>
      </Table>
    </div>
  </CardContent>
</Card>
```

### Footer Info
```tsx
<div className="text-xs text-muted-foreground flex gap-4">
  <span>작성: {formatDate(po.created_at)}</span>
  <span>수정: {formatDate(po.updated_at)}</span>
</div>
```

### Back Navigation
```tsx
// Header에 뒤로가기를 넣거나, 페이지 상단에 breadcrumb
<Button variant="ghost" size="sm" asChild>
  <Link to="/po">
    <ChevronLeft className="h-4 w-4 mr-1" />
    목록으로
  </Link>
</Button>
```
Note: `ChevronLeft`를 icons.tsx에 추가 필요.

---

## 5. PO Edit Page (`_layout.po.$id.edit.tsx`)

Create와 동일한 `POForm` 컴포넌트 사용. `defaultValues` prop으로 기존 데이터 전달.

```tsx
<Header title={`${po.po_number} 수정`} />
<PageContainer>
  <POForm
    orgs={orgs}
    products={products}
    defaultValues={po}
    onCancel={() => navigate(`/po/${po.id}`)}
  />
</PageContainer>
```

PO 번호 필드는 `readOnly`로 표시.

---

## 6. Shared Components

### `app/components/po/po-form.tsx`

Create/Edit 공용 폼. useFetcher로 제출.

```tsx
interface POFormProps {
  orgs: Array<{ id: string; name_en: string; type: string }>;
  products: Array<{ id: string; name: string; gsm: number | null; width_mm: number | null }>;
  defaultValues?: POFormData;
  onCancel: () => void;
}

export function POForm({ orgs, products, defaultValues, onCancel }: POFormProps) {
  const fetcher = useFetcher();
  const isEdit = !!defaultValues;
  const isPending = fetcher.state !== "idle";
  const [lineItems, setLineItems] = useState<LineItem[]>(
    defaultValues?.details ?? [createEmptyLineItem()]
  );

  // 공급자/구매자 기본값
  const suppliers = orgs.filter(o => o.type === "supplier");
  const buyers = orgs.filter(o => o.type === "buyer" || o.type === "seller");

  return (
    <fetcher.Form method="post">
      <input type="hidden" name="_action" value={isEdit ? "update" : "create"} />
      {isEdit && <input type="hidden" name="id" value={defaultValues.id} />}

      {/* 기본 정보 섹션 */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* 좌측: 기본 정보 */}
        <Card>
          <CardHeader><CardTitle className="text-sm">기본 정보</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            {isEdit && (
              <div className="grid gap-2">
                <Label>PO 번호</Label>
                <Input value={defaultValues.po_number} readOnly className="bg-muted" />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="po_date">PO 일자 *</Label>
              <Input type="date" id="po_date" name="po_date"
                defaultValue={defaultValues?.po_date ?? today()} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="validity">유효기간</Label>
              <Input type="date" id="validity" name="validity"
                defaultValue={defaultValues?.validity ?? ""} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ref_no">참조번호</Label>
              <Input id="ref_no" name="ref_no"
                defaultValue={defaultValues?.ref_no ?? ""} placeholder="참조번호" />
            </div>
          </CardContent>
        </Card>

        {/* 우측: 거래 조건 */}
        <Card>
          <CardHeader><CardTitle className="text-sm">거래 조건</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="supplier_id">공급자 *</Label>
              <Select name="supplier_id" defaultValue={defaultValues?.supplier_id ?? suppliers[0]?.id}>
                ...
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="buyer_id">구매자 *</Label>
              <Select name="buyer_id" defaultValue={defaultValues?.buyer_id ?? buyers[0]?.id}>
                ...
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <SelectField name="currency" label="통화" options={CURRENCIES} />
              <SelectField name="payment_term" label="결제조건" options={PAYMENT_TERMS} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <SelectField name="delivery_term" label="인도조건" options={DELIVERY_TERMS} />
              <SelectField name="loading_port" label="선적항" options={LOADING_PORTS} />
            </div>
            <SelectField name="discharge_port" label="양륙항" options={DISCHARGE_PORTS} />
          </CardContent>
        </Card>
      </div>

      {/* 품목 내역 */}
      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm">품목 내역</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
            <Plus className="h-4 w-4 mr-1" />
            품목 추가
          </Button>
        </CardHeader>
        <CardContent>
          <POLineItems
            items={lineItems}
            products={products}
            currency={selectedCurrency}
            onChange={setLineItems}
          />
        </CardContent>
      </Card>

      {/* 비고 */}
      <Card className="mt-6">
        <CardContent className="pt-6">
          <Label htmlFor="notes">비고</Label>
          <Textarea id="notes" name="notes"
            defaultValue={defaultValues?.notes ?? ""} rows={3} className="mt-2" />
        </CardContent>
      </Card>

      {/* 하단 버튼 */}
      <div className="flex justify-end gap-2 mt-6 pb-8">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
          취소
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "저장 중..." : isEdit ? "수정" : "작성"}
        </Button>
      </div>

      {/* hidden field: serialized line items */}
      <input type="hidden" name="details" value={JSON.stringify(lineItems)} />
    </fetcher.Form>
  );
}
```

**Mobile Layout**: `md:grid-cols-2`는 모바일에서 자동으로 single column(`grid gap-6`)이 된다.

### `app/components/po/po-line-items.tsx`

동적 품목 편집기.

```tsx
interface LineItem {
  product_id: string;
  product_name: string;
  gsm: number | null;
  width_mm: number | null;
  quantity_kg: number;
  unit_price: number;
  amount: number;
}

interface POLineItemsProps {
  items: LineItem[];
  products: Array<{ id: string; name: string; gsm: number | null; width_mm: number | null }>;
  currency: string;
  onChange: (items: LineItem[]) => void;
}
```

**Desktop Layout (md 이상)**: 테이블 형태
```
| 품목 (Select)        | 수량 (KG)  | 단가      | 금액        | X |
| Glassine 40gsm 620mm| 5,000     | 1.25     | $6,250.00  | X |
| Glassine 50gsm 780mm| 3,000     | 1.30     | $3,900.00  | X |
|                      |           |    합계   | $10,150.00 |   |
```

**Mobile Layout (md:hidden)**: 카드 스택 형태
```
+----------------------------------+
| 품목: [Select ▼                ] |
| 수량 (KG): [5000        ]       |
| 단가:      [1.25        ]       |
| 금액:      $6,250.00     [삭제] |
+----------------------------------+
```

```tsx
export function POLineItems({ items, products, currency, onChange }: POLineItemsProps) {
  const updateItem = (index: number, field: keyof LineItem, value: unknown) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    // auto-calc amount
    if (field === "quantity_kg" || field === "unit_price") {
      updated[index].amount = updated[index].quantity_kg * updated[index].unit_price;
    }
    onChange(updated);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return; // 최소 1행 유지
    onChange(items.filter((_, i) => i !== index));
  };

  const handleProductSelect = (index: number, productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    updateItem(index, "product_id", productId);
    // 제품 정보 자동 채움
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      product_id: productId,
      product_name: product.name,
      gsm: product.gsm,
      width_mm: product.width_mm,
    };
    onChange(updated);
  };

  const total = items.reduce((sum, item) => sum + (item.amount || 0), 0);

  return (
    <>
      {/* Desktop */}
      <div className="hidden md:block overflow-x-auto">
        <Table> ... </Table>
      </div>

      {/* Mobile */}
      <div className="md:hidden flex flex-col gap-4">
        {items.map((item, i) => (
          <div key={i} className="rounded-lg border p-4 grid gap-3">
            <div className="grid gap-2">
              <Label>품목</Label>
              <Select value={item.product_id} onValueChange={(v) => handleProductSelect(i, v)}>
                <SelectTrigger><SelectValue placeholder="제품 선택" /></SelectTrigger>
                <SelectContent>
                  {products.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} {p.gsm ? `(${p.gsm}gsm` : ""}
                      {p.width_mm ? `, ${p.width_mm}mm)` : p.gsm ? ")" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>수량 (KG)</Label>
                <Input type="number" value={item.quantity_kg || ""} onChange={...} />
              </div>
              <div className="grid gap-2">
                <Label>단가</Label>
                <Input type="number" step="0.01" value={item.unit_price || ""} onChange={...} />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                금액: {formatCurrency(item.amount, currency)}
              </span>
              <Button type="button" variant="ghost" size="icon"
                onClick={() => removeItem(i)} disabled={items.length <= 1}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* 합계 (공용) */}
      <div className="flex justify-end mt-4 text-sm">
        <span className="font-semibold">합계: {formatCurrency(total, currency)}</span>
      </div>
    </>
  );
}
```

### `app/components/po/po-status-badge.tsx`

```tsx
import { Badge } from "~/components/ui/badge";

const STATUS_CONFIG = {
  process: { label: "진행", variant: "default" as const },
  complete: { label: "완료", variant: "secondary" as const },
};

export function POStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]
    ?? { label: status, variant: "outline" as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
```

**Reuse note**: 이 패턴은 `app/components/shared/doc-status-badge.tsx`로 일반화 가능. `DOC_STATUS`를 기반으로 PI, Shipping에서도 동일한 진행/완료 상태를 쓰므로, 범용 컴포넌트로 만드는 것을 권장.

```tsx
// app/components/shared/doc-status-badge.tsx
export function DocStatusBadge({ status }: { status: string }) { ... }
```

---

## 7. Line Item Serialization Strategy

Line items는 JSONB 컬럼이므로 폼에서 JSON 문자열로 전송:

```tsx
// 폼 제출 시:
<input type="hidden" name="details" value={JSON.stringify(lineItems)} />
```

Server action에서:
```typescript
const details = JSON.parse(formData.get("details") as string);
// Zod로 검증
const lineItemSchema = z.array(z.object({
  product_id: z.string().uuid(),
  product_name: z.string(),
  gsm: z.number().nullable(),
  width_mm: z.number().nullable(),
  quantity_kg: z.number().positive(),
  unit_price: z.number().positive(),
  amount: z.number(),
}));
```

---

## 8. PO Number Generation

서버에서 auto-generate. 패턴: `PO-{YYYY}-{NNN}` (예: PO-2026-001).

```typescript
// server-side
async function generatePONumber(supabase: SupabaseClient): Promise<string> {
  const year = new Date().getFullYear();
  const { count } = await supabase
    .from("purchase_orders")
    .select("*", { count: "exact", head: true })
    .ilike("po_number", `PO-${year}-%`);
  const seq = String((count ?? 0) + 1).padStart(3, "0");
  return `PO-${year}-${seq}`;
}
```

Create 폼에서는 PO 번호 필드를 표시하지 않음 (저장 후 자동 부여).
Edit 폼에서는 readOnly로 표시.

---

## 9. Clone Feature

상세 페이지에서 "복제" 클릭 시:
- Server action으로 새 PO 생성 (새 PO 번호, 동일 details/조건)
- 생성 후 새 PO의 edit 페이지로 redirect
- 복제 시 status는 항상 "process"

```typescript
// server action
case "clone":
  const original = await getPO(id);
  const newNumber = await generatePONumber(supabase);
  const { data: cloned } = await supabase.from("purchase_orders").insert({
    ...original,
    id: undefined,
    po_number: newNumber,
    status: "process",
    created_at: undefined,
    updated_at: undefined,
  }).select("id").single();
  return redirect(`/po/${cloned.id}/edit`);
```

---

## 10. New shadcn Components Needed

```bash
npx shadcn@latest add tabs
npx shadcn@latest add card
npx shadcn@latest add dropdown-menu  # 이미 설치됨 확인
```

`tabs`: 상태 필터 (전체/진행/완료)
`card`: PO 상세 페이지 info sections, mobile list cards, form sections

**Note**: `card`는 아직 설치되지 않았을 수 있음. 확인 필요.

---

## 11. Icons to Add to `icons.tsx`

```tsx
// 추가 필요:
export {
  // 기존...
  ChevronLeft,    // 뒤로가기 (상세 → 목록)
  Eye,            // 상세보기 (optional)
  ArrowUpDown,    // 정렬 (optional, future)
  Calendar,       // 일자 필드 (optional)
  MoreVertical,   // 모바일 actions (optional, MoreHorizontal이면 충분)
} from "lucide-react";
```

최소한 `ChevronLeft`만 추가하면 충분. 나머지는 필요시.

---

## 12. UI Wireframes (ASCII)

### PO List - Desktop
```
+----------------------------------------------------------+
| [=] | 구매주문                              [PO 작성] btn |
+----------------------------------------------------------+
| [전체(12)] [진행(8)] [완료(4)]    [🔍 PO 번호 검색...]   |
+----------------------------------------------------------+
| PO No.       | 일자       | 공급자 | 통화| 총액       |상태| ⋯ |
|------------- |------------|--------|-----|------------|----|----|
| PO-2026-003  | 2026.03.05 | CHP    | USD | $18,750.00 |진행| ⋯ |
| PO-2026-002  | 2026.03.01 | CHP    | USD | $12,500.00 |진행| ⋯ |
| PO-2026-001  | 2026.02.15 | CHP    | KRW | ₩8,500,000 |완료| ⋯ |
+----------------------------------------------------------+
```

### PO List - Mobile
```
+----------------------------+
| [=] 구매주문    [PO 작성]  |
+----------------------------+
| [전체] [진행] [완료]       |
| [🔍 PO 번호 검색...]      |
+----------------------------+
| +------------------------+ |
| | PO-2026-003      [진행]| |
| | CHP | 2026.03.05       | |
| |           $18,750.00   | |
| +------------------------+ |
| +------------------------+ |
| | PO-2026-002      [진행]| |
| | CHP | 2026.03.01       | |
| |           $12,500.00   | |
| +------------------------+ |
+----------------------------+
```

### PO Create - Desktop
```
+----------------------------------------------------------+
| [=] | 구매주문 작성                                       |
+----------------------------------------------------------+
| +-------------------------+ +---------------------------+ |
| | 기본 정보               | | 거래 조건                 | |
| | PO 일자: [2026-03-06]   | | 공급자: [CHP        ▼]  | |
| | 유효기간: [          ]   | | 구매자: [GV Int'l   ▼]  | |
| | 참조번호: [          ]   | | 통화: [USD ▼] 결제:[▼]  | |
| |                         | | 인도: [▼]   선적항: [▼]  | |
| |                         | | 양륙항: [▼]              | |
| +-------------------------+ +---------------------------+ |
| +-------------------------------------------------------+ |
| | 품목 내역                              [품목 추가] btn | |
| | 품목               | 수량(KG) | 단가   | 금액      | X | |
| |--------------------+----------+--------+-----------+---| |
| | [Glassine 40g ▼]  | [5000]   | [1.25] | $6,250.00 | X | |
| | [Glassine 50g ▼]  | [3000]   | [1.30] | $3,900.00 | X | |
| |                    |          |  합계  |$10,150.00 |   | |
| +-------------------------------------------------------+ |
| +-------------------------------------------------------+ |
| | 비고                                                   | |
| | [                                                    ] | |
| +-------------------------------------------------------+ |
|                                      [취소]  [작성] btn  |
+----------------------------------------------------------+
```

### PO Create - Mobile
```
+----------------------------+
| [=] 구매주문 작성           |
+----------------------------+
| +------------------------+ |
| | 기본 정보              | |
| | PO 일자: [2026-03-06]  | |
| | 유효기간: [         ]  | |
| | 참조번호: [         ]  | |
| +------------------------+ |
| +------------------------+ |
| | 거래 조건              | |
| | 공급자: [CHP       ▼]  | |
| | 구매자: [GV Int'l  ▼]  | |
| | 통화: [USD ▼]          | |
| | 결제조건: [T/T  ▼]     | |
| | 인도조건: [CFR  ▼]     | |
| | 선적항: [Keelung ▼]    | |
| | 양륙항: [Busan   ▼]    | |
| +------------------------+ |
| +------------------------+ |
| | 품목 내역  [품목 추가]  | |
| | +--------------------+ | |
| | | 품목:[Glassine ▼]  | | |
| | | 수량:[5000] 단가:[1.25]|
| | | 금액: $6,250  [삭제]| | |
| | +--------------------+ | |
| +------------------------+ |
| +------------------------+ |
| | 비고: [              ] | |
| +------------------------+ |
|        [취소]  [작성]     |
+----------------------------+
```

### PO Detail - Desktop
```
+----------------------------------------------------------+
| [< 목록으로] | PO-2026-003   [진행] [완료 처리] [⋯]      |
+----------------------------------------------------------+
| +-------------------------+ +---------------------------+ |
| | 기본 정보               | | 거래 조건                 | |
| | PO 번호    PO-2026-003  | | 공급자         CHP       | |
| | 일자       2026.03.05   | | 구매자   GV Int'l        | |
| | 유효기간   2026.04.05   | | 결제조건  T/T in advance | |
| | 참조번호   REF-123      | | 인도조건  CFR Busan      | |
| |                         | | 선적항  Keelung, Taiwan  | |
| |                         | | 양륙항  Busan, Korea     | |
| +-------------------------+ +---------------------------+ |
| +-------------------------------------------------------+ |
| | 품목 내역                                              | |
| | #  | 품목                | 수량(KG)  | 단가  | 금액     | |
| |----|---------------------|-----------|-------|---------|  |
| | 1  | Glassine 40g, 620mm | 5,000 KG  | $1.25 |$6,250  | |
| | 2  | Glassine 50g, 780mm | 3,000 KG  | $1.30 |$3,900  | |
| |    |                     |           | 합계  |$10,150 | |
| +-------------------------------------------------------+ |
| 작성: 2026.03.05  수정: 2026.03.05                        |
+----------------------------------------------------------+
```

---

## 13. State Management Notes

### List Page State
- `search`: string (검색어)
- `deleteId`: PO | null (삭제 확인 AlertDialog)
- Tabs: URL searchParams 기반 (React Router `useSearchParams`)
- 필터링: `useMemo`로 status + search 적용

### Form Page State
- `lineItems`: LineItem[] (동적 배열, useState)
- `selectedCurrency`: string (통화 변경 시 금액 표시 갱신)
- Form fields: uncontrolled (defaultValue) + fetcher.Form
- Error display: `fetcher.data?.error`

### Detail Page State
- `showDelete`: boolean (삭제 AlertDialog)
- Status toggle: useFetcher submit

---

## 14. Navigation Flow

```
/po (리스트)
  ├── /po/new (작성) → 저장 후 redirect to /po/{id}
  ├── /po/{id} (상세)
  │   ├── /po/{id}/edit (수정) → 저장 후 redirect to /po/{id}
  │   ├── 복제 → server clone → redirect to /po/{newId}/edit
  │   ├── 삭제 → server delete → redirect to /po
  │   └── 상태 변경 → server toggle → revalidation
  └── 행 클릭 → /po/{id}
```

---

## 15. Error Handling Pattern

```tsx
// fetcher.data 기반 에러 표시 (Phase 1 패턴 따름)
{fetcher.data && "error" in fetcher.data && (
  <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
    <AlertCircle className="inline h-4 w-4 mr-1" />
    {fetcher.data.error as string}
  </div>
)}
```

---

## 16. File Summary

### New Files
```
app/routes/_layout.po.new.tsx          # PO 작성 페이지
app/routes/_layout.po.$id.tsx          # PO 상세 페이지
app/routes/_layout.po.$id.edit.tsx     # PO 수정 페이지
app/loaders/po.server.ts               # PO 리스트 loader + actions
app/loaders/po.detail.server.ts        # PO 상세 loader + actions
app/loaders/po.form.server.ts          # PO 폼 loader + create/update actions
app/components/po/po-form.tsx          # 공용 PO 폼
app/components/po/po-line-items.tsx    # 동적 품목 편집기
app/components/shared/doc-status-badge.tsx  # 범용 문서 상태 배지
```

### Modified Files
```
app/routes/_layout.po.tsx              # 리스트 전면 리라이트
app/routes.ts                          # 새 PO 라우트 추가
app/components/ui/icons.tsx            # ChevronLeft 추가
```

### New shadcn Components
```bash
npx shadcn@latest add tabs card
```

---

## 17. Implementation Priority

1. **shadcn 설치** (tabs, card)
2. **icons.tsx 업데이트** (ChevronLeft)
3. **routes.ts 업데이트** (새 라우트)
4. **doc-status-badge.tsx** (공용 컴포넌트)
5. **po.server.ts** (리스트 loader)
6. **_layout.po.tsx** (리스트 UI, desktop + mobile)
7. **po.form.server.ts** (폼 loader + actions)
8. **po-line-items.tsx** (동적 품목 편집기)
9. **po-form.tsx** (공용 폼)
10. **_layout.po.new.tsx** (작성 페이지)
11. **po.detail.server.ts** (상세 loader)
12. **_layout.po.$id.tsx** (상세 페이지)
13. **_layout.po.$id.edit.tsx** (수정 페이지)

---

## 18. Open Questions

1. **PO 번호 형식**: `PO-{YYYY}-{NNN}` 확정? 또는 `PO{YYYYMM}-{NNN}`?
2. **Card 컴포넌트**: 이미 설치되어 있는지 확인 필요
3. **Clone 후 redirect**: edit 페이지 vs detail 페이지?
4. **Pagination**: Phase 2에서 필요한가? 초기 데이터 100건 미만 예상이면 불필요
5. **PDF 미리보기**: Phase 9에서 다루므로 Phase 2에서는 제외
6. **Notes 필드**: Textarea 단순 텍스트 vs Tiptap 에디터? Phase 4에서 Tiptap 도입 예정이므로 Phase 2는 Textarea
