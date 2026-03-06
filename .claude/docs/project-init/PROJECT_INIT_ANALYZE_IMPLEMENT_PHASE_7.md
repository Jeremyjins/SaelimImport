# Phase 7: Customs Module - Implementation Improvements

**Date:** 2026-03-06
**Based on:** PROJECT_INIT_ANALYZE_PHASE_7.md
**Status:** Complete

---

## Agent Team

| Role | Scope |
|------|-------|
| Architect | Overall plan, file ownership, doc |
| Backend-dev | Schema, server loaders/actions, order-sync |
| Frontend-dev | List page bug fix, breakpoint |
| DB-admin | Supabase MCP migration |

---

## Implemented Fixes

### H1 — Tab Count Bug (BUG FIX)

**Files:**
- `app/loaders/customs.server.ts` (backend-dev)
- `app/routes/_layout.customs.tsx` (frontend-dev)

**Problem:** Server applied `feeFilter` to query → returned subset → `counts` useMemo computed from
already-filtered array → inactive tab counts showed 0.

**Fix:**
- Removed `feeFilter` URL param parsing and conditional query clauses from `customs.server.ts` loader.
- Loader now always returns all non-deleted customs (client-side filtering is sufficient at this data scale).
- Added `feeFilter` to `filtered` useMemo in `_layout.customs.tsx`:
  ```typescript
  if (feeFilter === "received" && c.fee_received !== true) return false;
  if (feeFilter === "not_received" && c.fee_received === true) return false;
  ```
- Added `feeFilter` to useMemo dependency array.

---

### H2 — feeBreakdownSchema Dead Export (DEAD CODE)

**File:** `app/loaders/customs.schema.ts` (backend-dev)

**Problem:** `feeBreakdownSchema` was exported but never imported anywhere.

**Fix:** Removed the export entirely. Flat `feeFlatFields` pattern handles server validation.

---

### H3 — unlinkCustomsFromOrder Error Handling (ERROR HANDLING)

**Files:**
- `app/lib/order-sync.server.ts` (backend-dev)
- `app/loaders/customs.$id.server.ts` (backend-dev)

**Problem:** `unlinkCustomsFromOrder` swallowed errors with try/catch, returning `undefined`.
Delete action proceeded regardless → stale FK possible.

**Fix:**
- `unlinkCustomsFromOrder` now returns `Promise<boolean>` (true = success, false = error).
- Removed try/catch, uses direct `{ error }` destructuring from Supabase.
- Delete action in `customs.$id.server.ts` checks the return value:
  ```typescript
  const unlinkOk = await unlinkCustomsFromOrder(...);
  if (!unlinkOk) return data({ error: "연결된 오더 정리 중 오류가 발생했습니다." }, { status: 500 });
  ```

**Design Note:** Other sync helpers (`linkCustomsToOrder`, `syncCustomsFeeToOrder`, etc.) remain
non-blocking (fire-and-forget with try/catch) as they are not prerequisites for other operations.
`unlinkCustomsFromOrder` is the exception because it's a required precondition for safe delete.
This asymmetry is documented in the file header comment.

---

### M3 — orders.shipping_doc_id Index (PERFORMANCE)

**Tool:** Supabase MCP (`apply_migration`)

**Problem:** `linkCustomsToOrder` scanned all orders with `customs_id IS NULL` then post-filtered
by `shipping_doc_id`. Suboptimal at 200+ orders.

**Fix:** Migration applied:
```sql
CREATE INDEX IF NOT EXISTS idx_orders_shipping_doc_id
ON public.orders (shipping_doc_id)
WHERE deleted_at IS NULL;
```

**Verification:** Index confirmed in `pg_indexes`. All expected indexes present:
- `idx_customs_deleted_at` (partial, covers list query)
- `idx_customs_shipping_doc_id`
- `idx_orders_customs_id` (partial)
- `idx_orders_shipping_doc_id` (partial) ← new

---

### M5 — customsFormLoader Error Handling (RELIABILITY)

**File:** `app/loaders/customs.server.ts` (backend-dev)

**Problem:** `Promise.all` for `allDocs`/`usedDocs` queries ignored errors, silently returning
empty arrays on failure.

**Fix:** Destructured `error` from both queries, added early return with user-facing error:
```typescript
const [{ data: allDocs, error: allDocsError }, { data: usedDocs, error: usedDocsError }] = ...
if (allDocsError || usedDocsError) {
  return data({ availableShippings: [], fromShipping: null, error: "선적서류 목록을 불러오는 데 실패했습니다." }, ...);
}
```

---

### M7 — Schema Base Extraction (CODE QUALITY)

**File:** `app/loaders/customs.schema.ts` (backend-dev)

**Problem:** `customsCreateSchema` and `customsUpdateSchema` duplicated `customs_no`,
`customs_date`, `etc_desc` field definitions.

**Fix:** Extracted `customsTextFields` object with shared fields. Both schemas spread it:
```typescript
const customsTextFields = { customs_no, customs_date, etc_desc };
export const customsCreateSchema = z.object({ shipping_doc_id, ...customsTextFields, ...feeFlatFields });
export const customsUpdateSchema = z.object({ ...customsTextFields, ...feeFlatFields });
```

---

### L1 — Date Semantic Validation (SECURITY / VALIDATION)

**File:** `app/loaders/customs.schema.ts` (backend-dev)

**Problem:** Regex `/^\d{4}-\d{2}-\d{2}$/` passes format-valid but semantically invalid dates
like `2024-13-45`.

**Fix:** Added `.refine()` to `customs_date` in shared `customsTextFields`:
```typescript
.refine((val) => !isNaN(Date.parse(val)), "유효한 날짜가 아닙니다.")
```

**Note:** DB `customs_date` column is `date` type (confirmed via Supabase MCP), so Postgres would
also reject invalid dates. The refine provides a localized error message before hitting the DB.

---

### L6 — computeFeeTotal KRW Rounding (CODE QUALITY)

**File:** `app/lib/customs-utils.ts` (backend-dev)

**Problem:** `Math.round((supply + vat) * 100) / 100` is for 2 decimal places (USD-style).
KRW is integer currency; `Math.round(supply + vat)` is sufficient.

**Fix:**
```typescript
export function computeFeeTotal(supply: number, vat: number): number {
  return Math.round(supply + vat);
}
```

---

### M10 — sm: Breakpoint Non-Conformance (UI CONSISTENCY)

**File:** `app/routes/_layout.customs.tsx` (frontend-dev)

**Problem:** Filter row and search input used `sm:` breakpoint. Project standard is `md:` (768px).

**Fix:** Changed `sm:flex-row sm:items-center sm:justify-between` → `md:flex-row md:items-center md:justify-between`
and `sm:w-72` → `md:w-72`.

---

## Supabase Verification Results

| Check | Result |
|-------|--------|
| RLS on `customs` | `gv_all` policy: `get_user_org_type() = 'gv'` — correct, no Saelim access |
| `idx_customs_deleted_at` | Present (partial index on created_at DESC) |
| `idx_orders_customs_id` | Present (partial index) |
| `idx_orders_shipping_doc_id` | Present (newly created) |
| `customs_date` column type | `date` — DB-level date validation active |

---

## Deferred Items

| # | Issue | Reason |
|---|-------|--------|
| M1 | 서버사이드 검색 | Data volume small; defer to Phase 8+ |
| M2 | Clone 기능 | Polish/QA phase |
| M4 | Create RPC 통합 | Optional perf optimization |
| M6 | Intl.NumberFormat 중복 | Fee input/summary use different display format ("X 원") vs list ("₩X"); semantic difference, not a bug |
| M8 | LoaderData drift risk | Accepted; documented pattern in MEMORY.md |
| M11 | Order customs enabled:false | Intentional design; manual link not needed |
| L2 | order-sync silent failure 문서화 | Addressed in order-sync.server.ts file header |
| L3 | Delete parallelization | Incompatible with H3 (unlink must precede delete) |
| L4 | calcTotalFees 이중 호출 | useMemo optimization; negligible impact |
| L5 | shipping_documents ci_date index | Row count too small to matter |
| L7-L15 | Minor code quality | No functional impact |
