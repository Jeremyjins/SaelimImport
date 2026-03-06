# Phase 6: Order Management - Architect Notes

## 1. Overview

Orders are the **aggregation hub** of the Saelim import management system. Unlike PO, PI, and Shipping which are standalone documents with their own CRUD lifecycles, an Order is a **management view** that links all documents for a single trade transaction and tracks cross-cutting dates and statuses.

### Key Characteristics

1. **Not a document** -- an Order has no "content" of its own (no line items, no amounts, no orgs). It is a join table with metadata fields (dates, saelim_no, customs_fee_received).
2. **Aggregation point** -- pulls together PO, PI, Shipping, Customs, Delivery into one row.
3. **Date tracker** -- tracks advice_date, arrival_date, delivery_date, and customs_fee_received as fields that do not exist on any child document.
4. **CY Free Time calculator** -- derived from ETA (shipping) and customs_date (customs), surfaced as a visual indicator.
5. **GV-only** -- Saelim users do not access orders (they only see deliveries).

### Existing Schema

```
orders:
  id: uuid PK
  po_id: uuid FK -> purchase_orders
  pi_id: uuid FK -> proforma_invoices
  shipping_doc_id: uuid FK -> shipping_documents
  customs_id: uuid FK -> customs
  delivery_id: uuid FK -> deliveries
  saelim_no: string (Saelim order number, manually entered)
  advice_date: date
  arrival_date: date
  delivery_date: date
  customs_fee_received: boolean
  created_by: uuid
  created_at, updated_at, deleted_at: timestamps
```

All FK columns are nullable. An order can exist with only a PO link initially, and other links are added as the trade progresses.

---

## 2. Implementation Sub-phases

### Phase 6-A: Order List + Create

**Scope:**
- Order list page with filtering and search
- Create order via dialog/action (select PO, auto-cascade linked documents)
- Display linked document numbers and key dates in the list
- Saelim number (saelim_no) manual entry

**Files to create:**
- `app/types/order.ts`
- `app/loaders/orders.server.ts` (list loader + create action)
- `app/components/orders/order-create-dialog.tsx` (dialog with PO selector)
- `app/components/orders/order-list-table.tsx` (desktop table)
- `app/components/orders/order-list-card.tsx` (mobile cards)

**Files to modify:**
- `app/routes/_layout.orders.tsx` (replace placeholder with list page)
- `app/routes.ts` (add `orders/:id` route)

### Phase 6-B: Order Detail (Dashboard + Inline Edit)

**Scope:**
- Order detail page as a document dashboard
- Linked documents section with navigation links to each module
- Inline editable fields: saelim_no, advice_date, arrival_date, delivery_date, customs_fee_received
- CY Free Time calculation and visual indicators
- Manual document linking/unlinking (for cases where auto-cascade misses)
- Content system integration (notes/attachments)

**Files to create:**
- `app/loaders/orders.$id.server.ts` (detail loader + update actions)
- `app/components/orders/order-detail-info.tsx` (order metadata cards)
- `app/components/orders/order-linked-docs.tsx` (linked documents dashboard)
- `app/components/orders/order-cy-indicator.tsx` (CY free time badge)
- `app/routes/_layout.orders.$id.tsx` (detail page)

**Files to modify:**
- `app/routes.ts` (already added in 6-A)

### Phase 6-C: Cross-Module Sync (Optional, deferred)

**Scope:**
- When Shipping doc is created/updated with a PI that has an order, sync shipping_doc_id + dates to the order
- When Customs is created/updated, sync customs_id + customs_date to the order
- When Delivery date changes, sync delivery_date to the order

**Why optional:** Sync can be done manually via the order detail page until Customs and Delivery modules are implemented (Phases 7-8). Auto-sync is most valuable once all modules exist.

**Files to modify (when implemented):**
- `app/loaders/shipping.$id.server.ts` (add order sync on create/update)
- `app/loaders/customs.$id.server.ts` (future -- add order sync)
- `app/loaders/delivery.$id.server.ts` (future -- add order sync)

---

## 3. Data Flow & Aggregation Strategy

### 3.1 Order Creation: Auto-Cascade Linking

When the user selects a PO to create an order:

```
User selects PO
  -> Query: PI where po_id = selected_po.id AND deleted_at IS NULL
     -> If exactly 1 PI found: auto-link pi_id
     -> If 0 or 2+ PIs: leave pi_id null (user links manually later)
  -> If PI linked:
     -> Query: shipping_documents where pi_id = linked_pi.id AND deleted_at IS NULL
        -> If exactly 1 found: auto-link shipping_doc_id
        -> If 0 or 2+ found: leave null
     -> Query: deliveries where pi_id = linked_pi.id AND deleted_at IS NULL
        -> If exactly 1 found: auto-link delivery_id
        -> If 0 or 2+ found: leave null
  -> If Shipping linked:
     -> Query: customs where shipping_doc_id = linked_shipping.id AND deleted_at IS NULL
        -> If exactly 1 found: auto-link customs_id
        -> If 0 or 2+ found: leave null
```

**Why "exactly 1" rule:** A PO can have multiple PIs (split orders), and a PI can have multiple shipping docs (partial shipments). In these 1:N cases, the system cannot guess which document the user intends. Auto-linking only fires for unambiguous 1:1 relationships.

**Alternative considered: Manual linking only.** Rejected because in the typical case (1 PO -> 1 PI -> 1 Shipping), auto-cascade saves significant data entry. The "exactly 1" rule handles both simple and complex cases correctly.

### 3.2 Cascade Linking Implementation

```typescript
async function cascadeLink(supabase, poId: string) {
  const result: Partial<OrderInsert> = { po_id: poId };

  // Step 1: Find linked PI
  const { data: pis } = await supabase
    .from("proforma_invoices")
    .select("id")
    .eq("po_id", poId)
    .is("deleted_at", null);

  if (pis?.length === 1) {
    result.pi_id = pis[0].id;

    // Step 2: Find linked Shipping & Delivery (parallel)
    const [{ data: ships }, { data: delivs }] = await Promise.all([
      supabase
        .from("shipping_documents")
        .select("id")
        .eq("pi_id", result.pi_id)
        .is("deleted_at", null),
      supabase
        .from("deliveries")
        .select("id")
        .eq("pi_id", result.pi_id)
        .is("deleted_at", null),
    ]);

    if (ships?.length === 1) {
      result.shipping_doc_id = ships[0].id;

      // Step 3: Find linked Customs
      const { data: customs } = await supabase
        .from("customs")
        .select("id")
        .eq("shipping_doc_id", result.shipping_doc_id)
        .is("deleted_at", null);

      if (customs?.length === 1) {
        result.customs_id = customs[0].id;
      }
    }
    if (delivs?.length === 1) {
      result.delivery_id = delivs[0].id;
    }
  }

  return result;
}
```

### 3.3 Saelim Number (saelim_no)

**Manual entry, not auto-generated.** The saelim_no is Saelim's internal order reference number. It comes from the Saelim side and does not follow the GVXX format. The user types it in directly on the order create dialog or edits it later on the detail page.

Format example: `SL-2603-001`, `24-0315`, or any format Saelim uses. No validation beyond max length (50 chars).

### 3.4 Duplicate Prevention

An order should not link to a PO that already has an order. On create:

```typescript
const { count } = await supabase
  .from("orders")
  .select("id", { count: "exact", head: true })
  .eq("po_id", selectedPoId)
  .is("deleted_at", null);

if (count && count > 0) {
  return data({ success: false, error: "이미 오더가 존재하는 PO입니다." }, ...);
}
```

---

## 4. Route Structure

```
/orders              -> Order List (replace current placeholder)
/orders/:id          -> Order Detail (linked docs dashboard + inline editing)
```

**No /orders/new page.** Order creation is a dialog on the list page (select PO -> auto-cascade -> create). This is simpler than a full form page since orders have very few own fields.

**No /orders/:id/edit page.** All order-specific fields (saelim_no, advice_date, arrival_date, delivery_date, customs_fee_received) are edited inline on the detail page. Document links are managed via link/unlink actions on the detail page.

### routes.ts additions:
```typescript
route("orders/:id", "routes/_layout.orders.$id.tsx"),
```

---

## 5. New/Modified Files List

### Types
| File | Action | Owner | Purpose |
|------|--------|-------|---------|
| `app/types/order.ts` | Create | 6-A | OrderListItem, OrderDetail, OrderInsert types |

### Loaders
| File | Action | Owner | Purpose |
|------|--------|-------|---------|
| `app/loaders/orders.server.ts` | Create | 6-A | List loader + create action + delete action |
| `app/loaders/orders.$id.server.ts` | Create | 6-B | Detail loader + update/link/unlink actions |

### Components
| File | Action | Owner | Purpose |
|------|--------|-------|---------|
| `app/components/orders/order-create-dialog.tsx` | Create | 6-A | PO selector dialog for order creation |
| `app/components/orders/order-list-table.tsx` | Create | 6-A | Desktop table view |
| `app/components/orders/order-list-card.tsx` | Create | 6-A | Mobile card view |
| `app/components/orders/order-detail-info.tsx` | Create | 6-B | Metadata cards (dates, saelim_no, status) |
| `app/components/orders/order-linked-docs.tsx` | Create | 6-B | Linked documents dashboard section |
| `app/components/orders/order-cy-indicator.tsx` | Create | 6-B | CY free time badge component |

### Routes
| File | Action | Owner | Purpose |
|------|--------|-------|---------|
| `app/routes/_layout.orders.tsx` | Modify | 6-A | Replace placeholder with list page |
| `app/routes/_layout.orders.$id.tsx` | Create | 6-B | Order detail page |
| `app/routes.ts` | Modify | 6-A | Add `orders/:id` route |

---

## 6. Cross-Module Sync Design

### 6.1 Data Sources per Field

| Order Field | Source Module | Source Field | Sync Timing |
|-------------|-------------|-------------|-------------|
| `po_id` | Order | (set on create) | Manual |
| `pi_id` | Order | (auto-cascade or manual link) | On create / manual |
| `shipping_doc_id` | Order | (auto-cascade or manual link) | On create / manual |
| `customs_id` | Order | (auto-cascade or manual link) | On create / manual |
| `delivery_id` | Order | (auto-cascade or manual link) | On create / manual |
| `saelim_no` | Order | (user input) | Manual inline edit |
| `advice_date` | Order | (user input) | Manual inline edit |
| `arrival_date` | Shipping | `eta` (copied) or manual override | Auto-sync or manual |
| `delivery_date` | Delivery | `delivery_date` (copied) or manual | Auto-sync or manual |
| `customs_fee_received` | Order | (user input, boolean) | Manual inline edit |

### 6.2 Sync Direction: Child -> Order (Read-through)

Rather than actively syncing data from child modules into order columns, the order detail loader **joins** the linked documents and reads their current values at query time. This is simpler and always up-to-date.

Fields that are truly order-only (saelim_no, advice_date, customs_fee_received) live on the orders table. Fields that duplicate child data (arrival_date from shipping.eta, delivery_date from deliveries.delivery_date) can follow one of two strategies:

**Option A: Read-through joins (recommended for Phase 6).**
The order detail loader joins PO, PI, Shipping, Customs, Delivery and reads dates directly from the source tables. The `arrival_date` and `delivery_date` columns on orders serve as **manual overrides** when the source data is not yet available or needs correction.

```typescript
// Order detail loader query
const { data: order } = await supabase
  .from("orders")
  .select(`
    id, saelim_no, advice_date, arrival_date, delivery_date, customs_fee_received,
    created_at, updated_at,
    po:purchase_orders!po_id(id, po_no, po_date, status, amount, currency),
    pi:proforma_invoices!pi_id(id, pi_no, pi_date, status, amount, currency),
    shipping:shipping_documents!shipping_doc_id(id, ci_no, ci_date, status, vessel, voyage, etd, eta),
    customs:customs!customs_id(id, customs_no, customs_date, fee_received),
    delivery:deliveries!delivery_id(id, delivery_date)
  `)
  .eq("id", orderId)
  .is("deleted_at", null)
  .single();
```

Display logic for arrival_date:
```
if order.arrival_date exists -> show order.arrival_date (manual override)
else if order.shipping?.eta exists -> show shipping.eta (auto-derived)
else -> show "미정"
```

**Option B: Write-through sync (deferred to Phase 6-C).**
When a shipping doc or delivery is updated, also update the corresponding order columns. This is useful for list-level filtering/sorting by arrival_date without needing joins, but adds complexity to every child module's update action.

**Decision: Start with Option A (read-through).** Add Option B write-through sync in Phase 6-C or later if list performance requires it.

### 6.3 Future Auto-Sync Points (Phase 6-C)

When Customs and Delivery modules are implemented:

**Shipping -> Order sync (on shipping create/update):**
```typescript
// After shipping doc create/update, find any order that references this shipping doc
await supabase
  .from("orders")
  .update({ arrival_date: shipping.eta, updated_at: new Date().toISOString() })
  .eq("shipping_doc_id", shippingDocId)
  .is("deleted_at", null);
```

**Customs -> Order sync (on customs create):**
```typescript
// After customs record create, find order via shipping_doc_id chain
const { data: order } = await supabase
  .from("orders")
  .select("id")
  .eq("shipping_doc_id", customs.shipping_doc_id)
  .is("deleted_at", null)
  .single();

if (order) {
  await supabase
    .from("orders")
    .update({ customs_id: customs.id })
    .eq("id", order.id);
}
```

**Delivery -> Order sync (on delivery_date update):**
```typescript
await supabase
  .from("orders")
  .update({ delivery_date: delivery.delivery_date })
  .eq("delivery_id", deliveryId)
  .is("deleted_at", null);
```

---

## 7. CY Free Time Calculation

### 7.1 Business Rule

When a container arrives at the CY (Container Yard), the shipper gets **14 calendar days of free storage**. After 14 days, demurrage/detention fees apply.

```
CY Free Time = customs_date - arrival_date (or ETA)
If CY Free Time > 14 days -> WARNING (fee applies)
```

### 7.2 Data Sources

- **CY arrival date**: `order.arrival_date` or `shipping.eta` (whichever is available, order field takes priority as manual override)
- **Customs clearance date**: `customs.customs_date` (from joined customs record)
- **Free time period**: 14 days (hardcoded constant, could be configurable later)

### 7.3 Calculation Logic

```typescript
function calcCYFreeTime(arrivalDate: string | null, customsDate: string | null) {
  if (!arrivalDate) return null; // Cannot calculate without arrival

  const arrival = new Date(arrivalDate);
  const today = new Date();

  if (customsDate) {
    // Already cleared customs
    const customs = new Date(customsDate);
    const daysInCY = Math.ceil((customs.getTime() - arrival.getTime()) / (1000 * 60 * 60 * 24));
    return { days: daysInCY, status: daysInCY > 14 ? "overdue" : "ok", cleared: true };
  }

  // Not yet cleared -- calculate from today
  const daysInCY = Math.ceil((today.getTime() - arrival.getTime()) / (1000 * 60 * 60 * 24));

  if (daysInCY < 0) {
    return { days: Math.abs(daysInCY), status: "pending", cleared: false }; // Not arrived yet
  }
  if (daysInCY <= 10) {
    return { days: daysInCY, status: "ok", cleared: false };
  }
  if (daysInCY <= 14) {
    return { days: daysInCY, status: "warning", cleared: false }; // Approaching deadline
  }
  return { days: daysInCY, status: "overdue", cleared: false }; // Fee applies
}
```

### 7.4 UI Indicators

| Status | Badge Color | Label Example |
|--------|-------------|---------------|
| `pending` | Gray | `D-3 도착예정` |
| `ok` | Green | `CY 5일 (14일 중)` |
| `warning` | Yellow/Amber | `CY 12일 (2일 남음)` |
| `overdue` | Red | `CY 18일 (4일 초과)` |
| `cleared` (ok) | Blue | `CY 8일 통관완료` |
| `cleared` (overdue) | Red/Blue | `CY 16일 통관완료 (초과)` |

Component: `order-cy-indicator.tsx` -- a small Badge/span that renders the appropriate color and text. Used on both the list page (compact) and detail page (with more detail).

### 7.5 List Page Integration

The order list shows a CY status column. Since we use read-through joins, the list loader needs to join shipping.eta and customs.customs_date:

```typescript
// List loader query
const { data: orders } = await supabase
  .from("orders")
  .select(`
    id, saelim_no, advice_date, arrival_date, delivery_date,
    customs_fee_received, created_at, updated_at,
    po:purchase_orders!po_id(po_no, status),
    pi:proforma_invoices!pi_id(pi_no, status),
    shipping:shipping_documents!shipping_doc_id(ci_no, vessel, eta),
    customs:customs!customs_id(customs_no, customs_date)
  `)
  .is("deleted_at", null)
  .order("created_at", { ascending: false });
```

CY calculation runs in the component (client-side), not in the loader. This keeps it simple and allows real-time "today" comparison.

---

## 8. Key Architectural Decisions

### D1: Order Create via Dialog, Not Full Page

**Decision:** Dialog on the list page with PO selector.

**Rationale:** An order has only 2 user-entered fields at creation time: PO selection and saelim_no (optional). A full page with header/form/navigation is overkill. A dialog keeps the user in context and reduces navigation. The auto-cascade logic runs server-side in the action.

### D2: Inline Editing on Detail Page, No Dedicated Edit Page

**Decision:** All order-specific fields are edited inline on the detail page.

**Rationale:** Order-specific fields (saelim_no, advice_date, arrival_date, delivery_date, customs_fee_received) are simple scalars. They do not have the complexity of PO/PI forms (no line items, no org selectors). Inline editing with fetcher.submit is the right pattern.

**Implementation approach:** Each editable field uses a click-to-edit pattern or a persistent form section. On blur/submit, a fetcher POSTs to the detail action with `_action: "update_field"` and the field name/value.

```typescript
// Action handler in orders.$id.server.ts
case "update_field": {
  const field = formData.get("field") as string;
  const value = formData.get("value") as string;

  // Whitelist allowed fields
  const EDITABLE_FIELDS = ["saelim_no", "advice_date", "arrival_date", "delivery_date", "customs_fee_received"];
  if (!EDITABLE_FIELDS.includes(field)) {
    return data({ success: false, error: "수정할 수 없는 필드입니다." }, ...);
  }

  // Type-specific parsing
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (field === "customs_fee_received") {
    updateData[field] = value === "true";
  } else if (["advice_date", "arrival_date", "delivery_date"].includes(field)) {
    updateData[field] = value || null;
  } else {
    updateData[field] = value || null;
  }

  await supabase.from("orders").update(updateData).eq("id", orderId);
  return data({ success: true });
}
```

### D3: Read-Through Joins Over Write-Through Sync

**Decision:** Order detail/list loads data from joined child tables rather than copying data into order columns.

**Rationale:**
- Simpler implementation (no sync code in child module actions)
- Always shows current data (no stale copies)
- The orders table remains thin (only order-specific fields)
- Performance is acceptable -- the join query involves at most 5 left joins on primary keys (indexed)

**Trade-off:** List-level sorting/filtering by derived fields (e.g., "sort by ETA") requires the join in the list query too. This is acceptable for the expected data volume (hundreds, not thousands of orders).

### D4: Manual Document Linking/Unlinking on Detail Page

**Decision:** The detail page allows manually linking/unlinking PI, Shipping, Customs, and Delivery.

**Rationale:** Auto-cascade handles the simple case (1:1 chains). But when a PO has multiple PIs, or when the user needs to correct a wrong link, manual control is needed.

**UI pattern:** Each linked document slot shows either:
- A linked document (number + link + unlink button)
- An empty slot with a "Link" button that opens a search/select dropdown

**Actions:**
- `_action: "link_document"` with `doc_type` (pi/shipping/customs/delivery) and `doc_id`
- `_action: "unlink_document"` with `doc_type`

### D5: Soft Delete Only

**Decision:** Orders use soft delete (`deleted_at` timestamp), same as all other modules.

**Rationale:** Consistency with PO/PI/Shipping patterns. No cascading side effects needed -- unlinking is NOT required on order delete since the child documents exist independently.

---

## 9. Type Definitions

```typescript
// app/types/order.ts

// ── List view (compact, with joined doc numbers) ────────────

export interface OrderListItem {
  id: string;
  saelim_no: string | null;
  advice_date: string | null;
  arrival_date: string | null;
  delivery_date: string | null;
  customs_fee_received: boolean | null;
  created_at: string;
  updated_at: string;
  po: { po_no: string; status: string } | null;
  pi: { pi_no: string; status: string } | null;
  shipping: { ci_no: string; vessel: string | null; eta: string | null } | null;
  customs: { customs_no: string | null; customs_date: string | null } | null;
}

// ── Detail view (full joins) ────────────────────────────────

export interface OrderDetail {
  id: string;
  saelim_no: string | null;
  advice_date: string | null;
  arrival_date: string | null;
  delivery_date: string | null;
  customs_fee_received: boolean | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  po: {
    id: string;
    po_no: string;
    po_date: string;
    status: string;
    amount: number | null;
    currency: string | null;
  } | null;
  pi: {
    id: string;
    pi_no: string;
    pi_date: string;
    status: string;
    amount: number | null;
    currency: string | null;
  } | null;
  shipping: {
    id: string;
    ci_no: string;
    ci_date: string;
    status: string;
    vessel: string | null;
    voyage: string | null;
    etd: string | null;
    eta: string | null;
  } | null;
  customs: {
    id: string;
    customs_no: string | null;
    customs_date: string | null;
    fee_received: boolean | null;
  } | null;
  delivery: {
    id: string;
    delivery_date: string | null;
  } | null;
}

// ── CY Free Time ────────────────────────────────────────────

export type CYStatus = "pending" | "ok" | "warning" | "overdue";

export interface CYFreeTimeResult {
  days: number;
  status: CYStatus;
  cleared: boolean;
}
```

---

## 10. Order List Page Design

### Layout

Same pattern as PO/PI/Shipping list pages:
- Header with title "오더관리" + "오더 생성" button (opens dialog)
- No status tabs (orders do not have a process/complete status)
- Search by: saelim_no, PO number, PI number, CI number
- Sort by: created_at (default), advice_date, arrival_date

### Desktop Table Columns

| Saelim No | PO No | PI No | CI No | Vessel | Advice | Arrival/ETA | CY Status | Delivery | Fee |
|-----------|-------|-------|-------|--------|--------|-------------|-----------|----------|-----|

- **Saelim No**: `saelim_no` or "-" if null
- **PO/PI/CI No**: Linked document numbers, each as a Link to the detail page, or "-" if not linked
- **Vessel**: From joined shipping document
- **Advice**: `advice_date` formatted
- **Arrival/ETA**: `arrival_date` or `shipping.eta`, formatted
- **CY Status**: CYFreeTime badge (color-coded)
- **Delivery**: `delivery_date` formatted
- **Fee**: `customs_fee_received` as checkbox/icon (green check / gray dash)

### Mobile Card Layout

- Primary: Saelim No (or PO No if no Saelim No) + CY Status badge
- Secondary row: PO No -> PI No -> CI No (arrow chain)
- Tertiary row: Vessel, ETA, Delivery Date

### Create Dialog

Simple dialog with:
1. **PO selector** (required): Dropdown of POs that do not already have an order. Shows `po_no` + `po_date`.
2. **Saelim No** (optional): Text input, max 50 chars.
3. **Advice Date** (optional): Date picker.
4. Submit button: "오더 생성"

On submit: server action runs auto-cascade, creates order, returns to list.

---

## 11. Order Detail Page Design

### Page Structure

```
Header: "오더 #{saelim_no || po.po_no}" + dropdown menu (delete)

Section 1: Order Info Card (inline editable fields)
  - Saelim No (click-to-edit text)
  - Advice Date (date picker)
  - Arrival Date (date picker, with ETA hint from shipping)
  - Delivery Date (date picker)
  - Customs Fee Received (toggle switch)
  - CY Free Time indicator (prominent, color-coded)

Section 2: Linked Documents Dashboard
  - 5 cards in a grid (2 cols on desktop, 1 col on mobile)
  - Each card: Document type icon + number + status badge + key info
  - Card for: PO, PI, Shipping, Customs, Delivery
  - Each card links to the respective detail page
  - Empty cards show "Not linked" + "Link" button

Section 3: Content (notes/attachments, same pattern as PO/PI/Shipping)
```

### Linked Document Cards Detail

**PO Card:**
- PO No (link to `/po/:id`)
- PO Date
- Amount + Currency
- Status badge

**PI Card:**
- PI No (link to `/pi/:id`)
- PI Date
- Amount + Currency
- Status badge

**Shipping Card:**
- CI No (link to `/shipping/:id`)
- Vessel + Voyage
- ETD -> ETA
- Status badge

**Customs Card:**
- Customs No (link to `/customs/:id`, greyed out if not implemented)
- Customs Date
- Fee breakdown summary (from customs.customs_fee JSONB)

**Delivery Card:**
- Delivery Date (link to `/delivery/:id`, greyed out if not implemented)
- Status

### Link/Unlink Actions

Each card that is empty shows a select dropdown:
- For PI: shows PIs where `po_id = order.po_id` (scoped to same PO)
- For Shipping: shows shipping docs where `pi_id = order.pi_id` (scoped to same PI)
- For Customs: shows customs where `shipping_doc_id = order.shipping_doc_id`
- For Delivery: shows deliveries where `pi_id = order.pi_id`

Each linked card has an "unlink" button (small X icon) that clears the FK.

---

## 12. Order List Loader Query

```typescript
// Loader for /orders
export async function loader({ request, context }: LoaderArgs) {
  const { supabase, responseHeaders } = await requireGVUser(request, context);

  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      "id, saelim_no, advice_date, arrival_date, delivery_date, " +
      "customs_fee_received, created_at, updated_at, " +
      "po:purchase_orders!po_id(po_no, status), " +
      "pi:proforma_invoices!pi_id(pi_no, status), " +
      "shipping:shipping_documents!shipping_doc_id(ci_no, vessel, eta), " +
      "customs:customs!customs_id(customs_no, customs_date)"
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

---

## 13. Trade-offs & Decisions Summary

### T1: Dialog Create vs. Full Page
**Decision:** Dialog.
**Trade-off:** Less screen space for the form, but order creation has only 3 fields. A full page would feel wastefully empty.

### T2: Inline Edit vs. Edit Page
**Decision:** Inline edit on detail page.
**Trade-off:** More complex detail page component (needs fetcher per editable field), but avoids the overhead of a separate edit page + form for 5 simple fields.

### T3: Read-through Joins vs. Denormalized Columns
**Decision:** Read-through joins for Phase 6.
**Trade-off:** Slightly more complex list query (5 left joins), but data is always fresh. If list performance becomes an issue with hundreds of orders, add denormalized columns and write-through sync in a future phase.

### T4: Auto-Cascade "Exactly 1" Rule vs. "Always First" or "Always Manual"
**Decision:** "Exactly 1" auto-link rule.
**Trade-off:** Does not handle 1:N cases automatically, but avoids wrong guesses. The typical business case is 1:1 chains, so this covers 90%+ of orders. Manual linking covers the rest.

### T5: CY Calculation Client-Side vs. Server-Side
**Decision:** Client-side (in component).
**Trade-off:** The "days from today" calculation needs the current date, which changes daily. Computing it client-side ensures it is always accurate without server cache issues. The downside is that server-rendered HTML may show stale values until hydration, but this is acceptable for an internal tool.

---

## 14. Implementation Order

### Phase 6-A: Order List + Create

1. Create `app/types/order.ts` (types)
2. Create `app/loaders/orders.server.ts` (list loader + create action + delete action)
3. Create `app/components/orders/order-create-dialog.tsx` (PO selector dialog)
4. Create `app/components/orders/order-list-table.tsx` (desktop table)
5. Create `app/components/orders/order-list-card.tsx` (mobile card)
6. Create `app/components/orders/order-cy-indicator.tsx` (CY badge, needed for list)
7. Replace `app/routes/_layout.orders.tsx` (list page implementation)
8. Update `app/routes.ts` (add `orders/:id` route)

### Phase 6-B: Order Detail

1. Create `app/loaders/orders.$id.server.ts` (detail loader + update/link/unlink actions)
2. Create `app/components/orders/order-detail-info.tsx` (inline editable fields card)
3. Create `app/components/orders/order-linked-docs.tsx` (5-card document dashboard)
4. Create `app/routes/_layout.orders.$id.tsx` (detail page)
5. Integrate content system (loadContent/handleContentAction in loader/action)

### Phase 6-C: Cross-Module Sync (deferred)

1. Add order sync to `app/loaders/shipping.$id.server.ts` (on update: sync eta -> arrival_date)
2. Add order sync to future `app/loaders/customs.$id.server.ts` (on create: link customs_id)
3. Add order sync to future `app/loaders/delivery.$id.server.ts` (on update: sync delivery_date)

---

## 15. Korean Label Reference

| English | Korean Label |
|---------|-------------|
| Order Management | 오더관리 |
| Create Order | 오더 생성 |
| Order Detail | 오더 상세 |
| Saelim No | 세림 발주번호 |
| Advice Date | 어드바이스 일자 |
| Arrival Date | 도착일 |
| Delivery Date | 납품일 |
| Customs Fee Received | 통관비 수령 |
| CY Free Time | CY 프리타임 |
| Linked Documents | 연결 서류 |
| Link Document | 서류 연결 |
| Unlink | 연결 해제 |
| Purchase Order | 구매발주서 (PO) |
| Proforma Invoice | 견적송장 (PI) |
| Shipping Document | 선적서류 |
| Customs | 통관 |
| Delivery | 납품 |
| Not Linked | 미연결 |
| Fee Overdue | 프리타임 초과 |
| Days Remaining | 일 남음 |
| Days Exceeded | 일 초과 |
| Customs Cleared | 통관완료 |

---

## 16. Edge Cases & Validation Notes

1. **PO with no PI:** Valid. Order can exist with only PO linked. The user creates the PI later and links it manually or through auto-cascade when the PI is created referencing that PO.

2. **Multiple PIs for one PO:** Auto-cascade skips PI linking (leaves null). User must manually select which PI to link on the order detail page.

3. **Order delete does NOT unlink child documents.** The order is just a hub; deleting it does not affect PO, PI, Shipping, Customs, or Delivery records.

4. **Duplicate order for same PO:** Prevented by check in the create action (query existing active orders with same po_id).

5. **Customs/Delivery not yet implemented:** The linked document cards for Customs and Delivery render in a "disabled" state. The link/unlink actions still work at the DB level (the FK columns exist), but navigation to `/customs/:id` and `/delivery/:id` leads to placeholder pages.

6. **CY calculation without ETA:** If neither `arrival_date` nor `shipping.eta` is available, the CY indicator shows nothing (or "미정"). No false warnings.

7. **CY calculation before arrival:** If ETA is in the future, show `D-N 도착예정` in gray. No warning until the container actually arrives (days >= 0).

8. **saelim_no uniqueness:** Not enforced at DB level (no unique constraint in current schema). If needed, add a check in the update action. For now, allow duplicates since the format is not standardized.

---

## 17. RLS Considerations

Orders follow the same RLS pattern as other modules:
- **GV users (org_type = 'seller'):** Full CRUD on orders table
- **Saelim users (org_type = 'buyer'):** No access to orders table (they use the delivery portal)

Since the orders table already exists in the schema, RLS policies should already be in place or need to be added:

```sql
-- GV users: full access
CREATE POLICY "gv_orders_all" ON orders
  FOR ALL
  USING (get_user_org_type() = 'seller')
  WITH CHECK (get_user_org_type() = 'seller');
```

Verify this exists before Phase 6-A implementation. If missing, add via Supabase migration.

---

## 18. Performance Considerations

### List Query with 5 Left Joins

The orders list query joins 4 tables (PO, PI, Shipping, Customs). All joins are on indexed FK columns (uuid primary keys), so performance should be fine for the expected data volume (< 1000 orders).

If the list grows beyond ~5000 rows, consider:
1. Pagination (limit/offset or cursor-based)
2. Denormalized summary columns on orders table (po_no, pi_no, ci_no cached)

For Phase 6-A, no pagination is needed. Add it later if the list grows.

### Detail Query

The detail query joins the same 4 tables plus delivery (5 total). Each join returns a single row (all FKs point to specific records). This is efficient.

---

## 19. Schema Additions

No schema changes needed for Phase 6. The `orders` table already has all required columns:
- `id`, `po_id`, `pi_id`, `shipping_doc_id`, `customs_id`, `delivery_id`
- `saelim_no`, `advice_date`, `arrival_date`, `delivery_date`, `customs_fee_received`
- `created_by`, `created_at`, `updated_at`, `deleted_at`

Verify RLS policies exist (see section 17).
