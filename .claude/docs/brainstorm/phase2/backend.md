# Phase 2: PO Module - Backend Dev Brainstorming

## 1. Route Structure Decision

**Recommendation: Two loader files + route expansion in `routes.ts`**

- `app/loaders/po.server.ts` -- PO list loader + create action
- `app/loaders/po.$id.server.ts` -- PO detail loader + update/delete/clone/toggleStatus actions

**Rationale**: The PO module differs from Phase 1 settings pages. Settings are single-page CRUD (list + dialog). PO has distinct list and detail/edit views with different data requirements. Two files keeps each file focused and avoids a bloated single file with complex routing logic. This also maps cleanly to the route config:

```typescript
// routes.ts additions
route("po", "routes/_layout.po.tsx"),           // list
route("po/new", "routes/_layout.po.new.tsx"),   // create form
route("po/:id", "routes/_layout.po.$id.tsx"),   // detail view
route("po/:id/edit", "routes/_layout.po.$id.edit.tsx"), // edit form
```

The `new` and `edit` routes can share loader logic with the list/detail respectively, or use a third shared loader. Given the form routes need organizations + products for dropdowns, a clean approach:

```typescript
// routes/_layout.po.new.tsx
export { poFormLoader as loader, createPOAction as action } from "~/loaders/po.server";

// routes/_layout.po.$id.tsx
export { poDetailLoader as loader } from "~/loaders/po.$id.server";

// routes/_layout.po.$id.edit.tsx
export { poEditLoader as loader, poEditAction as action } from "~/loaders/po.$id.server";
```

**Alternative considered**: A single `po.server.ts` with all logic. Rejected because it would grow to 300+ lines and mix unrelated concerns (list filtering vs form validation vs clone logic).

---

## 2. Type Definitions (`app/types/po.ts`)

```typescript
import type { Tables } from "./database";

export interface POLineItem {
  product_id: string;
  product_name: string;
  gsm: number | null;
  width_mm: number | null;
  quantity_kg: number;
  unit_price: number;
  amount: number;
}

// Supabase relation join result type
export interface POWithOrgs extends Tables<"purchase_orders"> {
  supplier: { name_en: string } | null;
  buyer: { name_en: string } | null;
}
```

Note: `Tables<"purchase_orders">` already includes `details: Json | null` from auto-generated types. The `POLineItem` type is for runtime validation/parsing of the JSONB `details` column. Frontend should cast `po.details as POLineItem[]` after the loader returns validated data.

---

## 3. Zod Validation Schemas

```typescript
import { z } from "zod";

const lineItemSchema = z.object({
  product_id: z.string().uuid("유효한 제품을 선택하세요"),
  product_name: z.string().min(1),
  gsm: z.number().nullable(),
  width_mm: z.number().nullable(),
  quantity_kg: z.number().positive("수량은 0보다 커야 합니다"),
  unit_price: z.number().positive("단가는 0보다 커야 합니다"),
  amount: z.number().nonnegative(),
});

const poSchema = z.object({
  po_date: z.string().min(1, "PO 일자를 입력하세요"),
  validity: z.string().optional().default(""),
  ref_no: z.string().optional().default(""),
  supplier_id: z.string().uuid("공급업체를 선택하세요"),
  buyer_id: z.string().uuid("구매업체를 선택하세요"),
  currency: z.enum(["USD", "KRW"]),
  payment_term: z.string().optional().default(""),
  delivery_term: z.string().optional().default(""),
  loading_port: z.string().optional().default(""),
  discharge_port: z.string().optional().default(""),
  notes: z.string().optional().default(""),
});
```

`details` (line items) is validated separately because it arrives as a JSON string in FormData and needs `JSON.parse` before Zod validation. The `poSchema` does not include `details` to avoid mixing string-form and parsed-form validation.

---

## 4. Loader File: `app/loaders/po.server.ts`

### poListLoader

```typescript
import { data } from "react-router";
import type { AppLoadContext } from "react-router";
import { requireGVUser } from "~/lib/auth.server";

interface LoaderArgs {
  request: Request;
  context: AppLoadContext;
}

export async function loader({ request, context }: LoaderArgs) {
  const { supabase, responseHeaders } = await requireGVUser(request, context);

  const url = new URL(request.url);
  const status = url.searchParams.get("status"); // "process" | "complete" | null (all)

  let query = supabase
    .from("purchase_orders")
    .select(
      "id, po_no, po_date, status, amount, currency, supplier_id, buyer_id, " +
      "supplier:organizations!supplier_id(name_en), " +
      "buyer:organizations!buyer_id(name_en)"
    )
    .is("deleted_at", null)
    .order("po_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (status === "process" || status === "complete") {
    query = query.eq("status", status);
  }

  const { data: pos, error } = await query;

  if (error) {
    return data({ pos: [], error: error.message }, { headers: responseHeaders });
  }

  return data({ pos: pos ?? [] }, { headers: responseHeaders });
}
```

**Key decisions:**
- Select only columns needed for the list view (no `details`, `notes`, etc.)
- Supabase foreign key joins via `organizations!supplier_id` and `organizations!buyer_id` -- both reference the same `organizations` table, so the `!foreign_key_name` disambiguator is required
- Status filter via URL search params rather than a separate route
- Default sort: newest PO date first, then newest created_at as tiebreaker

### poFormLoader (for create page)

```typescript
export async function poFormLoader({ request, context }: LoaderArgs) {
  const { supabase, responseHeaders } = await requireGVUser(request, context);

  const [orgsResult, productsResult] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, type, name_en")
      .is("deleted_at", null)
      .order("name_en"),
    supabase
      .from("products")
      .select("id, name, gsm, width_mm")
      .is("deleted_at", null)
      .order("name"),
  ]);

  return data(
    {
      organizations: orgsResult.data ?? [],
      products: productsResult.data ?? [],
    },
    { headers: responseHeaders }
  );
}
```

**Why Promise.all**: Two independent queries for dropdown data. Parallel execution saves latency on the edge. Both are lightweight queries.

### createPOAction

```typescript
import { redirect } from "react-router";
import { z } from "zod";
import type { POLineItem } from "~/types/po";

export async function createPOAction({ request, context }: LoaderArgs) {
  const { supabase, user, responseHeaders } = await requireGVUser(request, context);
  const formData = await request.formData();

  // 1. Validate main fields
  const raw = Object.fromEntries(formData);
  const parsed = poSchema.safeParse(raw);
  if (!parsed.success) {
    return data(
      { success: false, error: parsed.error.issues[0]?.message ?? "입력 값을 확인하세요." },
      { status: 400, headers: responseHeaders }
    );
  }

  // 2. Parse and validate line items
  const detailsRaw = formData.get("details") as string;
  let lineItems: POLineItem[];
  try {
    const detailsParsed = JSON.parse(detailsRaw || "[]");
    const validated = z.array(lineItemSchema).min(1, "최소 1개 이상의 품목을 추가하세요").safeParse(detailsParsed);
    if (!validated.success) {
      return data(
        { success: false, error: validated.error.issues[0]?.message ?? "품목 정보를 확인하세요." },
        { status: 400, headers: responseHeaders }
      );
    }
    lineItems = validated.data;
  } catch {
    return data(
      { success: false, error: "품목 데이터 형식이 올바르지 않습니다." },
      { status: 400, headers: responseHeaders }
    );
  }

  // 3. Recalculate amounts server-side (never trust client amounts)
  const recalculated = lineItems.map((item) => ({
    ...item,
    amount: Math.round(item.quantity_kg * item.unit_price * 100) / 100,
  }));
  const totalAmount = recalculated.reduce((sum, item) => sum + item.amount, 0);

  // 4. Generate PO number via RPC
  const { data: poNo, error: rpcError } = await supabase.rpc("generate_doc_number", {
    doc_type: "PO",
    ref_date: parsed.data.po_date,
  });

  if (rpcError || !poNo) {
    return data(
      { success: false, error: "PO 번호 생성에 실패했습니다." },
      { status: 500, headers: responseHeaders }
    );
  }

  // 5. Insert
  const { data: newPO, error: insertError } = await supabase
    .from("purchase_orders")
    .insert({
      po_no: poNo,
      po_date: parsed.data.po_date,
      validity: parsed.data.validity || null,
      ref_no: parsed.data.ref_no || null,
      supplier_id: parsed.data.supplier_id,
      buyer_id: parsed.data.buyer_id,
      currency: parsed.data.currency,
      amount: totalAmount,
      payment_term: parsed.data.payment_term || null,
      delivery_term: parsed.data.delivery_term || null,
      loading_port: parsed.data.loading_port || null,
      discharge_port: parsed.data.discharge_port || null,
      details: recalculated as unknown as Json,
      notes: parsed.data.notes || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (insertError) {
    return data(
      { success: false, error: insertError.message },
      { status: 500, headers: responseHeaders }
    );
  }

  throw redirect(`/po/${newPO.id}`, { headers: responseHeaders });
}
```

**Key decisions:**
- Server-side amount recalculation: `quantity_kg * unit_price` is recomputed server-side to prevent tampered amounts
- `Math.round(...*100)/100` for USD two-decimal precision
- `generate_doc_number` RPC is called with `po_date` as `ref_date` so the YYMM prefix matches the PO date, not "today"
- Redirect after successful create (PRG pattern)
- Insert uses `.select("id").single()` to get the new row's ID for the redirect
- Empty optional strings converted to `null` to keep DB clean

---

## 5. Loader File: `app/loaders/po.$id.server.ts`

### poDetailLoader

```typescript
import { data } from "react-router";
import type { AppLoadContext } from "react-router";
import { requireGVUser } from "~/lib/auth.server";

interface DetailLoaderArgs {
  request: Request;
  context: AppLoadContext;
  params: { id: string };
}

export async function loader({ request, context, params }: DetailLoaderArgs) {
  const { supabase, responseHeaders } = await requireGVUser(request, context);

  const { data: po, error } = await supabase
    .from("purchase_orders")
    .select(
      "*, " +
      "supplier:organizations!supplier_id(id, name_en, name_ko, address_en), " +
      "buyer:organizations!buyer_id(id, name_en, name_ko, address_en)"
    )
    .eq("id", params.id)
    .is("deleted_at", null)
    .single();

  if (error || !po) {
    throw data(null, { status: 404, headers: responseHeaders });
  }

  return data({ po }, { headers: responseHeaders });
}
```

**Notes:**
- Detail view selects `*` because all columns are displayed (including notes, details line items, ports, terms, etc.)
- Organization join includes address fields for potential PDF/print display
- `.single()` returns error if 0 or 2+ rows; we treat both as 404
- `throw data(null, { status: 404 })` triggers React Router's error boundary

### poEditLoader (for edit page)

```typescript
export async function poEditLoader({ request, context, params }: DetailLoaderArgs) {
  const { supabase, responseHeaders } = await requireGVUser(request, context);

  const [poResult, orgsResult, productsResult] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select("*")
      .eq("id", params.id)
      .is("deleted_at", null)
      .single(),
    supabase
      .from("organizations")
      .select("id, type, name_en")
      .is("deleted_at", null)
      .order("name_en"),
    supabase
      .from("products")
      .select("id, name, gsm, width_mm")
      .is("deleted_at", null)
      .order("name"),
  ]);

  if (poResult.error || !poResult.data) {
    throw data(null, { status: 404, headers: responseHeaders });
  }

  return data(
    {
      po: poResult.data,
      organizations: orgsResult.data ?? [],
      products: productsResult.data ?? [],
    },
    { headers: responseHeaders }
  );
}
```

### poEditAction (update + delete + clone + toggleStatus)

Uses the same multi-intent pattern established in Phase 1:

```typescript
export async function action({ request, context, params }: DetailLoaderArgs) {
  const { supabase, user, responseHeaders } = await requireGVUser(request, context);
  const formData = await request.formData();
  const intent = formData.get("_action") as string;

  switch (intent) {
    case "update":
      return handleUpdate(supabase, formData, params.id, responseHeaders);
    case "delete":
      return handleDelete(supabase, params.id, responseHeaders);
    case "clone":
      return handleClone(supabase, user.id, params.id, responseHeaders);
    case "toggle_status":
      return handleToggleStatus(supabase, params.id, formData, responseHeaders);
    default:
      return data(
        { success: false, error: "알 수 없는 요청입니다." },
        { status: 400, headers: responseHeaders }
      );
  }
}
```

#### handleUpdate

```typescript
async function handleUpdate(
  supabase: SupabaseClient,
  formData: FormData,
  id: string,
  responseHeaders: Headers
) {
  const raw = Object.fromEntries(formData);
  const parsed = poSchema.safeParse(raw);
  if (!parsed.success) {
    return data(
      { success: false, error: parsed.error.issues[0]?.message ?? "입력 값을 확인하세요." },
      { status: 400, headers: responseHeaders }
    );
  }

  // Parse and validate line items (same as create)
  const detailsRaw = formData.get("details") as string;
  let lineItems: POLineItem[];
  try {
    const detailsParsed = JSON.parse(detailsRaw || "[]");
    const validated = z.array(lineItemSchema).min(1).safeParse(detailsParsed);
    if (!validated.success) {
      return data(
        { success: false, error: validated.error.issues[0]?.message ?? "품목 정보를 확인하세요." },
        { status: 400, headers: responseHeaders }
      );
    }
    lineItems = validated.data;
  } catch {
    return data(
      { success: false, error: "품목 데이터 형식이 올바르지 않습니다." },
      { status: 400, headers: responseHeaders }
    );
  }

  const recalculated = lineItems.map((item) => ({
    ...item,
    amount: Math.round(item.quantity_kg * item.unit_price * 100) / 100,
  }));
  const totalAmount = recalculated.reduce((sum, item) => sum + item.amount, 0);

  const { error } = await supabase
    .from("purchase_orders")
    .update({
      po_date: parsed.data.po_date,
      validity: parsed.data.validity || null,
      ref_no: parsed.data.ref_no || null,
      supplier_id: parsed.data.supplier_id,
      buyer_id: parsed.data.buyer_id,
      currency: parsed.data.currency,
      amount: totalAmount,
      payment_term: parsed.data.payment_term || null,
      delivery_term: parsed.data.delivery_term || null,
      loading_port: parsed.data.loading_port || null,
      discharge_port: parsed.data.discharge_port || null,
      details: recalculated as unknown as Json,
      notes: parsed.data.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) {
    return data({ success: false, error: error.message }, { status: 500, headers: responseHeaders });
  }

  throw redirect(`/po/${id}`, { headers: responseHeaders });
}
```

**Note:** Update does NOT change `po_no`. The PO number is immutable once generated. The `po_date` can change (e.g., user corrects a typo) but the document number stays bound to the original sequence.

#### handleDelete

```typescript
async function handleDelete(
  supabase: SupabaseClient,
  id: string,
  responseHeaders: Headers
) {
  const { error } = await supabase
    .from("purchase_orders")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return data({ success: false, error: error.message }, { status: 500, headers: responseHeaders });
  }

  throw redirect("/po", { headers: responseHeaders });
}
```

#### handleClone

```typescript
async function handleClone(
  supabase: SupabaseClient,
  userId: string,
  sourceId: string,
  responseHeaders: Headers
) {
  // 1. Fetch original PO
  const { data: original, error: fetchError } = await supabase
    .from("purchase_orders")
    .select("*")
    .eq("id", sourceId)
    .is("deleted_at", null)
    .single();

  if (fetchError || !original) {
    return data({ success: false, error: "원본 PO를 찾을 수 없습니다." }, { status: 404, headers: responseHeaders });
  }

  // 2. Generate new PO number (use today's date for the clone)
  const today = new Date().toISOString().split("T")[0];
  const { data: poNo, error: rpcError } = await supabase.rpc("generate_doc_number", {
    doc_type: "PO",
    ref_date: today,
  });

  if (rpcError || !poNo) {
    return data({ success: false, error: "PO 번호 생성에 실패했습니다." }, { status: 500, headers: responseHeaders });
  }

  // 3. Insert clone (reset status, dates, ownership)
  const { data: newPO, error: insertError } = await supabase
    .from("purchase_orders")
    .insert({
      po_no: poNo,
      po_date: today,
      validity: original.validity,
      ref_no: original.ref_no,
      supplier_id: original.supplier_id,
      buyer_id: original.buyer_id,
      currency: original.currency,
      amount: original.amount,
      payment_term: original.payment_term,
      delivery_term: original.delivery_term,
      loading_port: original.loading_port,
      discharge_port: original.discharge_port,
      details: original.details,
      notes: original.notes,
      status: "process",
      created_by: userId,
    })
    .select("id")
    .single();

  if (insertError) {
    return data({ success: false, error: insertError.message }, { status: 500, headers: responseHeaders });
  }

  throw redirect(`/po/${newPO.id}`, { headers: responseHeaders });
}
```

**Clone decisions:**
- New `po_date` = today, new `po_no` = generated from today's YYMM
- Status resets to `"process"`
- `created_by` = current user, not original creator
- `validity` carried over (user can edit after clone)
- All line items (`details` JSONB) copied as-is

#### handleToggleStatus

```typescript
async function handleToggleStatus(
  supabase: SupabaseClient,
  id: string,
  formData: FormData,
  responseHeaders: Headers
) {
  const currentStatus = formData.get("current_status") as string;
  const newStatus = currentStatus === "process" ? "complete" : "process";

  const { error } = await supabase
    .from("purchase_orders")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) {
    return data({ success: false, error: error.message }, { status: 500, headers: responseHeaders });
  }

  return data({ success: true, status: newStatus }, { headers: responseHeaders });
}
```

**Note:** Toggle does NOT redirect -- it returns the new status so the UI can update in-place via `fetcher.data`.

---

## 6. FormData Handling for JSONB Line Items

The frontend sends line items as a single JSON string field:

```typescript
// Frontend form submission
const formData = new FormData();
formData.set("details", JSON.stringify(lineItems));
// ...other fields
```

Server-side parsing pattern:

```typescript
// 1. Extract from FormData
const detailsRaw = formData.get("details") as string;

// 2. JSON.parse with try/catch (malformed JSON from tampered requests)
let parsed: unknown;
try {
  parsed = JSON.parse(detailsRaw || "[]");
} catch {
  // Return 400
}

// 3. Zod array validation
const result = z.array(lineItemSchema).min(1).safeParse(parsed);

// 4. Server-side amount recalculation
const items = result.data.map(item => ({
  ...item,
  amount: Math.round(item.quantity_kg * item.unit_price * 100) / 100,
}));
const total = items.reduce((sum, item) => sum + item.amount, 0);
```

**Why this approach over multiple FormData fields:**
- Line items are variable-length arrays with nested objects
- `FormData.getAll("product_id[]")` + index correlation is fragile and error-prone
- JSON string is clean, parseable, and maps directly to the JSONB column
- Single Zod validation pass on the parsed array

---

## 7. Error Handling Patterns

Consistent with Phase 1, three error categories:

| Category | Pattern | HTTP Status |
|----------|---------|-------------|
| Validation error | `return data({ success: false, error: "..." }, { status: 400, headers })` | 400 |
| Not found | `throw data(null, { status: 404, headers })` | 404 |
| DB/server error | `return data({ success: false, error: error.message }, { status: 500, headers })` | 500 |
| Auth failure | `throw redirect("/login", { headers })` (handled by `requireGVUser`) | 302 |

**Important distinction:**
- `throw data(...)` for hard failures that should render an error boundary (404, unrecoverable)
- `return data(...)` for soft failures that the form UI should display inline (validation, DB constraint violations)
- `throw redirect(...)` for navigation after success or auth failure

---

## 8. Route Config Updates

```typescript
// routes.ts - PO section expansion
route("po", "routes/_layout.po.tsx"),               // list
route("po/new", "routes/_layout.po.new.tsx"),        // create form
route("po/:id", "routes/_layout.po.$id.tsx"),        // detail view
route("po/:id/edit", "routes/_layout.po.$id.edit.tsx"), // edit form
```

Route file re-exports:

```typescript
// routes/_layout.po.tsx
export { loader } from "~/loaders/po.server";
// (no action needed on list page, create is on /po/new)

// routes/_layout.po.new.tsx
export { poFormLoader as loader, createPOAction as action } from "~/loaders/po.server";

// routes/_layout.po.$id.tsx
export { loader } from "~/loaders/po.$id.server";
// (toggle_status action via fetcher can be handled here too)

// routes/_layout.po.$id.edit.tsx
export { poEditLoader as loader, action } from "~/loaders/po.$id.server";
```

**Action routing note:** The detail page (`po/:id`) needs to handle `toggle_status` and `delete` actions even though it is primarily a view page. These are triggered by buttons/fetchers on the detail page. Options:

1. **Same action export on detail route** -- export action from `po.$id.server.ts` on the detail route file
2. **Fetcher posting to edit route** -- `fetcher.submit(formData, { action: `/po/${id}/edit` })`

Option 1 is cleaner. The detail page exports the same action handler:

```typescript
// routes/_layout.po.$id.tsx
export { loader, action } from "~/loaders/po.$id.server";
```

---

## 9. Supabase Query Patterns - Gotchas

### Foreign key disambiguation
Both `supplier_id` and `buyer_id` reference `organizations`. Supabase PostgREST requires explicit foreign key hints:
```
supplier:organizations!supplier_id(name_en)
buyer:organizations!buyer_id(name_en)
```
Without the `!supplier_id` hint, PostgREST returns an ambiguous relationship error.

### JSONB column typing
Supabase types `details` as `Json | null`. When inserting/updating, the `POLineItem[]` must be cast:
```typescript
details: recalculated as unknown as Json
```
This double-cast is necessary because `POLineItem[]` is not assignable to `Json` (TypeScript structural typing issue with the recursive `Json` type).

### Select column optimization for list view
The list query selects only display columns, not `details` or `notes`. This keeps payload small since `details` JSONB can be large (many line items). The detail page fetches `*`.

### updated_at manual setting
The `purchase_orders` table has `updated_at TIMESTAMPTZ DEFAULT NOW()` but this default only applies on INSERT. For UPDATE operations, we must explicitly set `updated_at: new Date().toISOString()`. An alternative would be a Postgres trigger, but per project guidelines we use application-level sync.

---

## 10. Security Considerations

1. **Auth guard**: Every loader/action starts with `requireGVUser()`. PO management is GV-only.
2. **Server-side amount recalculation**: Never trust `amount` values from the client. Always recompute `quantity_kg * unit_price` on the server.
3. **RLS as defense-in-depth**: The `purchase_orders` table should have RLS policies that enforce `auth.uid()` is authenticated. App-level auth is the primary gate; RLS is backup.
4. **UUID validation**: `supplier_id` and `buyer_id` are validated as UUIDs via Zod before hitting the database. This prevents injection of malformed IDs.
5. **Soft delete filter**: All queries include `.is("deleted_at", null)` to prevent accessing soft-deleted records.
6. **No service role key**: All operations use the user-scoped Supabase client from `requireGVUser()`, never the admin client.

---

## 11. Open Questions / Decisions for Discussion

1. **PO number immutability on date change**: If a user edits `po_date` from March to April, should the `po_no` (e.g., `GVPO2603-001`) update to reflect the new month? Current design: NO, po_no is locked at creation. This prevents document number gaps and reference chain breaks with downstream PIs.

2. **Clone date handling**: Current design uses today's date for the clone. Alternative: keep original `po_date` and let user edit. Recommendation: use today -- it is the more common use case (repeating a similar order "now").

3. **Pagination**: Phase 2 MVP skips pagination. PO volume is expected to be low (dozens per month). If needed later, add `.range(offset, offset + limit - 1)` and return count via `.select("*", { count: "exact" })`.

4. **Search/filter**: MVP has only status filter. Future: add search by `po_no`, `supplier name`, date range. These can be added to the list loader via additional URL search params without structural changes.

5. **Concurrent edit protection**: No optimistic locking in MVP. If two GV users edit the same PO simultaneously, last write wins. Future option: add a `version` column and check `version = expected_version` in the UPDATE WHERE clause.
