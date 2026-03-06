# Phase 6: Order Management - Security Review Notes

**Date:** 2026-03-06
**Role:** Security Reviewer
**Scope:** `orders` table CRUD, 5-FK aggregation hub, link/unlink actions, customs_fee_received toggle, content system integration

---

## 1. RLS Policy Review

### 1.1 `orders` Table - RLS Verification (Critical)

No SQL migration files in the repository. RLS status on `orders` must be verified in Supabase dashboard before Phase 6 ships.

**Required SQL:**
```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gv_all" ON orders
  FOR ALL
  USING (get_user_org_type() = 'gv')
  WITH CHECK (get_user_org_type() = 'gv');
```

**Critical**: Saelim users must have NO policy on `orders` - not even SELECT. The orders record links to both PO (CHP purchase price) and PI (Saelim selling price), making margin computable from a single row.

### 1.2 `deleted_at` Filter

Existing pattern: `deleted_at IS NULL` at application layer, not in RLS. Maintain same pattern for orders:
- All SELECT: `.is("deleted_at", null)`
- Soft-delete: `.update({ deleted_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null)`

### 1.3 FK Tables - RLS Inheritance

JOINs to PO, PI, Shipping, Customs, Delivery do not bypass per-table RLS. Already confirmed for PO, PI, Shipping. Customs/Delivery RLS: verify in Phase 7/8.

### 1.4 UNIQUE Constraint on `po_id`

One Order per PO. Must enforce at DB level:
```sql
ALTER TABLE orders ADD CONSTRAINT orders_po_id_unique UNIQUE (po_id);
```

### 1.5 FK ON DELETE Behavior

Recommended: SET NULL on all FKs (preserve order when linked docs deleted).

---

## 2. Authentication & Authorization

### 2.1 `requireGVUser` on All Order Routes (Critical)

Every loader/action must begin with:
```typescript
const { supabase, user, responseHeaders } = await requireGVUser(request, context);
```

Current `_layout.orders.tsx` has no loader export - must add before shipping Phase 6.

### 2.2 `app_metadata` Check (Verified Correct)

`requireGVUser()` checks `user.app_metadata?.org_type` (server-controlled, not user-editable).

### 2.3 `responseHeaders` Forwarding

Every `data()` and `redirect()` must include `{ headers: responseHeaders }`. Missing breaks session cookie refresh.

### 2.4 No Saelim Routes for Orders

`_saelim.tsx` layout must never include order routes. Only `/saelim/delivery` is permitted for Saelim users.

---

## 3. Input Validation

### 3.1 URL Parameter `$id` - UUID Validation

```typescript
const idResult = z.string().uuid().safeParse(params.id);
if (!idResult.success) {
  throw data(null, { status: 404, headers: responseHeaders });
}
```

### 3.2 Zod Schema

```typescript
const orderSchema = z.object({
  po_id: z.string().uuid("유효한 PO ID가 필요합니다"),
  saelim_no: z.string().max(50).regex(/^[A-Za-z0-9\-]*$/, "영문, 숫자, 하이픈만 허용됩니다").optional().default(""),
});

const linkDocumentSchema = z.object({
  doc_type: z.enum(["pi", "shipping", "customs", "delivery"]),
  doc_id: z.string().uuid("유효한 문서 ID가 필요합니다"),
});
```

### 3.3 `po_id` Duplicate Check (Critical)

```typescript
const { count } = await supabase
  .from("orders")
  .select("id", { count: "exact", head: true })
  .eq("po_id", validated_po_id)
  .is("deleted_at", null);

if (count && count > 0) {
  return data({ success: false, error: "이미 오더가 생성된 PO입니다." }, { status: 409, headers: responseHeaders });
}
```

### 3.4 FK Document Existence + Non-Duplication on Link

Each link action must verify:
1. Target UUID valid (Zod)
2. Target exists and not deleted
3. Target not already linked to a different order

---

## 4. Cross-Module Data Access

### 4.1 JOIN - No Privilege Escalation

Supabase enforces RLS per-table. JOINs do not bypass RLS on joined tables.

### 4.2 `doc_type` Enum Guard

`doc_type` must use strict enum validation. Server action must use hardcoded mapping, never interpolate user input into table names:

```typescript
const DOC_TYPE_TO_FK: Record<string, string> = {
  pi: "pi_id",
  shipping: "shipping_doc_id",
  customs: "customs_id",
  delivery: "delivery_id",
};
```

### 4.3 Unlink - FK Nullification Only

Unlink must ONLY null out FK on `orders`. Must NEVER delete the linked document.

---

## 5. Information Leakage

### 5.1 Saelim Must Not Access Orders (Critical)

Orders aggregate PO amounts (buy price) + PI amounts (sell price) = full margin exposure.

**Enforcements:**
1. RLS: No Saelim policy on `orders`
2. Application: All routes under `_layout.tsx`, never `_saelim.tsx`
3. `requireGVUser()` on every loader/action

### 5.2 Error Messages

Must not reveal table names, column names, or Supabase error codes. Use Korean user-facing messages only.

---

## 6. Content System Integration

### 6.1 Already Registered (Verified)

- `content.server.ts` PARENT_TABLE_MAP: `"order": "orders"` exists
- `content.schema.ts` uploadRequestSchema.documentType: `"order"` included
- No content system changes needed for Phase 6

### 6.2 `content_delete` Cross-Isolation (Existing Debt)

`handleContentDelete` does not verify content belongs to current module's parent. A GV user on order page could delete PO content by submitting its content_id. Flag as global debt, fix across all modules.

---

## 7. `customs_fee_received` Toggle

### Phase 6: Local toggle only (no customs table sync yet)

Read current value from DB (not client), toggle server-side. Phase 7 will add bidirectional customs sync.

---

## 8. Action Security Matrix

| Action | Auth | Validation | DB Cross-Check |
|--------|------|-----------|----------------|
| create | requireGVUser | po_id UUID + Zod | PO exists + no duplicate order |
| update_fields | requireGVUser | date ISO, saelim_no alnum | Order exists + not deleted |
| toggle_customs_fee | requireGVUser | None (no user input) | Read state from DB |
| link_document | requireGVUser | doc_type enum + UUID | Target exists + not linked to other order |
| unlink_document | requireGVUser | doc_type enum | FK nullification only |
| delete | requireGVUser | None | Soft-delete; no cascade to linked docs |
| content_* | requireGVUser | Existing patterns | verifyParentExists("order", id) |

---

## 9. Pre-Implementation DB Checklist

- [ ] Verify RLS enabled on `orders` table
- [ ] Verify `gv_all` policy exists (FOR ALL, `get_user_org_type() = 'gv'`)
- [ ] Confirm NO Saelim policy on `orders`
- [ ] Add UNIQUE constraint: `orders_po_id_unique` on `orders(po_id)`
- [ ] Verify FK ON DELETE behavior (SET NULL recommended)
- [ ] Verify `get_user_org_type()` function returns correct values
- [ ] Verify `orders` has `deleted_at`, `created_by`, `updated_at` columns

---

## 10. Findings Summary by Priority

### Critical
1. RLS on `orders` must be verified - no migration files in repo
2. No Saelim policy on `orders` - margin exposure if Saelim can SELECT
3. All order loaders/actions must call `requireGVUser()`
4. `po_id` duplicate check on create + UNIQUE DB constraint

### High
5. `doc_type` enum validation prevents arbitrary table traversal
6. FK document existence + non-duplication on link actions
7. `customs_fee_received` toggle reads from DB, never client

### Medium
8. `content_delete` cross-content isolation (global debt)
9. Error messages must not expose internal DB details

### Low
10. Phase 7 bidirectional customs sync design (forward-planning)
11. Soft-deleted linked document UI handling
