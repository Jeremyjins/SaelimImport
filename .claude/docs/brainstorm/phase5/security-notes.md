# Phase 5: Shipping Documents & Stuffing Lists -- Security Review Notes

**Date:** 2026-03-06
**Role:** Security Reviewer
**Scope:** shipping_documents CRUD, stuffing_lists CRUD + CSV upload, cross-module PI->Shipping->Delivery links

---

## Executive Summary

Phase 5 introduces two tables (`shipping_documents`, `stuffing_lists`), a CSV bulk-import flow, and cross-module authorization chains. The most significant risk is the pre-confirmed `saelim_read` RLS policy on `shipping_documents` that exposes `amount` and `details` (sales prices) to Saelim users -- this must be corrected before Phase 8. The `stuffing_lists` table is missing soft-delete and audit columns. CSV parsing requires a dedicated security checklist.

---

## 1. RLS Policy Status

### 1.1 shipping_documents -- Pre-existing Exposure (Critical)

The Phase 4 security audit confirmed a `saelim_read` policy on `shipping_documents` that gives Saelim users SELECT access including `amount` and `details` columns (pricing data).

**Required fix (before Phase 8, recommended before Phase 5):**

Option A -- Column-level exclusion via application loader (recommended):
```typescript
// In Saelim delivery loader (Phase 8), explicitly select only safe columns:
// vessel, voyage, eta, etd, loading_port, discharge_port, ship_date
// NEVER select: amount, details, payment_term, delivery_term
```

Option B -- Replace `saelim_read` with restricted view:
```sql
CREATE VIEW shipping_documents_saelim AS
  SELECT id, ci_no, pl_no, ci_date, pi_id, vessel, voyage, eta, etd,
         loading_port, discharge_port, ship_date, status
  FROM shipping_documents WHERE deleted_at IS NULL;
```

### 1.2 stuffing_lists -- RLS Status Unknown, Likely Absent (Critical)

The `stuffing_lists` table schema has no `deleted_at`, no `created_by` column. This suggests it may lack RLS policies.

**Required before Phase 5 ships:**
```sql
-- 1. Add missing audit columns
ALTER TABLE stuffing_lists
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN created_by uuid REFERENCES auth.users(id);

-- 2. Enable RLS
ALTER TABLE stuffing_lists ENABLE ROW LEVEL SECURITY;

-- 3. GV-only access policy
CREATE POLICY "gv_all" ON stuffing_lists
  FOR ALL USING (get_user_org_type() = 'gv')
  WITH CHECK (get_user_org_type() = 'gv');
```

### 1.3 Soft-Delete Exclusion

All Phase 5 loaders must apply `.is("deleted_at", null)` on all SELECT/UPDATE/DELETE queries, including cross-module joins.

---

## 2. Authentication & Authorization Guards

### 2.1 requireGVUser on All Shipping Routes (Critical)

All shipping_documents and stuffing_lists routes must call `requireGVUser()` -- not `requireAuth()`.

**Files to audit on completion:**
- `app/loaders/shipping.server.ts`
- `app/loaders/shipping.$id.server.ts`

### 2.2 app_metadata Check (Verified Correct)

`requireGVUser()` checks `user.app_metadata?.org_type !== ORG_TYPES.GV`. Uses `app_metadata` (not `user_metadata`), which users cannot modify.

### 2.3 responseHeaders Forwarding

All `data()` and `redirect()` calls must include `{ headers: responseHeaders }`.

---

## 3. Input Validation

### 3.1 URL Parameter Validation

```typescript
const idResult = z.string().uuid().safeParse(params.id);
if (!idResult.success) {
  throw data(null, { status: 404, headers: responseHeaders });
}
```

### 3.2 Shipping Document Schema

```typescript
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const shippingDocSchema = z.object({
  ci_date: z.string().min(1).regex(ISO_DATE),
  pi_id: z.union([z.string().uuid(), z.literal("")]).optional(),
  shipper_id: z.string().uuid(),
  consignee_id: z.string().uuid(),
  currency: z.enum(["USD", "KRW"]),
  payment_term: z.string().max(200).optional().default(""),
  delivery_term: z.string().max(200).optional().default(""),
  loading_port: z.string().max(200).optional().default(""),
  discharge_port: z.string().max(200).optional().default(""),
  vessel: z.string().max(200).optional().default(""),
  voyage: z.string().max(100).optional().default(""),
  etd: z.string().optional().default("").refine(v => !v || ISO_DATE.test(v)),
  eta: z.string().optional().default("").refine(v => !v || ISO_DATE.test(v)),
  ship_date: z.string().optional().default("").refine(v => !v || ISO_DATE.test(v)),
  package_no: z.coerce.number().int().nonnegative().max(99999).optional(),
  gross_weight: z.coerce.number().nonnegative().max(9_999_999).optional(),
  net_weight: z.coerce.number().nonnegative().max(9_999_999).optional(),
  ref_no: z.string().max(100).optional().default(""),
  notes: z.string().max(2000).optional().default(""),
});

// Cross-field: net_weight <= gross_weight
```

### 3.3 JSONB details Validation

Same pattern as PO/PI: JSON.parse with try/catch, `z.array(lineItemSchema).min(1).max(20)`, server-side amount recalculation.

### 3.4 Stuffing List Schema

```typescript
export const stuffingListSchema = z.object({
  cntr_no: z.string().max(20).optional().default(""),
  seal_no: z.string().max(50).optional().default(""),
  roll_no_range: z.string().max(100).optional().default(""),
});

export const rollDetailRowSchema = z.object({
  roll_no: z.string().min(1).max(50),
  product_name: z.string().max(200),
  gsm: z.number().nullable(),
  width_mm: z.number().nullable(),
  net_weight_kg: z.number().nonnegative().max(99999),
  gross_weight_kg: z.number().nonnegative().max(99999),
});

export const rollDetailsSchema = z.array(rollDetailRowSchema).max(500);
```

### 3.5 Org Existence Validation

Same pattern as PO/PI: validate shipper_id and consignee_id are active (non-deleted) organizations.

---

## 4. CSV Upload Security

### 4.1 File Type Validation

```typescript
// Extension check
if (!file.name.toLowerCase().endsWith(".csv")) { ... }

// MIME type check (secondary)
if (file.type && file.type !== "text/csv" && file.type !== "application/vnd.ms-excel") { ... }

// File size limit: 500KB
if (file.size > 512_000) { ... }
```

### 4.2 Magic Byte Validation

Reject PDF and ZIP-based files masquerading as CSV:
```typescript
const buffer = await file.slice(0, 4).arrayBuffer();
const bytes = new Uint8Array(buffer);
// Reject PDF (%PDF = 0x25504446)
if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) { reject }
// Reject ZIP (PK = 0x504B)
if (bytes[0] === 0x50 && bytes[1] === 0x4B) { reject }
```

### 4.3 CSV Parsing Safety

- Use safe parser (no eval, no template literals)
- Strip formula injection: remove leading `=`, `+`, `-`, `@` from cells

### 4.4 Row Count Limit (DoS Prevention)

```typescript
const MAX_ROWS = 500;
if (lines.length > MAX_ROWS + 1) { reject }
```

### 4.5 Per-Row Data Validation

Validate every row with `rollDetailRowSchema` before INSERT. Show first 5 errors only.

### 4.6 Memory Usage

CF Workers 128MB limit. 500KB CSV is well within limits. Always validate file size before parsing.

---

## 5. Cross-Module Authorization

### 5.1 pi_id Validation

When shipping doc references a PI, verify PI exists and is not deleted.

### 5.2 Delivery Link Authorization

When linking shipping to delivery, verify delivery's pi_id matches shipping doc's pi_id (prevents cross-PI linking).

### 5.3 Cascade Delete

- Check status != 'complete' before delete
- Soft-delete linked stuffing_lists
- Unlink from deliveries (set shipping_doc_id = null, do NOT delete delivery)

---

## 6. Data Isolation: Saelim Restrictions

### Columns Saelim Must NEVER Receive

| Column | Reason |
|--------|--------|
| `amount` | Sales invoice value |
| `details` (JSONB) | Line items with unit_price |
| `payment_term` | Confidential trade terms |
| `shipper_id` + org data | Supplier identity |

### Safe Columns for Saelim (Phase 8 only)

vessel, voyage, eta, etd, ship_date, loading_port, discharge_port, ci_no, pl_no, ci_date, status

### stuffing_lists -- Saelim Access

Operational detail. Block until Phase 8 makes explicit decision about exposure.

---

## 7. Business Logic Security

1. **Complete status blocking** -- Block edit AND delete of complete shipping docs
2. **Amount recalculation** -- Server-side from details line items, never trust client
3. **Document number generation** -- ci_no/pl_no via generate_doc_number RPC only, verify UNIQUE constraints exist
4. **Weight validation** -- net_weight <= gross_weight cross-field check

---

## 8. Findings Summary by Priority

### Critical
1. **stuffing_lists missing RLS** -- Add `gv_all` policy, `deleted_at`/`created_by` columns
2. **All shipping loaders must use requireGVUser** -- Primary application-level guard
3. **shipping_documents saelim_read exposes pricing** -- Fix before Phase 8

### High
4. **pi_id cross-reference validation** in create/update
5. **net_weight <= gross_weight** server validation
6. **Verify UNIQUE constraints** on ci_no, pl_no

### Medium
7. CSV file size (500KB) and row count (500) limits
8. CSV formula injection sanitization
9. Container number format validation
10. Cascade delete error handling

### Low
11. Complete status: prevent delete (not just edit)
12. Attachment file_size upper bound validation
13. No console.log of amounts/content in Workers

---

## 9. Pre-Implementation Checklist

### Database (Before code)
- [ ] Confirm RLS on shipping_documents
- [ ] Confirm saelim_read policy scope
- [ ] Add deleted_at, created_by to stuffing_lists
- [ ] Enable RLS on stuffing_lists with gv_all policy
- [ ] Verify UNIQUE constraints on ci_no, pl_no
- [ ] Verify generate_doc_number supports 'CI' and 'PL' doc types

### Application (Before routes go live)
- [ ] All loaders call requireGVUser()
- [ ] URL param $id validated as UUID
- [ ] responseHeaders forwarded in all data()/redirect()
- [ ] Zod schema validates all fields + cross-field net<=gross
- [ ] Amount recalculated server-side
- [ ] Status queried from DB for toggle
- [ ] pi_id, shipper_id, consignee_id validated
- [ ] Cascade delete: stuffing soft-delete, delivery unlink
- [ ] Content integration: loadContent("shipping", id)

### CSV Upload
- [ ] File size limit: 500KB
- [ ] Row count limit: 500 rows
- [ ] Extension check: .csv only
- [ ] Magic byte check: reject PDF/ZIP
- [ ] Per-row Zod validation
- [ ] Formula injection sanitization
- [ ] No file stored (parse in memory, discard)
- [ ] Error reporting: first 5 errors only
