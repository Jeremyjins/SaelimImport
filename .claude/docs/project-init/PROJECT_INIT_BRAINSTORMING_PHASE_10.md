# Phase 10: Polish & QA - Comprehensive Brainstorming

**Date:** 2026-03-06
**Status:** Brainstorming Complete
**Dependencies:** Phase 1-9 All Complete
**Next Step:** Phase 10 상세 구현 계획 수립

---

## 1. Agent Team & File Ownership

| # | Role | File | Status |
|---|------|------|--------|
| 1 | **Architect** | [architect-notes.md](../brainstorm/phase10/architect-notes.md) | Complete |
| 2 | **Frontend Dev** | [frontend-notes.md](../brainstorm/phase10/frontend-notes.md) | Complete |
| 3 | **Backend Dev** | [backend-notes.md](brainstorm/phase10/backend-notes.md) | Complete (summary) |
| 4 | **Tester** | [tester-notes.md](../brainstorm/phase10/tester-notes.md) | Complete |
| 5 | **Perf Analyzer** | [perf-notes.md](brainstorm/phase10/perf-notes.md) | Complete (summary) |
| 6 | **Security Reviewer** | [security-notes.md](brainstorm/phase10/security-notes.md) | Complete (summary) |
| 7 | **Code Reviewer** | [code-review-notes.md](brainstorm/phase10/code-review-notes.md) | Complete (summary) |
| 8 | **Researcher** | [researcher-notes.md](brainstorm/phase10/researcher-notes.md) | Complete (summary) |

---

## 2. Phase 10 Scope Overview

Phase 10 is the final polish pass across all 9 completed phases. The scope covers:

1. **Critical Bug Fixes** - Error boundaries, data integrity, orphaned FKs
2. **Dashboard Implementation** - Home page with metrics, alerts, quick actions
3. **Mobile Responsive Optimization** - Settings pages, headers, forms, Saelim portal
4. **UI/UX Consistency** - Standardize patterns across all modules
5. **Error Handling Enhancement** - Route-level ErrorBoundary, shared components
6. **Code Quality Refactoring** - Shared helpers, pattern standardization
7. **Testing** - Unit tests, integration tests, schema coverage
8. **Accessibility** - ARIA labels, color contrast, keyboard navigation
9. **Performance Optimization** - Query parallelization, bundle optimization

---

## 3. Priority Classification (P0-P3)

### P0 - Critical (Must Fix)

| ID | Issue | Source | Impact |
|----|-------|--------|--------|
| P0-1 | **Layout ErrorBoundary missing** | Architect | Users lose sidebar navigation on any unhandled error. Root ErrorBoundary renders blank page without nav. |
| P0-2 | **Header responsive overflow** | Architect, Frontend | Detail page headers (title + badge + toggle + dropdown) overflow on mobile across ALL detail pages. |
| P0-3 | **Settings pages NO mobile layout** | Frontend | Organizations, Products, Users tables are 100% unusable on mobile. No `md:hidden` card alternative. |
| P0-4 | **Dashboard home page is placeholder** | Architect, Frontend | `_layout.home.tsx` shows static text only. No metrics, no alerts, no quick actions. |

### P1 - High Priority

| ID | Issue | Source | Impact |
|----|-------|--------|--------|
| P1-1 | **ErrorBanner shared component** | Architect | 6+ identical error banner blocks duplicated across list pages. |
| P1-2 | **Mobile card Link standardization** | Architect | Orders/Customs/Delivery list mobile cards use `<button>` instead of `<Link>`. Breaks middle-click, accessibility. |
| P1-3 | **Saelim header responsive** | Frontend | `px-8` fixed padding too wide on mobile. Should be `px-4 md:px-8`. |
| P1-4 | **PageContainer mobile padding** | Frontend | `p-6` on 320px leaves only 272px content. Should be `p-4 md:p-6`. |
| P1-5 | **Cross-module delete orphan (SYNC-1)** | Architect | Deleting PO/PI/Shipping doesn't unlink from Orders. Orphaned FK references remain. |
| P1-6 | **Missing ARIA labels** | Frontend | Search inputs, icon-only buttons in Settings, MoreHorizontal dropdown triggers lack `aria-label`. |
| P1-7 | **Sidebar missing home link** | Frontend | No "dashboard" or "home" link in sidebar navigation. |
| P1-8 | **`<a>` tag in customs detail** | Frontend | `customs-detail-info.tsx:48` uses bare `<a href=...>` instead of React Router `<Link>`. |
| P1-9 | **Vitest config excludes .tsx** | Tester | `include: ["app/**/*.test.ts"]` silently ignores any `.test.tsx` component tests. |

### P2 - Medium Priority

| ID | Issue | Source | Impact |
|----|-------|--------|--------|
| P2-1 | **Detail page spacing inconsistency** | Frontend | PO/PI/Shipping use `flex flex-col gap-6`, Orders use `space-y-4`, Delivery uses `space-y-6`. |
| P2-2 | **CardTitle style inconsistency** | Frontend | PO/PI: `text-base`, Orders/Customs: `text-sm font-semibold text-zinc-700`. |
| P2-3 | **Meta footer wording** | Frontend | PO/PI/Shipping: `작성:`, Orders/Customs/Delivery: `생성:`. Should standardize. |
| P2-4 | **Customs form card style** | Frontend | Uses plain `<div>` with border instead of `<Card>` component (inconsistent with other forms). |
| P2-5 | **Filter bar breakpoint** | Frontend | Most lists use `sm:flex-row`, Customs uses `md:flex-row`. Should standardize to `md:`. |
| P2-6 | **Empty states lack CTA** | Frontend | Empty list messages show text only. Should add icon + "작성하기" button. |
| P2-7 | **Color contrast** | Frontend | `text-zinc-400` (contrast ~3.3:1) used for meta text fails WCAG AA. Should be `text-zinc-500`. |
| P2-8 | **Delete dialog spinners** | Frontend | Orders and Delivery delete dialogs missing `Loader2` spinner on action button. |
| P2-9 | **Fetcher.formData cast inconsistency** | Architect | Some files use `as FormData | null`, others use `as unknown as FormData | null`. |
| P2-10 | **Toast feedback pattern** | Architect | Orders uses `prevStateRef` (simpler), Delivery uses `prevRef` with action (more correct). |
| P2-11 | **Dropdown trigger size** | Frontend | PO/PI/Shipping use `size="icon" className="h-8 w-8"`, Orders/Delivery use `size="sm"`. |

### P3 - Low Priority / Nice-to-Have

| ID | Issue | Source | Impact |
|----|-------|--------|--------|
| P3-1 | **Navigation loading bar** | Frontend | Global route transition indicator (`useNavigation().state`). |
| P3-2 | **Field-level validation errors** | Frontend | Return Zod field errors inline under each field. |
| P3-3 | **Content editor mobile toolbar** | Frontend | Small touch targets, no horizontal scroll on toolbar wrap. |
| P3-4 | **Parse JSONB helper extraction** | Architect | 6 duplicated `JSON.parse + z.array().safeParse` blocks across create/update actions. |
| P3-5 | **Org validation helper** | Architect | Active org check repeated in every create/update action. |
| P3-6 | **E2E test suite** | Tester | Playwright setup for critical user flows. |
| P3-7 | **Rate limiting** | Architect | No rate limiting on API actions. Low risk (invite-only) but notable. |

---

## 4. Implementation Sub-Phases

### Phase 10-A: Critical Fixes & Error Handling

**Scope:** P0-1, P0-2, P1-1, P1-2, P1-7, P1-8, P2-9
**Effort:** Small
**Dependencies:** None

**Files to create:**
- `app/components/shared/error-banner.tsx` - Shared ErrorBanner component

**Files to modify:**
- `app/routes/_layout.tsx` - Add layout-level ErrorBoundary preserving sidebar
- `app/routes/_saelim.tsx` - Add layout-level ErrorBoundary
- `app/components/layout/header.tsx` - Responsive fix (truncate title, shrink-0 actions)
- `app/components/layout/app-sidebar.tsx` - Add home/dashboard link
- `app/routes/_layout.orders.tsx` - Mobile card `<Link>`, fetcher cast fix
- `app/routes/_layout.customs.tsx` - Mobile card `<Link>`
- `app/routes/_layout.delivery.tsx` - Mobile card `<Link>`
- `app/routes/_layout.orders.$id.tsx` - Fetcher cast standardization
- `app/components/customs/customs-detail-info.tsx` - `<a>` to `<Link>`
- All list pages - Replace inline error banner with `<ErrorBanner>`

**ErrorBoundary Design:**
```tsx
// _layout.tsx ErrorBoundary - preserves sidebar navigation
export function ErrorBoundary() {
  const error = useRouteError();
  return (
    <SidebarProvider>
      <AppSidebar user={{ email: "unknown" }} />
      <SidebarInset>
        <Header title="오류가 발생했습니다" backTo="/" />
        <PageContainer>
          {isRouteErrorResponse(error) ? (
            <div>
              <h2>{error.status} {error.statusText}</h2>
              <p>{error.data}</p>
            </div>
          ) : (
            <div>
              <h2>예상치 못한 오류</h2>
              <p>페이지를 새로고침하거나 좌측 메뉴에서 다른 항목을 선택해 주세요.</p>
            </div>
          )}
        </PageContainer>
      </SidebarInset>
    </SidebarProvider>
  );
}
```

**Header Responsive Fix:**
```tsx
// header.tsx - truncate title, prevent action overflow
<h1 className="text-sm font-semibold text-foreground truncate min-w-0 flex-1">
  {title}
</h1>
{children && (
  <div className="ml-auto flex items-center gap-2 shrink-0">
    {children}
  </div>
)}
```

---

### Phase 10-B: Dashboard Implementation

**Scope:** P0-4, P1-7
**Effort:** Medium
**Dependencies:** 10-A (ErrorBanner)

**Files to create:**
- `app/loaders/home.server.ts` - Dashboard data aggregation loader
- `app/components/dashboard/stat-card.tsx` - Reusable metric card
- `app/components/dashboard/alert-list.tsx` - Warning/alert items
- `app/components/dashboard/recent-activity.tsx` - Recent activity list

**Files to modify:**
- `app/routes/_layout.home.tsx` - Complete rewrite with dashboard

**Dashboard Loader Design:**
```typescript
// app/loaders/home.server.ts
export async function loader({ request, context }: AppLoadContext) {
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
    supabase.from("orders")
      .select("id, saelim_no, status, created_at, po_id, pi_id")
      .is("deleted_at", null).order("created_at", { ascending: false }).limit(5),
    supabase.from("delivery_change_requests")
      .select("id, delivery_id, requested_date, reason, created_at")
      .eq("status", "pending").order("created_at", { ascending: false }).limit(5),
  ]);

  return data({
    stats: { poProcess, piProcess, shippingProcess, orderProcess, customsNotReceived, deliveryActive },
    recentOrders: recentOrders ?? [],
    pendingRequests: pendingRequests ?? [],
  }, { headers: responseHeaders });
}
```

**Dashboard Layout (Mobile-First):**
```
Mobile (< 768px):
+----------------------------+
| [진행 PO: 12] [진행 PI: 8]  |  <- grid-cols-2
| [진행 선적: 5] [대기 배송: 3] |
+----------------------------+
| 주요 알림                    |  <- full width card
| - CY 초과 위험 2건           |
| - 변경요청 대기 3건          |
| - 통관비 미수령 4건          |
+----------------------------+
| 최근 오더                    |  <- full width card
| ...                         |
+----------------------------+

Desktop (>= 768px):
+--------------------------------------------------+
| [진행 PO] [진행 PI] [진행 선적] [진행 오더]          |  <- grid-cols-4
| [통관비 미수령] [대기 배송]                           |  <- grid-cols-4
+--------------------------------------------------+
| 주요 알림 (1/2)          | 최근 오더 (1/2)          |  <- grid-cols-2
+--------------------------------------------------+
```

---

### Phase 10-C: Mobile Responsive Optimization

**Scope:** P0-3, P1-3, P1-4, P2-4, P2-5, P2-6, P2-8, P3-3
**Effort:** Medium-Large
**Dependencies:** 10-A (Header fix)

**Files to modify:**
- `app/components/layout/page-container.tsx` - `p-4 md:p-6`, `gap-4 md:gap-6`
- `app/routes/_saelim.tsx` - Header `px-4 md:px-8`
- `app/routes/_layout.settings.organizations.tsx` - Add mobile card layout
- `app/routes/_layout.settings.products.tsx` - Add mobile card layout
- `app/routes/_layout.settings.users.tsx` - Add mobile card layout
- `app/components/customs/customs-form.tsx` - Replace `<div>` with `<Card>`
- `app/components/content/content-editor-toolbar.tsx` - Mobile toolbar improvements
- All list pages with empty states - Add icon + CTA button

**Settings Page Mobile Pattern:**
```tsx
{/* Desktop table */}
<div className="hidden md:block">
  <Table>...</Table>
</div>

{/* Mobile cards */}
<div className="md:hidden space-y-3">
  {items.map(item => (
    <Card key={item.id} className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{item.name_en}</p>
          <p className="text-sm text-muted-foreground">{item.name_ko}</p>
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" aria-label="수정">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" aria-label="삭제">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  ))}
</div>
```

**Empty State Pattern:**
```tsx
<div className="flex flex-col items-center justify-center py-12 text-center">
  <FileText className="h-12 w-12 text-zinc-300 mb-3" />
  <p className="text-sm text-zinc-500">등록된 PO가 없습니다.</p>
  <Button asChild size="sm" className="mt-4">
    <Link to="/po/new">PO 작성하기</Link>
  </Button>
</div>
```

---

### Phase 10-D: UI/UX Consistency & Accessibility

**Scope:** P1-6, P2-1 ~ P2-11, P2-7, P3-1
**Effort:** Medium
**Dependencies:** 10-A

**Consistency Standardization Decisions:**

| Pattern | Standardize To | Current Variants |
|---------|---------------|-----------------|
| Detail page gap | `flex flex-col gap-6` | `space-y-4`, `space-y-6` |
| CardTitle style | `text-base` | `text-sm font-semibold text-zinc-700` |
| Meta footer text | `작성:` / `수정:` | `생성:` (in Orders/Customs/Delivery) |
| Filter bar breakpoint | `md:flex-row` | `sm:flex-row` (in PO/PI/Shipping/Orders/Delivery) |
| Dropdown trigger | `size="icon" className="h-8 w-8"` | `size="sm"` (in Orders/Delivery) |
| Fetcher cast | `as unknown as FormData \| null` | `as FormData \| null` |
| Toast pattern | `prevRef` with `{ state, action }` | `prevStateRef` (simpler) |
| Meta text color | `text-zinc-500` | `text-zinc-400` (WCAG fail) |

**Files to modify (consistency):**
- `app/routes/_layout.orders.$id.tsx` - gap-6, CardTitle, meta text, dropdown, toast pattern
- `app/routes/_layout.customs.$id.tsx` - gap-6, CardTitle, meta text
- `app/routes/_layout.delivery.$id.tsx` - gap-6, CardTitle, meta text
- All list pages - filter bar `md:flex-row`
- All detail pages - `text-zinc-400` -> `text-zinc-500` for meta text

**Accessibility Fixes:**
- Add `aria-label="검색"` to all search inputs
- Add `aria-label="수정"`, `aria-label="삭제"` to icon-only buttons in Settings
- Add `aria-label="더보기"` to MoreHorizontal dropdown triggers
- Add `Loader2` spinner to Orders/Delivery delete dialog buttons

**Navigation Loading Bar:**
```tsx
// In _layout.tsx render
const navigation = useNavigation();
{navigation.state === "loading" && (
  <div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-primary animate-pulse" />
)}
```

---

### Phase 10-E: Code Quality & Data Integrity

**Scope:** P1-5, P3-4, P3-5
**Effort:** Medium
**Dependencies:** None

**SYNC-1 Fix: Delete Cascade to Orders**

When PO/PI/Shipping is soft-deleted, unlink from connected Orders:

```typescript
// app/lib/order-sync.server.ts - Add new functions:

export async function unlinkPOFromOrder(supabase: SupabaseClient, poId: string) {
  const { error } = await supabase
    .from("orders")
    .update({ po_id: null })
    .eq("po_id", poId);
  if (error) console.error("unlinkPOFromOrder failed:", error);
}

export async function unlinkPIFromOrder(supabase: SupabaseClient, piId: string) {
  const { error } = await supabase
    .from("orders")
    .update({ pi_id: null })
    .eq("pi_id", piId);
  if (error) console.error("unlinkPIFromOrder failed:", error);
}

export async function unlinkShippingFromOrder(supabase: SupabaseClient, shippingId: string) {
  const { error } = await supabase
    .from("orders")
    .update({ shipping_doc_id: null })
    .eq("shipping_doc_id", shippingId);
  if (error) console.error("unlinkShippingFromOrder failed:", error);
}
```

**Files to modify:**
- `app/lib/order-sync.server.ts` - Add 3 unlink functions
- `app/loaders/po.$id.server.ts` - Call `unlinkPOFromOrder` on delete
- `app/loaders/pi.$id.server.ts` - Call `unlinkPIFromOrder` on delete
- `app/loaders/shipping.$id.server.ts` - Call `unlinkShippingFromOrder` on delete

**Shared Helper Extraction:**
```typescript
// app/lib/form-utils.server.ts
export function parseJSONBField<T>(
  formData: FormData,
  schema: z.ZodSchema<T[]>,
  fieldName = "details"
): { data: T[] } | { error: string } {
  const raw = formData.get(fieldName) as string;
  let parsed: unknown;
  try { parsed = JSON.parse(raw || "[]"); }
  catch { return { error: "잘못된 데이터 형식입니다." }; }
  const result = schema.safeParse(parsed);
  if (!result.success) return { error: result.error.issues[0]?.message ?? "유효하지 않은 데이터입니다." };
  return { data: result.data };
}
```

---

### Phase 10-F: Testing

**Scope:** P1-9, P3-6
**Effort:** Large
**Dependencies:** 10-E (code quality fixes should precede testing)

**Current State:** 131 tests across 5 files (PO schema, auth schema, settings schemas). Vitest configured. `@vitest/coverage-v8` installed.

**Infrastructure Fixes Needed:**
1. Update `vitest.config.ts`: `include: ["app/**/*.test.{ts,tsx}"]`
2. Add coverage for `app/lib/format.ts`, `app/lib/sanitize.ts`, `app/lib/customs-utils.ts`, `app/components/pdf/shared/pdf-utils.ts`
3. Install `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`
4. Create `app/test/setup.ts`, `app/test/supabase-mock.ts`, `app/test/fixtures.ts`

**Test Priority Matrix (Impact x Likelihood):**

| Area | Impact | Likelihood | Priority |
|------|--------|------------|----------|
| Auth guards (requireGVUser/requireAuth) | CRITICAL | HIGH | **P0** |
| Saelim org_type security (CRIT-1/2/3) | CRITICAL | MEDIUM | **P0** |
| `requested_by` server-side enforcement | CRITICAL | MEDIUM | **P0** |
| Amount recalculation server-side | HIGH | MEDIUM | **P1** |
| Cross-module sync functions | HIGH | HIGH | **P1** |
| Exactly-1 cascade link rule | HIGH | HIGH | **P1** |
| `unlinkCustomsFromOrder` blocking | HIGH | MEDIUM | **P1** |
| Customs fee computation | HIGH | MEDIUM | **P1** |
| Formula injection sanitize | HIGH | LOW | **P1** |
| Delivery future-date refine | HIGH | LOW | **P1** |
| PI/Shipping/Customs/Orders schemas | MEDIUM | MEDIUM | **P2** |
| PDF formatters (en-US) | MEDIUM | LOW | **P2** |
| `format.ts` utilities | LOW | LOW | **P3** |

**Test Files to Create (Priority Order):**

**Week 1 - Tier 1 (Schema + Utility):**
- `app/loaders/__tests__/pi.schema.test.ts`
- `app/loaders/__tests__/shipping.schema.test.ts`
- `app/loaders/__tests__/customs.schema.test.ts`
- `app/loaders/__tests__/delivery.schema.test.ts`
- `app/loaders/__tests__/orders.schema.test.ts`
- `app/lib/__tests__/format.test.ts`
- `app/lib/__tests__/sanitize.test.ts`
- `app/lib/__tests__/customs-utils.test.ts`
- `app/components/pdf/shared/__tests__/pdf-utils.test.ts`

**Week 2 - Tier 2 (Integration):**
- `app/loaders/__tests__/saelim.delivery.server.test.ts` (CRIT security)
- `app/loaders/__tests__/order-sync.server.test.ts` (sync functions)
- `app/loaders/__tests__/customs.server.test.ts` (create, delete, fee sync)
- `app/loaders/__tests__/delivery.$id.server.test.ts` (approve, reject)
- `app/loaders/__tests__/po.server.test.ts` (CRUD, clone, toggle)

**Key Implementation Notes:**
- `submitChangeRequestSchema` uses `new Date()` at validation time -> tests MUST use `vi.useFakeTimers()`
- Existing schema tests inline-redefine Zod schemas to avoid CF context. New schemas can import directly (no CF dependency).
- `triggerDownload` (PDF) uses DOM APIs - test filename sanitization regex only, skip DOM calls
- Coverage target: 50% overall by end of Phase 10

---

## 5. Architecture & Performance Insights

### 5.1 Performance Findings (Perf Analyzer)

**Bundle Optimization:**
- PDF: dynamic `import()` in click handlers keeps main bundle lean (~900KB gzip lazy chunk)
- ContentEditor: `React.lazy()` + `<Suspense>` already implemented
- No tree-shaking issues detected with current icon imports

**Server Performance:**
- All list pages load full datasets (no pagination). Acceptable at current scale (<100 records per module)
- Order list loader has sequential queries (orders then POs by usedPoIds). Necessarily sequential, not worth optimizing at current scale
- Delivery list already parallelizes queries. Good.
- 8 parallel count queries for dashboard is acceptable (all use indexes, `count+head` is lightweight)

**Database:**
- All queries consistently filter by `.is("deleted_at", null)` - good
- No N+1 issues detected (FK joins handled via Supabase `.select()` with `!fk_name` syntax)
- Content system queries are sequential (need `content_id` first) - acceptable

**No Pagination Needed Yet:**
- At <200 records per module, full load is fine
- Plan for cursor-based pagination when any module exceeds ~200 records

### 5.2 Security Findings (Security Reviewer)

**Confirmed Secure:**
- All loaders/actions call `requireGVUser()` or `requireAuth()` - no gaps
- Saelim data isolation: price fields excluded from SELECT queries (CRIT-1)
- `requested_by` forced server-side in change requests (CRIT-3)
- UUID param validation via Zod in every detail loader
- File upload path validation (SEC-1 regex)
- Content upload MIME-based extensions (SEC-5)
- RLS policies enforce DB-level access control

**Notable Findings (Low Risk):**
- No explicit CSRF token (SameSite cookies provide implicit protection)
- No rate limiting (invite-only auth mitigates risk)
- No admin role distinction within GV users (all GV users can access settings)
- `get_user_org_type()` RLS function security confirmed

### 5.3 Code Quality Findings (Code Reviewer)

**Type Safety:**
- `as unknown as` casts are documented tradeoffs for React Router 7 shared loaders
- JSONB types (details, fees) are Zod-validated server-side
- `Record<string, unknown>` for `app_metadata` is correct (Supabase SDK type)

**Code Duplication (Actionable):**
- List page structure ~80% identical. Verdict: keep as-is (structural duplication, readable)
- JSONB parse + validate: 6 duplicated blocks. Extract to `parseJSONBField()`
- Org validation: repeated in every create/update. Extract to `validateOrgExists()`

**Naming Consistency:**
- Files: kebab-case (consistent)
- Components: PascalCase (consistent)
- Variables/functions: camelCase (consistent)
- No barrel exports, no circular dependencies detected

---

## 6. Dashboard Metrics & Data Design

### Stat Cards (6 cards)

| Metric | Query | Icon |
|--------|-------|------|
| 진행중 PO | `purchase_orders.status = 'process'` | FileText |
| 진행중 PI | `proforma_invoices.status = 'process'` | FileCheck |
| 진행중 선적 | `shipping_documents.status = 'process'` | Ship |
| 진행중 오더 | `orders.status = 'process'` | Package |
| 통관비 미수령 | `customs.fee_received = false` | AlertCircle |
| 대기 배송 | `deliveries.status IN ('pending','scheduled')` | Truck |

### Alert Items

| Alert Type | Source | Badge Color |
|------------|--------|-------------|
| CY 체류일 초과 위험 | `orders` with `advice_date` set, no `customs_date` | Red |
| 배송 변경요청 대기 | `delivery_change_requests.status = 'pending'` | Amber |
| 통관비 미수령 | `customs.fee_received = false` | Yellow |

### Recent Activity
- Last 5 orders sorted by `created_at DESC`
- Show: `saelim_no`, status badge, created date
- Link to order detail page

---

## 7. Supabase / DB Considerations

### Supabase MCP/Connector 활용 방안

Phase 10에서 Supabase MCP를 직접 사용하는 작업:

1. **인덱스 확인 및 추가** - `execute_sql`로 현재 인덱스 확인, 누락 인덱스 추가
2. **RLS 정책 감사** - `execute_sql`로 전체 RLS 정책 목록 확인
3. **DB 어드바이저** - `get_advisors`로 성능 최적화 제안 확인
4. **테이블 스키마 확인** - `list_tables`로 현재 스키마 검증

**DB 변경 필요 없음:** Phase 10은 기존 스키마 그대로 사용. 새 마이그레이션 불필요.

### Dashboard 뷰 (Optional Optimization)

현재 8개 병렬 쿼리로 충분하지만, 추후 데이터 증가 시 DB View 고려:

```sql
-- Optional: Materialized view for dashboard stats
CREATE VIEW dashboard_stats AS
SELECT
  (SELECT count(*) FROM purchase_orders WHERE status = 'process' AND deleted_at IS NULL) as po_process,
  (SELECT count(*) FROM proforma_invoices WHERE status = 'process' AND deleted_at IS NULL) as pi_process,
  (SELECT count(*) FROM shipping_documents WHERE status = 'process' AND deleted_at IS NULL) as shipping_process,
  (SELECT count(*) FROM orders WHERE status = 'process' AND deleted_at IS NULL) as order_process,
  (SELECT count(*) FROM customs WHERE fee_received = false AND deleted_at IS NULL) as customs_unreceived,
  (SELECT count(*) FROM deliveries WHERE status IN ('pending', 'scheduled')) as delivery_active;
```

---

## 8. Implementation Roadmap

```
Phase 10-A: Critical Fixes & Error Handling ─────── [Small]  ─── 독립
Phase 10-B: Dashboard Implementation ─────────────── [Medium] ─── 10-A 후
Phase 10-C: Mobile Responsive Optimization ───────── [Medium-Large] ─── 10-A 후
Phase 10-D: UI/UX Consistency & Accessibility ────── [Medium] ─── 10-A 후
Phase 10-E: Code Quality & Data Integrity ────────── [Medium] ─── 독립
Phase 10-F: Testing ──────────────────────────────── [Large]  ─── 10-E 후
```

**추천 진행 순서:**
1. **10-A** (Critical Fixes) - 가장 먼저, 모든 후속 작업의 기반
2. **10-E** (Code Quality) - A와 병렬 가능, 테스트 전 코드 정리
3. **10-B** (Dashboard) - A 완료 후
4. **10-C** (Mobile) - A 완료 후, B와 병렬 가능
5. **10-D** (Consistency) - A 완료 후, B/C와 병렬 가능
6. **10-F** (Testing) - E 완료 후, 마지막 단계

**병렬 실행 가능 그룹:**
- Group 1: 10-A + 10-E (독립)
- Group 2: 10-B + 10-C + 10-D (10-A 완료 후, 서로 독립)
- Group 3: 10-F (10-E 완료 후)

---

## 9. Detailed Agent Notes Reference

각 에이전트별 상세 분석은 아래 파일 참조:

- [Architect Notes](../brainstorm/phase10/architect-notes.md) - 아키텍처 건강성, 크로스모듈 통합, 에러 처리, 모바일 갭, 구현 단계
- [Frontend Dev Notes](../brainstorm/phase10/frontend-notes.md) - 모바일 반응형 감사, UI 일관성, UX 개선, 접근성, 대시보드 디자인
- [Tester Notes](../brainstorm/phase10/tester-notes.md) - 테스트 전략, 우선순위 매트릭스, 인프라, 시나리오별 테스트 케이스

---

## 10. Key Decisions Made (No Questions Asked)

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Dashboard: 8 parallel count queries, no DB view | Scale is <100 records, queries are lightweight |
| 2 | No pagination yet | <200 records per module, full load is acceptable |
| 3 | Keep list page duplication | Structural duplication, readable and grep-friendly |
| 4 | Extract JSONB parse helper | 6 duplicated blocks, clear DRY opportunity |
| 5 | Standardize to `md:` breakpoint | Consistent with app-wide responsive strategy |
| 6 | `text-zinc-500` for meta text | WCAG AA compliance (contrast ~5:1) |
| 7 | Layout ErrorBoundary with sidebar | Users must retain navigation on error |
| 8 | `<Link>` for all mobile cards | Accessibility, middle-click, SPA navigation |
| 9 | Defer Playwright E2E to last | Unit/integration tests provide higher ROI first |
| 10 | No rate limiting implementation | Invite-only auth, <10 users, risk too low |
