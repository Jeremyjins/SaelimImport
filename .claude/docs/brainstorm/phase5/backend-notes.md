# Phase 5: Shipping Documents - Backend Notes

## 1. File Structure

```
app/types/shipping.ts               → TypeScript types (list, detail, edit, stuffing)
app/loaders/shipping.schema.ts      → Zod schemas (shipping, stuffing, CSV)
app/loaders/shipping.server.ts      → List loader + form loader + create action
app/loaders/shipping.$id.server.ts  → Detail loader + edit loader + actions (CRUD + stuffing + content)
```

---

## 2. TypeScript Types (`app/types/shipping.ts`)

```typescript
import type { DocStatus } from "~/types/common";

// ── Line Items (reuse PI line item structure) ──────────────

export interface ShippingLineItem {
  product_id: string;
  product_name: string;
  gsm: number | null;
  width_mm: number | null;
  quantity_kg: number;
  unit_price: number;
  amount: number;
}

// ── Stuffing List Roll Detail (JSONB) ──────────────────────

export interface StuffingRollDetail {
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
  shipping_doc_id: string;
  sl_no: string | null;
  cntr_no: string | null;
  seal_no: string | null;
  roll_no_range: string | null;
  roll_details: StuffingRollDetail[];
  created_at: string;
  updated_at: string;
}

// ── List Item (for shipping list page) ─────────────────────

export interface ShippingListItem {
  id: string;
  ci_no: string;
  pl_no: string;
  ci_date: string;
  status: DocStatus;
  currency: string | null;
  amount: number | null;
  vessel: string | null;
  eta: string | null;
  shipper: { name_en: string } | null;
  consignee: { name_en: string } | null;
  pi: { pi_no: string } | null;
}

// ── Detail (with org joins) ────────────────────────────────

export interface ShippingWithOrgs {
  id: string;
  ci_no: string;
  pl_no: string;
  ci_date: string;
  ship_date: string | null;
  shipper_id: string;
  consignee_id: string;
  pi_id: string | null;
  currency: string | null;
  amount: number | null;
  payment_term: string | null;
  delivery_term: string | null;
  loading_port: string | null;
  discharge_port: string | null;
  vessel: string | null;
  voyage: string | null;
  etd: string | null;
  eta: string | null;
  gross_weight: number | null;
  net_weight: number | null;
  package_no: number | null;
  details: ShippingLineItem[];
  notes: string | null;
  ref_no: string | null;
  status: DocStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  shipper: { id: string; name_en: string; name_ko: string | null; address_en: string | null } | null;
  consignee: { id: string; name_en: string; name_ko: string | null; address_en: string | null } | null;
  pi: { pi_no: string } | null;
}

// ── Edit Data (for edit form pre-fill) ─────────────────────

export interface ShippingEditData {
  id: string;
  ci_no: string;
  pl_no: string;
  ci_date: string;
  ship_date: string | null;
  shipper_id: string;
  consignee_id: string;
  pi_id: string | null;
  currency: string | null;
  payment_term: string | null;
  delivery_term: string | null;
  loading_port: string | null;
  discharge_port: string | null;
  vessel: string | null;
  voyage: string | null;
  etd: string | null;
  eta: string | null;
  gross_weight: number | null;
  net_weight: number | null;
  package_no: number | null;
  notes: string | null;
  ref_no: string | null;
  status: DocStatus;
  details: ShippingLineItem[];
}

// ── Source PI (for ?from_pi= reference creation) ───────────

export interface SourcePI {
  id: string;
  pi_no: string;
  supplier_id: string;   // maps to shipper_id
  buyer_id: string;       // maps to consignee_id
  currency: string;
  payment_term: string | null;
  delivery_term: string | null;
  loading_port: string | null;
  discharge_port: string | null;
  details: ShippingLineItem[];
}
```

---

## 3. Zod Schemas (`app/loaders/shipping.schema.ts`)

```typescript
import { z } from "zod";
import { lineItemSchema } from "~/loaders/po.schema";

// Reuse lineItemSchema from PO (same structure: product_id, product_name, gsm, width_mm, quantity_kg, unit_price, amount)
export { lineItemSchema };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ── Main Shipping Schema ───────────────────────────────────

export const shippingSchema = z.object({
  ci_date: z
    .string()
    .min(1, "CI 일자를 입력하세요")
    .regex(ISO_DATE, "올바른 날짜 형식이 아닙니다 (YYYY-MM-DD)"),
  ship_date: z
    .string()
    .optional()
    .default("")
    .refine(
      (v) => !v || ISO_DATE.test(v),
      "올바른 날짜 형식이 아닙니다 (YYYY-MM-DD)"
    ),
  shipper_id: z.string().uuid("Shipper를 선택하세요"),
  consignee_id: z.string().uuid("Consignee를 선택하세요"),
  pi_id: z.union([z.string().uuid(), z.literal("")]).optional(),
  currency: z.enum(["USD", "KRW"]),
  payment_term: z.string().max(200).optional().default(""),
  delivery_term: z.string().max(200).optional().default(""),
  loading_port: z.string().max(200).optional().default(""),
  discharge_port: z.string().max(200).optional().default(""),
  vessel: z.string().max(200).optional().default(""),
  voyage: z.string().max(200).optional().default(""),
  etd: z
    .string()
    .optional()
    .default("")
    .refine(
      (v) => !v || ISO_DATE.test(v),
      "올바른 날짜 형식이 아닙니다 (YYYY-MM-DD)"
    ),
  eta: z
    .string()
    .optional()
    .default("")
    .refine(
      (v) => !v || ISO_DATE.test(v),
      "올바른 날짜 형식이 아닙니다 (YYYY-MM-DD)"
    ),
  ref_no: z.string().max(100).optional().default(""),
  notes: z.string().max(2000).optional().default(""),
});

// ── Stuffing List Schema ───────────────────────────────────

export const stuffingRollDetailSchema = z.object({
  roll_no: z.number().int().positive("Roll 번호는 1 이상이어야 합니다"),
  product_name: z.string().min(1, "제품명을 입력하세요").max(200),
  gsm: z.number().positive("GSM은 0보다 커야 합니다"),
  width_mm: z.number().positive("폭은 0보다 커야 합니다"),
  length_m: z.number().positive("길이는 0보다 커야 합니다"),
  net_weight_kg: z.number().nonnegative("순중량은 0 이상이어야 합니다"),
  gross_weight_kg: z.number().nonnegative("총중량은 0 이상이어야 합니다"),
});

export const stuffingListSchema = z.object({
  id: z.string().uuid().optional(),           // present on update, absent on create
  sl_no: z.string().max(100).optional().default(""),
  cntr_no: z.string().max(100).optional().default(""),
  seal_no: z.string().max(100).optional().default(""),
  roll_no_range: z.string().max(100).optional().default(""),
  roll_details: z.array(stuffingRollDetailSchema).min(1, "Roll 내역을 1개 이상 입력하세요"),
});

// ── CSV Upload Row Schema ──────────────────────────────────
// Validates a single parsed CSV row before conversion to StuffingRollDetail

export const csvRollRowSchema = z.object({
  roll_no: z.coerce.number().int().positive("Roll 번호는 1 이상이어야 합니다"),
  product_name: z.string().min(1),
  gsm: z.coerce.number().positive(),
  width_mm: z.coerce.number().positive(),
  length_m: z.coerce.number().positive(),
  net_weight_kg: z.coerce.number().nonnegative(),
  gross_weight_kg: z.coerce.number().nonnegative(),
});
```

Key notes on schemas:
- `lineItemSchema` is reused from `po.schema.ts` (same structure across PO/PI/Shipping).
- `shippingSchema` does NOT include `ci_no` or `pl_no` since those are server-generated.
- `stuffingListSchema.id` is optional: absent for create, present for update.
- `csvRollRowSchema` uses `z.coerce.number()` because CSV values arrive as strings.
- Date fields (ship_date, etd, eta) are optional with empty string defaults, validated only when non-empty.

---

## 4. List Loader (`app/loaders/shipping.server.ts`)

```typescript
export async function loader({ request, context }: LoaderArgs) {
  const { supabase, responseHeaders } = await requireGVUser(request, context);

  const { data: docs, error } = await supabase
    .from("shipping_documents")
    .select(
      "id, ci_no, pl_no, ci_date, status, currency, amount, vessel, eta, " +
        "shipper:organizations!shipper_id(name_en), " +
        "consignee:organizations!consignee_id(name_en), " +
        "pi:proforma_invoices!pi_id(pi_no)"
    )
    .is("deleted_at", null)
    .order("ci_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return data(
      { docs: [], error: "데이터를 불러오는 데 실패했습니다." },
      { headers: responseHeaders }
    );
  }

  return data({ docs: docs ?? [] }, { headers: responseHeaders });
}
```

Pattern notes:
- Same FK join pattern as PI list: `shipper:organizations!shipper_id(name_en)`.
- TypeScript `GenericStringError` workaround: cast result `as unknown as { docs: ShippingListItem[] }` if needed.
- Dual-field search (CI No + PI No) will be handled client-side by filtering the returned array (same as PI list pattern).

---

## 5. Form Loader (`app/loaders/shipping.server.ts` - `shippingFormLoader`)

```typescript
export async function shippingFormLoader({ request, context }: LoaderArgs) {
  const { supabase, responseHeaders } = await requireGVUser(request, context);

  const url = new URL(request.url);
  const fromPiId = url.searchParams.get("from_pi");

  const piIdResult = fromPiId ? z.string().uuid().safeParse(fromPiId) : null;
  const validPiId = piIdResult?.success ? piIdResult.data : null;

  const [{ data: shippers }, { data: consignees }, { data: products }, { data: pis }, { data: pi }] =
    await Promise.all([
      // Shipper = GV (type='seller')
      supabase
        .from("organizations")
        .select("id, name_en, name_ko")
        .eq("type", "seller")
        .is("deleted_at", null)
        .order("name_en"),
      // Consignee = Saelim (type='buyer')
      supabase
        .from("organizations")
        .select("id, name_en, name_ko")
        .eq("type", "buyer")
        .is("deleted_at", null)
        .order("name_en"),
      // Products for line item editor
      supabase
        .from("products")
        .select("id, name, gsm, width_mm")
        .is("deleted_at", null)
        .order("name"),
      // Active PIs for reference dropdown
      supabase
        .from("proforma_invoices")
        .select("id, pi_no")
        .is("deleted_at", null)
        .order("pi_date", { ascending: false }),
      // Source PI if from_pi param provided
      validPiId
        ? supabase
            .from("proforma_invoices")
            .select(
              "id, pi_no, supplier_id, buyer_id, currency, payment_term, " +
                "delivery_term, loading_port, discharge_port, details"
            )
            .eq("id", validPiId)
            .is("deleted_at", null)
            .single()
        : Promise.resolve({ data: null, error: null }),
    ]);

  // Build sourcePI with field mapping
  let sourcePI: SourcePI | null = null;
  if (validPiId && pi) {
    const piData = pi as unknown as {
      id: string;
      pi_no: string;
      supplier_id: string;
      buyer_id: string;
      currency: string;
      payment_term: string | null;
      delivery_term: string | null;
      loading_port: string | null;
      discharge_port: string | null;
      details: ShippingLineItem[];
    };
    sourcePI = {
      id: piData.id,
      pi_no: piData.pi_no,
      supplier_id: piData.supplier_id,   // PI supplier → shipper
      buyer_id: piData.buyer_id,         // PI buyer → consignee
      currency: piData.currency,
      payment_term: piData.payment_term,
      delivery_term: piData.delivery_term,
      loading_port: piData.loading_port,
      discharge_port: piData.discharge_port,
      details: Array.isArray(piData.details) ? piData.details : [],
    };
  }

  return data(
    {
      shippers: shippers ?? [],
      consignees: consignees ?? [],
      products: products ?? [],
      pis: pis ?? [],
      sourcePI,
    },
    { headers: responseHeaders }
  );
}
```

PI reference field mapping:
- `pi.supplier_id` (GV/seller) maps directly to `shipping.shipper_id` (also GV/seller).
- `pi.buyer_id` (Saelim/buyer) maps directly to `shipping.consignee_id` (also buyer).
- This is a direct 1:1 mapping because PI and Shipping share the same role structure (seller = GV, buyer = Saelim). Unlike PO-to-PI where roles are reversed.
- `currency`, `payment_term`, `delivery_term`, `loading_port`, `discharge_port`, `details` are copied directly.
- Shipping-specific fields left empty: `vessel`, `voyage`, `etd`, `eta`, `ship_date`, weights.

---

## 6. Create Action (`app/loaders/shipping.server.ts` - `createShippingAction`)

```typescript
export async function createShippingAction({ request, context }: LoaderArgs) {
  const { supabase, user, responseHeaders } = await requireGVUser(request, context);
  const formData = await request.formData();

  // ── 1. Parse & validate JSONB details ──────────────────
  const detailsRaw = formData.get("details") as string;
  let parsedDetails: unknown;
  try {
    parsedDetails = JSON.parse(detailsRaw || "[]");
  } catch {
    return data(
      { success: false, error: "품목 데이터 형식이 올바르지 않습니다." },
      { status: 400, headers: responseHeaders }
    );
  }

  const detailsResult = z
    .array(lineItemSchema)
    .min(1, "품목을 1개 이상 추가하세요")
    .max(20, "품목은 최대 20개까지 입력 가능합니다")
    .safeParse(parsedDetails);

  if (!detailsResult.success) {
    return data(
      { success: false, error: detailsResult.error.issues[0]?.message ?? "품목 입력을 확인하세요." },
      { status: 400, headers: responseHeaders }
    );
  }

  // ── 2. Validate main fields ────────────────────────────
  const raw = Object.fromEntries(formData);
  const parsed = shippingSchema.safeParse(raw);
  if (!parsed.success) {
    return data(
      { success: false, error: parsed.error.issues[0]?.message ?? "입력 값을 확인하세요." },
      { status: 400, headers: responseHeaders }
    );
  }

  const resolvedPiId = parsed.data.pi_id && parsed.data.pi_id !== "" ? parsed.data.pi_id : null;

  // ── 3. Validate org IDs + pi_id (parallel) ────────────
  const [{ count: shipperCount }, { count: consigneeCount }, { count: piCount }] =
    await Promise.all([
      supabase
        .from("organizations")
        .select("id", { count: "exact", head: true })
        .eq("id", parsed.data.shipper_id)
        .is("deleted_at", null),
      supabase
        .from("organizations")
        .select("id", { count: "exact", head: true })
        .eq("id", parsed.data.consignee_id)
        .is("deleted_at", null),
      resolvedPiId
        ? supabase
            .from("proforma_invoices")
            .select("id", { count: "exact", head: true })
            .eq("id", resolvedPiId)
            .is("deleted_at", null)
        : Promise.resolve({ count: 1 }),
    ]);

  if (!shipperCount) {
    return data({ success: false, error: "선택한 Shipper가 유효하지 않습니다." }, { status: 400, headers: responseHeaders });
  }
  if (!consigneeCount) {
    return data({ success: false, error: "선택한 Consignee가 유효하지 않습니다." }, { status: 400, headers: responseHeaders });
  }
  if (resolvedPiId && !piCount) {
    return data({ success: false, error: "참조한 PI를 찾을 수 없습니다." }, { status: 400, headers: responseHeaders });
  }

  // ── 4. Server-side amount recalculation ────────────────
  const recalculated: ShippingLineItem[] = detailsResult.data.map((item) => ({
    ...item,
    amount: Math.round(item.quantity_kg * item.unit_price * 100) / 100,
  }));
  const totalAmount =
    Math.round(recalculated.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;

  // ── 5. Generate BOTH ci_no and pl_no ───────────────────
  // Two sequential RPC calls (cannot parallelize: both increment the same counter sequence)
  // IMPORTANT: If generate_doc_number uses a single sequence for each doc_type, these CAN be parallel.
  // If CI and PL share a sequence, they must be sequential. Assuming separate sequences:
  const [{ data: ciNo, error: ciRpcError }, { data: plNo, error: plRpcError }] =
    await Promise.all([
      supabase.rpc("generate_doc_number", { doc_type: "CI", ref_date: parsed.data.ci_date }),
      supabase.rpc("generate_doc_number", { doc_type: "PL", ref_date: parsed.data.ci_date }),
    ]);

  if (ciRpcError || !ciNo) {
    return data({ success: false, error: "CI 번호 생성에 실패했습니다." }, { status: 500, headers: responseHeaders });
  }
  if (plRpcError || !plNo) {
    return data({ success: false, error: "PL 번호 생성에 실패했습니다." }, { status: 500, headers: responseHeaders });
  }

  // ── 6. Insert shipping document ────────────────────────
  const { data: created, error: insertError } = await supabase
    .from("shipping_documents")
    .insert({
      ci_no: ciNo,
      pl_no: plNo,
      ci_date: parsed.data.ci_date,
      ship_date: parsed.data.ship_date || null,
      shipper_id: parsed.data.shipper_id,
      consignee_id: parsed.data.consignee_id,
      pi_id: resolvedPiId,
      currency: parsed.data.currency,
      amount: totalAmount,
      payment_term: parsed.data.payment_term || null,
      delivery_term: parsed.data.delivery_term || null,
      loading_port: parsed.data.loading_port || null,
      discharge_port: parsed.data.discharge_port || null,
      vessel: parsed.data.vessel || null,
      voyage: parsed.data.voyage || null,
      etd: parsed.data.etd || null,
      eta: parsed.data.eta || null,
      details: recalculated as unknown as Json,
      notes: parsed.data.notes || null,
      ref_no: parsed.data.ref_no || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (insertError || !created) {
    const errMsg = insertError?.code === "23505"
      ? "이미 존재하는 CI/PL 번호입니다."
      : "저장 중 오류가 발생했습니다.";
    return data({ success: false, error: errMsg }, { status: 500, headers: responseHeaders });
  }

  // ── 7. Link delivery (if pi_id provided) ───────────────
  if (resolvedPiId) {
    await supabase
      .from("deliveries")
      .update({ shipping_doc_id: created.id })
      .eq("pi_id", resolvedPiId)
      .is("deleted_at", null);
    // Best-effort: if delivery update fails, shipping doc is still valid.
    // The link can be corrected manually later.
  }

  throw redirect(`/shipping/${created.id}`, { headers: responseHeaders });
}
```

Key decisions:
- **ci_no and pl_no generation**: Both use `generate_doc_number` with the same `ci_date` as `ref_date`. They use different `doc_type` values (`"CI"` and `"PL"`), so they increment separate sequences and can safely run in parallel.
- **Delivery linking**: Best-effort update. If a delivery exists with matching `pi_id`, set its `shipping_doc_id`. No rollback if this fails since the shipping doc itself is valid.
- **No auto-create of delivery**: Unlike PI creation which auto-creates a delivery record, shipping doc creation only *links* to an existing delivery (created when the PI was created).

---

## 7. Detail Loader (`app/loaders/shipping.$id.server.ts`)

```typescript
export async function loader({ request, context, params }: DetailLoaderArgs) {
  const { supabase, user, responseHeaders } = await requireGVUser(request, context);

  const idResult = z.string().uuid().safeParse(params.id);
  if (!idResult.success) {
    throw data(null, { status: 404, headers: responseHeaders });
  }

  const [{ data: doc, error }, { data: stuffingLists }, { content }] = await Promise.all([
    // Main shipping document with org + PI joins
    supabase
      .from("shipping_documents")
      .select(
        "id, ci_no, pl_no, ci_date, ship_date, shipper_id, consignee_id, pi_id, " +
          "currency, amount, payment_term, delivery_term, loading_port, discharge_port, " +
          "vessel, voyage, etd, eta, gross_weight, net_weight, package_no, " +
          "details, notes, ref_no, status, created_by, created_at, updated_at, " +
          "shipper:organizations!shipper_id(id, name_en, name_ko, address_en), " +
          "consignee:organizations!consignee_id(id, name_en, name_ko, address_en), " +
          "pi:proforma_invoices!pi_id(pi_no)"
      )
      .eq("id", idResult.data)
      .is("deleted_at", null)
      .single(),

    // Stuffing lists for this document
    supabase
      .from("stuffing_lists")
      .select("id, shipping_doc_id, sl_no, cntr_no, seal_no, roll_no_range, roll_details, created_at, updated_at")
      .eq("shipping_doc_id", idResult.data)
      .order("created_at", { ascending: true }),

    // Content (notes + attachments + comments)
    loadContent(supabase, "shipping", idResult.data),
  ]);

  if (error || !doc) {
    throw data(null, { status: 404, headers: responseHeaders });
  }

  return data(
    { doc, stuffingLists: stuffingLists ?? [], content, userId: user.id },
    { headers: responseHeaders }
  );
}
```

Notes:
- Three-way Promise.all: shipping doc, stuffing lists, content.
- Stuffing lists ordered by `created_at` ascending (chronological container order).
- `stuffing_lists` does not have `deleted_at` column based on schema. If we want soft delete for stuffing lists, we need a migration. See Section 12 for recommendation.

---

## 8. Edit Loader (`app/loaders/shipping.$id.server.ts` - `shippingEditLoader`)

```typescript
export async function shippingEditLoader({ request, context, params }: DetailLoaderArgs) {
  const { supabase, responseHeaders } = await requireGVUser(request, context);

  const idResult = z.string().uuid().safeParse(params.id);
  if (!idResult.success) {
    throw data(null, { status: 404, headers: responseHeaders });
  }

  const [{ data: doc, error }, { data: shippers }, { data: consignees }, { data: products }, { data: pis }] =
    await Promise.all([
      supabase
        .from("shipping_documents")
        .select(
          "id, ci_no, pl_no, ci_date, ship_date, shipper_id, consignee_id, pi_id, currency, " +
            "payment_term, delivery_term, loading_port, discharge_port, " +
            "vessel, voyage, etd, eta, gross_weight, net_weight, package_no, " +
            "notes, ref_no, status, details"
        )
        .eq("id", idResult.data)
        .is("deleted_at", null)
        .single(),
      supabase
        .from("organizations")
        .select("id, name_en, name_ko")
        .eq("type", "seller")
        .is("deleted_at", null)
        .order("name_en"),
      supabase
        .from("organizations")
        .select("id, name_en, name_ko")
        .eq("type", "buyer")
        .is("deleted_at", null)
        .order("name_en"),
      supabase
        .from("products")
        .select("id, name, gsm, width_mm")
        .is("deleted_at", null)
        .order("name"),
      supabase
        .from("proforma_invoices")
        .select("id, pi_no")
        .is("deleted_at", null)
        .order("pi_date", { ascending: false }),
    ]);

  if (error || !doc) {
    throw data(null, { status: 404, headers: responseHeaders });
  }

  return data(
    { doc, shippers: shippers ?? [], consignees: consignees ?? [], products: products ?? [], pis: pis ?? [] },
    { headers: responseHeaders }
  );
}
```

---

## 9. Detail Actions (`app/loaders/shipping.$id.server.ts`)

### 9.1 Action Router (main action function)

```typescript
export async function action({ request, context, params }: DetailLoaderArgs) {
  const { supabase, user, responseHeaders } = await requireGVUser(request, context);

  const idResult = z.string().uuid().safeParse(params.id);
  if (!idResult.success) {
    return data({ success: false, error: "잘못된 요청입니다." }, { status: 400, headers: responseHeaders });
  }
  const id = idResult.data;

  const formData = await request.formData();
  const intent = formData.get("_action") as string;

  // Content actions (notes, attachments, comments)
  if (intent?.startsWith("content_")) {
    return handleContentAction(supabase, user.id, "shipping", id, intent, formData, responseHeaders);
  }

  // Stuffing list actions
  if (intent === "stuffing_save") { return handleStuffingSave(supabase, id, formData, responseHeaders); }
  if (intent === "stuffing_delete") { return handleStuffingDelete(supabase, id, formData, responseHeaders); }
  if (intent === "stuffing_csv_upload") { return handleStuffingCsvUpload(supabase, id, formData, responseHeaders); }

  // Document CRUD actions
  if (intent === "update") { /* see 9.2 */ }
  if (intent === "delete") { /* see 9.3 */ }
  if (intent === "clone") { /* see 9.4 */ }
  if (intent === "toggle_status") { /* see 9.5 */ }

  return data({ success: false, error: "알 수 없는 요청입니다." }, { status: 400, headers: responseHeaders });
}
```

### 9.2 Update Action

Same pattern as PI update:
1. Check status is not 'complete' (block edit).
2. Parse and validate details JSON + shippingSchema.
3. Validate org IDs (active check).
4. Validate pi_id if provided.
5. Server-side amount recalculation.
6. Update shipping_documents row.
7. Redirect to `/shipping/:id`.

Additional consideration: Do NOT regenerate ci_no/pl_no on update. These are immutable after creation.

### 9.3 Delete Action

```typescript
// Soft delete shipping document
await supabase
  .from("shipping_documents")
  .update({ deleted_at: new Date().toISOString() })
  .eq("id", id)
  .is("deleted_at", null);

// Unlink delivery (set shipping_doc_id = null)
await supabase
  .from("deliveries")
  .update({ shipping_doc_id: null })
  .eq("shipping_doc_id", id)
  .is("deleted_at", null);

// Hard delete stuffing lists (no deleted_at column on stuffing_lists)
// OR soft delete if we add deleted_at column (see Section 12)
await supabase
  .from("stuffing_lists")
  .delete()
  .eq("shipping_doc_id", id);

throw redirect("/shipping", { headers: responseHeaders });
```

Key difference from PI delete: Delivery is NOT soft-deleted. Instead, we unlink by setting `shipping_doc_id = null`. The delivery record itself lives on (it was created with the PI and belongs to the PI lifecycle).

### 9.4 Clone Action

```typescript
// 1. Fetch original (excluding weights — those are calculated from stuffing lists)
const { data: original } = await supabase
  .from("shipping_documents")
  .select("ci_date, ship_date, shipper_id, consignee_id, currency, amount, " +
    "payment_term, delivery_term, loading_port, discharge_port, " +
    "vessel, voyage, etd, eta, details, notes, ref_no")
  .eq("id", id)
  .is("deleted_at", null)
  .single();

// 2. Generate new CI + PL numbers (today's date)
const today = new Date().toISOString().split("T")[0];
const [{ data: ciNo }, { data: plNo }] = await Promise.all([
  supabase.rpc("generate_doc_number", { doc_type: "CI", ref_date: today }),
  supabase.rpc("generate_doc_number", { doc_type: "PL", ref_date: today }),
]);

// 3. Insert clone (pi_id = null, weights reset to null, status = 'process')
const { data: cloned } = await supabase
  .from("shipping_documents")
  .insert({
    ...original,
    ci_no: ciNo,
    pl_no: plNo,
    ci_date: today,
    pi_id: null,               // Clear PI reference
    gross_weight: null,         // Reset (no stuffing lists cloned)
    net_weight: null,
    package_no: null,
    status: "process",
    created_by: user.id,
  })
  .select("id")
  .single();

// 4. Redirect to edit (no stuffing lists are cloned)
throw redirect(`/shipping/${cloned.id}/edit`, { headers: responseHeaders });
```

Decision: Do NOT clone stuffing lists. They are container-specific and almost always different between shipments. The user creates new stuffing lists for the cloned document.

### 9.5 Toggle Status

Same pattern as PI: fetch current status, flip process/complete, update.

---

## 10. Stuffing List Actions

### 10.1 Save (Create or Update)

```typescript
async function handleStuffingSave(
  supabase: SupabaseClient<Database>,
  shippingDocId: string,
  formData: FormData,
  responseHeaders: Headers
) {
  const rawJson = formData.get("stuffing_data") as string;
  let parsedData: unknown;
  try {
    parsedData = JSON.parse(rawJson || "{}");
  } catch {
    return data(
      { success: false, error: "적입 데이터 형식이 올바르지 않습니다." },
      { status: 400, headers: responseHeaders }
    );
  }

  const result = stuffingListSchema.safeParse(parsedData);
  if (!result.success) {
    return data(
      { success: false, error: result.error.issues[0]?.message ?? "입력 값을 확인하세요." },
      { status: 400, headers: responseHeaders }
    );
  }

  const { id: stuffingId, sl_no, cntr_no, seal_no, roll_no_range, roll_details } = result.data;

  const payload = {
    shipping_doc_id: shippingDocId,
    sl_no: sl_no || null,
    cntr_no: cntr_no || null,
    seal_no: seal_no || null,
    roll_no_range: roll_no_range || null,
    roll_details: roll_details as unknown as Json,
    updated_at: new Date().toISOString(),
  };

  if (stuffingId) {
    // Update existing
    const { error } = await supabase
      .from("stuffing_lists")
      .update(payload)
      .eq("id", stuffingId)
      .eq("shipping_doc_id", shippingDocId);  // Ensure ownership

    if (error) {
      return data({ success: false, error: "적입 목록 수정 중 오류가 발생했습니다." }, { status: 500, headers: responseHeaders });
    }
  } else {
    // Create new
    const { error } = await supabase
      .from("stuffing_lists")
      .insert(payload);

    if (error) {
      return data({ success: false, error: "적입 목록 생성 중 오류가 발생했습니다." }, { status: 500, headers: responseHeaders });
    }
  }

  // Recalculate shipping doc weights
  await recalculateShippingWeights(supabase, shippingDocId);

  return data({ success: true }, { headers: responseHeaders });
}
```

### 10.2 Delete

```typescript
async function handleStuffingDelete(
  supabase: SupabaseClient<Database>,
  shippingDocId: string,
  formData: FormData,
  responseHeaders: Headers
) {
  const stuffingId = formData.get("stuffing_id") as string;
  const idResult = z.string().uuid().safeParse(stuffingId);
  if (!idResult.success) {
    return data({ success: false, error: "잘못된 요청입니다." }, { status: 400, headers: responseHeaders });
  }

  // Hard delete (stuffing_lists has no deleted_at column)
  const { error } = await supabase
    .from("stuffing_lists")
    .delete()
    .eq("id", idResult.data)
    .eq("shipping_doc_id", shippingDocId);  // Ensure ownership

  if (error) {
    return data({ success: false, error: "적입 목록 삭제 중 오류가 발생했습니다." }, { status: 500, headers: responseHeaders });
  }

  // Recalculate weights after deletion
  await recalculateShippingWeights(supabase, shippingDocId);

  return data({ success: true }, { headers: responseHeaders });
}
```

Decision: **Hard delete** for stuffing lists. They are child records of a shipping document with no independent business identity. No audit trail needed for individual container records.

### 10.3 CSV Upload

```typescript
async function handleStuffingCsvUpload(
  supabase: SupabaseClient<Database>,
  shippingDocId: string,
  formData: FormData,
  responseHeaders: Headers
) {
  const csvText = formData.get("csv_data") as string;
  const cntrNo = formData.get("cntr_no") as string;
  const sealNo = formData.get("seal_no") as string;

  if (!csvText) {
    return data({ success: false, error: "CSV 데이터가 없습니다." }, { status: 400, headers: responseHeaders });
  }

  // Parse CSV manually (no external library needed for simple structure)
  // See Section 11 for CSV parsing approach
  const rows = parseCSV(csvText);

  // Validate each row
  const validatedRows: StuffingRollDetail[] = [];
  for (let i = 0; i < rows.length; i++) {
    const result = csvRollRowSchema.safeParse(rows[i]);
    if (!result.success) {
      return data(
        { success: false, error: `${i + 1}행: ${result.error.issues[0]?.message ?? "데이터 형식 오류"}` },
        { status: 400, headers: responseHeaders }
      );
    }
    validatedRows.push(result.data);
  }

  if (validatedRows.length === 0) {
    return data({ success: false, error: "유효한 데이터가 없습니다." }, { status: 400, headers: responseHeaders });
  }

  // Derive roll_no_range
  const rollNos = validatedRows.map((r) => r.roll_no).sort((a, b) => a - b);
  const rollNoRange = rollNos.length === 1
    ? String(rollNos[0])
    : `${rollNos[0]}-${rollNos[rollNos.length - 1]}`;

  // Insert stuffing list
  const { error } = await supabase
    .from("stuffing_lists")
    .insert({
      shipping_doc_id: shippingDocId,
      cntr_no: cntrNo || null,
      seal_no: sealNo || null,
      roll_no_range: rollNoRange,
      roll_details: validatedRows as unknown as Json,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    return data({ success: false, error: "적입 목록 저장 중 오류가 발생했습니다." }, { status: 500, headers: responseHeaders });
  }

  await recalculateShippingWeights(supabase, shippingDocId);

  return data({ success: true }, { headers: responseHeaders });
}
```

---

## 11. CSV Parsing Strategy

For Cloudflare Workers compatibility, use a **manual CSV parser** instead of Papa Parse. The CSV structure is simple and fixed (7 columns), so a lightweight approach is sufficient.

```typescript
interface RawCSVRow {
  roll_no: string;
  product_name: string;
  gsm: string;
  width_mm: string;
  length_m: string;
  net_weight_kg: string;
  gross_weight_kg: string;
}

const EXPECTED_HEADERS = ["roll_no", "product_name", "gsm", "width_mm", "length_m", "net_weight_kg", "gross_weight_kg"];

function parseCSV(csvText: string): RawCSVRow[] {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return []; // Header + at least 1 data row

  // Validate header
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const headerMatch = EXPECTED_HEADERS.every((h, i) => headers[i] === h);
  if (!headerMatch) {
    throw new Error("CSV 헤더가 올바르지 않습니다. 예상: " + EXPECTED_HEADERS.join(", "));
  }

  // Parse data rows
  const rows: RawCSVRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines

    const cols = line.split(",").map((c) => c.trim());
    if (cols.length < EXPECTED_HEADERS.length) continue; // Skip malformed rows

    rows.push({
      roll_no: cols[0],
      product_name: cols[1],
      gsm: cols[2],
      width_mm: cols[3],
      length_m: cols[4],
      net_weight_kg: cols[5],
      gross_weight_kg: cols[6],
    });
  }

  return rows;
}
```

Why manual instead of Papa Parse:
- Papa Parse adds ~20KB to the bundle (minor, but unnecessary).
- The CSV structure is fixed and simple (no quoted fields, no commas in values expected for numeric data).
- If `product_name` might contain commas in the future, consider switching to Papa Parse or handling quoted fields.
- CF Workers runtime has no Node.js `fs` dependency issues with manual parsing.

Alternative: If CSV complexity grows, `csv-parse/sync` from the `csv` npm package is also CF Workers compatible (pure JS, no Node APIs).

---

## 12. Weight Aggregation Helper

```typescript
async function recalculateShippingWeights(
  supabase: SupabaseClient<Database>,
  shippingDocId: string
): Promise<void> {
  // Fetch all stuffing lists for this document
  const { data: stuffingLists } = await supabase
    .from("stuffing_lists")
    .select("roll_details")
    .eq("shipping_doc_id", shippingDocId);

  let grossWeight = 0;
  let netWeight = 0;
  let packageNo = 0;

  if (stuffingLists) {
    for (const sl of stuffingLists) {
      const rolls = sl.roll_details as unknown as StuffingRollDetail[];
      if (!Array.isArray(rolls)) continue;
      for (const roll of rolls) {
        grossWeight += roll.gross_weight_kg ?? 0;
        netWeight += roll.net_weight_kg ?? 0;
        packageNo += 1;
      }
    }
  }

  // Round to 2 decimal places
  grossWeight = Math.round(grossWeight * 100) / 100;
  netWeight = Math.round(netWeight * 100) / 100;

  await supabase
    .from("shipping_documents")
    .update({
      gross_weight: grossWeight || null,   // null if 0 (no stuffing data)
      net_weight: netWeight || null,
      package_no: packageNo || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", shippingDocId)
    .is("deleted_at", null);
}
```

This function is called after every stuffing list create/update/delete. It does a full recalculation rather than incremental delta to avoid drift.

**RPC alternative** (if performance becomes a concern): Create a Supabase RPC function that does the aggregation in a single SQL query:

```sql
CREATE OR REPLACE FUNCTION recalculate_shipping_weights(p_shipping_doc_id UUID)
RETURNS VOID AS $$
  UPDATE shipping_documents
  SET
    gross_weight = COALESCE(agg.total_gross, NULL),
    net_weight = COALESCE(agg.total_net, NULL),
    package_no = COALESCE(agg.total_rolls, NULL),
    updated_at = NOW()
  FROM (
    SELECT
      SUM((r->>'gross_weight_kg')::NUMERIC) AS total_gross,
      SUM((r->>'net_weight_kg')::NUMERIC) AS total_net,
      COUNT(*) AS total_rolls
    FROM stuffing_lists sl,
         jsonb_array_elements(sl.roll_details) AS r
    WHERE sl.shipping_doc_id = p_shipping_doc_id
  ) agg
  WHERE id = p_shipping_doc_id AND deleted_at IS NULL;
$$ LANGUAGE sql;
```

Start with the application-level approach. Migrate to RPC only if round-trip latency becomes measurable.

---

## 13. PI Detail Cross-Module Query

Add to the PI detail loader (`app/loaders/pi.$id.server.ts`) a query for linked shipping documents, matching the pattern used in PO detail for linked PIs.

```typescript
// Inside pi.$id.server.ts loader, add to Promise.all:
supabase
  .from("shipping_documents")
  .select("id, ci_no, ci_date, status, vessel, eta")
  .eq("pi_id", idResult.data)
  .is("deleted_at", null)
  .order("ci_date", { ascending: false }),
```

Return as `shippingDocs` in the loader response. The PI detail page can then show a "Shipping Documents" card with links, and a "선적서류 작성" dropdown menu item linking to `/shipping/new?from_pi={piId}`.

Type for PI detail's shipping list:

```typescript
export interface ShippingDocSummary {
  id: string;
  ci_no: string;
  ci_date: string;
  status: DocStatus;
  vessel: string | null;
  eta: string | null;
}
```

---

## 14. Route Configuration

Add to `app/routes.ts`:

```typescript
route("shipping", "_layout.shipping.tsx"),
route("shipping/new", "_layout.shipping.new.tsx"),
route("shipping/:id", "_layout.shipping.$id.tsx"),
route("shipping/:id/edit", "_layout.shipping.$id.edit.tsx"),
```

Route file exports follow the standard pattern:

```typescript
// _layout.shipping.tsx
export { loader } from "~/loaders/shipping.server";

// _layout.shipping.new.tsx
export { shippingFormLoader as loader, createShippingAction as action } from "~/loaders/shipping.server";

// _layout.shipping.$id.tsx
export { loader, action } from "~/loaders/shipping.$id.server";

// _layout.shipping.$id.edit.tsx
export { shippingEditLoader as loader, action } from "~/loaders/shipping.$id.server";
```

---

## 15. Database Migration Considerations

### 15.1 Existing Schema Verification

Before implementation, verify the `stuffing_lists` table has:
- `updated_at` column with default `NOW()` (may need adding)
- No `deleted_at` column (confirm hard delete approach is acceptable)

If `sl_no` should be auto-generated (like ci_no/pl_no), we may need a `generate_doc_number('SL', ref_date)` call. However, `sl_no` is typically a manual entry (container-specific identifier), so auto-generation is likely not needed.

### 15.2 Potential Migration: Add index for delivery lookup

```sql
-- Index for efficient delivery linking when creating shipping docs
CREATE INDEX IF NOT EXISTS idx_deliveries_pi_id
  ON deliveries (pi_id)
  WHERE deleted_at IS NULL;

-- Index for stuffing list lookup by shipping doc
CREATE INDEX IF NOT EXISTS idx_stuffing_lists_shipping_doc_id
  ON stuffing_lists (shipping_doc_id);

-- Index for shipping doc list filtered by deleted_at
CREATE INDEX IF NOT EXISTS idx_shipping_documents_deleted_at
  ON shipping_documents (deleted_at)
  WHERE deleted_at IS NULL;
```

### 15.3 Potential Migration: CI/PL doc_number_sequences

Verify that `generate_doc_number` supports `doc_type = 'CI'` and `doc_type = 'PL'`. If the function only handles PO/PI, it needs to be updated to recognize the new document types. Check the function definition:

```sql
SELECT prosrc FROM pg_proc WHERE proname = 'generate_doc_number';
```

If it uses a lookup table or CASE statement, add entries for CI and PL.

---

## 16. Error Messages (Korean)

Consistent Korean error messages following existing patterns:

| Context | Message |
|---------|---------|
| List load fail | "데이터를 불러오는 데 실패했습니다." |
| CI number gen fail | "CI 번호 생성에 실패했습니다." |
| PL number gen fail | "PL 번호 생성에 실패했습니다." |
| Invalid shipper | "선택한 Shipper가 유효하지 않습니다." |
| Invalid consignee | "선택한 Consignee가 유효하지 않습니다." |
| PI not found | "참조한 PI를 찾을 수 없습니다." |
| Duplicate CI/PL | "이미 존재하는 CI/PL 번호입니다." |
| Complete edit block | "완료 처리된 선적서류는 수정할 수 없습니다. 상태를 변경 후 수정하세요." |
| Not found | "선적서류를 찾을 수 없습니다." |
| Save error | "저장 중 오류가 발생했습니다." |
| Delete error | "삭제 중 오류가 발생했습니다." |
| Clone not found | "복제할 선적서류를 찾을 수 없습니다." |
| Status toggle error | "상태 변경 중 오류가 발생했습니다." |
| Stuffing save error | "적입 목록 저장 중 오류가 발생했습니다." (적입 = stuffing) |
| Stuffing delete error | "적입 목록 삭제 중 오류가 발생했습니다." |
| CSV header error | "CSV 헤더가 올바르지 않습니다." |
| CSV row error | "{n}행: {message}" |
| No CSV data | "CSV 데이터가 없습니다." |

---

## 17. Summary of Key Decisions

1. **Line item schema**: Reuse `lineItemSchema` from `po.schema.ts`. Same structure across PO/PI/Shipping.
2. **Dual doc number generation**: CI and PL numbers generated in parallel via `generate_doc_number` RPC with separate doc_type values.
3. **PI-to-Shipping field mapping**: Direct 1:1 (unlike PO-to-PI role reversal). Both use seller=GV, buyer=Saelim.
4. **Delivery linking**: Best-effort UPDATE on create (set `shipping_doc_id`), NULL-out on delete. No delivery creation or deletion.
5. **Stuffing list lifecycle**: Hard delete (no `deleted_at` column). Child records with no independent identity.
6. **Clone does NOT copy stuffing lists**: Containers are always different between shipments.
7. **Weight recalculation**: Application-level full recalculation after every stuffing CRUD. Start simple, migrate to SQL RPC if needed.
8. **CSV parsing**: Manual parser (no library). Fixed 7-column structure. Use `z.coerce.number()` for string-to-number conversion.
9. **Cross-module**: PI detail page shows linked shipping docs (same pattern as PO showing linked PIs).
