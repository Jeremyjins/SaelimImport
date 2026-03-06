# Phase 5: Shipping Documents - Architect Notes

## 1. Overview

Shipping Documents represent the CI (Commercial Invoice) and PL (Packing List) pair generated after a PI is confirmed. They capture the physical shipping details: vessel, voyage, ETD/ETA, container info, and actual shipped quantities. A shipping document optionally references a PI and has zero or more Stuffing Lists as children.

### Key Differences from PO/PI Modules

1. **Dual document numbers**: `ci_no` + `pl_no` always generated together (CI and PL are two views of the same shipment).
2. **Shipping-specific fields**: vessel, voyage, etd, eta, ship_date, gross_weight, net_weight, package_no.
3. **Child entity**: Stuffing Lists (1:N) with container/seal/roll details -- this is new; PO and PI have no child entities.
4. **Weight aggregation**: Stuffing list roll details sum up to shipping doc gross_weight / net_weight.
5. **Downstream links**: Shipping doc links to deliveries (update `deliveries.shipping_doc_id`) and future Order sync.
6. **Org role mapping**: `shipper_id` = GV (type='seller'), `consignee_id` = Saelim (type='buyer') -- same org types as PI's supplier/buyer.

---

## 2. Implementation Sub-phases

### Phase 5-A: List + Create

**Scope:**
- Shipping document list page with status tabs (all/process/complete)
- Search by ci_no, pl_no, and linked PI number
- Create page with PI reference prefill (`?from_pi=uuid`)
- Dual document number generation (CI + PL)
- Line items editor (reuse pattern from PO/PI)
- Delivery link: on create, update existing delivery's `shipping_doc_id`

**Files to create:**
- `app/types/shipping.ts`
- `app/loaders/shipping.schema.ts`
- `app/loaders/shipping.server.ts` (list loader + form loader + create action)
- `app/components/shipping/shipping-form.tsx`
- `app/components/shipping/shipping-line-items.tsx`
- `app/routes/_layout.shipping.new.tsx`

**Files to modify:**
- `app/routes/_layout.shipping.tsx` (replace placeholder with list page)
- `app/routes.ts` (add shipping/new, shipping/:id, shipping/:id/edit routes)

### Phase 5-B: Detail + Edit + Clone + Toggle + Delete + Cross-module Links

**Scope:**
- Detail page with shipping info cards, line items, linked PI reference, stuffing list preview
- Edit page (reuse ShippingForm with pre-filled data)
- Clone action (pi_id=null on clone, new CI/PL numbers)
- Toggle status (process/complete)
- Delete (soft delete, unlink from delivery: set `deliveries.shipping_doc_id = null`)
- PI detail page: add "shipping doc creation" dropdown menu item + linked shipping docs list
- Content system integration (notes/attachments on shipping detail)

**Files to create:**
- `app/loaders/shipping.$id.server.ts` (detail loader + edit loader + action)
- `app/components/shipping/shipping-detail-info.tsx`
- `app/components/shipping/shipping-detail-items.tsx`
- `app/routes/_layout.shipping.$id.tsx`
- `app/routes/_layout.shipping.$id.edit.tsx`

**Files to modify:**
- `app/routes/_layout.pi.$id.tsx` (add "shipping doc" dropdown + linked shipping docs card)
- `app/loaders/pi.$id.server.ts` (add linked shipping docs query in detail loader)

### Phase 5-C: Stuffing List CRUD + CSV Upload

**Scope:**
- Stuffing list section on shipping detail page (inline CRUD, not separate route)
- Add/edit/delete stuffing list entries (container + seal + rolls)
- CSV upload for roll details bulk import
- Weight aggregation: sum stuffing list rolls -> update shipping doc gross/net weight
- Roll details table with responsive mobile/desktop views

**Rationale for separate sub-phase:** Stuffing lists are a distinct child entity with their own CRUD and CSV upload logic. Keeping this separate from 5-B reduces complexity per sub-phase and allows 5-B to be shippable without stuffing list support.

**Files to create:**
- `app/components/shipping/stuffing-list-section.tsx` (main section component with add/edit/delete)
- `app/components/shipping/stuffing-list-form.tsx` (modal form for single stuffing list entry)
- `app/components/shipping/stuffing-roll-table.tsx` (roll details table within a stuffing list)
- `app/components/shipping/csv-upload-dialog.tsx` (CSV file picker + preview + import)
- `app/lib/csv-parser.ts` (client-side CSV parsing utility -- no server dependency needed)

**Files to modify:**
- `app/loaders/shipping.$id.server.ts` (add stuffing list actions: create/update/delete, CSV import, weight recalculation)
- `app/routes/_layout.shipping.$id.tsx` (add StuffingListSection component)

---

## 3. Document Number Strategy

### Current Pattern
The `generate_doc_number` RPC takes `doc_type` (e.g., 'PO', 'PI') and `ref_date`, and returns a formatted string like `GVPOYYMM-XXX` using the `document_sequences` table keyed by `(doc_prefix, doc_yymm)`.

### Shipping Document Dual Numbers

**Recommendation: Shared sequence number, separate prefixes.**

CI and PL always come in pairs for the same shipment. They should share the same sequence number to make it obvious they belong together:
- `ci_no`: `GVCI2603-001`
- `pl_no`: `GVPL2603-001`

**Implementation approach:**

Option A (recommended): Call `generate_doc_number('CI', ref_date)` once, then derive the PL number by string replacement.
```
ci_no = generate_doc_number('CI', ref_date)  -- returns GVCI2603-001
pl_no = ci_no.replace('GVCI', 'GVPL')        -- yields GVPL2603-001
```

This works because:
- The `document_sequences` table tracks by `doc_prefix` + `doc_yymm`, so CI gets its own sequence.
- PL does not need its own sequence -- it always mirrors CI.
- No DB function changes needed.

Option B (alternative): Create a new RPC `generate_shipping_doc_numbers` that returns both in one call. More correct but adds unnecessary DB complexity for a simple derivation.

**Decision: Go with Option A.** The string derivation is trivially safe since the prefix format is fixed and controlled by us. Document it clearly in the create action.

### Clone Behavior
When cloning, generate fresh CI + PL numbers using today's date (same as PO/PI clone pattern). Reset `pi_id = null`.

---

## 4. Data Flow & Module Connections

### 4.1 PI -> Shipping Reference Creation

**Trigger:** From PI detail page, user clicks "shipping doc creation" in dropdown menu.
**URL:** `/shipping/new?from_pi={pi_id}`

**Data that copies from PI:**

| PI Field | Shipping Field | Notes |
|----------|---------------|-------|
| supplier_id (GV) | shipper_id | Same org, different FK name |
| buyer_id (Saelim) | consignee_id | Same org, different FK name |
| currency | currency | Direct copy |
| payment_term | payment_term | Direct copy |
| delivery_term | delivery_term | Direct copy |
| loading_port | loading_port | Direct copy |
| discharge_port | discharge_port | Direct copy |
| details (line items) | details (line items) | Direct copy -- same structure |
| amount | amount | Recalculated from details |

**Fields that are new (not from PI):**
- ci_date (defaults to today)
- ship_date, etd, eta (user enters)
- vessel, voyage (user enters)
- gross_weight, net_weight, package_no (initially null, populated from stuffing lists)
- ref_no (optional)

### 4.2 Shipping -> Delivery Link

When a shipping document is created with a `pi_id`:
1. Look up the delivery record where `deliveries.pi_id = shipping.pi_id`
2. Update `deliveries.shipping_doc_id = shipping.id`

This is an application-level update in the create action (consistent with PI -> Delivery auto-creation pattern).

**On shipping doc delete:**
- Set `deliveries.shipping_doc_id = null` where `deliveries.shipping_doc_id = deleted_id`
- Do NOT delete the delivery itself (it belongs to the PI lifecycle)

**On shipping doc clone:**
- Do NOT link the clone to any delivery (pi_id is reset to null on clone)

### 4.3 Shipping -> Order Sync (Phase 6 - Future)

The `orders` table has `shipping_doc_id` FK. When Phase 6 is implemented:
- Creating/updating a shipping doc will sync vessel, voyage, etd, eta to the order record
- This is NOT implemented in Phase 5 -- just noted for awareness

### 4.4 Content System Integration

Same pattern as PO/PI:
- Detail loader: `loadContent(supabase, "shipping", id)` in Promise.all
- Action handler: `if (intent?.startsWith("content_")) handleContentAction(supabase, user.id, "shipping", id, ...)`
- ContentSection component rendered on detail page

---

## 5. Stuffing List Architecture

### 5.1 Data Model (Already in DB)

```
stuffing_lists:
  id: uuid (PK)
  shipping_doc_id: uuid (FK -> shipping_documents)
  sl_no: text        -- Stuffing list number (e.g., "SL-001")
  cntr_no: text      -- Container number (e.g., "TEMU1234567")
  seal_no: text      -- Seal number
  roll_no_range: text -- Summary (e.g., "1-120")
  roll_details: JSONB -- Array of roll detail objects
  created_at, updated_at
```

### 5.2 roll_details JSONB Structure

```typescript
interface StuffingRollDetail {
  roll_no: number;        // Sequential roll number (1, 2, 3, ...)
  product_name: string;   // e.g., "Glassine Paper"
  gsm: number;            // e.g., 40
  width_mm: number;       // e.g., 787
  length_m: number;       // e.g., 7000
  net_weight_kg: number;  // e.g., 220.5
  gross_weight_kg: number; // e.g., 225.0
}
```

### 5.3 Container-Level Grouping

Each stuffing list entry = one container. A shipping document can have multiple containers (multiple stuffing_lists rows). Typical scenario: 1-3 containers per shipment.

### 5.4 Weight / Package Aggregation

When stuffing lists are modified (create/update/delete), recalculate shipping document totals:

```sql
-- Aggregate from all stuffing lists for this shipping doc
UPDATE shipping_documents SET
  net_weight = (
    SELECT COALESCE(SUM((roll->>'net_weight_kg')::numeric), 0)
    FROM stuffing_lists sl,
    jsonb_array_elements(sl.roll_details) AS roll
    WHERE sl.shipping_doc_id = :id
  ),
  gross_weight = (
    SELECT COALESCE(SUM((roll->>'gross_weight_kg')::numeric), 0)
    FROM stuffing_lists sl,
    jsonb_array_elements(sl.roll_details) AS roll
    WHERE sl.shipping_doc_id = :id
  ),
  package_no = (
    SELECT COALESCE(SUM(jsonb_array_length(COALESCE(sl.roll_details, '[]'::jsonb))), 0)
    FROM stuffing_lists sl
    WHERE sl.shipping_doc_id = :id
  )
WHERE id = :id;
```

**Implementation:** Do this in the server action after any stuffing list mutation. Use a helper function `recalcWeightsFromStuffing(supabase, shippingDocId)` that:
1. Queries all stuffing lists for the shipping doc
2. Iterates roll_details in application code (simpler than complex SQL, handles edge cases)
3. Updates shipping_documents with totals

This keeps it application-level (consistent with project pattern of no DB triggers).

### 5.5 CSV Upload Format

**Expected CSV columns:**
```
roll_no,product_name,gsm,width_mm,length_m,net_weight_kg,gross_weight_kg
1,Glassine Paper,40,787,7000,220.5,225.0
2,Glassine Paper,40,787,7000,219.8,224.3
...
```

**Parsing strategy:**
- Client-side CSV parsing (no server upload needed -- parse in browser, send as JSON)
- Use a simple CSV parser utility (no heavy library needed for this format)
- Validate each row against `StuffingRollDetail` Zod schema
- Preview parsed data in dialog before confirming import
- On confirm, merge into the stuffing list's `roll_details` JSONB (replace or append -- user chooses)
- The `roll_no_range` field is auto-calculated from min/max roll_no in the array

**Why client-side:** The CSV contains no sensitive data, it is small (typically < 500 rows), and parsing in the browser avoids a server round-trip for preview. The validated data is sent as JSON in the form submission.

### 5.6 Stuffing List UI Approach

**Inline section on shipping detail page** (not a separate route):
- Collapsible card per container (stuffing list entry)
- Each card shows: SL No, Container No, Seal No, Roll Range, Roll Count, Total Net/Gross Weight
- Expand to see full roll details table
- "Add Container" button creates a new stuffing_list entry
- Edit/Delete per container via dropdown menu
- CSV upload button per container (imports rolls into that container)

**Actions handled through the shipping detail route's action handler:**
- `_action: "stuffing_create"` -- Create new stuffing list
- `_action: "stuffing_update"` -- Update existing stuffing list
- `_action: "stuffing_delete"` -- Delete stuffing list
- `_action: "stuffing_csv_import"` -- Bulk import rolls from CSV

All four trigger weight recalculation after the mutation.

---

## 6. Route Structure

```
/shipping              -> List page (status tabs, search)
/shipping/new          -> Create page (?from_pi=uuid)
/shipping/:id          -> Detail page (info + items + stuffing lists + content)
/shipping/:id/edit     -> Edit page (form pre-filled)
```

### routes.ts additions:
```typescript
route("shipping/new", "routes/_layout.shipping.new.tsx"),
route("shipping/:id", "routes/_layout.shipping.$id.tsx"),
route("shipping/:id/edit", "routes/_layout.shipping.$id.edit.tsx"),
```

Note: The existing `route("shipping", "routes/_layout.shipping.tsx")` placeholder already exists and will be replaced with the list page implementation.

---

## 7. Component Architecture

```
app/components/shipping/
  shipping-form.tsx            -- Create/Edit form (shared)
  shipping-line-items.tsx      -- Line items editor (Desktop table / Mobile card)
  shipping-detail-info.tsx     -- Detail: basic info + shipping info (2-column cards)
  shipping-detail-items.tsx    -- Detail: line items read-only table
  stuffing-list-section.tsx    -- Detail: all stuffing lists container
  stuffing-list-card.tsx       -- Single stuffing list collapsible card
  stuffing-list-form.tsx       -- Dialog for add/edit stuffing list metadata
  stuffing-roll-table.tsx      -- Roll details table within a stuffing list card
  csv-upload-dialog.tsx        -- CSV file picker + preview + confirm dialog
```

### Component Responsibility Notes

**shipping-form.tsx:**
- Two sections: (1) Document info (ci_date, shipper, consignee, currency, terms) and (2) Shipping info (vessel, voyage, ship_date, etd, eta, ports)
- Line items section (reuse ShippingLineItems component)
- Notes textarea
- No stuffing list editing here -- that is on the detail page only

**shipping-detail-info.tsx:**
- Card 1: Document Info (CI No, PL No, CI Date, Ship Date, Ref No, Status, Shipper, Consignee)
- Card 2: Shipping Info (Vessel, Voyage, ETD, ETA, Loading Port, Discharge Port)
- Card 3: Weight/Package Summary (Gross Weight, Net Weight, Package Count) -- sourced from stuffing list aggregation
- Linked PI reference (if pi_id exists, show as blue Link)

**stuffing-list-section.tsx:**
- Renders all StuffingListCard components
- "Add Container" button
- Shows total summary across all containers

---

## 8. Type Definitions

```typescript
// app/types/shipping.ts

import type { DocStatus } from "~/types/common";

// Line item structure -- identical to PO/PI (reuse from po.ts)
export interface ShippingLineItem {
  product_id: string;
  product_name: string;
  gsm: number | null;
  width_mm: number | null;
  quantity_kg: number;
  unit_price: number;
  amount: number;
}

// Full shipping document with org joins
export interface ShippingWithOrgs {
  id: string;
  ci_no: string;
  pl_no: string;
  ci_date: string;
  ship_date: string | null;
  ref_no: string | null;
  shipper_id: string;
  consignee_id: string;
  pi_id: string | null;
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
}

// List view (compact)
export interface ShippingListItem {
  id: string;
  ci_no: string;
  pl_no: string;
  ci_date: string;
  status: DocStatus;
  currency: string;
  amount: number | null;
  vessel: string | null;
  etd: string | null;
  eta: string | null;
  shipper: { name_en: string } | null;
  consignee: { name_en: string } | null;
  pi: { pi_no: string } | null;
}

// Edit form data
export interface ShippingEditData {
  id: string;
  ci_no: string;
  pl_no: string;
  ci_date: string;
  ship_date: string | null;
  ref_no: string | null;
  shipper_id: string;
  consignee_id: string;
  pi_id: string | null;
  currency: string;
  payment_term: string | null;
  delivery_term: string | null;
  loading_port: string | null;
  discharge_port: string | null;
  vessel: string | null;
  voyage: string | null;
  etd: string | null;
  eta: string | null;
  notes: string | null;
  status: DocStatus;
  details: ShippingLineItem[];
}

// Source PI for reference creation (?from_pi=uuid)
export interface SourcePI {
  id: string;
  pi_no: string;
  currency: string;
  payment_term: string | null;
  delivery_term: string | null;
  loading_port: string | null;
  discharge_port: string | null;
  supplier_id: string;  // maps to shipper_id
  buyer_id: string;     // maps to consignee_id
  details: ShippingLineItem[];
}

// Stuffing list with roll details
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
```

---

## 9. Zod Schema Design

```typescript
// app/loaders/shipping.schema.ts

import { z } from "zod";
import { lineItemSchema } from "~/loaders/po.schema";

// Reuse the same lineItemSchema from PO (structure is identical)
export { lineItemSchema };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const shippingSchema = z.object({
  ci_date: z.string().min(1, "CI 일자를 입력하세요").regex(ISO_DATE, "올바른 날짜 형식이 아닙니다"),
  ship_date: z.string().optional().default("").refine(v => !v || ISO_DATE.test(v), "올바른 날짜 형식이 아닙니다"),
  ref_no: z.string().max(100).optional().default(""),
  pi_id: z.union([z.string().uuid(), z.literal("")]).optional(),
  shipper_id: z.string().uuid("송하인을 선택하세요"),
  consignee_id: z.string().uuid("수하인을 선택하세요"),
  currency: z.enum(["USD", "KRW"]),
  payment_term: z.string().max(200).optional().default(""),
  delivery_term: z.string().max(200).optional().default(""),
  loading_port: z.string().max(200).optional().default(""),
  discharge_port: z.string().max(200).optional().default(""),
  vessel: z.string().max(200).optional().default(""),
  voyage: z.string().max(100).optional().default(""),
  etd: z.string().optional().default("").refine(v => !v || ISO_DATE.test(v), "올바른 날짜 형식이 아닙니다"),
  eta: z.string().optional().default("").refine(v => !v || ISO_DATE.test(v), "올바른 날짜 형식이 아닙니다"),
  notes: z.string().max(2000).optional().default(""),
});

export const stuffingRollSchema = z.object({
  roll_no: z.number().int().positive(),
  product_name: z.string().min(1).max(200),
  gsm: z.number().positive(),
  width_mm: z.number().positive(),
  length_m: z.number().positive(),
  net_weight_kg: z.number().nonnegative(),
  gross_weight_kg: z.number().nonnegative(),
});

export const stuffingListSchema = z.object({
  sl_no: z.string().max(50).optional().default(""),
  cntr_no: z.string().max(50).optional().default(""),
  seal_no: z.string().max(50).optional().default(""),
});
```

---

## 10. PI -> Shipping Data Mapping (Detailed)

### SourcePI Loader Query

In `shippingFormLoader`, when `from_pi` is provided:

```typescript
const { data: pi } = await supabase
  .from("proforma_invoices")
  .select("id, pi_no, currency, payment_term, delivery_term, loading_port, discharge_port, supplier_id, buyer_id, details")
  .eq("id", validPiId)
  .is("deleted_at", null)
  .single();
```

### Field Mapping in ShippingForm

```typescript
// In shipping-form.tsx, when sourcePI is provided:
const mergedDefaults = sourcePI ? {
  pi_id: sourcePI.id,
  shipper_id: sourcePI.supplier_id,   // PI supplier (GV) -> shipper
  consignee_id: sourcePI.buyer_id,    // PI buyer (Saelim) -> consignee
  currency: sourcePI.currency,
  payment_term: sourcePI.payment_term ?? "",
  delivery_term: sourcePI.delivery_term ?? "",
  loading_port: sourcePI.loading_port ?? "",
  discharge_port: sourcePI.discharge_port ?? "",
  details: sourcePI.details,
} : defaultValues;
```

### Org Type Consistency

| Module | Field Name | Org Type | Org Name |
|--------|-----------|----------|----------|
| PO | supplier_id | supplier | CHP |
| PO | buyer_id | seller | GV International |
| PI | supplier_id | seller | GV International |
| PI | buyer_id | buyer | Saelim |
| Shipping | shipper_id | seller | GV International |
| Shipping | consignee_id | buyer | Saelim |

Shipping org types match PI exactly (seller + buyer). The form loader queries are the same:
- Shippers: `organizations.type = 'seller'`
- Consignees: `organizations.type = 'buyer'`

---

## 11. Cross-module Detail Page Links

### 11.1 PI Detail -> Shipping

**Pattern follows PO Detail -> PI exactly.**

PI detail page additions:
1. Dropdown menu item: "선적서류 작성" linking to `/shipping/new?from_pi={pi.id}`
2. Linked shipping docs card (below content section or above notes)

PI detail loader addition:
```typescript
// In pi.$id.server.ts loader, add to Promise.all:
supabase
  .from("shipping_documents")
  .select("id, ci_no, pl_no, ci_date, status, currency, amount, vessel, etd")
  .eq("pi_id", idResult.data)
  .is("deleted_at", null)
  .order("ci_date", { ascending: false }),
```

PI detail page addition:
```tsx
{/* Same pattern as PO detail's connected PI list */}
{shippingDocs.length > 0 && (
  <Card>
    <CardHeader>
      <CardTitle className="text-base">연결된 선적서류</CardTitle>
    </CardHeader>
    <CardContent className="p-0">
      <div className="flex flex-col divide-y">
        {shippingDocs.map((sd) => (
          <Link key={sd.id} to={`/shipping/${sd.id}`} className="...">
            <span>{sd.ci_no}</span>
            <DocStatusBadge status={sd.status} />
            <span>{sd.vessel}</span>
            <span>{formatDate(sd.etd)}</span>
          </Link>
        ))}
      </div>
    </CardContent>
  </Card>
)}
```

### 11.2 Shipping Detail -> PI Reference

In `shipping-detail-info.tsx`, if `pi_id` exists:
```tsx
<Link to={`/pi/${shipping.pi_id}`} className="text-blue-600 hover:underline">
  {shipping.pi?.pi_no}
</Link>
```

Same pattern as PI detail showing linked PO reference.

---

## 12. Shipping List Page Design

### Status Tabs
Same pattern as PO/PI: 전체 | 진행 | 완료

### Search
Search across: `ci_no`, `pl_no`, and linked `pi.pi_no`.

### List Columns

**Desktop table:**
| CI No | PL No | PI No | Date | Vessel | ETD | ETA | Amount | Status |
|-------|-------|-------|------|--------|-----|-----|--------|--------|

**Mobile card:**
- Primary: CI No + Status Badge
- Secondary: PL No, PI No
- Tertiary: Vessel, ETD, Amount

### Loader Query
```typescript
supabase
  .from("shipping_documents")
  .select(
    "id, ci_no, pl_no, ci_date, status, currency, amount, vessel, etd, eta, " +
    "shipper:organizations!shipper_id(name_en), " +
    "consignee:organizations!consignee_id(name_en), " +
    "pi:proforma_invoices!pi_id(pi_no)"
  )
  .is("deleted_at", null)
  .order("ci_date", { ascending: false })
  .order("created_at", { ascending: false });
```

---

## 13. Shipping Create Action Flow

```
1. Parse & validate form data (shippingSchema + lineItemSchema[])
2. Validate shipper_id + consignee_id are active orgs
3. If pi_id provided, validate PI exists and is not deleted
4. Server-side amount recalculation (same as PO/PI)
5. Generate CI number: generate_doc_number('CI', ci_date)
6. Derive PL number: ci_no.replace('GVCI', 'GVPL')
7. INSERT shipping_documents
8. If pi_id provided:
   a. Find delivery with pi_id
   b. Update delivery.shipping_doc_id = new shipping doc id
9. Redirect to /shipping/:id
```

### Delete Action Side Effects
```
1. Soft delete shipping_documents (set deleted_at)
2. Unlink from delivery: UPDATE deliveries SET shipping_doc_id = null WHERE shipping_doc_id = id
3. Redirect to /shipping
```

### Clone Action
```
1. Fetch original data
2. Generate new CI/PL numbers
3. INSERT with pi_id = null, status = 'process'
4. No delivery link (pi_id is null)
5. Redirect to /shipping/:id/edit
```

---

## 14. Shipping Form Design

### Form Sections

**Section 1: Document Info**
- CI Date (required, date picker)
- Ship Date (optional)
- Reference No (optional)
- Linked PI (optional, hidden when from_pi prefill, display-only otherwise)
- Shipper (select, seller type orgs)
- Consignee (select, buyer type orgs)
- Currency (USD/KRW toggle)
- Payment Term, Delivery Term (text inputs)

**Section 2: Shipping Info**
- Vessel (text input)
- Voyage (text input)
- Loading Port, Discharge Port (text inputs -- prefilled from PI)
- ETD (date input)
- ETA (date input)

**Section 3: Line Items**
- Same dynamic line items editor as PO/PI
- Product select, GSM, Width, Quantity, Unit Price, Amount (auto-calc)

**Section 4: Notes**
- Textarea (max 2000 chars)

Note: gross_weight, net_weight, package_no are NOT editable in the form. They are calculated from stuffing lists and shown read-only on the detail page.

---

## 15. Trade-offs & Decisions

### T1: Dual doc number via string replacement vs. new RPC
**Decision:** String replacement (Option A).
**Trade-off:** Slightly less "pure" but avoids DB function changes and works perfectly for the fixed prefix format. If the prefix format ever changes, this would need updating -- but so would the DB function.

### T2: Stuffing list as inline section vs. separate route
**Decision:** Inline section on detail page.
**Trade-off:** More complex detail page, but better UX (user sees everything in context). Separate route would mean navigating away from the shipping doc to manage containers, which breaks the mental model.

### T3: CSV parsing client-side vs. server-side
**Decision:** Client-side.
**Trade-off:** Cannot handle huge files (but stuffing lists are small, < 500 rows). Gives instant preview without network round-trip. Security risk is minimal since the CSV contains product data, not executable content.

### T4: Weight aggregation in application code vs. SQL
**Decision:** Application code.
**Trade-off:** Slightly more code than a SQL aggregate query, but consistent with the project's "no triggers, application-level sync" pattern. Also easier to debug and test.

### T5: Stuffing list CRUD as separate sub-phase (5-C) vs. part of 5-B
**Decision:** Separate sub-phase.
**Trade-off:** More granular phases (3 instead of 2), but each sub-phase is manageable in scope. 5-B is shippable without stuffing lists -- the weight fields just remain null until 5-C.

---

## 16. Implementation Order

### Phase 5-A (List + Create)
1. Create `app/types/shipping.ts` (types)
2. Create `app/loaders/shipping.schema.ts` (Zod schemas)
3. Create `app/loaders/shipping.server.ts` (list loader + form loader + create action)
4. Create `app/components/shipping/shipping-line-items.tsx` (editor)
5. Create `app/components/shipping/shipping-form.tsx` (form)
6. Replace `app/routes/_layout.shipping.tsx` (list page)
7. Create `app/routes/_layout.shipping.new.tsx` (create page)
8. Update `app/routes.ts` (add new routes)

### Phase 5-B (Detail + Edit + Cross-module)
1. Create `app/loaders/shipping.$id.server.ts` (detail/edit loaders + actions)
2. Create `app/components/shipping/shipping-detail-info.tsx` (info cards)
3. Create `app/components/shipping/shipping-detail-items.tsx` (items table)
4. Create `app/routes/_layout.shipping.$id.tsx` (detail page)
5. Create `app/routes/_layout.shipping.$id.edit.tsx` (edit page)
6. Update `app/loaders/pi.$id.server.ts` (add linked shipping docs query)
7. Update `app/routes/_layout.pi.$id.tsx` (add dropdown item + linked docs card)

### Phase 5-C (Stuffing Lists + CSV)
1. Create `app/lib/csv-parser.ts` (CSV utility)
2. Create `app/components/shipping/stuffing-roll-table.tsx`
3. Create `app/components/shipping/stuffing-list-form.tsx`
4. Create `app/components/shipping/stuffing-list-card.tsx`
5. Create `app/components/shipping/csv-upload-dialog.tsx`
6. Create `app/components/shipping/stuffing-list-section.tsx`
7. Update `app/loaders/shipping.$id.server.ts` (add stuffing CRUD actions + weight recalc)
8. Update `app/routes/_layout.shipping.$id.tsx` (add StuffingListSection)

---

## 17. Korean Label Reference

For consistency with PO/PI UI labels:

| English | Korean Label |
|---------|-------------|
| Shipping Documents | 선적서류 |
| Commercial Invoice | 상업송장 (CI) |
| Packing List | 포장명세서 (PL) |
| Stuffing List | 스터핑 리스트 |
| Shipper | 송하인 |
| Consignee | 수하인 |
| Vessel | 선박명 |
| Voyage | 항차 |
| ETD | 출항예정일 |
| ETA | 도착예정일 |
| Ship Date | 선적일 |
| Loading Port | 선적항 |
| Discharge Port | 양륙항 |
| Gross Weight | 총중량 |
| Net Weight | 순중량 |
| Package | 포장수 |
| Container No | 컨테이너 번호 |
| Seal No | 봉인 번호 |
| Roll No | 롤 번호 |
| CSV Upload | CSV 업로드 |
| Add Container | 컨테이너 추가 |

---

## 18. Edge Cases & Validation Notes

1. **PI already has a shipping doc:** Allow multiple shipping docs per PI (the FK is not unique). A PI can have partial shipments across multiple shipping documents.

2. **Delivery link when PI has multiple shipping docs:** The delivery record has a single `shipping_doc_id`. For now, the LAST created shipping doc wins (overwrites). This is acceptable for the current business case where typically one PI = one shipping doc. If multi-shipment becomes common, we may need to revisit the delivery model.

3. **Weight fields on create:** Initially null. Editable manually on the edit page OR auto-calculated from stuffing lists. If both manual entry and stuffing list exist, stuffing list aggregation overwrites manual values. Document this in the UI.

4. **Stuffing list without rolls:** Allowed (user may add container info first, then import rolls later via CSV).

5. **CSV column order:** Strict -- must match the expected format. Show a template/example in the upload dialog.

6. **Clone and stuffing lists:** Cloning a shipping doc does NOT clone its stuffing lists. The user creates stuffing lists fresh for the new shipping doc. This avoids complexity and is consistent with the business model (each shipment has unique container/roll data).

7. **Delete shipping doc with stuffing lists:** Stuffing lists don't have `deleted_at`. When shipping doc is soft-deleted, stuffing lists become orphaned but are filtered out by the shipping doc's `deleted_at` check in queries. Alternatively, hard-delete stuffing lists when shipping doc is soft-deleted (they have no independent lifecycle). **Recommendation: Hard-delete stuffing lists** on shipping doc soft-delete for cleanliness.
