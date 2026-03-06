# Phase 10: Frontend Polish & QA - Comprehensive Analysis

## 1. Mobile Responsiveness Audit

### 1.1 List Pages (Overall: Good)

All six list pages (PO, PI, Shipping, Orders, Customs, Delivery) follow a consistent responsive pattern:
- Desktop: `hidden md:block` table with hover rows and keyboard navigation
- Mobile: `md:hidden` card-based layout with Link/button wrappers
- Filter/Search bar: `flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`

**Issues Found:**

| Page | File | Issue | Severity |
|------|------|-------|----------|
| PO List | `app/routes/_layout.po.tsx` | Search breakpoint uses `sm:` (640px) while other responsive splits use `md:` (768px). Inconsistent but functionally fine. | Low |
| PI List | `app/routes/_layout.pi.tsx` | Same `sm:` breakpoint inconsistency as PO. | Low |
| Shipping List | `app/routes/_layout.shipping.tsx` | Same `sm:` breakpoint inconsistency. | Low |
| Customs List | `app/routes/_layout.customs.tsx` | Uses `md:flex-row` for filter bar (correct), but other list pages use `sm:flex-row`. Customs is actually correct; the others should match. | Medium |
| Delivery List | `app/routes/_layout.delivery.tsx` | Uses `sm:flex-row` -- inconsistent with Customs. | Low |
| Orders List | `app/routes/_layout.orders.tsx` | Uses `sm:flex-row` -- inconsistent with Customs. | Low |
| Settings: Organizations | `app/routes/_layout.settings.organizations.tsx` | **No mobile layout at all.** Only a Table, no card view for mobile. 6-column table is unusable on mobile. | **High** |
| Settings: Products | `app/routes/_layout.settings.products.tsx` | **No mobile layout at all.** Same problem as Organizations. | **High** |
| Settings: Users | `app/routes/_layout.settings.users.tsx` | **No mobile layout at all.** 8-column table is severely broken on mobile. | **Critical** |

**Recommendation for Settings Pages:**
- Add `hidden md:block` wrapper to existing tables
- Add `md:hidden` card-based layout for each settings page
- For Users: Collapse columns into a card showing name, email, org badge, and actions
- For Organizations: Show name_en, type badge, and edit/delete actions in card format
- For Products: Show name, GSM/width specs, and edit/delete actions in card format

### 1.2 Detail Pages (Overall: Good)

All detail pages use `PageContainer` (max-w-7xl, p-6) with card-based layouts that stack naturally on mobile.

**Issues Found:**

| Page | File | Issue | Severity |
|------|------|-------|----------|
| PO Detail | `app/routes/_layout.po.$id.tsx` | Header action buttons (status badge + toggle + dropdown) can overflow on narrow screens when title is long. | Medium |
| PI Detail | `app/routes/_layout.pi.$id.tsx` | Linked shipping docs table inside card has no mobile alternative -- uses `overflow-x-auto` which is acceptable but not ideal. | Low |
| PI Detail | `app/components/pi/pi-detail-info.tsx` | Same InfoRow pattern as PO -- good. | OK |
| Shipping Detail | `app/routes/_layout.shipping.$id.tsx` | Header title `${ci_no} / ${pl_no}` can be very long, causing overflow in header. | Medium |
| Orders Detail | `app/routes/_layout.orders.$id.tsx` | `OrderDocLinks` grid uses `grid-cols-1 md:grid-cols-3 xl:grid-cols-5` which works. `OrderInlineFields` uses `grid-cols-2 md:grid-cols-3 xl:grid-cols-5` -- good responsive behavior. | OK |
| Orders Detail | `app/components/orders/order-date-timeline.tsx` | Has proper Desktop (horizontal) and Mobile (vertical) timeline. Well done. | OK |
| Customs Detail | `app/routes/_layout.customs.$id.tsx` | `CustomsDetailInfo` uses `grid-cols-2 md:grid-cols-4` -- good. | OK |
| Delivery Detail | `app/routes/_layout.delivery.$id.tsx` | Clean mobile layout. | OK |

**Header Overflow Problem (Affects PO, PI, Shipping details):**
The `Header` component (`app/components/layout/header.tsx`) puts children in `ml-auto flex items-center gap-2`. When the title is long AND there are multiple action buttons (badge + toggle + dropdown), the header overflows on mobile.

**Proposed Fix:**
```
// In Header: wrap children with flex-shrink-0 and add truncation to title
<h1 className="text-sm font-semibold text-foreground truncate min-w-0">
// Children wrapper:
<div className="ml-auto flex items-center gap-2 shrink-0">
```
For detail pages with many header actions, consider moving the status toggle button inside the dropdown menu on mobile, or wrapping header children to a second line.

### 1.3 Form Pages (Overall: Good)

| Page | File | Issue | Severity |
|------|------|-------|----------|
| PO Form | `app/components/po/po-form.tsx` | `grid grid-cols-1 md:grid-cols-2 gap-6` for card layout -- good mobile stacking. Port fields use `grid-cols-2` even on mobile -- acceptable for short inputs. | OK |
| PI Form | `app/components/pi/pi-form.tsx` | Same pattern as PO Form. | OK |
| Shipping Form | `app/components/shipping/shipping-form.tsx` | 4 cards in 2-column grid, stacks properly. Weight section uses `grid-cols-1 sm:grid-cols-3` -- good. | OK |
| Customs Form | `app/components/customs/customs-form.tsx` | `grid md:grid-cols-2 gap-6` -- good. Uses plain `div` with border instead of Card component (inconsistency with other forms). | Medium |
| PO/PI Line Items | `app/components/po/po-line-items.tsx` | Not read, but likely similar to detail items. Need to verify mobile experience for adding/editing line items. | Low |

**Customs Form Inconsistency:**
The customs form uses `<div className="rounded-lg border p-4 space-y-4">` with `<h3>` headers instead of `<Card><CardHeader><CardTitle>` pattern used in PO/PI/Shipping forms. Should be unified.

### 1.4 Saelim Portal (Overall: Good but Limited)

| Page | File | Issue | Severity |
|------|------|-------|----------|
| Saelim Layout | `app/routes/_saelim.tsx` | Header uses fixed `px-8` padding -- too much on mobile. Should be `px-4 md:px-8`. | Medium |
| Saelim Delivery List | `app/routes/_saelim.delivery.tsx` | Card-only layout (no table), works well on all sizes. | OK |
| Saelim Delivery Detail | `app/routes/_saelim.delivery.$id.tsx` | Clean card-based layout, max-w-2xl centered. | OK |

---

## 2. UI Consistency Audit

### 2.1 Spacing & Layout Patterns

**Inconsistencies Found:**

1. **PageContainer gap:** Uses `gap-6 p-6` consistently -- good.
2. **Detail page content gap:** PO/PI/Shipping use `flex flex-col gap-6`, Orders/Customs/Delivery use `space-y-4` or `space-y-6`. Should standardize to one pattern.
   - `app/routes/_layout.po.$id.tsx` -- `flex flex-col gap-6`
   - `app/routes/_layout.pi.$id.tsx` -- `flex flex-col gap-6`
   - `app/routes/_layout.shipping.$id.tsx` -- `flex flex-col gap-6`
   - `app/routes/_layout.orders.$id.tsx` -- `space-y-4`
   - `app/routes/_layout.customs.$id.tsx` -- `space-y-4`
   - `app/routes/_layout.delivery.$id.tsx` -- `space-y-6`

3. **Card header styles:** PO/PI use `CardTitle className="text-base"`, Orders/Customs use `CardTitle className="text-sm font-semibold text-zinc-700"`. Not consistent.

4. **Error banner:** All pages use the same inline red error banner pattern -- good consistency.

5. **Meta info footer:** All detail pages have a meta footer with `text-xs text-zinc-400 flex gap-4`, but some add `pb-4` and some don't. Some say "작성:" and some say "생성:".
   - PO/PI/Shipping: `작성:` / `수정:`
   - Orders/Customs: `생성:` / `수정:`
   - Delivery: `생성:` / `수정:`
   Should standardize the wording.

### 2.2 Button Patterns

- **Create buttons:** All use `<Button size="sm">` with Plus icon + text -- consistent.
- **Status toggle:** PO/PI/Shipping detail pages have a dedicated outline button in header. Orders puts it inside dropdown menu. Should be consistent.
- **Dropdown menu trigger:** PO/PI/Shipping use `size="icon" className="h-8 w-8"`. Orders uses `size="sm"` without icon variant. Customs uses `size="icon" className="h-8 w-8"`. Delivery uses `size="sm"`. Should standardize.

### 2.3 Status Badge Patterns

- **PO/PI/Shipping/Orders:** Use `DocStatusBadge` (process/complete) -- consistent.
- **Customs:** Uses custom `FeeReceivedBadge` with inline styles (not using DocStatusBadge) -- acceptable, different domain.
- **Delivery:** Uses `DeliveryStatusBadge` from `change-request-badge.tsx` -- different status domain, correct to have separate component.
- **Orders CY Warning:** Uses `OrderCYWarning` component -- domain-specific, fine.

### 2.4 Dialog Patterns

All destructive actions use `AlertDialog` with state-controlled open/close pattern -- good consistency.

**Issue:** The customs detail info links to shipping using a bare `<a>` tag instead of React Router's `<Link>`:
```tsx
// app/components/customs/customs-detail-info.tsx line 48
<a href={`/shipping/${customs.shipping.id}`}
```
Should be `<Link to={...}>` for SPA navigation.

---

## 3. UX Improvements

### 3.1 Dashboard / Home Page (Critical Gap)

**Current State:** `app/routes/_layout.home.tsx` is a placeholder with a centered message "좌측 메뉴에서 관리할 항목을 선택해 주세요."

**Proposed Dashboard Design:**

```
+--------------------------------------------------+
| GV International 수입관리 시스템       [날짜/시간] |
+--------------------------------------------------+
| [진행중 PO]  [진행중 PI]  [진행중 선적]  [대기 배송] |
|    12건         8건          5건           3건      |
+--------------------------------------------------+
| 최근 활동                    | 주요 알림            |
| - PI-2024-015 작성됨         | CY 초과 위험 2건     |
| - 선적서류 CI-0042 완료       | 변경요청 대기 3건    |
| - 오더 SL-0031 도착 확인      | 통관비 미수령 4건    |
+--------------------------------------------------+
| 빠른 이동                                          |
| [PO 작성] [PI 작성] [선적서류 작성] [통관서류 작성]   |
+--------------------------------------------------+
```

**Implementation Plan:**
1. Create a new loader `app/loaders/home.server.ts` with aggregate counts query
2. Use Card components for stat cards in a `grid grid-cols-2 md:grid-cols-4` layout
3. Add a recent activity section pulling latest 10 items across modules
4. Add alert/warning section for CY warnings, pending change requests, unreceivedFees
5. Quick action buttons at the bottom
6. Mobile: Stack stat cards 2-per-row, activity and alerts full-width

### 3.2 Navigation Flow

**Back Button:**
- All detail pages have `backTo` prop on Header -- good.
- Form pages (new/edit) have `backTo` -- good.
- Settings pages do NOT have `backTo` -- should add `backTo="/settings/..."` or similar.

**Breadcrumb Consideration:**
Currently only a simple back arrow is shown. For deeper navigation paths (e.g., PO -> PI -> Shipping), a breadcrumb trail would improve orientation. However, for this app's relatively flat hierarchy, the current back button is adequate.

**Missing Navigation Aids:**
- No way to navigate between related documents inline. For example, from a PI detail page there is a linked shipping docs section, but no quick link to the parent PO from the PI detail header area (only in PIDetailInfo card).
- Order detail has doc links grid which is excellent. Consider adding similar cross-links to other detail pages.

### 3.3 Form Validation Feedback

**Current State:**
- Server-side validation returns an `error` string displayed as a red banner at the top of the form.
- No inline field-level validation errors.
- Zod `safeParse` is used server-side but errors are collapsed into a single string.

**Recommended Improvements:**
1. **Field-level errors:** Return Zod field errors as a `fieldErrors` object from the action, display inline under each field using `<p className="text-xs text-destructive mt-1">`.
2. **Client-side validation:** Add `required` and basic HTML5 validation (already present on most fields) -- good.
3. **Form submission state:** Already handled with `useNavigation().state === "submitting"` and Loader2 spinner -- good.
4. **Scroll to error:** When the error banner appears at the top after a server validation failure, the user may not see it if they scrolled down. Add `scrollIntoView` or use a toast for errors.

### 3.4 Loading States

**Current State:**
- No skeleton loading for list pages -- data is loaded server-side (SSR), so the page renders with data. This is acceptable for SSR.
- Fetcher operations show Loader2 spinners -- good.
- PDF downloads show loading state via `usePDFDownload` hook -- good.
- Content editor has `<Suspense fallback={<div className="border-b h-32 animate-pulse bg-zinc-50" />}>` -- good lazy loading skeleton.

**Recommended Improvements:**
1. **Navigation loading indicator:** Add a global loading bar (e.g., NProgress-style) in the root layout for route transitions. React Router 7 supports `useNavigation()` at the layout level.
2. **Optimistic updates:** PO/PI/Shipping status toggles already use optimistic status -- good. Consider adding optimistic UI for inline field edits in Orders.

### 3.5 Empty States

**Current State:** All list pages show a centered text message for empty/no-results states. Examples:
- "등록된 PO가 없습니다."
- "검색 결과가 없습니다."

**Recommended Improvements:**
1. **Add icon + action:** Empty states should include a relevant icon and a CTA button. Example:
   ```
   [FileText icon]
   등록된 PO가 없습니다.
   [PO 작성하기 버튼]
   ```
2. **Differentiate empty vs. no-results:** Empty state (no data at all) should show onboarding guidance. No-results (search/filter returned nothing) should show "검색 결과가 없습니다" with a "필터 초기화" button.

### 3.6 Confirmation Dialogs for Destructive Actions

All delete operations use `AlertDialog` with clear title, description, and red action button -- excellent consistency.

**Minor Issues:**
- Orders delete dialog does not show `Loader2` spinner during deletion (compare with PO/PI which do show spinner). File: `app/routes/_layout.orders.$id.tsx` line 202.
- Delivery delete dialog also missing spinner on the action button.

---

## 4. Accessibility Audit

### 4.1 Keyboard Navigation

**Good:**
- All table rows have `tabIndex={0}` and `onKeyDown` handlers for Enter/Space -- excellent.
- Dropdown menus, dialogs, and alert dialogs from shadcn/ui (Radix) have built-in keyboard support.
- Mobile card items in PO/PI list pages use `<Link>` which is naturally keyboard-accessible.

**Issues:**
- Mobile cards in Orders, Customs, Delivery lists use `<button>` with `onClick` + `navigate()`. While technically accessible, using `<Link>` would be more semantic and enable middle-click/ctrl-click to open in new tab.
- The customs fee toggle in `OrderInlineFields` uses a custom `<button>` with `role="switch"` and `aria-checked` -- good.
- Inline edit fields (click-to-edit) have no visual indicator that they are editable other than hover state. Consider adding a pencil icon or "클릭하여 수정" tooltip.

### 4.2 Labels & ARIA

**Good:**
- All form fields have `<Label htmlFor="...">` paired with `id` on inputs -- good.
- `SidebarTrigger` has a screen-reader accessible label.
- Back button has `<span className="sr-only">뒤로</span>` -- good.

**Issues:**
- Table action buttons (edit/delete) in Settings pages have icons only, no `aria-label`. Add `aria-label="수정"` and `aria-label="삭제"` to icon-only buttons.
- The MoreHorizontal dropdown trigger button in detail pages has no `aria-label`. Should add `aria-label="더보기"` or `aria-label="액션 메뉴"`.
- Search inputs lack `aria-label` (the placeholder serves as visual label but not for screen readers). Add `aria-label="검색"`.

### 4.3 Color Contrast

- Badge colors (green-100/green-700, amber-100/amber-700) meet WCAG AA contrast requirements.
- `text-zinc-400` on white background may not meet AA for small text (contrast ratio ~3.3:1, need 4.5:1). Used extensively for:
  - Empty state messages
  - Meta info text
  - Placeholder-style secondary text

**Recommendation:** Change `text-zinc-400` to `text-zinc-500` (contrast ratio ~5:1) for body text that conveys information. Keep `text-zinc-400` only for truly decorative elements.

### 4.4 Focus Management

- AlertDialog correctly traps focus and returns focus on close (Radix built-in).
- Inline edit fields (`OrderInlineFields`) correctly auto-focus via `useEffect` + `inputRef.current?.focus()` -- good.
- Content editor Tiptap handles its own focus management.

**Issue:** When a dialog closes after a successful action (e.g., OrgDialog auto-closes), focus is not explicitly returned to the triggering element. This is a minor Radix behavior issue but could be improved.

---

## 5. Specific Component Improvements

### 5.1 `app/components/layout/page-container.tsx`

**Current:** `p-6` padding on all sides.

**Issue:** On very small screens (320px), `p-6` (24px) leaves only 272px for content. Consider reducing to `p-4 md:p-6`.

**Proposed Change:**
```tsx
className={cn(
  "flex flex-col gap-4 p-4 md:gap-6 md:p-6",
  !fullWidth && "max-w-7xl mx-auto",
  className
)}
```

### 5.2 `app/components/layout/app-sidebar.tsx`

**Current:** Standard shadcn sidebar with collapsible settings section.

**Issues:**
1. No active route highlighting for home page (sidebar has no "대시보드" link).
2. Logout form inside a DropdownMenuItem causes the entire menu item to be a form/button -- the click target is a nested `<button>` inside a `<DropdownMenuItem>`. This works but is semantically odd. Consider using `fetcher.submit` onClick instead.

**Proposed Improvements:**
- Add a "대시보드" / "홈" link at the top of the nav items pointing to `/`.
- Ensure the sidebar auto-closes on mobile after navigation (shadcn sidebar may already handle this via `SidebarProvider`).

### 5.3 `app/components/layout/header.tsx`

**Issue:** Title text can overflow when combined with multiple action buttons on narrow screens.

**Proposed Changes:**
1. Add `truncate min-w-0` to the `<h1>` element.
2. Add `shrink-0` to the children wrapper `<div>`.
3. Consider wrapping header content in `flex-wrap` for extremely narrow cases.

```tsx
{title && (
  <h1 className="text-sm font-semibold text-foreground truncate min-w-0 flex-1">{title}</h1>
)}
{children && <div className="ml-auto flex items-center gap-2 shrink-0">{children}</div>}
```

### 5.4 `app/components/content/content-editor.tsx`

**Mobile Editing Experience:**

**Issues:**
1. The toolbar buttons are small touch targets. Consider increasing padding for mobile.
2. Tiptap prose area `min-h-[120px]` is good for desktop but could use more vertical space on mobile where the virtual keyboard takes screen space.
3. No mobile-specific toolbar adaptation (e.g., collapsing less-used buttons behind a "more" menu).

**Proposed Improvements:**
- Add `min-h-[180px] md:min-h-[120px]` for more comfortable mobile editing.
- Ensure toolbar scrolls horizontally on narrow screens if it wraps.

### 5.5 `app/components/content/content-section.tsx`

**Current:** Collapsible card with editor, attachments, and comments.

**Issue:** The bottom padding `pb-32` mentioned in system prompt for scroll accessibility in sheets is not applied here. If the content section is near the bottom of a page, the mobile keyboard may obscure the editor.

**Proposed:** Add `pb-safe` or extra bottom padding to the last content section on detail pages.

### 5.6 Stuffing Section Components

The shipping stuffing components (`stuffing-section.tsx`, `stuffing-roll-table.tsx`, `stuffing-container-card.tsx`) were not read in detail but are shipping-specific. Recommend auditing:
- Roll table mobile layout (likely table-based, may need card view)
- CSV upload UX on mobile
- Container form dialog mobile sizing

---

## 6. Dashboard Design Proposal

### 6.1 Layout (Mobile-First)

```
Mobile:
+------------------------+
| [진행 PO: 12] [진행 PI: 8]  |  <- grid-cols-2
| [진행 선적: 5] [대기 배송: 3] |
+------------------------+
| 주요 알림                |  <- full width card
| - CY 초과 위험 2건       |
| - 변경요청 대기 3건      |
| - 통관비 미수령 4건      |
+------------------------+
| 최근 활동                |  <- full width card
| ...                     |
+------------------------+

Desktop:
+--------------------------------------------+
| [진행 PO] [진행 PI] [진행 선적] [대기 배송]    |  <- grid-cols-4
+--------------------------------------------+
| 주요 알림 (1/2)       | 최근 활동 (1/2)      |  <- grid-cols-2
+--------------------------------------------+
```

### 6.2 Data Requirements

New loader `app/loaders/home.server.ts`:
```typescript
// Counts
const [poCount, piCount, shippingCount, deliveryCount,
       cyWarnings, pendingRequests, unreceivedFees, recentItems] = await Promise.all([
  supabase.from("purchase_orders").select("id", { count: "exact", head: true }).eq("status", "process").is("deleted_at", null),
  supabase.from("proforma_invoices").select("id", { count: "exact", head: true }).eq("status", "process").is("deleted_at", null),
  supabase.from("shipping_docs").select("id", { count: "exact", head: true }).eq("status", "process").is("deleted_at", null),
  supabase.from("deliveries").select("id", { count: "exact", head: true }).in("status", ["pending", "scheduled"]),
  // CY warnings: orders with arrival_date set but no customs_date within X days
  // Pending change requests count
  // Unreceived customs fees count
  // Recent 10 items across modules ordered by updated_at
]);
```

### 6.3 Components to Create

1. `app/components/dashboard/stat-card.tsx` -- Reusable stat card with icon, count, label, link
2. `app/components/dashboard/alert-list.tsx` -- Warning/alert items with badges
3. `app/components/dashboard/recent-activity.tsx` -- Recent activity timeline

---

## 7. Cross-Cutting Improvements

### 7.1 List Page Abstraction

All 6 list pages share nearly identical structure:
1. Header with title + create button
2. PageContainer with tabs + search + desktop table + mobile cards

**Recommendation:** Create a shared `DocumentListPage` component or custom hook (`useDocumentList`) to reduce ~150 lines of duplicated code per list page.

### 7.2 Loading/Error State Wrapper

The error banner pattern is repeated in every page. Create a shared `ErrorBanner` component:
```tsx
export function ErrorBanner({ error }: { error?: string | null }) {
  if (!error) return null;
  return (
    <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
      {error}
    </div>
  );
}
```

### 7.3 Global Navigation Loading Bar

Add to `app/routes/_layout.tsx`:
```tsx
import { useNavigation } from "react-router";

// Inside component:
const navigation = useNavigation();
const isNavigating = navigation.state === "loading";

// Render a thin top bar:
{isNavigating && (
  <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-blue-500 animate-pulse" />
)}
```

### 7.4 `<a>` Tag to `<Link>` Migration

Found in:
- `app/components/customs/customs-detail-info.tsx` line 48 -- uses `<a href=...>` instead of `<Link to=...>`

---

## 8. Priority Summary

### Critical (Must Fix)
1. **Settings pages mobile layout** -- Organizations, Products, Users tables are unusable on mobile
2. **Dashboard home page** -- Currently a placeholder; needs real content

### High Priority
1. **Header title overflow** on detail pages with long titles + multiple action buttons
2. **Saelim portal header padding** -- `px-8` too wide on mobile
3. **PageContainer mobile padding** -- Consider `p-4 md:p-6`
4. **Search input accessibility** -- Missing `aria-label`
5. **Icon-only button accessibility** -- Missing `aria-label` on edit/delete buttons in Settings

### Medium Priority
1. **Consistent spacing** -- Standardize `flex flex-col gap-6` vs `space-y-4` across detail pages
2. **Consistent CardTitle styles** -- `text-base` vs `text-sm font-semibold text-zinc-700`
3. **Consistent meta footer wording** -- `작성:` vs `생성:`
4. **Customs form card style** -- Plain div vs Card component
5. **Filter bar breakpoint** -- Standardize `sm:` vs `md:` across list pages
6. **Empty states with icons and CTAs**
7. **`<a>` to `<Link>` migration** in customs detail info
8. **Color contrast** -- `text-zinc-400` to `text-zinc-500` for informational text
9. **Add sidebar home/dashboard link**
10. **Delete dialog loading spinners** -- Add to Orders and Delivery detail delete buttons

### Low Priority
1. **Navigation loading bar** -- Global route transition indicator
2. **Field-level validation errors** -- Inline Zod error display
3. **Content editor mobile toolbar** -- Larger touch targets
4. **List page code deduplication** -- Shared `DocumentListPage` abstraction
5. **ErrorBanner shared component**
6. **Scroll to error on form validation failure**

---

## 9. File Reference Index

### Route Pages
- `app/routes/_layout.home.tsx` -- Dashboard (placeholder)
- `app/routes/_layout.tsx` -- GV layout
- `app/routes/_layout.po.tsx` -- PO list
- `app/routes/_layout.po.$id.tsx` -- PO detail
- `app/routes/_layout.po.new.tsx` -- PO create
- `app/routes/_layout.po.$id.edit.tsx` -- PO edit
- `app/routes/_layout.pi.tsx` -- PI list
- `app/routes/_layout.pi.$id.tsx` -- PI detail
- `app/routes/_layout.pi.new.tsx` -- PI create
- `app/routes/_layout.pi.$id.edit.tsx` -- PI edit
- `app/routes/_layout.shipping.tsx` -- Shipping list
- `app/routes/_layout.shipping.$id.tsx` -- Shipping detail
- `app/routes/_layout.shipping.new.tsx` -- Shipping create
- `app/routes/_layout.shipping.$id.edit.tsx` -- Shipping edit
- `app/routes/_layout.orders.tsx` -- Orders list
- `app/routes/_layout.orders.$id.tsx` -- Order detail
- `app/routes/_layout.customs.tsx` -- Customs list
- `app/routes/_layout.customs.$id.tsx` -- Customs detail
- `app/routes/_layout.customs.new.tsx` -- Customs create
- `app/routes/_layout.customs.$id.edit.tsx` -- Customs edit
- `app/routes/_layout.delivery.tsx` -- Delivery list
- `app/routes/_layout.delivery.$id.tsx` -- Delivery detail
- `app/routes/_layout.settings.organizations.tsx` -- Org settings (NO mobile layout)
- `app/routes/_layout.settings.products.tsx` -- Product settings (NO mobile layout)
- `app/routes/_layout.settings.users.tsx` -- User settings (NO mobile layout)
- `app/routes/_saelim.tsx` -- Saelim portal layout
- `app/routes/_saelim.delivery.tsx` -- Saelim delivery list
- `app/routes/_saelim.delivery.$id.tsx` -- Saelim delivery detail
- `app/routes/_auth.login.tsx` -- Login page

### Layout Components
- `app/components/layout/page-container.tsx` -- Page wrapper
- `app/components/layout/header.tsx` -- Page header
- `app/components/layout/app-sidebar.tsx` -- Sidebar navigation

### Shared Components
- `app/components/shared/doc-status-badge.tsx` -- Status badge
- `app/components/content/content-section.tsx` -- Content system
- `app/components/content/content-editor.tsx` -- Tiptap editor

### Module Components
- `app/components/po/po-form.tsx`, `po-detail-info.tsx`, `po-detail-items.tsx`
- `app/components/pi/pi-form.tsx`, `pi-detail-info.tsx`, `pi-detail-items.tsx`
- `app/components/shipping/shipping-form.tsx`, `shipping-detail-info.tsx`, `shipping-detail-items.tsx`
- `app/components/customs/customs-form.tsx`, `customs-detail-info.tsx`, `customs-fee-summary.tsx`
- `app/components/orders/order-create-dialog.tsx`, `order-doc-links.tsx`, `order-inline-fields.tsx`, `order-date-timeline.tsx`
- `app/components/delivery/delivery-info-card.tsx`, `change-request-card.tsx`, `change-request-form.tsx`
