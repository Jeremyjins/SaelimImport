# Phase 3: PI Module - Backend Dev Notes

**Date:** 2026-03-06
**Role:** Backend Dev

---

## 1. DB 현황

### proforma_invoices 테이블 (Phase 0에서 생성 완료)

```sql
CREATE TABLE proforma_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pi_no TEXT UNIQUE NOT NULL,
  pi_date DATE NOT NULL,
  validity DATE,
  ref_no TEXT,
  supplier_id UUID REFERENCES organizations(id),   -- GV (seller)
  buyer_id UUID REFERENCES organizations(id),       -- Saelim (buyer)
  currency TEXT DEFAULT 'USD',
  amount DECIMAL(15,2),
  payment_term TEXT,
  delivery_term TEXT,
  loading_port TEXT,
  discharge_port TEXT,
  details JSONB DEFAULT '[]',
  notes TEXT,
  status TEXT DEFAULT 'process' CHECK (status IN ('process', 'complete')),
  po_id UUID REFERENCES purchase_orders(id),        -- nullable FK
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### deliveries 테이블

```sql
CREATE TABLE deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pi_id UUID REFERENCES proforma_invoices(id),
  shipping_doc_id UUID REFERENCES shipping_documents(id),
  delivery_date DATE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 인덱스 (이미 존재)

```sql
CREATE INDEX idx_pi_status ON proforma_invoices(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_pi_po_id ON proforma_invoices(po_id);
CREATE INDEX idx_pi_created_at ON proforma_invoices(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_deliveries_pi_id ON deliveries(pi_id);
```

### generate_doc_number RPC

'PI' doc_type 지원: `prefix := 'GV' || doc_type;` -> 'GVPI' -> GVPIYYMM-XXX. 추가 마이그레이션 불필요.

---

## 2. 서버 파일 구조

```
app/loaders/pi.schema.ts         # piSchema (lineItemSchema는 po.schema에서 재사용)
app/loaders/pi.server.ts         # loader(목록) + piFormLoader(폼용) + createPIAction(생성)
app/loaders/pi.$id.server.ts     # loader(상세) + piEditLoader(수정폼) + action(update/delete/clone/toggle)
```

---

## 3. PI Schema (Zod)

```typescript
// app/loaders/pi.schema.ts
import { z } from "zod";
import { lineItemSchema } from "~/loaders/po.schema";  // 공유 재사용

export { lineItemSchema };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const piSchema = z.object({
  pi_date: z.string().min(1, "PI 일자를 입력하세요")
    .regex(ISO_DATE, "올바른 날짜 형식이 아닙니다 (YYYY-MM-DD)"),
  validity: z.string().optional().default("")
    .refine(v => !v || ISO_DATE.test(v), "올바른 날짜 형식이 아닙니다"),
  ref_no: z.string().max(100).optional().default(""),
  po_id: z.string().optional().default("")
    .refine(v => !v || z.string().uuid().safeParse(v).success, "유효한 PO를 선택하세요"),
  supplier_id: z.string().uuid("판매자를 선택하세요"),
  buyer_id: z.string().uuid("구매자를 선택하세요"),
  currency: z.enum(["USD", "KRW"]),
  payment_term: z.string().optional().default(""),
  delivery_term: z.string().optional().default(""),
  loading_port: z.string().optional().default(""),
  discharge_port: z.string().optional().default(""),
  notes: z.string().max(2000).optional().default(""),
});
```

---

## 4. PI List Loader

```typescript
export async function loader({ request, context }: LoaderArgs) {
  const { supabase, responseHeaders } = await requireGVUser(request, context);

  const { data: pis, error } = await supabase
    .from("proforma_invoices")
    .select(
      "id, pi_no, pi_date, status, amount, currency, " +
      "supplier:organizations!supplier_id(name_en), " +
      "buyer:organizations!buyer_id(name_en), " +
      "po:purchase_orders!po_id(po_no)"
    )
    .is("deleted_at", null)
    .order("pi_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return data(
      { pis: [], error: "데이터를 불러오는 데 실패했습니다." },
      { headers: responseHeaders }
    );
  }

  return data({ pis: pis ?? [] }, { headers: responseHeaders });
}
```

**타입 캐스팅 필요:** `as unknown as { pis: PIListItem[] }` (GenericStringError)

---

## 5. PI Form Loader

```typescript
export async function piFormLoader({ request, context }: LoaderArgs) {
  const { supabase, responseHeaders } = await requireGVUser(request, context);

  const url = new URL(request.url);
  const fromPoId = url.searchParams.get("from_po");

  const [{ data: suppliers }, { data: buyers }, { data: products }, poResult] =
    await Promise.all([
      supabase.from("organizations")
        .select("id, name_en, name_ko")
        .eq("type", "seller")           // PI supplier = GV (seller)
        .is("deleted_at", null)
        .order("name_en"),
      supabase.from("organizations")
        .select("id, name_en, name_ko")
        .eq("type", "buyer")            // PI buyer = Saelim (buyer)
        .is("deleted_at", null)
        .order("name_en"),
      supabase.from("products")
        .select("id, name, gsm, width_mm")
        .is("deleted_at", null)
        .order("name"),
      fromPoId
        ? supabase.from("purchase_orders")
            .select(
              "id, po_no, currency, payment_term, delivery_term, " +
              "loading_port, discharge_port, details"
            )
            .eq("id", fromPoId)
            .is("deleted_at", null)
            .single()
        : Promise.resolve({ data: null, error: null }),
    ]);

  return data({
    suppliers: suppliers ?? [],
    buyers: buyers ?? [],
    products: products ?? [],
    sourcePO: poResult.data ?? null,
  }, { headers: responseHeaders });
}
```

---

## 6. Create PI Action (핵심)

```typescript
export async function createPIAction({ request, context }: LoaderArgs) {
  const { supabase, user, responseHeaders } = await requireGVUser(request, context);
  const formData = await request.formData();

  // 1. details 파싱 + 검증
  const detailsRaw = formData.get("details") as string;
  let parsedDetails: unknown;
  try { parsedDetails = JSON.parse(detailsRaw || "[]"); } catch {
    return data({ success: false, error: "품목 데이터 형식이 올바르지 않습니다." },
      { status: 400, headers: responseHeaders });
  }

  const detailsResult = z.array(lineItemSchema).min(1).max(20).safeParse(parsedDetails);
  if (!detailsResult.success) {
    return data({ success: false, error: detailsResult.error.issues[0]?.message ?? "품목 입력을 확인하세요." },
      { status: 400, headers: responseHeaders });
  }

  // 2. 기본 필드 검증
  const raw = Object.fromEntries(formData);
  const parsed = piSchema.safeParse(raw);
  if (!parsed.success) {
    return data({ success: false, error: parsed.error.issues[0]?.message ?? "입력 값을 확인하세요." },
      { status: 400, headers: responseHeaders });
  }

  const { pi_date, validity, ref_no, po_id, supplier_id, buyer_id, currency,
          payment_term, delivery_term, loading_port, discharge_port, notes } = parsed.data;

  // 3. Org 활성 검증
  const [{ count: supplierCount }, { count: buyerCount }] = await Promise.all([
    supabase.from("organizations").select("id", { count: "exact", head: true })
      .eq("id", supplier_id).is("deleted_at", null),
    supabase.from("organizations").select("id", { count: "exact", head: true })
      .eq("id", buyer_id).is("deleted_at", null),
  ]);
  if (!supplierCount) return data({ success: false, error: "선택한 판매자가 유효하지 않습니다." }, { status: 400, headers: responseHeaders });
  if (!buyerCount) return data({ success: false, error: "선택한 구매자가 유효하지 않습니다." }, { status: 400, headers: responseHeaders });

  // 4. po_id 참조 유효성 (있을 경우)
  if (po_id) {
    const { count: poCount } = await supabase.from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("id", po_id).is("deleted_at", null);
    if (!poCount) return data({ success: false, error: "참조 PO를 찾을 수 없습니다." }, { status: 400, headers: responseHeaders });
  }

  // 5. Amount 서버사이드 재계산
  const recalculated = detailsResult.data.map(item => ({
    ...item,
    amount: Math.round(item.quantity_kg * item.unit_price * 100) / 100,
  }));
  const totalAmount = Math.round(recalculated.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;

  // 6. PI 번호 생성
  const { data: piNo, error: rpcError } = await supabase.rpc(
    "generate_doc_number", { doc_type: "PI", ref_date: pi_date }
  );
  if (rpcError || !piNo) return data({ success: false, error: "PI 번호 생성에 실패했습니다." }, { status: 500, headers: responseHeaders });

  // 7. PI INSERT
  const { data: created, error: insertError } = await supabase
    .from("proforma_invoices")
    .insert({
      pi_no: piNo,
      pi_date,
      validity: validity || null,
      ref_no: ref_no || null,
      po_id: po_id || null,
      supplier_id,
      buyer_id,
      currency,
      amount: totalAmount,
      payment_term: payment_term || null,
      delivery_term: delivery_term || null,
      loading_port: loading_port || null,
      discharge_port: discharge_port || null,
      details: recalculated as unknown as Json,
      notes: notes || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (insertError) {
    const errMsg = insertError.code === "23505"
      ? "이미 존재하는 PI 번호입니다."
      : "저장 중 오류가 발생했습니다.";
    return data({ success: false, error: errMsg }, { status: 500, headers: responseHeaders });
  }

  // 8. Delivery 자동 생성
  const { error: deliveryError } = await supabase
    .from("deliveries")
    .insert({ pi_id: created.id });

  if (deliveryError) {
    // Delivery 실패 시 PI 롤백
    await supabase.from("proforma_invoices")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", created.id);
    return data({ success: false, error: "배송 레코드 생성 중 오류가 발생했습니다." }, { status: 500, headers: responseHeaders });
  }

  // 9. 성공 -> 상세 페이지로 리다이렉트
  throw redirect(`/pi/${created.id}`, { headers: responseHeaders });
}
```

---

## 7. PI Detail/Edit Action

PO action과 동일 패턴. 차이점:

### Delete
```typescript
if (intent === "delete") {
  // PI soft delete
  await supabase.from("proforma_invoices")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id).is("deleted_at", null);

  // 연결 Delivery도 soft delete
  await supabase.from("deliveries")
    .update({ deleted_at: new Date().toISOString() })
    .eq("pi_id", id).is("deleted_at", null);

  throw redirect("/pi", { headers: responseHeaders });
}
```

### Clone
```typescript
if (intent === "clone") {
  // po_id는 null로 초기화 (클론은 독립 PI)
  const { data: cloned } = await supabase.from("proforma_invoices")
    .insert({ ...cloneData, po_id: null, status: "process", created_by: user.id })
    .select("id").single();

  // 클론 PI에도 Delivery 자동 생성
  await supabase.from("deliveries").insert({ pi_id: cloned.id });

  throw redirect(`/pi/${cloned.id}/edit`, { headers: responseHeaders });
}
```

---

## 8. PO -> PI 데이터 매핑 (서버 loader)

```typescript
// piFormLoader에서 sourcePO 처리 시 클라이언트에 전달하는 데이터
if (sourcePO) {
  // details에서 단가는 유지 (사용자가 수정 가능하도록)
  // 가격을 비우려면: details.map(d => ({ ...d, unit_price: 0, amount: 0 }))
  // 하지만 UX 관점에서 PO 단가를 기본값으로 제공하는 것이 낫다
  return data({
    ...baseData,
    sourcePO: {
      id: sourcePO.id,
      po_no: sourcePO.po_no,
      currency: sourcePO.currency,
      payment_term: sourcePO.payment_term,
      delivery_term: sourcePO.delivery_term,
      loading_port: sourcePO.loading_port,
      discharge_port: sourcePO.discharge_port,
      details: sourcePO.details,  // unit_price 포함 (GV 사용자만 접근)
    },
  }, { headers: responseHeaders });
}
```

---

## 9. 추가 마이그레이션

**불필요.** 모든 테이블, 인덱스, RLS, RPC가 Phase 0에서 생성 완료.

유일한 고려: PO detail loader에서 연결된 PI 목록을 조회하려면 PO loader 수정 필요 (마이그레이션은 아님).
