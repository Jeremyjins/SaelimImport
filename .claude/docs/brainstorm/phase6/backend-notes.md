# Phase 6: Order Management - Backend Notes

## 1. File Structure

```
app/types/order.ts                 -> TypeScript types (list, detail, cascade link result)
app/loaders/orders.schema.ts       -> Zod schemas (create, update fields, link/unlink)
app/loaders/orders.server.ts       -> List loader + create action
app/loaders/orders.$id.server.ts   -> Detail loader + actions (update, link, delete, content)
```

---

## 2. TypeScript Types (`app/types/order.ts`)

```typescript
import type { DocStatus } from "~/types/common";

// -- Linked Document Summaries (from FK JOINs) ----------------

export interface OrderPORef {
  id: string;
  po_no: string;
  po_date: string | null;
  status: DocStatus;
  currency: string | null;
  amount: number | null;
}

export interface OrderPIRef {
  id: string;
  pi_no: string;
  pi_date: string | null;
  status: DocStatus;
  currency: string | null;
  amount: number | null;
}

export interface OrderShippingRef {
  id: string;
  ci_no: string;
  vessel: string | null;
  voyage: string | null;
  etd: string | null;
  eta: string | null;
  status: DocStatus;
}

export interface OrderCustomsRef {
  id: string;
  customs_no: string | null;
  customs_date: string | null;
  fee_received: boolean | null;
}

export interface OrderDeliveryRef {
  id: string;
  delivery_date: string | null;
}

// -- List Item -------------------------------------------------

export interface OrderListItem {
  id: string;
  saelim_no: string | null;
  advice_date: string | null;
  arrival_date: string | null;
  delivery_date: string | null;
  customs_fee_received: boolean | null;
  created_at: string | null;
  po: OrderPORef | null;
  pi: OrderPIRef | null;
  shipping: OrderShippingRef | null;
  customs: OrderCustomsRef | null;
  delivery: OrderDeliveryRef | null;
}

// -- Detail (extends list with full linked doc data) -----------

export interface OrderDetail extends OrderListItem {
  created_by: string | null;
  updated_at: string | null;
}

// -- Cascade Link Result (internal, not exported to client) ----

export interface CascadeLinkResult {
  pi_id: string | null;
  shipping_doc_id: string | null;
  delivery_id: string | null;
  customs_id: string | null;
}
```

---

## 3. Zod Schemas (`app/loaders/orders.schema.ts`)

```typescript
import { z } from "zod";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// -- Create Order (from PO) ------------------------------------

export const createOrderSchema = z.object({
  po_id: z.string().uuid("PO를 선택하세요"),
  saelim_no: z.string().max(50).optional().default(""),
});

// -- Update Order Fields ---------------------------------------

export const updateFieldsSchema = z.object({
  saelim_no: z.string().max(50).optional().default(""),
  advice_date: z
    .string()
    .optional()
    .default("")
    .refine((v) => !v || ISO_DATE.test(v), "올바른 날짜 형식이 아닙니다 (YYYY-MM-DD)"),
  arrival_date: z
    .string()
    .optional()
    .default("")
    .refine((v) => !v || ISO_DATE.test(v), "올바른 날짜 형식이 아닙니다 (YYYY-MM-DD)"),
  delivery_date: z
    .string()
    .optional()
    .default("")
    .refine((v) => !v || ISO_DATE.test(v), "올바른 날짜 형식이 아닙니다 (YYYY-MM-DD)"),
});

// -- Link / Unlink Document ------------------------------------

export const linkDocumentSchema = z.object({
  doc_type: z.enum(["pi", "shipping", "customs", "delivery"]),
  doc_id: z.string().uuid("유효한 문서 ID가 필요합니다"),
});

export const unlinkDocumentSchema = z.object({
  doc_type: z.enum(["pi", "shipping", "customs", "delivery"]),
});
```

---

## 4. List Loader (`app/loaders/orders.server.ts`)

### 4.1 Loader - Order List with Multi-JOIN

```typescript
import { data, redirect } from "react-router";
import { z } from "zod";
import type { AppLoadContext } from "react-router";
import { requireGVUser } from "~/lib/auth.server";
import { createOrderSchema } from "~/loaders/orders.schema";

interface LoaderArgs {
  request: Request;
  context: AppLoadContext;
}

export async function loader({ request, context }: LoaderArgs) {
  const { supabase, responseHeaders } = await requireGVUser(request, context);

  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      "id, saelim_no, advice_date, arrival_date, delivery_date, customs_fee_received, created_at, " +
        "po:purchase_orders!po_id(id, po_no, po_date, status, currency, amount), " +
        "pi:proforma_invoices!pi_id(id, pi_no, pi_date, status, currency, amount), " +
        "shipping:shipping_documents!shipping_doc_id(id, ci_no, vessel, voyage, etd, eta, status), " +
        "customs:customs!customs_id(id, customs_no, customs_date, fee_received), " +
        "delivery:deliveries!delivery_id(id, delivery_date)"
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return data(
      { orders: [], error: "데이터를 불러오는 데 실패했습니다." },
      { headers: responseHeaders }
    );
  }

  return data({ orders: orders ?? [] }, { headers: responseHeaders });
}
```

**Key design decisions:**

- Single query with 5 FK JOINs. All relationships are 1:1 (or 0..1), so PostgREST returns a single object (not an array) for each join. This is efficient and avoids N+1.
- The `!hint` syntax (`!po_id`, `!pi_id`, etc.) disambiguates FKs since the orders table has multiple FK columns.
- TypeScript cast will be needed on the result: `as unknown as OrderListItem[]`.
- No pagination initially -- orders count will be low (100s, not 1000s). Add `.range(from, to)` later if needed.

### 4.2 Available POs for Create Dropdown

When the user opens the "create order" dialog, we need a list of POs that do NOT already have an active order:

```typescript
// Inside create form loader or as a separate endpoint
const { data: availablePOs } = await supabase
  .from("purchase_orders")
  .select("id, po_no, po_date")
  .is("deleted_at", null)
  .order("po_date", { ascending: false });

// Filter out POs already linked to an active order
const { data: usedPOIds } = await supabase
  .from("orders")
  .select("po_id")
  .is("deleted_at", null);

const usedSet = new Set((usedPOIds ?? []).map((o) => o.po_id));
const filtered = (availablePOs ?? []).filter((po) => !usedSet.has(po.id));
```

**Alternative (single query with RPC):** Could use a left join anti-pattern, but the two-query approach is simpler and the data volume is small.

### 4.3 Create Action

```typescript
export async function createAction({ request, context }: LoaderArgs) {
  const { supabase, user, responseHeaders } = await requireGVUser(request, context);
  const formData = await request.formData();
  const raw = Object.fromEntries(formData);
  const parsed = createOrderSchema.safeParse(raw);

  if (!parsed.success) {
    return data(
      { success: false, error: parsed.error.issues[0]?.message ?? "입력 값을 확인하세요." },
      { status: 400, headers: responseHeaders }
    );
  }

  const { po_id, saelim_no } = parsed.data;

  // 1. Validate PO exists and is not soft-deleted
  const { count: poCount } = await supabase
    .from("purchase_orders")
    .select("id", { count: "exact", head: true })
    .eq("id", po_id)
    .is("deleted_at", null);

  if (!poCount) {
    return data(
      { success: false, error: "선택한 PO를 찾을 수 없습니다." },
      { status: 400, headers: responseHeaders }
    );
  }

  // 2. Check for duplicate (PO already has an active order)
  const { count: existingCount } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("po_id", po_id)
    .is("deleted_at", null);

  if (existingCount && existingCount > 0) {
    return data(
      { success: false, error: "이 PO에 대한 주문이 이미 존재합니다." },
      { status: 409, headers: responseHeaders }
    );
  }

  // 3. Auto-cascade: find linked documents
  const cascaded = await cascadeLink(supabase, po_id);

  // 4. Insert order
  const { data: created, error: insertError } = await supabase
    .from("orders")
    .insert({
      po_id,
      pi_id: cascaded.pi_id,
      shipping_doc_id: cascaded.shipping_doc_id,
      customs_id: cascaded.customs_id,
      delivery_id: cascaded.delivery_id,
      saelim_no: saelim_no || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (insertError || !created) {
    return data(
      { success: false, error: "주문 생성 중 오류가 발생했습니다." },
      { status: 500, headers: responseHeaders }
    );
  }

  throw redirect(`/orders/${created.id}`, { headers: responseHeaders });
}
```

---

## 5. Auto-Cascade Link Logic

The cascade follows the document chain: PO -> PI -> Shipping -> Customs, and PO -> PI -> Delivery.

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CascadeLinkResult } from "~/types/order";

async function cascadeLink(
  supabase: SupabaseClient,
  poId: string
): Promise<CascadeLinkResult> {
  // 1. Find PI linked to this PO
  const { data: pi } = await supabase
    .from("proforma_invoices")
    .select("id")
    .eq("po_id", poId)
    .is("deleted_at", null)
    .order("pi_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pi) {
    return { pi_id: null, shipping_doc_id: null, delivery_id: null, customs_id: null };
  }

  // 2. Find Shipping Doc and Delivery linked to this PI (parallel)
  const [{ data: shipping }, { data: delivery }] = await Promise.all([
    supabase
      .from("shipping_documents")
      .select("id")
      .eq("pi_id", pi.id)
      .is("deleted_at", null)
      .order("ci_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("deliveries")
      .select("id")
      .eq("pi_id", pi.id)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle(),
  ]);

  // 3. Find Customs linked to this Shipping Doc
  let customsId: string | null = null;
  if (shipping) {
    const { data: customs } = await supabase
      .from("customs")
      .select("id")
      .eq("shipping_doc_id", shipping.id)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    customsId = customs?.id ?? null;
  }

  return {
    pi_id: pi.id,
    shipping_doc_id: shipping?.id ?? null,
    delivery_id: delivery?.id ?? null,
    customs_id: customsId,
  };
}
```

**Design decisions:**

- When PO has multiple PIs, we pick the **latest** (`order by pi_date desc limit 1`). The user can manually link a different PI later via the "link_document" action. This avoids forcing the user to choose during creation while still providing a sensible default.
- Same logic for multiple shipping docs per PI: latest first, manual override available.
- Sequential cascade (PO->PI, then PI->Shipping+Delivery in parallel, then Shipping->Customs) because each step depends on the previous result. Total: 3 sequential rounds, with step 2 parallelized.

---

## 6. Detail Loader (`app/loaders/orders.$id.server.ts`)

### 6.1 Loader

```typescript
import { data, redirect } from "react-router";
import { z } from "zod";
import type { AppLoadContext } from "react-router";
import { requireGVUser } from "~/lib/auth.server";
import { loadContent, handleContentAction } from "~/lib/content.server";
import {
  updateFieldsSchema,
  linkDocumentSchema,
  unlinkDocumentSchema,
} from "~/loaders/orders.schema";

interface DetailLoaderArgs {
  request: Request;
  context: AppLoadContext;
  params: { id?: string };
}

export async function loader({ request, context, params }: DetailLoaderArgs) {
  const { supabase, user, responseHeaders } = await requireGVUser(request, context);

  const idResult = z.string().uuid().safeParse(params.id);
  if (!idResult.success) {
    throw data(null, { status: 404, headers: responseHeaders });
  }

  const [{ data: order, error }, { content }] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, saelim_no, advice_date, arrival_date, delivery_date, customs_fee_received, " +
          "created_by, created_at, updated_at, " +
          "po:purchase_orders!po_id(id, po_no, po_date, status, currency, amount, " +
          "  supplier:organizations!supplier_id(name_en), " +
          "  buyer:organizations!buyer_id(name_en)), " +
          "pi:proforma_invoices!pi_id(id, pi_no, pi_date, status, currency, amount), " +
          "shipping:shipping_documents!shipping_doc_id(id, ci_no, vessel, voyage, etd, eta, ship_date, status), " +
          "customs:customs!customs_id(id, customs_no, customs_date, fee_received, " +
          "  customs_fee, transport_fee, vat_fee, etc_fee, etc_desc), " +
          "delivery:deliveries!delivery_id(id, delivery_date)"
      )
      .eq("id", idResult.data)
      .is("deleted_at", null)
      .single(),
    loadContent(supabase, "order", idResult.data),
  ]);

  if (error || !order) {
    throw data(null, { status: 404, headers: responseHeaders });
  }

  return data(
    { order, content, userId: user.id },
    { headers: responseHeaders }
  );
}
```

**Notes on nested JOINs:**

- The detail loader uses deeper nesting than the list loader: `po.supplier.name_en`, `po.buyer.name_en`, and customs fee breakdown fields.
- PostgREST supports nested FK JOINs (e.g., `po:purchase_orders!po_id(supplier:organizations!supplier_id(name_en))`). This works because `purchase_orders` has FK to `organizations`.
- Content system integration uses `loadContent(supabase, "order", id)` -- the `PARENT_TABLE_MAP` in `content.server.ts` already maps `"order" -> "orders"`.

---

## 7. Detail Actions (`app/loaders/orders.$id.server.ts`)

### 7.1 Action Router

```typescript
export async function action({ request, context, params }: DetailLoaderArgs) {
  const { supabase, user, responseHeaders } = await requireGVUser(request, context);

  const idResult = z.string().uuid().safeParse(params.id);
  if (!idResult.success) {
    return data(
      { success: false, error: "잘못된 요청입니다." },
      { status: 400, headers: responseHeaders }
    );
  }
  const id = idResult.data;

  const formData = await request.formData();
  const intent = formData.get("_action") as string;

  // -- Content actions (notes & attachments) ---
  if (intent?.startsWith("content_")) {
    return handleContentAction(supabase, user.id, "order", id, intent, formData, responseHeaders);
  }

  // -- Route to specific action handler ---
  switch (intent) {
    case "update_fields":
      return handleUpdateFields(supabase, id, formData, responseHeaders);
    case "toggle_customs_fee":
      return handleToggleCustomsFee(supabase, id, responseHeaders);
    case "link_document":
      return handleLinkDocument(supabase, id, formData, responseHeaders);
    case "unlink_document":
      return handleUnlinkDocument(supabase, id, formData, responseHeaders);
    case "delete":
      return handleDelete(supabase, id, responseHeaders);
    default:
      return data(
        { success: false, error: "알 수 없는 요청입니다." },
        { status: 400, headers: responseHeaders }
      );
  }
}
```

### 7.2 Update Fields

```typescript
async function handleUpdateFields(
  supabase: SupabaseClient,
  id: string,
  formData: FormData,
  responseHeaders: Headers
) {
  const raw = Object.fromEntries(formData);
  const parsed = updateFieldsSchema.safeParse(raw);

  if (!parsed.success) {
    return data(
      { success: false, error: parsed.error.issues[0]?.message ?? "입력 값을 확인하세요." },
      { status: 400, headers: responseHeaders }
    );
  }

  const { saelim_no, advice_date, arrival_date, delivery_date } = parsed.data;

  const { error } = await supabase
    .from("orders")
    .update({
      saelim_no: saelim_no || null,
      advice_date: advice_date || null,
      arrival_date: arrival_date || null,
      delivery_date: delivery_date || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) {
    return data(
      { success: false, error: "수정 중 오류가 발생했습니다." },
      { status: 500, headers: responseHeaders }
    );
  }

  return data({ success: true }, { headers: responseHeaders });
}
```

### 7.3 Toggle Customs Fee Received

Bi-directional sync: toggling on Order also toggles on linked Customs record.

```typescript
async function handleToggleCustomsFee(
  supabase: SupabaseClient,
  id: string,
  responseHeaders: Headers
) {
  // Fetch current state
  const { data: current, error: fetchError } = await supabase
    .from("orders")
    .select("customs_fee_received, customs_id")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (fetchError || !current) {
    return data(
      { success: false, error: "주문을 찾을 수 없습니다." },
      { status: 404, headers: responseHeaders }
    );
  }

  const newValue = !current.customs_fee_received;

  // Update Order
  const { error: orderError } = await supabase
    .from("orders")
    .update({
      customs_fee_received: newValue,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("deleted_at", null);

  if (orderError) {
    return data(
      { success: false, error: "상태 변경 중 오류가 발생했습니다." },
      { status: 500, headers: responseHeaders }
    );
  }

  // Bi-directional sync: also update linked Customs record
  if (current.customs_id) {
    await supabase
      .from("customs")
      .update({
        fee_received: newValue,
        updated_at: new Date().toISOString(),
      })
      .eq("id", current.customs_id)
      .is("deleted_at", null);
    // Best-effort: if customs update fails, order toggle still succeeds
  }

  return data({ success: true }, { headers: responseHeaders });
}
```

### 7.4 Link Document

Manually link a PI, Shipping Doc, Customs, or Delivery to this order.

```typescript
async function handleLinkDocument(
  supabase: SupabaseClient,
  id: string,
  formData: FormData,
  responseHeaders: Headers
) {
  const raw = Object.fromEntries(formData);
  const parsed = linkDocumentSchema.safeParse(raw);

  if (!parsed.success) {
    return data(
      { success: false, error: parsed.error.issues[0]?.message ?? "입력 값을 확인하세요." },
      { status: 400, headers: responseHeaders }
    );
  }

  const { doc_type, doc_id } = parsed.data;

  // Map doc_type to table name for existence check
  const tableMap: Record<string, string> = {
    pi: "proforma_invoices",
    shipping: "shipping_documents",
    customs: "customs",
    delivery: "deliveries",
  };
  const fkMap: Record<string, string> = {
    pi: "pi_id",
    shipping: "shipping_doc_id",
    customs: "customs_id",
    delivery: "delivery_id",
  };

  const tableName = tableMap[doc_type];
  const fkColumn = fkMap[doc_type];

  // Validate target document exists
  const { count } = await supabase
    .from(tableName)
    .select("id", { count: "exact", head: true })
    .eq("id", doc_id)
    .is("deleted_at", null);

  if (!count) {
    return data(
      { success: false, error: "연결할 문서를 찾을 수 없습니다." },
      { status: 400, headers: responseHeaders }
    );
  }

  // Check not already linked to another order
  const { data: conflict } = await supabase
    .from("orders")
    .select("id")
    .eq(fkColumn, doc_id)
    .is("deleted_at", null)
    .neq("id", id)
    .maybeSingle();

  if (conflict) {
    return data(
      { success: false, error: "이 문서는 이미 다른 주문에 연결되어 있습니다." },
      { status: 409, headers: responseHeaders }
    );
  }

  // Update order FK
  const { error } = await supabase
    .from("orders")
    .update({
      [fkColumn]: doc_id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) {
    return data(
      { success: false, error: "문서 연결 중 오류가 발생했습니다." },
      { status: 500, headers: responseHeaders }
    );
  }

  return data({ success: true }, { headers: responseHeaders });
}
```

**Note on `supabase.from(tableName)`:** The Supabase typed client restricts `.from()` to known table names. At runtime this works fine, but TypeScript may complain. Two options:
1. Use a switch/case with literal table names (verbose but type-safe).
2. Cast: `(supabase as any).from(tableName)` -- acceptable for this internal helper.

Recommendation: Use a switch/case for type safety, following existing patterns.

### 7.5 Unlink Document

```typescript
async function handleUnlinkDocument(
  supabase: SupabaseClient,
  id: string,
  formData: FormData,
  responseHeaders: Headers
) {
  const raw = Object.fromEntries(formData);
  const parsed = unlinkDocumentSchema.safeParse(raw);

  if (!parsed.success) {
    return data(
      { success: false, error: parsed.error.issues[0]?.message ?? "입력 값을 확인하세요." },
      { status: 400, headers: responseHeaders }
    );
  }

  const fkMap: Record<string, string> = {
    pi: "pi_id",
    shipping: "shipping_doc_id",
    customs: "customs_id",
    delivery: "delivery_id",
  };

  const fkColumn = fkMap[parsed.data.doc_type];

  const { error } = await supabase
    .from("orders")
    .update({
      [fkColumn]: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) {
    return data(
      { success: false, error: "문서 연결 해제 중 오류가 발생했습니다." },
      { status: 500, headers: responseHeaders }
    );
  }

  return data({ success: true }, { headers: responseHeaders });
}
```

### 7.6 Soft Delete

```typescript
async function handleDelete(
  supabase: SupabaseClient,
  id: string,
  responseHeaders: Headers
) {
  const { error } = await supabase
    .from("orders")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) {
    return data(
      { success: false, error: "삭제 중 오류가 발생했습니다." },
      { status: 500, headers: responseHeaders }
    );
  }

  throw redirect("/orders", { headers: responseHeaders });
}
```

**Note:** Order deletion does NOT cascade-unlink the underlying PO/PI/Shipping/Customs/Delivery. Those documents exist independently. The order is just a tracking wrapper.

---

## 8. CY Free Time Calculation (Server-Side)

Computed in the loader, not stored in DB. Derived from `shipping.eta` and `customs.customs_date`.

```typescript
function calcCYDays(eta: string | null, customsDate: string | null): number | null {
  if (!eta || !customsDate) return null;
  const etaMs = new Date(eta).getTime();
  const customsMs = new Date(customsDate).getTime();
  if (isNaN(etaMs) || isNaN(customsMs)) return null;
  return Math.ceil((customsMs - etaMs) / (1000 * 60 * 60 * 24));
}
```

This is calculated in the detail loader and included in the response:

```typescript
// Inside detail loader, after fetching order
const shipping = order.shipping as unknown as OrderShippingRef | null;
const customs = order.customs as unknown as OrderCustomsRef | null;
const cyDays = calcCYDays(shipping?.eta ?? null, customs?.customs_date ?? null);

return data(
  { order, content, userId: user.id, cyDays },
  { headers: responseHeaders }
);
```

---

## 9. Bi-Directional Sync Hooks

These are application-level sync operations that run when related documents change. They will be added to existing Phase 7/8 loaders, not in the Order module itself.

### 9.1 Sync Points (future Phase 7/8 responsibility)

| Trigger | Source Module | Order Field Updated |
|---------|-------------|-------------------|
| Customs created | Phase 7 customs.server.ts | `customs_id`, `customs_fee_received` |
| Customs `customs_date` changed | Phase 7 customs.$id.server.ts | (no direct field on orders, derived via JOIN) |
| Customs `fee_received` toggled | Phase 7 customs.$id.server.ts | `customs_fee_received` |
| Delivery date changed | Phase 8 deliveries.server.ts | `delivery_date` |
| Shipping `vessel/etd/eta` updated | Phase 5 shipping.$id.server.ts (add later) | (no direct field on orders, derived via JOIN) |

### 9.2 Helper for Phase 7/8 to Call

```typescript
// app/lib/order-sync.server.ts

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sync customs fee_received status from Customs to linked Order.
 * Called from customs.$id action when fee_received toggles.
 */
export async function syncCustomsFeeToOrder(
  supabase: SupabaseClient,
  customsId: string,
  feeReceived: boolean
) {
  await supabase
    .from("orders")
    .update({
      customs_fee_received: feeReceived,
      updated_at: new Date().toISOString(),
    })
    .eq("customs_id", customsId)
    .is("deleted_at", null);
}

/**
 * Sync delivery_date from Delivery to linked Order.
 * Called from deliveries action when delivery_date changes.
 */
export async function syncDeliveryDateToOrder(
  supabase: SupabaseClient,
  deliveryId: string,
  deliveryDate: string | null
) {
  await supabase
    .from("orders")
    .update({
      delivery_date: deliveryDate,
      updated_at: new Date().toISOString(),
    })
    .eq("delivery_id", deliveryId)
    .is("deleted_at", null);
}

/**
 * When a new Customs is created for a Shipping Doc, find the Order
 * that references that Shipping Doc and link the Customs.
 */
export async function linkCustomsToOrder(
  supabase: SupabaseClient,
  shippingDocId: string,
  customsId: string
) {
  await supabase
    .from("orders")
    .update({
      customs_id: customsId,
      updated_at: new Date().toISOString(),
    })
    .eq("shipping_doc_id", shippingDocId)
    .is("customs_id", null)
    .is("deleted_at", null);
}
```

---

## 10. Edge Cases & Decisions

### 10.1 PO with Multiple PIs

- **Decision:** Auto-cascade picks the latest PI by `pi_date DESC LIMIT 1`.
- **User override:** The `link_document` action allows manually linking a different PI.
- **UI hint:** The order detail page should show a "link PI" button if `pi_id` is null or if the user wants to change it.

### 10.2 PI with Multiple Shipping Docs

- **Decision:** Same as above -- latest by `ci_date DESC LIMIT 1`.
- **User override:** Manual link/unlink via actions.

### 10.3 Duplicate Order for Same PO

- **Prevention:** The create action checks `orders.po_id = input.po_id AND deleted_at IS NULL` before insert.
- **Error message:** "이 PO에 대한 주문이 이미 존재합니다." (409 Conflict).
- **Deleted orders:** A soft-deleted order does NOT block creation of a new order for the same PO.

### 10.4 Linked Document Gets Soft-Deleted

- **No automatic cleanup.** If a PI/Shipping/Customs/Delivery linked to an order is soft-deleted, the order FK remains pointing to it.
- **Query safety:** The detail loader joins with no `deleted_at` filter on the FK target, so the joined data will be `null` when the target is soft-deleted (PostgREST returns null for FK joins that find no row).
- **UI handling:** The frontend should show "문서 삭제됨" or a re-link prompt when a linked doc is null but the FK is set.
- **Future improvement:** A periodic cleanup job or an explicit check in the detail loader that detects dangling FKs and nullifies them.

### 10.5 Cascade Link Re-run

- **Use case:** User creates an order before PI exists, then later creates the PI. They want the order to auto-detect the new PI.
- **Solution:** A "refresh links" action that re-runs `cascadeLink()` and updates any null FKs without overwriting existing non-null ones.

```typescript
// _action: "refresh_links"
async function handleRefreshLinks(supabase, id, responseHeaders) {
  const { data: order } = await supabase
    .from("orders")
    .select("po_id, pi_id, shipping_doc_id, customs_id, delivery_id")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!order?.po_id) {
    return data({ success: false, error: "PO가 연결되어 있지 않습니다." }, ...);
  }

  const cascaded = await cascadeLink(supabase, order.po_id);

  // Only fill in NULL FKs, do not overwrite existing links
  const updates: Record<string, string | null> = {};
  if (!order.pi_id && cascaded.pi_id) updates.pi_id = cascaded.pi_id;
  if (!order.shipping_doc_id && cascaded.shipping_doc_id) updates.shipping_doc_id = cascaded.shipping_doc_id;
  if (!order.customs_id && cascaded.customs_id) updates.customs_id = cascaded.customs_id;
  if (!order.delivery_id && cascaded.delivery_id) updates.delivery_id = cascaded.delivery_id;

  if (Object.keys(updates).length === 0) {
    return data({ success: true, message: "변경 사항이 없습니다." }, ...);
  }

  await supabase
    .from("orders")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id);

  return data({ success: true }, ...);
}
```

---

## 11. DB Schema Notes

### 11.1 Existing Table - No Migration Needed

The `orders` table already exists with all required columns:
- `id`, `po_id`, `pi_id`, `shipping_doc_id`, `customs_id`, `delivery_id`
- `saelim_no`, `advice_date`, `arrival_date`, `delivery_date`
- `customs_fee_received`
- `created_by`, `created_at`, `updated_at`, `deleted_at`

All FK constraints are already in place per `database.ts` types.

### 11.2 Potential Index Additions

```sql
-- Speed up duplicate check and list query
CREATE INDEX IF NOT EXISTS idx_orders_po_id ON orders (po_id) WHERE deleted_at IS NULL;

-- Speed up sync helpers that look up orders by linked doc
CREATE INDEX IF NOT EXISTS idx_orders_shipping_doc_id ON orders (shipping_doc_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_customs_id ON orders (customs_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_delivery_id ON orders (delivery_id) WHERE deleted_at IS NULL;
```

### 11.3 RLS Policies

Orders follow the same pattern as other tables:
- GV users (org_type = 'seller'): Full CRUD
- Saelim users (org_type = 'buyer'): SELECT only (delivery-related views)

```sql
-- If not already present:
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "GV users can manage orders"
  ON orders FOR ALL
  USING (
    (SELECT (auth.jwt() -> 'app_metadata' ->> 'org_type')) = 'seller'
  );

CREATE POLICY "Saelim users can view orders"
  ON orders FOR SELECT
  USING (
    (SELECT (auth.jwt() -> 'app_metadata' ->> 'org_type')) = 'buyer'
  );
```

---

## 12. Route Configuration

```typescript
// In app/routes.ts
route("orders", "routes/_layout.orders.tsx"),           // list
route("orders/new", "routes/_layout.orders.new.tsx"),   // create (if separate page; or dialog on list)
route("orders/:id", "routes/_layout.orders.$id.tsx"),   // detail
```

Route files re-export loaders/actions:

```typescript
// app/routes/_layout.orders.tsx
export { loader } from "~/loaders/orders.server";

// app/routes/_layout.orders.$id.tsx
export { loader, action } from "~/loaders/orders.$id.server";
```

**No edit route needed.** Unlike PO/PI/Shipping which have complex forms warranting a separate edit page, Order fields are simple (saelim_no, dates, toggles) and are edited inline on the detail page via fetcher actions.

---

## 13. Performance Considerations

1. **List query with 5 JOINs**: All are FK 1:1 JOINs on indexed columns. PostgREST handles this efficiently as a single SQL query with LEFT JOINs. No N+1 risk.

2. **Cascade link on create**: 3 sequential round-trips (with step 2 parallelized). Acceptable for a create operation. Total latency: ~150-300ms on Supabase edge.

3. **No pagination yet**: Orders grow linearly with POs (1:1). Even at 500 orders, the list query with JOINs should return in <200ms. Add pagination when exceeding 1000 rows.

4. **CY days calculation**: Pure arithmetic on two date strings, no DB call needed. Zero cost.

5. **Sync helpers**: Best-effort updates, no transactions. If the sync fails, the primary operation still succeeds. The data will self-correct on next sync trigger or manual edit.
