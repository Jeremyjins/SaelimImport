# Phase 10: Polish & QA - Architect Notes

## 1. Architecture Health Assessment

### 1.1 Overall Architecture Quality

The codebase follows a well-established pattern across all modules (PO, PI, Shipping, Orders, Customs, Delivery). The server/client separation is clean, with all server code in `app/loaders/*.server.ts` and route files re-exporting via `export { loader, action }`.

**Strengths:**
- Consistent file naming: `{module}.server.ts` (list+create), `{module}.$id.server.ts` (detail+action)
- Consistent auth pattern: every loader/action calls `requireGVUser()` or `requireAuth()`
- Consistent soft-delete via `deleted_at` with `.is("deleted_at", null)` filters
- Consistent use of `data()` helper for typed responses
- UUID param validation via `z.string().uuid().safeParse(params.id)` in every detail loader
- JSONB line items validated with Zod on both create and update
- Server-side amount recalculation prevents client tampering

### 1.2 Architectural Inconsistencies

**TD-1: `useLoaderData` type casting is inconsistent and brittle**

Every route page uses `as unknown as` casting on loader data:
```typescript
// app/routes/_layout.po.tsx:25
const data = useLoaderData<typeof loader>() as unknown as { pos: POListItem[]; error?: string };

// app/routes/_layout.orders.tsx:34
const rawData = useLoaderData<typeof loader>() as unknown as LoaderData;
```

This pattern exists because shared loaders use `AppLoadContext` inline interfaces rather than `Route.LoaderArgs`, which breaks React Router's automatic type inference. All 12+ route files have this issue. The casting is fragile - if loader return shape changes, the route file will compile but fail at runtime.

**Recommendation:** This is a known tradeoff documented in CLAUDE.md ("Shared loader files use AppLoadContext inline interface, NOT Route.LoaderArgs"). For Phase 10, consider adding runtime validation or at least documenting the exact shape expected by each route component. No refactor needed unless we find actual bugs.

**TD-2: `fetcher.formData` type casting varies across files**

```typescript
// app/routes/_layout.orders.$id.tsx:53
const currentAction = (fetcher.formData as FormData | null)?.get("_action") as string | null;

// app/routes/_layout.delivery.$id.tsx:55-57
const currentAction = (
  fetcher.formData as unknown as FormData | null
)?.get("_action") as string | null;
```

Some files use `as FormData | null`, others use `as unknown as FormData | null`. The underlying issue is the same (React Router 7 types `formData` as `never`), but the fix should be consistent. The `as unknown as FormData | null` form is the safer cast.

**TD-3: Error display pattern duplication**

Every list page has this identical block:
```typescript
{loaderError && (
  <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
    {loaderError}
  </div>
)}
```

This should be extracted to a shared `<ErrorBanner message={...} />` component.

**TD-4: Toast feedback pattern varies between detail pages**

- `_layout.orders.$id.tsx` uses `prevStateRef` to track previous fetcher state (simpler)
- `_layout.delivery.$id.tsx` uses `prevRef` with `{ state, action }` object (more robust, captures action before idle transition)

The delivery approach is more correct because `fetcher.formData` can be null when state transitions to idle. All detail pages should use the delivery pattern.

**TD-5: Mobile card element type inconsistency**

List pages use different elements for mobile cards:
- PO list (`_layout.po.tsx`): `<Link>` element
- PI list (`_layout.pi.tsx`): `<Link>` element
- Shipping list (`_layout.shipping.tsx`): `<Link>` element
- Orders list (`_layout.orders.tsx`): `<button>` with `onClick={navigate}`
- Customs list (`_layout.customs.tsx`): `<button>` with `onClick={navigate}`
- Delivery list (`_layout.delivery.tsx`): `<button>` with `onClick={navigate}`

`<Link>` is preferable for navigation (enables middle-click, prefetch, accessibility). Phases 6-8 diverged from the earlier pattern. Should standardize on `<Link>`.

### 1.3 Code Duplication

**DUP-1: List page structure is ~80% identical across all 6 list pages**

Every list page follows this exact structure:
1. Header with create button
2. PageContainer fullWidth
3. Error banner
4. Tabs + Search filter bar
5. useMemo for `filtered` and `counts`
6. Desktop table (`hidden md:block`)
7. Mobile card list (`md:hidden`)
8. Empty state message

The differences are: column names, filter logic, and card layout. This could be extracted into a shared `<DocumentList>` component, but the ROI is questionable since each module has unique columns. The current approach is readable and grep-friendly.

**Verdict:** Keep as-is. The duplication is structural, not logical.

**DUP-2: Detail JSONB parsing + Zod validation is duplicated across PO/PI/Shipping create actions**

The pattern:
```typescript
const detailsRaw = formData.get("details") as string;
let parsedDetails: unknown;
try { parsedDetails = JSON.parse(detailsRaw || "[]"); } catch { ... }
const detailsResult = z.array(lineItemSchema).min(1).max(20).safeParse(parsedDetails);
```

This appears verbatim in `po.server.ts`, `pi.server.ts`, `shipping.server.ts`, `po.$id.server.ts`, `pi.$id.server.ts`, `shipping.$id.server.ts`.

**Recommendation:** Extract to a shared helper:
```typescript
// app/lib/form-utils.server.ts
export function parseJSONBDetails<T>(formData: FormData, schema: z.ZodSchema<T[]>, fieldName = "details") { ... }
```

**DUP-3: Organization validation pattern repeated**

Active org validation (`count: exact, head: true` check) appears in every create/update action. Could be a shared `validateOrgExists(supabase, orgId)` helper.

### 1.4 Large Files

The following files are oversized and could benefit from splitting:

| File | Lines | Notes |
|------|-------|-------|
| `loaders/shipping.$id.server.ts` | ~750+ | Stuffing CRUD adds complexity |
| `loaders/pi.$id.server.ts` | ~470 | Clone + Update + Content + Delivery cascade |
| `loaders/po.$id.server.ts` | ~430 | Clone + Update + Content |
| `loaders/orders.$id.server.ts` | ~345 | Link/Unlink/Refresh/Toggle/Delete |
| `loaders/delivery.$id.server.ts` | ~370 | Approve/Reject/Mark/Date/Delete |
| `lib/content.server.ts` | ~470 | Full CRUD for content system |

The shipping detail server file is the most concerning at 750+ lines. Consider splitting stuffing operations into a separate `shipping-stuffing.server.ts`.

---

## 2. Cross-Module Integration Issues

### 2.1 Document Chain Flow

```
PO (purchase_orders)
 |-- FK --> PI (proforma_invoices.po_id)
              |-- FK --> Shipping (shipping_documents.pi_id)
              |           |-- FK --> Customs (customs.shipping_doc_id)
              |-- FK --> Delivery (deliveries.pi_id)
                          |-- FK --> Shipping (deliveries.shipping_doc_id)
```

**Order** is a hub table with FKs to all five:
```
orders.po_id, .pi_id, .shipping_doc_id, .customs_id, .delivery_id
```

### 2.2 Sync Logic Analysis (`order-sync.server.ts`)

The sync architecture is sound:
- **Fire-and-forget** for non-critical syncs (customs fee, delivery date, link operations)
- **Blocking** for unlink operations (must succeed before delete proceeds)
- **Cascade link** uses "Exactly-1 Rule" - only auto-links when exactly one candidate exists

**Potential Edge Case - SYNC-1: PI deletion does not cascade to Order**

When a PI is soft-deleted (`_layout.pi.$id.tsx` delete action), there's no call to unlink it from orders. If a PI is linked to an order and then deleted:
- The order retains the `pi_id` FK pointing to a soft-deleted PI
- The order detail page will still show the PI because the query uses `!pi_id` join (left join), and soft-deleted records are still in the DB
- However, clicking the PI link would show a 404

**Impact:** Low (PIs are rarely deleted after being linked to orders), but should be handled.

**Fix:** Add `unlinkPIFromOrder()` to `order-sync.server.ts`, called from PI delete action.

**Same issue applies to:** Shipping doc deletion (unlinks customs but not orders), PO deletion (no order unlink).

**SYNC-2: Delivery auto-creation on PI create has no rollback for order link**

In `pi.server.ts:292-307`, when PI is created, a delivery is auto-created. If delivery creation fails, the PI is soft-deleted as rollback. However, there's no logic to link the new delivery to existing orders. This is handled later by `cascadeLinkPartial` when the user manually refreshes links, which is acceptable.

**SYNC-3: Shipping creation links delivery but not order**

In `shipping.server.ts:324-329`, after creating a shipping doc, if `pi_id` exists, it links to the delivery's `shipping_doc_id`. But it doesn't call `linkShippingToOrder()`. This is fine because orders use `cascadeLinkPartial` for discovery, but it means the order won't show the shipping link until the user clicks "refresh links".

**Recommendation:** Consider adding auto-link calls in shipping and customs create actions to immediately update connected orders. This would reduce the need for manual "refresh links".

### 2.3 Data Consistency Checks

**CHECK-1: `deleted_at` filter consistency**

All queries consistently include `.is("deleted_at", null)`. This is well-maintained.

**CHECK-2: RLS + Application-level double guard**

- `_layout.tsx` loader calls `requireGVUser()` - blocks non-GV users
- `_saelim.tsx` loader calls `requireAuth()` + checks `org_type === 'saelim'`
- Every child loader also calls `requireGVUser()` or `requireAuth()` independently
- RLS policies provide DB-level enforcement as backup

This defense-in-depth is correctly implemented.

---

## 3. Error Handling Architecture

### 3.1 Current Strategy

**Root ErrorBoundary (`app/root.tsx:44-71`):**
- Handles 404s and unhandled errors
- Shows stack traces in dev mode only
- Minimal styling, no navigation to recover

**Route-level:** No individual route ErrorBoundaries exist. All routes rely on the root boundary.

**Server-side error handling (loaders):**
- List loaders: return `{ items: [], error: "message" }` - graceful degradation
- Detail loaders: `throw data(null, { status: 404 })` for not-found
- Actions: return `{ success: false, error: "message" }` with appropriate status codes

**Client-side error handling:**
- Loader errors: displayed as red error banners at top of list
- Action errors: displayed via `fetcherError` banners or `toast.error()`
- PDF download: wrapped in try/catch with toast feedback

### 3.2 Error Handling Gaps

**ERR-1: No route-level ErrorBoundary for detail pages**

If a detail page loader throws an unexpected error (not a controlled `throw data(null, { status: 404 })`), the entire app falls to the root ErrorBoundary, losing the sidebar layout. User has no way to navigate back without manually editing the URL.

**Recommendation:** Add ErrorBoundary to `_layout.tsx` that preserves the sidebar:
```typescript
export function ErrorBoundary() {
  return (
    <SidebarProvider>
      <AppSidebar user={{ email: "..." }} />
      <SidebarInset>
        {/* Error UI with back navigation */}
      </SidebarInset>
    </SidebarProvider>
  );
}
```

**ERR-2: Supabase query errors in loaders are inconsistently handled**

Some loaders check `error` from Supabase, others don't:
```typescript
// delivery.server.ts:39-41 - handles requestsError with console.error only
if (requestsError) {
  console.error("delivery_change_requests query failed:", requestsError);
}
```

This is acceptable for secondary queries (change requests are supplementary), but the pattern should be documented.

**ERR-3: Order sync fire-and-forget errors are invisible to users**

`order-sync.server.ts` catches all errors and logs to console. If a sync fails:
- The primary action succeeds (user sees success)
- The sync silently fails (data inconsistency)
- No way for user to know or retry

**Recommendation:** For Phase 10, add a "sync health check" in the order detail page that detects FK mismatches and offers a "repair" button (already partially implemented via `refresh_links`).

**ERR-4: No network error handling on client**

If a `fetcher.submit()` call fails due to network issues, there's no error UI. React Router handles this via its error boundary, but a timeout or offline state could leave the user confused.

### 3.3 Missing Error States

- `_layout.home.tsx`: No loader, no error handling (placeholder page)
- Settings pages: Have error handling via fetcher.data, but no loader error banners
- PDF download: Has catch block but doesn't distinguish between rendering errors and network errors

---

## 4. Mobile Architecture Gaps

### 4.1 Current Mobile Support

All list pages have a `hidden md:block` desktop table and a `md:hidden` mobile card view. This is correctly implemented for:
- PO list, PI list, Shipping list, Orders list, Customs list, Delivery list
- Saelim delivery list (card-only, no table)

### 4.2 Mobile Gaps

**MOB-1: Detail pages have no mobile-specific layouts**

Detail pages (`_layout.po.$id.tsx`, `_layout.pi.$id.tsx`, etc.) use the same layout for mobile and desktop. The `Card` components stack vertically which works, but:
- Header action buttons (`DropdownMenu`, status toggle, status badge) can overflow on small screens
- The `Header` component has `flex items-center gap-2` with no wrapping
- On a 320px screen, the PO detail header shows: back button + PO number + badge + toggle button + dropdown = too wide

**Recommendation:** Make the Header component responsive:
- On mobile: move action buttons below the title, or collapse more items into the dropdown
- Consider `flex-wrap` on the header actions container

**MOB-2: Form pages are not mobile-optimized**

Create/edit pages (`po.new`, `pi.new`, `shipping.new`, `customs.new`) use form layouts designed for desktop:
- `PO Form`, `PI Form`, `Shipping Form` components use grid layouts (`grid grid-cols-2`) that may not collapse properly
- Line item tables within forms are desktop-focused
- `ShippingForm` is particularly complex with weight/package fields

**MOB-3: Settings pages have desktop-only tables**

`settings.organizations.tsx`, `settings.products.tsx`, `settings.users.tsx` use `<Table>` without mobile card alternatives. These are admin-only pages so lower priority, but should have basic mobile support.

**MOB-4: Saelim layout header is not responsive**

`_saelim.tsx:35`: `<header className="flex h-16 items-center justify-between border-b bg-white px-8">`
- Fixed `px-8` padding is too much on mobile
- No hamburger/collapse for navigation on small screens

**MOB-5: ContentSection (Tiptap editor) mobile experience**

The Tiptap editor toolbar and editor area need mobile-specific adjustments. The toolbar has many buttons that may wrap poorly on small screens.

### 4.3 Mobile Strategy Recommendation

**Priority order:**
1. Header responsive fix (affects all detail pages)
2. Saelim layout responsive fix (external users, may use mobile)
3. Detail page card layouts (minor adjustments)
4. Form pages responsive (less critical, data entry is typically desktop)
5. Settings pages mobile cards (lowest priority, admin-only)

---

## 5. Dashboard / Home Page Architecture

### 5.1 Current State

`_layout.home.tsx` is a placeholder with static text ("좌측 메뉴에서 관리할 항목을 선택해 주세요"). No loader, no data, no metrics.

### 5.2 Proposed Dashboard Design

**Data aggregation approach:** Single server-side loader with parallel Supabase queries.

```typescript
// app/loaders/home.server.ts
export async function loader({ request, context }: LoaderArgs) {
  const { supabase, responseHeaders } = await requireGVUser(request, context);

  const [
    { count: poProcess },
    { count: piProcess },
    { count: shippingProcess },
    { count: orderProcess },
    { count: customsNotReceived },
    { count: deliveryActive },
    { data: recentOrders },
    { data: pendingRequests },
  ] = await Promise.all([
    supabase.from("purchase_orders").select("id", { count: "exact", head: true })
      .eq("status", "process").is("deleted_at", null),
    supabase.from("proforma_invoices").select("id", { count: "exact", head: true })
      .eq("status", "process").is("deleted_at", null),
    supabase.from("shipping_documents").select("id", { count: "exact", head: true })
      .eq("status", "process").is("deleted_at", null),
    supabase.from("orders").select("id", { count: "exact", head: true })
      .eq("status", "process").is("deleted_at", null),
    supabase.from("customs").select("id", { count: "exact", head: true })
      .eq("fee_received", false).is("deleted_at", null),
    supabase.from("deliveries").select("id", { count: "exact", head: true })
      .in("status", ["pending", "scheduled"]).is("deleted_at", null),
    // Recent orders with key info
    supabase.from("orders").select(ORDER_SUMMARY_SELECT)
      .is("deleted_at", null).order("created_at", { ascending: false }).limit(5),
    // Pending delivery change requests
    supabase.from("delivery_change_requests").select("id, delivery_id, created_at")
      .eq("status", "pending").limit(5),
  ]);

  return data({
    stats: { poProcess, piProcess, shippingProcess, orderProcess, customsNotReceived, deliveryActive },
    recentOrders: recentOrders ?? [],
    pendingRequests: pendingRequests ?? [],
  }, { headers: responseHeaders });
}
```

**Dashboard sections:**
1. **Summary cards row:** 6 metric cards (PO in progress, PI in progress, Shipping in progress, Orders active, Customs unpaid, Deliveries active)
2. **Recent orders table/cards:** Last 5 orders with status and key dates
3. **Action items:** Pending delivery change requests requiring GV response
4. **Optional:** CY warning list (orders with approaching arrival dates)

**Trade-offs:**
- 8 parallel queries per dashboard load is acceptable (all use indexes, count+head is lightweight)
- No caching needed at current scale
- Server-side aggregation is preferred over client-side (avoids loading full datasets)

---

## 6. Implementation Phase Plan

### Phase 10-A: Critical Fixes & Error Handling (Priority: High)

**Scope:**
1. Add layout-level ErrorBoundary to `_layout.tsx` and `_saelim.tsx` that preserves navigation
2. Extract `<ErrorBanner>` shared component
3. Standardize `fetcher.formData` casting pattern across all detail pages (use `as unknown as FormData | null`)
4. Standardize mobile card elements to `<Link>` in Orders/Customs/Delivery list pages
5. Fix Header responsive overflow on mobile (detail pages)

**Files to modify:**
- `app/routes/_layout.tsx` - add ErrorBoundary
- `app/routes/_saelim.tsx` - add ErrorBoundary
- `app/components/shared/error-banner.tsx` - new shared component
- `app/components/layout/header.tsx` - responsive fix
- `app/routes/_layout.orders.tsx` - mobile card Link, fetcher cast
- `app/routes/_layout.customs.tsx` - mobile card Link
- `app/routes/_layout.delivery.tsx` - mobile card Link
- `app/routes/_layout.orders.$id.tsx` - fetcher cast
- `app/routes/_layout.delivery.$id.tsx` - already correct pattern

**Dependencies:** None
**Estimated effort:** Small

### Phase 10-B: Dashboard Implementation (Priority: Medium)

**Scope:**
1. Create `app/loaders/home.server.ts` with stats aggregation
2. Redesign `_layout.home.tsx` with summary cards, recent orders, action items
3. Mobile-responsive dashboard layout

**Files to create/modify:**
- `app/loaders/home.server.ts` - new
- `app/routes/_layout.home.tsx` - complete rewrite

**Dependencies:** 10-A (ErrorBanner component)
**Estimated effort:** Medium

### Phase 10-C: Mobile Optimization (Priority: Medium)

**Scope:**
1. Form pages responsive improvements (grid collapse on mobile)
2. Saelim layout header responsive fix
3. Settings pages basic mobile card views
4. ContentSection/Tiptap toolbar mobile adjustments
5. Detail page card layouts minor tweaks

**Files to modify:**
- `app/components/po/po-form.tsx`
- `app/components/pi/pi-form.tsx`
- `app/components/shipping/shipping-form.tsx`
- `app/components/customs/customs-form.tsx`
- `app/routes/_saelim.tsx` - header responsive
- `app/routes/_layout.settings.organizations.tsx` - mobile cards
- `app/routes/_layout.settings.products.tsx` - mobile cards
- `app/routes/_layout.settings.users.tsx` - mobile cards
- `app/components/content/content-editor-toolbar.tsx` - mobile toolbar

**Dependencies:** 10-A (Header fix)
**Estimated effort:** Medium-Large

### Phase 10-D: Code Quality & Refactoring (Priority: Low)

**Scope:**
1. Extract `parseJSONBDetails()` shared helper to reduce create/update action duplication
2. Extract `validateOrgExists()` shared helper
3. Add PI/Shipping/PO unlink-from-order on delete (SYNC-1 fix)
4. Consistent toast feedback pattern across all detail pages
5. Review and clean up TypeScript `as unknown as` casts where possible

**Files to create/modify:**
- `app/lib/form-utils.server.ts` - new shared helper
- `app/loaders/po.$id.server.ts` - delete action add order unlink
- `app/loaders/pi.$id.server.ts` - delete action add order unlink
- `app/loaders/shipping.$id.server.ts` - delete action add order unlink
- `app/lib/order-sync.server.ts` - add unlinkPO/PI/Shipping helpers

**Dependencies:** None
**Estimated effort:** Medium

### Phase 10-E: E2E Testing (Priority: Medium)

**Scope:**
1. Set up Playwright with test Supabase project
2. Auth flow tests (login, logout, GV vs Saelim routing)
3. CRUD flow tests for each module (PO, PI, Shipping, Customs, Order, Delivery)
4. Cross-module flow test: PO -> PI -> Shipping -> Order -> Customs -> Delivery
5. Saelim portal: delivery view + change request flow
6. PDF download smoke test

**Files to create:**
- `playwright.config.ts`
- `e2e/auth.spec.ts`
- `e2e/po.spec.ts`
- `e2e/pi.spec.ts`
- `e2e/shipping.spec.ts`
- `e2e/orders.spec.ts`
- `e2e/customs.spec.ts`
- `e2e/delivery.spec.ts`
- `e2e/saelim-delivery.spec.ts`
- `e2e/cross-module.spec.ts`
- `e2e/helpers/` - auth helpers, data factories

**Dependencies:** 10-A (error handling must be solid before testing)
**Estimated effort:** Large

---

## 7. Performance Considerations

### 7.1 Current Performance Profile

- All list pages load full datasets (no pagination). Acceptable at current scale (<100 records per module), but should plan for pagination if data grows.
- Order list loader makes 2 sequential queries (orders list, then available POs). Could be parallelized.
- Delivery list loader makes 2 parallel queries (deliveries + pending requests). Good.
- Content system makes 3 sequential queries per detail page (content -> attachments + comments). The first query is necessarily sequential (need content_id for subsequent queries).

### 7.2 Potential Optimizations

**PERF-1: Order list loader has sequential queries**

```typescript
// orders.server.ts:29-58
const { data: rawOrders } = await supabase.from("orders").select(...);
// ... processes rawOrders to get usedPoIds ...
const { data: pos } = await posQuery; // depends on usedPoIds
```

This is necessarily sequential (need order data to compute usedPoIds). Could be optimized with a DB function/view, but not worth the complexity at current scale.

**PERF-2: PDF lazy loading is well-implemented**

PDF generation uses dynamic `import()` in click handlers, keeping the main bundle lean. The `~900KB gzip` lazy chunk is loaded on-demand only.

**PERF-3: No unnecessary re-renders detected**

List filtering uses `useMemo` correctly. `counts` computation is separate from `filtered` which is correct (counts should not change with search filter).

### 7.3 Pagination Strategy (Future)

If data grows beyond ~200 records per module, add cursor-based pagination:
- Server: `.range(offset, offset + limit - 1)` with total count
- Client: simple prev/next buttons, not infinite scroll
- Keep search/filter as URL params for bookmark-ability

---

## 8. Security Review

### 8.1 Current Security Posture

- **Auth:** All routes gated by `requireAuth()` or `requireGVUser()`
- **RLS:** Database-level policies based on `get_user_org_type()`
- **Input validation:** Zod schemas validate all form inputs server-side
- **UUID validation:** All `params.id` validated before DB queries
- **Soft delete:** `deleted_at` prevents access to deleted records
- **Org validation:** Active org checks prevent referencing deleted organizations
- **Content upload:** SEC-1 regex validates file paths, SEC-5 uses MIME-based extensions
- **Saelim isolation:** Price fields excluded from Saelim queries (CRIT-1)

### 8.2 Security Gaps

**SEC-GAP-1: No rate limiting on actions**

API actions (create, delete, clone) have no rate limiting. A malicious user could rapidly create hundreds of POs. This is low risk (invite-only auth), but worth noting.

**SEC-GAP-2: No CSRF protection beyond Supabase cookies**

React Router's default form handling with Supabase cookie auth provides implicit CSRF protection (cookies are SameSite), but there's no explicit CSRF token.

**SEC-GAP-3: Admin operations not restricted**

Settings pages (organizations, products, users) are accessible to any GV user. There's no admin role distinction within GV users.

---

## 9. Summary of Priorities

| Priority | Item | Category | Impact |
|----------|------|----------|--------|
| P0 | Layout ErrorBoundary | Error Handling | Users lose navigation on errors |
| P0 | Header responsive fix | Mobile | Buttons overflow on all detail pages |
| P1 | Dashboard implementation | Feature | Home page is empty placeholder |
| P1 | ErrorBanner shared component | Code Quality | 6+ duplicated error banner blocks |
| P1 | Mobile card Link standardization | Consistency | 3 list pages use wrong element |
| P2 | Saelim header responsive | Mobile | External users on mobile |
| P2 | Form pages responsive | Mobile | Grid doesn't collapse |
| P2 | Settings mobile cards | Mobile | Admin pages desktop-only |
| P2 | Cross-module delete cleanup (SYNC-1) | Data Integrity | Orphaned FK on delete |
| P3 | Parse/validate helper extraction | Code Quality | 6 duplicated blocks |
| P3 | Toast pattern standardization | Consistency | 2 different patterns |
| P3 | E2E test suite | Quality | No automated testing |
