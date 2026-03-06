# Phase 8: Delivery Management - Architect Notes

## 1. Schema Assessment

### 1.1 Existing `deliveries` Table - Evaluation

Current columns:
```
id, pi_id (FK), shipping_doc_id (FK), delivery_date, created_at, deleted_at, updated_at
```

**Verdict: Mostly sufficient, but needs a few additions.**

The table is intentionally minimal - a delivery is essentially a date tied to a PI and shipping document. However, for the Delivery Management UI to be functional, we need:

#### Required Additions

| Column | Type | Rationale |
|--------|------|-----------|
| `status` | `TEXT CHECK (status IN ('pending', 'scheduled', 'delivered'))` | Deliveries need lifecycle tracking. `pending` = no date set, `scheduled` = date set but not delivered, `delivered` = confirmed delivered. Without this, we cannot filter or badge deliveries meaningfully. |
| `delivery_address` | `TEXT` | Saelim has multiple delivery locations. This is currently nowhere in the schema. Nullable - can be set by GV when scheduling. |
| `notes` | `TEXT` | GV internal notes about the delivery (driver info, special instructions). Nullable. We already have ContentSection but a simple text field is more practical for delivery-specific quick notes. |

#### Considered but Rejected

| Column | Reason to Skip |
|--------|---------------|
| `tracking_number` | Domestic delivery in Korea - no formal tracking system for paper rolls on trucks. Over-engineering. |
| `driver_name` / `driver_phone` | Could go in `notes` field. Separate columns not justified at this scale. |
| `confirmed_by` / `confirmed_at` | The `status = 'delivered'` + `updated_at` is sufficient. Adding separate confirmation fields is premature. |
| `weight` / `quantity` | Already captured in PI details (JSONB line items) and shipping documents. Duplicating here violates single source of truth. |

### 1.2 Existing `delivery_change_requests` Table - Evaluation

Current columns:
```
id, delivery_id (FK), requested_date, reason, status, response_text,
requested_by, responded_by, created_at, updated_at
```

**Verdict: Sufficient as-is.** The schema already has everything needed for the change request workflow. One observation:

- `responded_by` is `string | null` but was designed with `REFERENCES auth.users(id)` in the original migration plan. The database.ts types show it as plain `string | null`, so we need to verify the actual DB constraint. If missing, we should add it via migration.
- The `responded_at` column exists in the migration SQL but is NOT in `database.ts`. We need to regenerate types or add it manually. This is important for showing when GV responded.

#### Missing from database.ts (needs type regeneration)
- `responded_at` field on `delivery_change_requests`


## 2. Data Flow Design

### 2.1 Delivery Lifecycle

```
PI Created ──auto──> Delivery Created (status: pending, pi_id set)
                         │
Shipping Created ────────┤──> shipping_doc_id linked to delivery
                         │
GV Sets Date ────────────┤──> delivery_date set, status: scheduled
                         │    └──> sync to orders.delivery_date
                         │
Saelim Requests Change ──┤──> delivery_change_request created (status: pending)
                         │
GV Approves ─────────────┤──> delivery_date updated, change_request status: approved
                         │    └──> sync to orders.delivery_date
                         │
GV Confirms Delivered ───┘──> status: delivered
```

### 2.2 Delivery Creation (Already Implemented)

PI creation in `pi.server.ts` line 292-294:
```typescript
await supabase.from("deliveries").insert({ pi_id: created.id });
```

Shipping creation in `shipping.server.ts` line 323-329:
```typescript
await supabase.from("deliveries")
  .update({ shipping_doc_id: created.id })
  .eq("pi_id", resolvedPiId)
  .is("shipping_doc_id", null);
```

These are already working. No changes needed.

### 2.3 delivery_date Bidirectional Sync

The sync helper `syncDeliveryDateToOrder` already exists in `order-sync.server.ts` (line 35-49). It pushes delivery_date from delivery to order. We need:

**Delivery -> Order (existing):** When GV updates `deliveries.delivery_date`, call `syncDeliveryDateToOrder(supabase, deliveryId, newDate)`.

**Order -> Delivery (new):** When GV updates `orders.delivery_date` via inline edit, we should also update `deliveries.delivery_date`. Currently `orders.$id.server.ts` `update_fields` action updates `orders.delivery_date` but does NOT sync back to `deliveries`. We need to add a reverse sync:

```typescript
// New function in order-sync.server.ts
export async function syncDeliveryDateFromOrder(
  supabase: Supabase,
  deliveryId: string,
  date: string | null
) {
  try {
    await supabase
      .from("deliveries")
      .update({ delivery_date: date, updated_at: new Date().toISOString() })
      .eq("id", deliveryId)
      .is("deleted_at", null);
  } catch (err) {
    console.error("syncDeliveryDateFromOrder failed:", err);
  }
}
```

Then call it in `orders.$id.server.ts` `update_fields` when `delivery_date` changes and `orderCheck.delivery_id` exists.

### 2.4 Change Request Workflow

```
Saelim User                          GV User
    │                                    │
    ├─ POST /saelim/delivery/:id         │
    │  _action: request_change           │
    │  requested_date: "2026-04-15"      │
    │  reason: "공장 일정 변경"            │
    │                                    │
    │  ──> INSERT delivery_change_requests│
    │      status: pending               │
    │      requested_by: saelim_user_id  │
    │                                    │
    │                                    ├─ GET /delivery/:id
    │                                    │  Shows pending change requests
    │                                    │
    │                                    ├─ POST /delivery/:id
    │                                    │  _action: approve_change
    │                                    │  change_request_id: uuid
    │                                    │
    │                                    │  ──> UPDATE delivery_change_requests
    │                                    │      status: approved
    │                                    │      responded_by: gv_user_id
    │                                    │
    │                                    │  ──> UPDATE deliveries
    │                                    │      delivery_date: requested_date
    │                                    │
    │                                    │  ──> syncDeliveryDateToOrder()
    │                                    │
```

**Key Decision: Approving a change request automatically updates the delivery_date.** This avoids the error-prone pattern of approving then manually changing the date. The `requested_date` IS the new date.


## 3. Route Architecture

### 3.1 GV Routes

| Route | File | Purpose |
|-------|------|---------|
| `/delivery` | `_layout.delivery.tsx` | List all deliveries (already exists as placeholder) |
| `/delivery/:id` | `_layout.delivery.$id.tsx` | Detail view with change request management |

**No `/delivery/new` or `/delivery/:id/edit` routes needed.** Deliveries are auto-created from PI. Editing is inline (like Orders). The detail page handles all actions: set/update date, approve/reject change requests, mark as delivered.

### 3.2 Saelim Routes

| Route | File | Purpose |
|-------|------|---------|
| `/saelim/delivery` | `_saelim.delivery.tsx` | List deliveries (already exists as placeholder) |
| `/saelim/delivery/:id` | `_saelim.delivery.$id.tsx` | Detail + submit change requests |

### 3.3 Route Registration (routes.ts)

```typescript
// GV Layout - add:
route("delivery/:id", "routes/_layout.delivery.$id.tsx"),

// Saelim Layout - add:
route("saelim/delivery/:id", "routes/_saelim.delivery.$id.tsx"),
```

### 3.4 Loader/Action Files

| File | Purpose |
|------|---------|
| `app/loaders/delivery.server.ts` | GV list loader |
| `app/loaders/delivery.$id.server.ts` | GV detail loader + all GV actions |
| `app/loaders/saelim-delivery.server.ts` | Saelim list loader |
| `app/loaders/saelim-delivery.$id.server.ts` | Saelim detail loader + change request action |

**Why separate Saelim loader files?** Different auth guards (`requireAuth` + org_type check vs `requireGVUser`), different data shapes (Saelim sees no pricing), and different action sets. Following the existing `_saelim.tsx` layout pattern.


## 4. Module Connections

### 4.1 Delivery <-> PI (FK: deliveries.pi_id)

- **Created by:** PI creation auto-inserts delivery with `pi_id`
- **Display:** Delivery detail shows linked PI number (join query)
- **Deletion cascade:** PI soft-delete also soft-deletes its delivery (already in `pi.$id.server.ts` line 337-338)

### 4.2 Delivery <-> Shipping Doc (FK: deliveries.shipping_doc_id)

- **Linked by:** Shipping creation updates delivery's `shipping_doc_id` (already in `shipping.server.ts` line 323-329)
- **Unlinked by:** Shipping deletion nullifies delivery's `shipping_doc_id` (already in `shipping.$id.server.ts` line 748-751)
- **Display:** Delivery detail shows linked shipping info (vessel, ETA)

### 4.3 Delivery <-> Order (Reverse FK: orders.delivery_id)

- **Linked by:** Order cascade link (`cascadeLinkFull` / `cascadeLinkPartial` in `order-sync.server.ts`)
- **Sync point:** `delivery_date` is bidirectional
- **Display:** Delivery detail can show linked order's `saelim_no`

### 4.4 Delivery <-> Change Requests (1:many FK: delivery_change_requests.delivery_id)

- **Created by:** Saelim users submit change requests
- **Managed by:** GV users approve/reject
- **Side effect:** Approval updates `deliveries.delivery_date` and syncs to order
- **Display:** GV detail shows all change requests. Saelim detail shows own requests.

### 4.5 Connection Diagram

```
purchase_orders ──> proforma_invoices ──> deliveries <── delivery_change_requests
                                              │                    │
                         shipping_documents ──┘              (Saelim creates,
                                                              GV approves)
                              orders ─── delivery_id ──> deliveries
                              (delivery_date bidirectional sync)
```


## 5. Implementation Phases

### 5.1 Phase 8-A: Core Delivery Management (GV Side)

**Goal:** GV users can view, manage, and update deliveries.

**Dependencies:** None (all upstream modules complete).

#### Deliverables:

1. **Schema Migration**
   - Add `status` column to `deliveries` (default: `'pending'`)
   - Add `delivery_address` column (nullable TEXT)
   - Add `notes` column (nullable TEXT)
   - Verify `responded_at` exists on `delivery_change_requests`
   - Regenerate `database.ts` types

2. **Types** (`app/types/delivery.ts`)
   - `DeliveryStatus = 'pending' | 'scheduled' | 'delivered'`
   - `DeliveryListItem` (id, status, delivery_date, delivery_address, pi join, shipping join, order join)
   - `DeliveryDetail` (full fields + change_requests array)
   - `DeliveryChangeRequest` (row type)

3. **GV Delivery List** (`_layout.delivery.tsx` + `delivery.server.ts`)
   - Replace placeholder with real list
   - SELECT with PI join (pi_no), Shipping join (ci_no, vessel, eta), Order join (saelim_no)
   - Tab filter by status: all / pending / scheduled / delivered
   - Search by PI number, saelim_no
   - Mobile-first card layout + desktop table (follow Orders pattern)

4. **GV Delivery Detail** (`_layout.delivery.$id.tsx` + `delivery.$id.server.ts`)
   - Delivery info section (status badge, date, address, linked docs)
   - Inline edit: delivery_date, delivery_address, notes (follow Order inline pattern)
   - Status transitions: pending -> scheduled (when date set), scheduled -> delivered (manual)
   - Change request list with approve/reject actions
   - Link to PI, Shipping, Order detail pages

5. **Order Sync Enhancement**
   - Add `syncDeliveryDateFromOrder` to `order-sync.server.ts`
   - Wire it into `orders.$id.server.ts` `update_fields` action
   - Wire `syncDeliveryDateToOrder` into delivery date updates

6. **Zod Schemas** (`app/loaders/delivery.schema.ts`)
   - `updateDeliverySchema` (delivery_date, delivery_address, notes)
   - `approveChangeSchema` (change_request_id)
   - `rejectChangeSchema` (change_request_id, response_text)

7. **Components** (`app/components/delivery/`)
   - `delivery-info.tsx` - Detail info display
   - `delivery-change-requests.tsx` - Change request list with approve/reject UI (GV version)

### 5.2 Phase 8-B: Saelim Portal

**Goal:** Saelim users can view their deliveries and submit change requests.

**Dependencies:** Phase 8-A.

#### Deliverables:

1. **Saelim Delivery List** (`_saelim.delivery.tsx` + `saelim-delivery.server.ts`)
   - Replace placeholder with real list
   - Auth: `requireAuth` + `org_type === 'saelim'` check
   - Filtered view: no pricing, no cost info
   - Show: delivery status, date, PI reference, shipping vessel/ETA
   - Status badges with color coding

2. **Saelim Delivery Detail** (`_saelim.delivery.$id.tsx` + `saelim-delivery.$id.server.ts`)
   - Read-only delivery info (date, status, address)
   - Linked document references (PI number, vessel name - no IDs/links to GV routes)
   - Change request submission form: requested_date (required) + reason (optional)
   - Own change request history with status badges (pending/approved/rejected)

3. **Saelim-specific Components** (`app/components/delivery/`)
   - `saelim-delivery-info.tsx` - Read-only info (no edit capability)
   - `saelim-change-request-form.tsx` - Date picker + reason textarea
   - `saelim-change-request-list.tsx` - Own request history

4. **RLS Verification**
   - Verify existing RLS policies work correctly:
     - `saelim_deliveries_select`: Saelim can read all non-deleted deliveries
     - `saelim_delivery_change_requests_select`: Saelim sees only own requests
     - `saelim_delivery_change_requests_insert`: Saelim can create with own `requested_by`
   - Test that Saelim cannot see GV-only fields (if any are added)


## 6. Schema Migration Needs

### Migration 1: deliveries table enhancements

```sql
-- Add status column with check constraint
ALTER TABLE deliveries
  ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending', 'scheduled', 'delivered'));

-- Add delivery address
ALTER TABLE deliveries
  ADD COLUMN delivery_address TEXT;

-- Add notes
ALTER TABLE deliveries
  ADD COLUMN notes TEXT;

-- Update existing deliveries: if delivery_date is set, mark as 'scheduled'
UPDATE deliveries
  SET status = 'scheduled'
  WHERE delivery_date IS NOT NULL AND deleted_at IS NULL;

-- Index on status for tab filtering
CREATE INDEX idx_deliveries_status ON deliveries(status) WHERE deleted_at IS NULL;
```

### Migration 2: Verify delivery_change_requests (may already exist)

```sql
-- Check if responded_at column exists, add if missing
-- (The original migration plan included it but database.ts doesn't show it)
ALTER TABLE delivery_change_requests
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;
```

### Post-Migration: Regenerate Types

Run Supabase CLI to regenerate `app/types/database.ts` to pick up new columns.


## 7. Key Design Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Delivery creation | Auto from PI (existing) | Deliveries are always 1:1 with PI. No manual creation needed. |
| Delivery editing | Inline on detail page | Follows Order module pattern. Only 3 editable fields (date, address, notes). Full edit form is overkill. |
| Status field | 3 states (pending/scheduled/delivered) | Minimum viable. `pending` = awaiting date, `scheduled` = date set, `delivered` = confirmed. No `cancelled` - use soft delete. |
| Change request approval | Auto-updates delivery_date | Reduces manual steps. The requested_date IS the proposed new date. |
| Saelim visibility | Delivery info only, no pricing | RLS enforced + route guards. Saelim sees delivery date, status, PI reference, vessel - nothing about costs. |
| Separate loader files for Saelim | Yes | Different auth, different data shapes, different actions. Mixing in one file with conditionals would be messy. |
| No `/delivery/new` route | Correct | Deliveries are never manually created. They come from PI creation. |
| No `/delivery/:id/edit` route | Correct | Inline editing on detail page is sufficient for 3 fields. |
| ContentSection on delivery | No | Unlike PO/PI/Shipping/Customs, deliveries don't need rich text notes. A simple `notes` TEXT column suffices. |

## 8. Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `responded_at` column missing from DB | Medium | Check via Supabase MCP before migration. May need `ADD COLUMN IF NOT EXISTS`. |
| Bidirectional date sync loops | Low | Both sync functions are fire-and-forget with try/catch. No infinite loop possible because they update different tables. |
| Saelim RLS policies not tested | Medium | Phase 8-B should include manual RLS testing with a Saelim user account. |
| Order inline delivery_date edit not syncing back | High (current bug) | Phase 8-A must add `syncDeliveryDateFromOrder` call to `orders.$id.server.ts`. |

## 9. File Summary

### New Files
```
app/types/delivery.ts
app/loaders/delivery.server.ts
app/loaders/delivery.$id.server.ts
app/loaders/delivery.schema.ts
app/loaders/saelim-delivery.server.ts
app/loaders/saelim-delivery.$id.server.ts
app/components/delivery/delivery-info.tsx
app/components/delivery/delivery-change-requests.tsx
app/components/delivery/saelim-delivery-info.tsx
app/components/delivery/saelim-change-request-form.tsx
app/components/delivery/saelim-change-request-list.tsx
app/routes/_layout.delivery.$id.tsx
app/routes/_saelim.delivery.$id.tsx
```

### Modified Files
```
app/routes.ts                          # Add delivery/:id and saelim/delivery/:id routes
app/routes/_layout.delivery.tsx        # Replace placeholder with real list
app/routes/_saelim.delivery.tsx        # Replace placeholder with real list
app/lib/order-sync.server.ts           # Add syncDeliveryDateFromOrder
app/loaders/orders.$id.server.ts       # Wire reverse date sync
app/types/database.ts                  # Regenerate after migration
```
