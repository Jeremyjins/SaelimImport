# Phase 10 Backend Verification Report

Date: 2026-03-06
Role: Backend Developer Agent

---

## 1. 10-B: Dashboard Loader (`app/loaders/home.server.ts`)

### 1.1 requireGVUser 호출
- **Status**: PASS
- Line 11: `const { supabase, responseHeaders } = await requireGVUser(request, context);`

### 1.2 Promise.all 병렬 쿼리
- **Status**: PASS
- Lines 23-74: 9개 쿼리를 단일 `Promise.all`로 병렬 실행 (6 counts + recentOrders + pendingRequests + cyRiskOrders)

### 1.3 6개 count 쿼리
- **Status**: PASS
- PO process (L25-28): `purchase_orders` WHERE status='process', deleted_at IS NULL
- PI process (L29-33): `proforma_invoices` WHERE status='process', deleted_at IS NULL
- Shipping process (L34-38): `shipping_documents` WHERE status='process', deleted_at IS NULL
- Order process (L39-43): `orders` WHERE status='process', deleted_at IS NULL
- Customs fee_received=false (L44-48): `customs` WHERE fee_received=false, deleted_at IS NULL
- Delivery active (L49-53): `deliveries` WHERE status IN ('pending','scheduled'), deleted_at IS NULL

### 1.4 recentOrders
- **Status**: PASS
- Lines 54-59: `orders` select id, saelim_no, status, created_at. deleted_at IS NULL, ORDER BY created_at DESC, LIMIT 5

### 1.5 pendingRequests
- **Status**: PASS
- Lines 60-65: `delivery_change_requests` WHERE status='pending', ORDER BY created_at DESC, LIMIT 5

### 1.6 data() helper + responseHeaders
- **Status**: PASS
- Lines 76-91: `data({ stats, recentOrders, pendingRequests, cyRiskCount }, { headers: responseHeaders })`

### 1.7 deleted_at IS NULL on all count queries
- **Status**: PASS
- All 6 count queries and recentOrders include `.is("deleted_at", null)`
- Note: pendingRequests (`delivery_change_requests`) does NOT have `.is("deleted_at", null)` -- this table does not use soft delete (no deleted_at column), so this is correct behavior.

### 1.8 Additional: cyRiskOrders (bonus query not in spec)
- **Status**: INFO
- Lines 67-73: Extra query for orders with advice_date but no arrival_date. Returns count as `cyRiskCount`. This is beyond the original 10-B spec but adds value.

---

## 2. 10-E SYNC-1: Unlink Functions (`app/lib/order-sync.server.ts`)

### 2.1 unlinkPOFromOrder
- **Status**: PASS
- Lines 167-176: Updates `orders` SET po_id=null WHERE po_id=poId
- Error handling: `if (error) console.error(...)` (fire-and-forget)

### 2.2 unlinkPIFromOrder
- **Status**: PASS
- Lines 182-191: Updates `orders` SET pi_id=null WHERE pi_id=piId
- Error handling: `if (error) console.error(...)` (fire-and-forget)

### 2.3 unlinkShippingFromOrder
- **Status**: PASS
- Lines 197-206: Updates `orders` SET shipping_doc_id=null WHERE shipping_doc_id=shippingId
- Error handling: `if (error) console.error(...)` (fire-and-forget)

### 2.4 Observation: Missing `.is("deleted_at", null)` on new unlink functions
- **Status**: WARNING
- `unlinkPOFromOrder` (L174): `.eq("po_id", poId)` -- no deleted_at filter
- `unlinkPIFromOrder` (L189): `.eq("pi_id", piId)` -- no deleted_at filter
- `unlinkShippingFromOrder` (L204): `.eq("shipping_doc_id", shippingId)` -- no deleted_at filter
- Compare with `unlinkCustomsFromOrder` (L102-103) and `unlinkDeliveryFromOrder` (L128): both include `.is("deleted_at", null)`
- **Impact**: Low. Setting FK to null on a soft-deleted order is harmless but inconsistent with existing patterns.

---

## 3. PO Delete -> unlinkPOFromOrder (`app/loaders/po.$id.server.ts`)

### 3.1 Import
- **Status**: PASS
- Line 9: `import { unlinkPOFromOrder } from "~/lib/order-sync.server";`

### 3.2 Call in delete action
- **Status**: PASS
- Lines 295-312: Delete action flow:
  1. Soft-delete PO (L296-300)
  2. Check for error (L302-306)
  3. Call `await unlinkPOFromOrder(supabase, id)` (L310) -- AFTER successful soft-delete
  4. Redirect to /po (L312)
- Correct ordering: unlink happens after successful soft-delete

---

## 4. PI Delete -> unlinkPIFromOrder (`app/loaders/pi.$id.server.ts`)

### 4.1 Import
- **Status**: PASS
- Line 9: `import { unlinkPIFromOrder } from "~/lib/order-sync.server";`

### 4.2 Call in delete action
- **Status**: PASS
- Lines 323-354: Delete action flow:
  1. Soft-delete PI (L324-328)
  2. Check for error (L330-334)
  3. Cascade soft-delete linked deliveries (L338-342)
  4. Check delivery delete error (L344-349)
  5. Call `await unlinkPIFromOrder(supabase, id)` (L352) -- AFTER both soft-deletes succeed
  6. Redirect to /pi (L354)
- Correct ordering

---

## 5. Shipping Delete -> unlinkShippingFromOrder (`app/loaders/shipping.$id.server.ts`)

### 5.1 Import
- **Status**: PASS
- Line 9: `import { unlinkShippingFromOrder } from "~/lib/order-sync.server";`

### 5.2 Call in delete action
- **Status**: PASS
- Lines 719-758: Delete action flow:
  1. Check complete status block (L721-733)
  2. Soft-delete shipping doc (L735-739)
  3. Check for error (L741-745)
  4. Unlink deliveries' shipping_doc_id (L749-752)
  5. Call `await unlinkShippingFromOrder(supabase, id)` (L755) -- AFTER soft-delete
  6. Redirect to /shipping (L757)
- Correct ordering

---

## 6. form-utils.server.ts (`app/lib/form-utils.server.ts`)

### 6.1 parseJSONBField
- **Status**: PASS
- Lines 16-33: Generic function with signature `parseJSONBField<T>(formData, schema, fieldName = "details")`
- Accepts `z.ZodSchema<T[]>` for schema validation
- Returns discriminated union: `{ data: T[] } | { error: string }`
- Handles JSON.parse errors gracefully

### 6.2 validateOrgExists
- **Status**: PASS
- Lines 43-53: Signature `validateOrgExists(supabase, orgId): Promise<boolean>`
- Uses count query with `.is("deleted_at", null)` filter
- Returns `(count ?? 0) > 0`

### 6.3 Observation: Helpers not yet adopted in existing loaders
- **Status**: INFO
- PO/PI/Shipping loaders still use inline JSONB parsing and org validation patterns (the old way).
- These helpers are available for future use but not retroactively applied. This is acceptable -- no regression, just unrealized DRY opportunity.

---

## 7. Supabase DB Verification (MCP)

- **Status**: SKIPPED
- Supabase MCP tools returned permission denied errors. Table structure, indexes, and RLS policies could not be verified via MCP in this session.

---

## Summary

| # | Item | Result | Notes |
|---|------|--------|-------|
| 1.1 | requireGVUser | PASS | |
| 1.2 | Promise.all parallel | PASS | 9 queries |
| 1.3 | 6 count queries | PASS | All correct filters |
| 1.4 | recentOrders limit 5 | PASS | |
| 1.5 | pendingRequests | PASS | |
| 1.6 | data() + responseHeaders | PASS | |
| 1.7 | deleted_at IS NULL | PASS | All applicable queries |
| 2.1 | unlinkPOFromOrder | PASS | |
| 2.2 | unlinkPIFromOrder | PASS | |
| 2.3 | unlinkShippingFromOrder | PASS | |
| 2.4 | deleted_at filter consistency | WARNING | New unlink fns miss `.is("deleted_at", null)` |
| 3 | PO delete -> unlink | PASS | Correct order |
| 4 | PI delete -> unlink | PASS | Correct order |
| 5 | Shipping delete -> unlink | PASS | Correct order |
| 6.1 | parseJSONBField | PASS | Generic, Zod-validated |
| 6.2 | validateOrgExists | PASS | |
| 6.3 | Helpers adoption | INFO | Not yet used in existing loaders |
| 7 | Supabase DB (MCP) | SKIPPED | Permission denied |

## Issues Found

### WARNING: Inconsistent deleted_at filter on new unlink functions

**Location**: `app/lib/order-sync.server.ts` lines 174, 189, 204

The three new unlink functions (`unlinkPOFromOrder`, `unlinkPIFromOrder`, `unlinkShippingFromOrder`) do not include `.is("deleted_at", null)` in their update queries. The two existing unlink functions (`unlinkCustomsFromOrder`, `unlinkDeliveryFromOrder`) do include this filter.

**Impact**: Minimal. Setting a FK column to null on a soft-deleted order row is effectively a no-op from the application perspective. However, it is a consistency gap that could cause confusion in future maintenance.

**Recommendation**: Add `.is("deleted_at", null)` to all three new unlink functions for consistency.
