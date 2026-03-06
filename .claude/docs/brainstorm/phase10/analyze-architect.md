# Phase 10 Polish & QA - Architect Verification Report

Date: 2026-03-06

---

## 1. 10-A: ErrorBoundary Structure

### `app/routes/_layout.tsx`

- [PASS] ErrorBoundary exported (line 31-55)
- [PASS] SidebarProvider + AppSidebar included in error state (line 35-36)
- [PASS] isRouteErrorResponse handling with status/statusText (line 40-43)
- [PASS] Fallback generic error message for non-route errors (line 46-49)
- [PASS] Header with backTo="/" and PageContainer wrapping

### `app/routes/_saelim.tsx`

- [PASS] ErrorBoundary exported (line 85-110)
- [PASS] isRouteErrorResponse handling (line 95-99)
- [PASS] Simplified header (no user dropdown, just brand name)
- [PASS] Centered error display with max-w-md constraint

### `app/components/shared/error-banner.tsx`

- [PASS] File exists, named export `ErrorBanner` (line 5)
- [PASS] Simple interface: `{ message: string }`
- [PASS] Consistent styling: `rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700`

---

## 2. 10-B: Dashboard Data Flow

### `app/loaders/home.server.ts`

- [PASS] Uses `requireGVUser` (line 3, 11)
- [PASS] Uses shared `AppLoadContext` interface, NOT `Route.LoaderArgs` (line 5-8)
- [PASS] Promise.all with 9 parallel queries (line 13-74): 6 stat counts + recentOrders + pendingRequests + cyRiskOrders
- [PASS] `data()` helper for return (line 76-91)
- [PASS] Null coalescing on all counts (`?? 0`) and arrays (`?? []`)

### `app/routes/_layout.home.tsx`

- [PASS] `loader` imported from `~/loaders/home.server` and re-exported (line 16-18)
- [PASS] `useLoaderData<typeof loader>()` with type assertion (line 25-49)
- [PASS] Dashboard components: StatCard, AlertList, RecentActivity (line 5-7)
- [PASS] Responsive grid: `grid-cols-2 md:grid-cols-3 xl:grid-cols-6` (line 80)
- [NOTE] Uses `useLoaderData` instead of `Route.ComponentProps` pattern. This is a minor inconsistency with the `_layout.tsx` which uses `Route.ComponentProps`. Both work, but the project convention shown in `_layout.tsx` (line 14) prefers `Route.ComponentProps`. Low priority.

---

## 3. 10-E: SYNC-1 Cross-Module Integrity

### `app/lib/order-sync.server.ts`

- [PASS] `unlinkPOFromOrder` exists (line 167-176)
- [PASS] `unlinkPIFromOrder` exists (line 182-191)
- [PASS] `unlinkShippingFromOrder` exists (line 197-206)
- [PASS] All three use fire-and-forget pattern (console.error on failure, no throw)
- [PASS] All update `updated_at` timestamp
- [NOTE] `unlinkPOFromOrder` and `unlinkPIFromOrder` do not filter by `is("deleted_at", null)` on the orders table (lines 174, 189), while `unlinkShippingFromOrder` also omits this filter (line 204). This is acceptable since orphan FK cleanup should apply to all orders referencing the deleted document, including soft-deleted orders. However, this is inconsistent with `unlinkCustomsFromOrder` (line 103) and `unlinkDeliveryFromOrder` (line 128) which DO filter by `is("deleted_at", null)`. This inconsistency is minor but worth noting for future alignment.

### `app/loaders/po.$id.server.ts`

- [PASS] `unlinkPOFromOrder` imported (line 9)
- [PASS] Called in delete action after soft-delete succeeds (line 310)
- [PASS] Comment `// SYNC-1` present for traceability

### `app/loaders/pi.$id.server.ts`

- [PASS] `unlinkPIFromOrder` imported (line 9)
- [PASS] Called in delete action after soft-delete + delivery cascade delete (line 352)
- [PASS] Comment `// SYNC-1` present
- [PASS] Delivery cascade delete also performed before order unlink (lines 338-349)

### `app/loaders/shipping.$id.server.ts`

- [PASS] `unlinkShippingFromOrder` imported (line 9)
- [PASS] Called in delete action after soft-delete + delivery unlink (line 755)
- [PASS] Comment `// SYNC-1` present
- [PASS] Delivery `shipping_doc_id` nulled before order unlink (lines 749-752)

### `app/lib/form-utils.server.ts`

- [PASS] `parseJSONBField` exists (line 16-33)
- [PASS] `validateOrgExists` exists (line 43-53)
- [PASS] Both properly typed with Supabase generic client
- [NOTE] `parseJSONBField` is defined but not yet consumed by any of the loader files read (po.$id, pi.$id, shipping.$id). These loaders still inline the JSON.parse + Zod safeParse pattern. This indicates the utility was created but the refactoring to consume it was not completed. Low impact since the inline pattern works correctly.

---

## 4. Sidebar Home Link

### `app/components/layout/app-sidebar.tsx`

- [PASS] `navItems` array includes dashboard entry (line 47): `{ title: "대시보드", url: "/", icon: Home }`
- [PASS] Home icon imported from icons.tsx (line 31)
- [PASS] Active state correctly handled for root: `item.url === "/" ? location.pathname === "/" : ...` (line 97-99)
- [PASS] Uses `<Link to={item.url}>` for client-side navigation (line 102)

---

## 5. vitest.config.ts

- [PASS] Include pattern: `app/**/*.test.{ts,tsx}` (line 8)
- [PASS] Setup file: `app/test/setup.ts` (line 9)
- [PASS] Coverage targets loaders, lib, and specific utility files (lines 13-19)
- [PASS] Uses `vite-tsconfig-paths` plugin for `~` alias resolution (line 5)

---

## Summary

| Item | Status | Notes |
|------|--------|-------|
| 10-A: ErrorBoundary `_layout.tsx` | PASS | Full structure with SidebarProvider |
| 10-A: ErrorBoundary `_saelim.tsx` | PASS | Simplified layout |
| 10-A: ErrorBanner component | PASS | Exists with named export |
| 10-B: Dashboard loader | PASS | requireGVUser + Promise.all + data() |
| 10-B: Dashboard route | PASS | Correct re-export and data usage |
| 10-E: unlink functions | PASS | All three exist in order-sync.server.ts |
| 10-E: PO delete sync | PASS | unlinkPOFromOrder called |
| 10-E: PI delete sync | PASS | unlinkPIFromOrder called |
| 10-E: Shipping delete sync | PASS | unlinkShippingFromOrder called |
| 10-E: form-utils.server.ts | PASS | parseJSONBField + validateOrgExists exist |
| Sidebar home link | PASS | Dashboard at "/" with Home icon |
| vitest.config.ts | PASS | Correct include pattern |

### Observations (non-blocking)

1. **Inconsistent deleted_at filter in unlink functions**: `unlinkPO/PI/Shipping` do not filter `deleted_at` on orders, while `unlinkCustoms/Delivery` do. Both behaviors are defensible but should be standardized.

2. **parseJSONBField not consumed**: The utility exists but PO/PI/Shipping loaders still use inline JSON.parse + safeParse. This is technical debt from incomplete refactoring.

3. **useLoaderData vs Route.ComponentProps**: `_layout.home.tsx` uses `useLoaderData` while `_layout.tsx` uses `Route.ComponentProps`. Minor style inconsistency.

All critical verification items pass. No structural integrity issues found.
