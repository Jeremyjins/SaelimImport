# Phase 8: Delivery Management - Research Notes

**Date:** 2026-03-06
**Researcher:** Research Agent

---

## 1. Delivery Tracking UX Best Practices

### Timeline/Status Visualization
- B2B logistics apps typically use a **horizontal step indicator** (ordered → shipped → customs → delivered)
- For Saelim's use case, a simpler approach fits: status badge + date display
- Recommended: Use `Badge` component with color coding (same as change request statuses)

### Status Progression for Delivery
- **pending** (대기): Created from PI, no date set yet
- **scheduled** (예정): Delivery date has been set by GV
- **delivered** (완료): Confirmed delivered

### Key UX Insight
- Don't over-engineer tracking. This is paper roll delivery by truck in Korea, not global parcel tracking
- A simple date + status badge is more practical than a full timeline component
- Focus UX effort on the change request workflow, which is the main user interaction

---

## 2. Change Request Workflow Patterns

### Approval Workflow Best Practices
1. **Single pending request per delivery**: Prevents confusion. Block new submission while one is pending.
2. **Auto-apply on approval**: When GV approves, automatically update delivery_date. Don't make them approve AND manually change the date.
3. **Required rejection reason**: GV must explain why a request was rejected. This builds trust.
4. **Immutable history**: Never delete change requests. They form an audit trail.

### Notification Strategy
- **Phase 8 recommendation**: No separate notification system. Use visual indicators:
  - GV: Amber badge with count on delivery list items (e.g., "대기 2건")
  - Saelim: Status badge on their own requests
- **Future consideration**: In-app notification could be added in Phase 10 if needed
- Email notification is overkill for 5-10 users

### UI Pattern
- Request → Review → Resolve is a standard "inbox" pattern
- GV's delivery detail page acts as the "inbox" for pending requests
- Saelim's detail page acts as the "submission + history" view

---

## 3. React Router 7 Dual-Layout Pattern

### Should GV and Saelim share loaders?
**Recommendation: Separate loaders for each portal.**

Reasons:
1. **Different auth guards**: `requireGVUser` vs `requireAuth` + org_type check
2. **Different data shapes**: GV sees pricing, Saelim doesn't
3. **Different action sets**: GV has approve/reject/delete, Saelim has submit_request only
4. **Clearer security boundary**: Separate files make code review easier
5. **Existing pattern**: The project already has `_saelim.tsx` as a separate layout

### Shared Code
What CAN be shared:
- TypeScript types (`delivery.ts`)
- Zod schemas (`delivery.schema.ts`)
- Sync helpers (`order-sync.server.ts`)
- UI components with `showActions` prop pattern

What should NOT be shared:
- Loader/action functions (different auth, different queries)
- Route components (different layout, different features)

---

## 4. Supabase RLS for Multi-Role Access

### Best Practices
1. **Use `get_user_org_type()` function**: Already established pattern. Reads from `app_metadata` JWT claim.
2. **Separate policies per operation**: Don't combine SELECT + INSERT in one policy. Split for clarity.
3. **Bake `deleted_at IS NULL` into Saelim SELECT policy**: Extra safety layer against application bugs.
4. **No UPDATE for Saelim on change_requests**: Prevents self-approval at the DB level.

### Performance Consideration
- `get_user_org_type()` is called per-row. For small datasets (< 1000 rows), this is negligible.
- If performance becomes an issue, consider caching the result per-query using a CTE:
  ```sql
  WITH user_type AS (SELECT get_user_org_type() as t)
  ```
- This optimization is NOT needed for Phase 8's data volume.

---

## 5. Date Picker UX

### Existing Project Pattern
The project uses native `<input type="date">` throughout (PO, PI, Shipping, Orders, Customs).

**Recommendation: Continue using native `<input type="date">`**

Reasons:
1. Consistent with existing codebase
2. Native mobile date picker UX is excellent
3. No additional library needed
4. Shadcn Calendar component exists but adds complexity and bundle size
5. For change requests, the date picker needs to be simple (just pick a date)

### Implementation
```tsx
<Input
  type="date"
  name="requested_date"
  min={new Date().toISOString().split("T")[0]} // today
  className="w-full md:w-64"
/>
```

---

## 6. Optimistic UI for Approval Workflows

### Existing Pattern in the Project
The project already uses optimistic UI extensively via the fetcher pattern:
```typescript
const currentAction = (fetcher.formData as FormData | null)?.get("_action") as string | null;
const isApproving = fetcher.state !== "idle" && currentAction === "approve_request";
```

### Recommendations for Phase 8

1. **Approve/Reject**: Show optimistic status change on the card while fetcher is in flight
2. **Submit request**: Disable form + show spinner on button
3. **Inline date edit**: Show optimistic value (same pattern as OrderInlineFields)
4. **Error rollback**: Use `useEffect` + `prevStateRef` pattern (already established)
5. **Toast feedback**: Use `sonner` toast (already in the project)

### Example Pattern
```tsx
// Optimistic badge for approval
const optimisticStatus = isApproving ? "approved" : request.status;

// Toast feedback
useEffect(() => {
  if (prevStateRef.current !== "idle" && fetcher.state === "idle") {
    const result = fetcher.data as { success?: boolean; error?: string } | null;
    if (result?.error) toast.error(result.error);
    else if (result?.success) toast.success("변경요청이 승인되었습니다.");
  }
  prevStateRef.current = fetcher.state;
}, [fetcher.state, fetcher.data]);
```

---

## 7. ContentSection Decision

### Should Delivery use ContentSection?

**Architect's recommendation**: No. Use a simple `notes` TEXT column instead.
**Counter-argument**: ContentSection is already built and provides rich text + file attachments.

**Final recommendation**: YES, use ContentSection for GV delivery detail.

Reasons:
1. The content system is already built and works with zero additional code
2. Just add `"delivery"` to ContentType union and PARENT_TABLE_MAP
3. Provides file attachment capability (e.g., delivery photos, signed receipts)
4. Saelim does NOT get ContentSection (GV-internal only)
5. No need for a separate `notes` column on deliveries table (avoid schema changes when existing system works)

This avoids the architect's proposed schema migration for `notes` and `delivery_address` columns, keeping the schema lean.

---

## 8. Implementation Phase Recommendation

### Phase 8-A (GV Side)
1. Schema migration: RLS policies + performance indexes (via Supabase MCP)
2. Types: `app/types/delivery.ts`
3. Content system: Add `"delivery"` to ContentType + PARENT_TABLE_MAP
4. Sync: Add `unlinkDeliveryFromOrder` to order-sync.server.ts
5. Backend: GV loaders (delivery.server.ts, delivery.$id.server.ts)
6. Frontend: GV list + detail pages with change request management
7. Zod schemas: delivery.schema.ts

### Phase 8-B (Saelim Portal)
1. Backend: Saelim loaders (saelim.delivery.server.ts, saelim.delivery.$id.server.ts)
2. Frontend: Saelim list + detail pages
3. Change request submission form
4. RLS verification testing with Saelim user account
