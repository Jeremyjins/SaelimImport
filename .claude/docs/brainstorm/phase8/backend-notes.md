# Phase 8: Delivery Management - Backend Notes

## 1. Loader Files Overview

| File | Auth | Purpose |
|------|------|---------|
| `app/loaders/delivery.server.ts` | `requireGVUser` | GV delivery list loader + action (currently placeholder route exists at `_layout.delivery.tsx`) |
| `app/loaders/delivery.$id.server.ts` | `requireGVUser` | GV delivery detail loader + action |
| `app/loaders/saelim.delivery.server.ts` | `requireAuth` + org_type check | Saelim delivery list loader |
| `app/loaders/saelim.delivery.$id.server.ts` | `requireAuth` + org_type check | Saelim delivery detail loader + action |
| `app/loaders/delivery.schema.ts` | N/A | Zod schemas for all delivery actions |

### New Routes Needed in `app/routes.ts`

```typescript
// GV Layout - add these
route("delivery", "routes/_layout.delivery.tsx"),         // already exists (placeholder)
route("delivery/:id", "routes/_layout.delivery.$id.tsx"), // NEW

// Saelim Layout - add detail route
route("saelim/delivery", "routes/_saelim.delivery.tsx"),          // already exists (placeholder)
route("saelim/delivery/:id", "routes/_saelim.delivery.$id.tsx"),  // NEW
```

---

## 2. Zod Schemas (`app/loaders/delivery.schema.ts`)

```typescript
import { z } from "zod";

// GV: Update delivery date directly
export const updateDeliveryDateSchema = z.object({
  delivery_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "유효한 날짜 형식이 아닙니다.")
    .refine((val) => !isNaN(Date.parse(val)), "유효한 날짜가 아닙니다.")
    .optional()
    .or(z.literal("")),
});

// Saelim: Submit change request
export const submitChangeRequestSchema = z.object({
  requested_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "유효한 날짜 형식이 아닙니다.")
    .refine((val) => !isNaN(Date.parse(val)), "유효한 날짜가 아닙니다."),
  reason: z
    .string()
    .min(1, "변경 사유를 입력하세요.")
    .max(500, "변경 사유는 500자 이내로 입력하세요."),
});

// GV: Approve change request
export const approveRequestSchema = z.object({
  request_id: z.string().uuid("유효한 요청 ID가 아닙니다."),
  response_text: z.string().max(500).optional(),
});

// GV: Reject change request
export const rejectRequestSchema = z.object({
  request_id: z.string().uuid("유효한 요청 ID가 아닙니다."),
  response_text: z
    .string()
    .min(1, "반려 사유를 입력하세요.")
    .max(500, "반려 사유는 500자 이내로 입력하세요."),
});
```

---

## 3. GV Delivery List Loader (`app/loaders/delivery.server.ts`)

### Loader

```typescript
import { data } from "react-router";
import type { AppLoadContext } from "react-router";
import { requireGVUser } from "~/lib/auth.server";

interface LoaderArgs {
  request: Request;
  context: AppLoadContext;
}

const DELIVERY_LIST_SELECT =
  "id, delivery_date, created_at, " +
  "pi:proforma_invoices!pi_id(id, pi_no, pi_date), " +
  "shipping:shipping_documents!shipping_doc_id(id, ci_no, vessel, voyage, eta)";

export async function loader({ request, context }: LoaderArgs) {
  const { supabase, responseHeaders } = await requireGVUser(request, context);

  const [{ data: rawDeliveries, error }, { data: rawRequests }] = await Promise.all([
    supabase
      .from("deliveries")
      .select(DELIVERY_LIST_SELECT)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    // Pending change request counts per delivery
    supabase
      .from("delivery_change_requests")
      .select("delivery_id, status")
      .eq("status", "pending"),
  ]);

  if (error) {
    return data(
      { deliveries: [], pendingCounts: {}, error: "데이터를 불러오는 데 실패했습니다." },
      { headers: responseHeaders }
    );
  }

  // Build pending request count map: { deliveryId: count }
  const pendingCounts: Record<string, number> = {};
  for (const req of rawRequests ?? []) {
    if (req.delivery_id) {
      pendingCounts[req.delivery_id] = (pendingCounts[req.delivery_id] ?? 0) + 1;
    }
  }

  const deliveries = (rawDeliveries ?? []) as unknown as DeliveryListItem[];

  return data(
    { deliveries, pendingCounts, error: null },
    { headers: responseHeaders }
  );
}
```

### Key Design Decisions

- **No create action on list page**: Deliveries are auto-created when a PI is created (existing pattern from Phase 3). The list page is read-only. No "new" route needed.
- **Pending count as separate query**: Rather than a subquery or RPC, we fetch all pending requests and build a map client-side. The total number of delivery_change_requests will be small (tens to low hundreds), so this is efficient.
- **Client-side filtering**: Follow the customs pattern -- return all data, filter by search/status on the client.

---

## 4. GV Delivery Detail Loader + Action (`app/loaders/delivery.$id.server.ts`)

### Loader

```typescript
const DELIVERY_DETAIL_SELECT =
  "id, delivery_date, pi_id, shipping_doc_id, created_at, updated_at, " +
  "pi:proforma_invoices!pi_id(id, pi_no, pi_date, status, currency, amount, " +
    "po:purchase_orders!po_id(id, po_no)" +
  "), " +
  "shipping:shipping_documents!shipping_doc_id(" +
    "id, ci_no, vessel, voyage, etd, eta, status" +
  ")";

export async function loader({ request, context, params }: DetailLoaderArgs) {
  const { supabase, user, responseHeaders } = await requireGVUser(request, context);

  const idResult = z.string().uuid().safeParse(params.id);
  if (!idResult.success) {
    throw data(null, { status: 404, headers: responseHeaders });
  }
  const id = idResult.data;

  const [
    { data: rawDelivery, error },
    { data: changeRequests },
    { content },
  ] = await Promise.all([
    supabase
      .from("deliveries")
      .select(DELIVERY_DETAIL_SELECT)
      .eq("id", id)
      .is("deleted_at", null)
      .single(),
    supabase
      .from("delivery_change_requests")
      .select("id, requested_date, reason, status, requested_by, responded_by, response_text, created_at, updated_at")
      .eq("delivery_id", id)
      .order("created_at", { ascending: false }),
    loadContent(supabase, "delivery", id),
  ]);

  if (error || !rawDelivery) {
    throw data(null, { status: 404, headers: responseHeaders });
  }

  const delivery = rawDelivery as unknown as DeliveryDetail;

  return data(
    { delivery, changeRequests: changeRequests ?? [], content, userId: user.id },
    { headers: responseHeaders }
  );
}
```

### Action (multi-intent)

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

  // ── Content actions delegation ──
  if (intent?.startsWith("content_")) {
    return handleContentAction(supabase, user.id, "delivery", id, intent, formData, responseHeaders);
  }

  // ── Verify delivery exists ──
  const { data: deliveryCheck } = await supabase
    .from("deliveries")
    .select("id, delivery_date")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!deliveryCheck) {
    return data({ success: false, error: "배송을 찾을 수 없습니다." }, { status: 404, headers: responseHeaders });
  }

  // ── update_delivery_date ──
  if (intent === "update_delivery_date") { ... }

  // ── approve_request ──
  if (intent === "approve_request") { ... }

  // ── reject_request ──
  if (intent === "reject_request") { ... }

  // ── delete ──
  if (intent === "delete") { ... }

  return data({ success: false, error: "알 수 없는 요청입니다." }, { status: 400, headers: responseHeaders });
}
```

### Action: `update_delivery_date`

```typescript
if (intent === "update_delivery_date") {
  const raw = Object.fromEntries(formData);
  const parsed = updateDeliveryDateSchema.safeParse(raw);
  if (!parsed.success) {
    return data(
      { success: false, error: parsed.error.issues[0]?.message ?? "입력 값을 확인하세요." },
      { status: 400, headers: responseHeaders }
    );
  }

  const newDate = parsed.data.delivery_date || null;

  const { error: updateError } = await supabase
    .from("deliveries")
    .update({ delivery_date: newDate, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (updateError) {
    return data({ success: false, error: "저장 중 오류가 발생했습니다." }, { status: 500, headers: responseHeaders });
  }

  // Sync to order
  await syncDeliveryDateToOrder(supabase as SupabaseClient<Database>, id, newDate);

  return data({ success: true }, { headers: responseHeaders });
}
```

### Action: `approve_request`

```typescript
if (intent === "approve_request") {
  const raw = Object.fromEntries(formData);
  const parsed = approveRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return data(
      { success: false, error: parsed.error.issues[0]?.message ?? "입력 값을 확인하세요." },
      { status: 400, headers: responseHeaders }
    );
  }

  // Fetch the request to get requested_date
  const { data: req } = await supabase
    .from("delivery_change_requests")
    .select("id, requested_date, status, delivery_id")
    .eq("id", parsed.data.request_id)
    .eq("delivery_id", id)
    .single();

  if (!req || req.status !== "pending") {
    return data(
      { success: false, error: "처리할 수 없는 요청입니다." },
      { status: 400, headers: responseHeaders }
    );
  }

  const now = new Date().toISOString();

  // 1. Update request status to approved
  const { error: reqError } = await supabase
    .from("delivery_change_requests")
    .update({
      status: "approved",
      responded_by: user.id,
      response_text: parsed.data.response_text || null,
      updated_at: now,
    })
    .eq("id", parsed.data.request_id);

  if (reqError) {
    return data({ success: false, error: "승인 처리 중 오류가 발생했습니다." }, { status: 500, headers: responseHeaders });
  }

  // 2. Update delivery_date to the requested date
  const { error: deliveryError } = await supabase
    .from("deliveries")
    .update({ delivery_date: req.requested_date, updated_at: now })
    .eq("id", id);

  if (deliveryError) {
    return data({ success: false, error: "배송일 변경 중 오류가 발생했습니다." }, { status: 500, headers: responseHeaders });
  }

  // 3. Sync to order
  await syncDeliveryDateToOrder(supabase as SupabaseClient<Database>, id, req.requested_date);

  return data({ success: true }, { headers: responseHeaders });
}
```

### Action: `reject_request`

```typescript
if (intent === "reject_request") {
  const raw = Object.fromEntries(formData);
  const parsed = rejectRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return data(
      { success: false, error: parsed.error.issues[0]?.message ?? "입력 값을 확인하세요." },
      { status: 400, headers: responseHeaders }
    );
  }

  const { data: req } = await supabase
    .from("delivery_change_requests")
    .select("id, status")
    .eq("id", parsed.data.request_id)
    .eq("delivery_id", id)
    .single();

  if (!req || req.status !== "pending") {
    return data(
      { success: false, error: "처리할 수 없는 요청입니다." },
      { status: 400, headers: responseHeaders }
    );
  }

  const { error: reqError } = await supabase
    .from("delivery_change_requests")
    .update({
      status: "rejected",
      responded_by: user.id,
      response_text: parsed.data.response_text,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.request_id);

  if (reqError) {
    return data({ success: false, error: "반려 처리 중 오류가 발생했습니다." }, { status: 500, headers: responseHeaders });
  }

  return data({ success: true }, { headers: responseHeaders });
}
```

### Action: `delete`

```typescript
if (intent === "delete") {
  // Unlink from order first (set order.delivery_id = null, order.delivery_date = null)
  const unlinkOk = await unlinkDeliveryFromOrder(supabase as SupabaseClient<Database>, id);
  if (!unlinkOk) {
    return data(
      { success: false, error: "연결된 오더 정리 중 오류가 발생했습니다." },
      { status: 500, headers: responseHeaders }
    );
  }

  const { error: deleteError } = await supabase
    .from("deliveries")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (deleteError) {
    return data({ success: false, error: "삭제 중 오류가 발생했습니다." }, { status: 500, headers: responseHeaders });
  }

  throw redirect("/delivery", { headers: responseHeaders });
}
```

---

## 5. Saelim Delivery List Loader (`app/loaders/saelim.delivery.server.ts`)

```typescript
import { data, redirect } from "react-router";
import type { AppLoadContext } from "react-router";
import { requireAuth } from "~/lib/auth.server";
import { ORG_TYPES } from "~/lib/constants";

interface LoaderArgs {
  request: Request;
  context: AppLoadContext;
}

// No pricing fields - limited columns for Saelim
const SAELIM_DELIVERY_LIST_SELECT =
  "id, delivery_date, created_at, " +
  "pi:proforma_invoices!pi_id(id, pi_no), " +
  "shipping:shipping_documents!shipping_doc_id(id, ci_no, vessel, voyage, eta)";

export async function loader({ request, context }: LoaderArgs) {
  const { user, supabase, responseHeaders } = await requireAuth(request, context);

  if (user.app_metadata?.org_type !== ORG_TYPES.SAELIM) {
    throw redirect("/", { headers: responseHeaders });
  }

  const [{ data: rawDeliveries, error }, { data: rawRequests }] = await Promise.all([
    supabase
      .from("deliveries")
      .select(SAELIM_DELIVERY_LIST_SELECT)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    // Only own change requests
    supabase
      .from("delivery_change_requests")
      .select("id, delivery_id, requested_date, status, created_at")
      .eq("requested_by", user.id)
      .order("created_at", { ascending: false }),
  ]);

  if (error) {
    return data(
      { deliveries: [], myRequests: [], error: "데이터를 불러오는 데 실패했습니다." },
      { headers: responseHeaders }
    );
  }

  const deliveries = (rawDeliveries ?? []) as unknown as SaelimDeliveryListItem[];

  // Map requests by delivery_id for quick lookup in the UI
  const myRequestsByDelivery: Record<string, { id: string; status: string; requested_date: string }[]> = {};
  for (const req of rawRequests ?? []) {
    if (req.delivery_id) {
      if (!myRequestsByDelivery[req.delivery_id]) myRequestsByDelivery[req.delivery_id] = [];
      myRequestsByDelivery[req.delivery_id].push({
        id: req.id,
        status: req.status ?? "pending",
        requested_date: req.requested_date,
      });
    }
  }

  return data(
    { deliveries, myRequestsByDelivery, error: null },
    { headers: responseHeaders }
  );
}
```

### Key Design Decisions

- **No pricing info**: Saelim SELECT does not join amount, currency, or fee fields.
- **Own requests only**: Filter `requested_by = user.id` so Saelim users only see their own change requests.
- **Org-type guard**: Application-level check via `user.app_metadata.org_type` before any query. RLS is defense-in-depth.

---

## 6. Saelim Delivery Detail + Action (`app/loaders/saelim.delivery.$id.server.ts`)

### Loader

```typescript
const SAELIM_DELIVERY_DETAIL_SELECT =
  "id, delivery_date, pi_id, shipping_doc_id, created_at, " +
  "pi:proforma_invoices!pi_id(id, pi_no), " +
  "shipping:shipping_documents!shipping_doc_id(id, ci_no, vessel, voyage, eta)";

export async function loader({ request, context, params }: DetailLoaderArgs) {
  const { user, supabase, responseHeaders } = await requireAuth(request, context);

  if (user.app_metadata?.org_type !== ORG_TYPES.SAELIM) {
    throw redirect("/", { headers: responseHeaders });
  }

  const idResult = z.string().uuid().safeParse(params.id);
  if (!idResult.success) {
    throw data(null, { status: 404, headers: responseHeaders });
  }
  const id = idResult.data;

  const [{ data: rawDelivery, error }, { data: changeRequests }] = await Promise.all([
    supabase
      .from("deliveries")
      .select(SAELIM_DELIVERY_DETAIL_SELECT)
      .eq("id", id)
      .is("deleted_at", null)
      .single(),
    // Only own requests for this delivery
    supabase
      .from("delivery_change_requests")
      .select("id, requested_date, reason, status, response_text, created_at, updated_at")
      .eq("delivery_id", id)
      .eq("requested_by", user.id)
      .order("created_at", { ascending: false }),
  ]);

  if (error || !rawDelivery) {
    throw data(null, { status: 404, headers: responseHeaders });
  }

  const delivery = rawDelivery as unknown as SaelimDeliveryDetail;

  // Check if there is a pending request (blocks new submission)
  const hasPendingRequest = (changeRequests ?? []).some((r) => r.status === "pending");

  return data(
    { delivery, changeRequests: changeRequests ?? [], hasPendingRequest, userId: user.id },
    { headers: responseHeaders }
  );
}
```

### Action: `submit_change_request`

```typescript
export async function action({ request, context, params }: DetailLoaderArgs) {
  const { user, supabase, responseHeaders } = await requireAuth(request, context);

  if (user.app_metadata?.org_type !== ORG_TYPES.SAELIM) {
    return data({ success: false, error: "권한이 없습니다." }, { status: 403, headers: responseHeaders });
  }

  const idResult = z.string().uuid().safeParse(params.id);
  if (!idResult.success) {
    return data({ success: false, error: "잘못된 요청입니다." }, { status: 400, headers: responseHeaders });
  }
  const id = idResult.data;

  const formData = await request.formData();
  const intent = formData.get("_action") as string;

  if (intent !== "submit_change_request") {
    return data({ success: false, error: "잘못된 요청입니다." }, { status: 400, headers: responseHeaders });
  }

  const raw = Object.fromEntries(formData);
  const parsed = submitChangeRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return data(
      { success: false, error: parsed.error.issues[0]?.message ?? "입력 값을 확인하세요." },
      { status: 400, headers: responseHeaders }
    );
  }

  // Verify delivery exists
  const { count: deliveryCount } = await supabase
    .from("deliveries")
    .select("id", { count: "exact", head: true })
    .eq("id", id)
    .is("deleted_at", null);

  if (!deliveryCount) {
    return data(
      { success: false, error: "배송을 찾을 수 없습니다." },
      { status: 404, headers: responseHeaders }
    );
  }

  // Check for existing pending request (prevent duplicate)
  const { count: pendingCount } = await supabase
    .from("delivery_change_requests")
    .select("id", { count: "exact", head: true })
    .eq("delivery_id", id)
    .eq("requested_by", user.id)
    .eq("status", "pending");

  if (pendingCount && pendingCount > 0) {
    return data(
      { success: false, error: "이미 대기 중인 변경 요청이 있습니다." },
      { status: 400, headers: responseHeaders }
    );
  }

  const { error: insertError } = await supabase
    .from("delivery_change_requests")
    .insert({
      delivery_id: id,
      requested_date: parsed.data.requested_date,
      reason: parsed.data.reason,
      requested_by: user.id,
      status: "pending",
    });

  if (insertError) {
    return data(
      { success: false, error: "변경 요청 저장 중 오류가 발생했습니다." },
      { status: 500, headers: responseHeaders }
    );
  }

  return data({ success: true }, { headers: responseHeaders });
}
```

---

## 7. Sync Logic

### Existing Helper (already in `order-sync.server.ts`)

`syncDeliveryDateToOrder(supabase, deliveryId, date)` already exists and works correctly:
- Finds orders with `delivery_id = deliveryId`
- Updates `order.delivery_date` to match

### New Helper Needed: `unlinkDeliveryFromOrder`

Add to `app/lib/order-sync.server.ts`:

```typescript
/**
 * Delivery 삭제 시 연결된 Order의 delivery_id, delivery_date 초기화.
 * delete 흐름의 선행 조건이므로 blocking: 실패 시 false 반환.
 * (Mirrors unlinkCustomsFromOrder pattern)
 */
export async function unlinkDeliveryFromOrder(
  supabase: Supabase,
  deliveryId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("orders")
    .update({
      delivery_id: null,
      delivery_date: null,
      updated_at: new Date().toISOString(),
    })
    .eq("delivery_id", deliveryId)
    .is("deleted_at", null);

  if (error) {
    console.error("unlinkDeliveryFromOrder failed:", error);
    return false;
  }
  return true;
}
```

### Sync Call Sites

| Action | Where | Sync Function |
|--------|-------|---------------|
| GV updates delivery_date directly | `delivery.$id.server.ts` `update_delivery_date` | `syncDeliveryDateToOrder(supabase, deliveryId, newDate)` |
| GV approves change request | `delivery.$id.server.ts` `approve_request` | `syncDeliveryDateToOrder(supabase, deliveryId, requestedDate)` |
| GV deletes delivery | `delivery.$id.server.ts` `delete` | `unlinkDeliveryFromOrder(supabase, deliveryId)` |

---

## 8. Content System Integration

### ContentType Update

The `ContentType` in `app/types/content.ts` must be extended:

```typescript
export type ContentType = "po" | "pi" | "shipping" | "order" | "customs" | "delivery";
```

And the `PARENT_TABLE_MAP` in `app/lib/content.server.ts`:

```typescript
const PARENT_TABLE_MAP: Record<ContentType, string> = {
  po: "purchase_orders",
  pi: "proforma_invoices",
  shipping: "shipping_documents",
  order: "orders",
  customs: "customs",
  delivery: "deliveries",  // ADD
};
```

This allows the GV delivery detail page to use `loadContent(supabase, "delivery", id)` and `handleContentAction(supabase, user.id, "delivery", id, ...)` with no other changes to the content system.

**Note**: Saelim delivery detail does NOT get content integration. Content (notes, attachments, comments) is GV-internal only.

---

## 9. RLS Policies (Migration)

### Current State

Based on brainstorming docs from Phase 0/3, the following policies were planned but may or may not be applied yet. The migration should use `CREATE POLICY IF NOT EXISTS` or drop-and-recreate pattern.

### Migration: `phase8_delivery_rls`

```sql
-- Enable RLS on both tables (idempotent)
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_change_requests ENABLE ROW LEVEL SECURITY;

-- ── deliveries ──────────────────────────────────────────────

-- GV: full CRUD
CREATE POLICY "gv_deliveries_all" ON deliveries
  FOR ALL
  USING (get_user_org_type() = 'gv')
  WITH CHECK (get_user_org_type() = 'gv');

-- Saelim: SELECT only (no pricing columns in SELECT query, but RLS controls row access not column access)
CREATE POLICY "saelim_deliveries_select" ON deliveries
  FOR SELECT
  USING (get_user_org_type() = 'saelim' AND deleted_at IS NULL);

-- ── delivery_change_requests ────────────────────────────────

-- GV: full CRUD (can view all, approve/reject)
CREATE POLICY "gv_change_requests_all" ON delivery_change_requests
  FOR ALL
  USING (get_user_org_type() = 'gv')
  WITH CHECK (get_user_org_type() = 'gv');

-- Saelim: SELECT own requests only
CREATE POLICY "saelim_change_requests_select" ON delivery_change_requests
  FOR SELECT
  USING (
    get_user_org_type() = 'saelim'
    AND requested_by = auth.uid()
  );

-- Saelim: INSERT own requests only
CREATE POLICY "saelim_change_requests_insert" ON delivery_change_requests
  FOR INSERT
  WITH CHECK (
    get_user_org_type() = 'saelim'
    AND requested_by = auth.uid()
  );
```

### RLS Design Notes

- **deliveries**: Saelim gets `deleted_at IS NULL` in the RLS policy itself, preventing them from seeing soft-deleted records even if application code has a bug.
- **delivery_change_requests**: Saelim can only see/create their own requests (`requested_by = auth.uid()`). They cannot UPDATE (no approve/reject). They cannot see other Saelim users' requests.
- **GV sees all**: GV policy has no row-level restriction, allowing them to see all change requests from all Saelim users and manage them.
- **Column-level security**: RLS does not restrict columns. Pricing exclusion for Saelim is handled at the application level (different SELECT queries in the Saelim loaders).

---

## 10. TypeScript Types Needed (`app/types/delivery.ts`)

```typescript
// GV List
export interface DeliveryListItem {
  id: string;
  delivery_date: string | null;
  created_at: string | null;
  pi: { id: string; pi_no: string; pi_date: string | null } | null;
  shipping: {
    id: string;
    ci_no: string | null;
    vessel: string | null;
    voyage: string | null;
    eta: string | null;
  } | null;
}

// GV Detail
export interface DeliveryDetail {
  id: string;
  delivery_date: string | null;
  pi_id: string | null;
  shipping_doc_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  pi: {
    id: string;
    pi_no: string;
    pi_date: string | null;
    status: string;
    currency: string | null;
    amount: number | null;
    po: { id: string; po_no: string } | null;
  } | null;
  shipping: {
    id: string;
    ci_no: string | null;
    vessel: string | null;
    voyage: string | null;
    etd: string | null;
    eta: string | null;
    status: string;
  } | null;
}

// Change Request
export interface ChangeRequest {
  id: string;
  requested_date: string;
  reason: string | null;
  status: string;
  requested_by: string | null;
  responded_by: string | null;
  response_text: string | null;
  created_at: string | null;
  updated_at: string | null;
}

// Saelim List
export interface SaelimDeliveryListItem {
  id: string;
  delivery_date: string | null;
  created_at: string | null;
  pi: { id: string; pi_no: string } | null;
  shipping: {
    id: string;
    ci_no: string | null;
    vessel: string | null;
    voyage: string | null;
    eta: string | null;
  } | null;
}

// Saelim Detail
export interface SaelimDeliveryDetail {
  id: string;
  delivery_date: string | null;
  pi_id: string | null;
  shipping_doc_id: string | null;
  created_at: string | null;
  pi: { id: string; pi_no: string } | null;
  shipping: {
    id: string;
    ci_no: string | null;
    vessel: string | null;
    voyage: string | null;
    eta: string | null;
  } | null;
}
```

---

## 11. Summary of Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `app/loaders/delivery.server.ts` | GV delivery list loader |
| `app/loaders/delivery.$id.server.ts` | GV delivery detail loader + action |
| `app/loaders/saelim.delivery.server.ts` | Saelim delivery list loader |
| `app/loaders/saelim.delivery.$id.server.ts` | Saelim delivery detail + change request action |
| `app/loaders/delivery.schema.ts` | Zod validation schemas |
| `app/types/delivery.ts` | TypeScript types |

### Files to Modify
| File | Change |
|------|--------|
| `app/lib/order-sync.server.ts` | Add `unlinkDeliveryFromOrder()` |
| `app/types/content.ts` | Add `"delivery"` to `ContentType` union |
| `app/lib/content.server.ts` | Add `delivery: "deliveries"` to `PARENT_TABLE_MAP` |
| `app/routes.ts` | Add `delivery/:id` route + `saelim/delivery/:id` route |

### Migration
| Migration | Purpose |
|-----------|---------|
| `phase8_delivery_rls` | RLS policies for `deliveries` and `delivery_change_requests` |

---

## 12. Edge Cases and Guards

1. **Double approval**: The `approve_request` action checks `status === "pending"` before proceeding. If two GV users click approve simultaneously, the second will get a "cannot process" error.

2. **Pending request duplicate**: Saelim `submit_change_request` checks for existing pending request with `count` query before insert. RLS alone does not prevent this -- application-level guard is required.

3. **Delivery without PI/Shipping**: Deliveries are created when PI is created (Phase 3 auto-creation). They always have `pi_id`. The `shipping_doc_id` may be null if the shipping document hasn't been created yet.

4. **Soft-deleted delivery with pending requests**: When a delivery is soft-deleted, pending change requests are left as-is (orphaned but harmless). The GV detail page won't be accessible anymore, and the Saelim page won't show the delivery due to `deleted_at IS NULL` filter.

5. **Order sync failure**: `syncDeliveryDateToOrder` is fire-and-forget (non-blocking). If it fails, the delivery date is still updated correctly on the delivery record. The order will be slightly out of sync until manually corrected or next page load.

6. **Content type "delivery"**: Must be added before deployment or the `loadContent` / `handleContentAction` calls will fail with a missing table mapping error.
