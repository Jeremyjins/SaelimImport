# Phase 6: Order Management - Research Notes

**Date:** 2026-03-06
**Role:** Researcher
**Scope:** CY free time rules, aggregation UX patterns, PostgREST performance, timeline UI, inline editing

---

## 1. CY (Container Yard) Free Time Rules

### 1.1 Korean Port Standards (Busan)

- **Free Time**: Typically 5-14 days depending on shipping line and contract
- Industry standard: **14 days** free time for FCL (Full Container Load)
- LCL (Less than Container Load) may have shorter free time (7-10 days)
- CHP-GV-Saelim trade uses FCL: **14 days is the appropriate baseline**

### 1.2 Calculation Method

```
CY Days = Customs Clearance Date - CY Arrival Date
```

- **CY Arrival Date**: Usually equals ETA or actual vessel arrival date
- **If customs not yet cleared**: Use today's date instead of customs_date
- **Demurrage** (CY storage fee): Applies after free time expires
- **Detention** (container usage fee): Separate from demurrage, applies when container leaves CY but isn't returned

### 1.3 Practical Implementation

```typescript
function calcCYFreeTime(arrivalDate: string | null, customsDate: string | null) {
  if (!arrivalDate) return null;

  const arrival = new Date(arrivalDate);
  const endDate = customsDate ? new Date(customsDate) : new Date();
  const days = Math.ceil((endDate.getTime() - arrival.getTime()) / (1000 * 60 * 60 * 24));

  if (days < 0) return { days: Math.abs(days), status: "pending" };  // Not yet arrived
  if (days <= 10) return { days, status: "ok" };
  if (days <= 14) return { days, status: "warning" };
  return { days, status: "overdue" };
}
```

### 1.4 Recommendation

- Use **14 days** as the default free time constant
- Calculate client-side for real-time "today" accuracy
- Four status levels: pending (gray), ok (green), warning (amber), overdue (red)
- Priority: `arrival_date` > `shipping.eta` for CY start date

---

## 2. Order Management UX Patterns

### 2.1 Trade Management Systems Reference

**Flexport Pattern:**
- Order as a timeline/progress view
- Horizontal milestones: Booked → Departed → In Transit → Arrived → Delivered
- Each milestone links to related documents

**CargoSmart Pattern:**
- Shipment tracking dashboard with document cards
- Status badges per document type
- Date-centric timeline visualization

### 2.2 Key Insight: Orders Are Views, Not Documents

Unlike PO/PI/Shipping which are "documents" with rich data, an Order is a **tracking view**:
- Minimal self-owned data (saelim_no, 3 dates, 1 boolean)
- Primary value: aggregating linked documents in one place
- Users come here to see "where is my order?" not to edit data

### 2.3 Recommended Pattern

**Dashboard-style aggregation** with:
1. Progress timeline (milestones with dates)
2. Document link cards (navigate to source documents)
3. Inline editable metadata (minimal)
4. Status alerts (CY warning)

---

## 3. Supabase PostgREST Multi-JOIN Performance

### 3.1 How PostgREST Handles JOINs

PostgREST translates FK select syntax into SQL LEFT JOINs. For 5 FK JOINs:

```sql
-- Generated SQL (approximate)
SELECT o.*,
  po.po_no, po.status,
  pi.pi_no, pi.status,
  sd.ci_no, sd.vessel, sd.eta,
  c.customs_no, c.customs_date,
  d.delivery_date
FROM orders o
LEFT JOIN purchase_orders po ON o.po_id = po.id
LEFT JOIN proforma_invoices pi ON o.pi_id = pi.id
LEFT JOIN shipping_documents sd ON o.shipping_doc_id = sd.id
LEFT JOIN customs c ON o.customs_id = c.id
LEFT JOIN deliveries d ON o.delivery_id = d.id
WHERE o.deleted_at IS NULL
ORDER BY o.created_at DESC;
```

### 3.2 Performance Characteristics

- **No N+1 problem**: All JOINs resolved in single SQL query
- **1:1 relationships**: Each FK points to exactly one row. No array expansion.
- **Index usage**: All FK columns are uuid type with foreign key constraints (auto-indexed in PostgreSQL)
- **Expected performance**: < 50ms for 100 orders, < 200ms for 1000 orders

### 3.3 Nested JOINs (Detail Page)

PostgREST supports depth-2 nesting:
```
po:purchase_orders!po_id(id, po_no, supplier:organizations!supplier_id(name_en))
```
This generates a nested LEFT JOIN. Still efficient for single-row detail queries.

### 3.4 Recommendation

- Use single query with 5 FK JOINs for both list and detail
- No need for Views, RPCs, or separate queries
- No pagination needed initially (< 500 orders expected)
- Add partial indexes on FK columns with `WHERE deleted_at IS NULL` for optimization

---

## 4. Date Timeline UI Components

### 4.1 Options Evaluated

| Approach | Pros | Cons |
|----------|------|------|
| Custom Tailwind CSS | Full control, no deps | More code |
| Recharts horizontal bar | Already in project | Overkill for simple timeline |
| Third-party timeline | Ready-made | Extra dependency |

### 4.2 Recommendation: Custom Tailwind CSS

A simple step indicator with:
- Horizontal layout on desktop (`hidden md:flex`)
- Vertical layout on mobile (`md:hidden`)
- Circle indicators (green=done, blue=next, gray=pending)
- Connecting lines between steps
- Date text below each step

**No additional dependencies needed.** Pure Tailwind + React. Matches existing component patterns.

### 4.3 Reference Implementation Pattern

```tsx
// 6 steps: advice → ETD → ETA → arrival → customs → delivery
const steps = [
  { key: "advice", label: "어드바이스", date: order.advice_date },
  { key: "etd", label: "출항일", date: order.shipping?.etd },
  { key: "eta", label: "도착예정", date: order.shipping?.eta },
  { key: "arrival", label: "도착", date: order.arrival_date },
  { key: "customs", label: "통관", date: order.customs?.customs_date },
  { key: "delivery", label: "배송", date: order.delivery_date },
];
```

---

## 5. Inline Editing Patterns in React

### 5.1 Options Evaluated

| Pattern | UX | Complexity | Fit for Order |
|---------|-----|-----------|---------------|
| Click-to-edit | Clean, minimal | Medium | Good for text fields |
| Always-visible inputs | Direct | Low | Best for date fields |
| Edit mode toggle | Clear separation | Low | Good for batch updates |
| Optimistic updates | Responsive feel | High | Overkill for infrequent edits |

### 5.2 Recommendation: Hybrid Approach

- **Date fields (advice, arrival, delivery)**: Always-visible date inputs. Date pickers are compact and immediately actionable.
- **Text fields (saelim_no)**: Click-to-edit. Shows text normally, transforms to input on click.
- **Boolean (customs_fee_received)**: Switch/toggle component.

**Save mechanism**: Individual fetcher per field. On blur/change, submit `{ _action: "update_field", field, value }`.

### 5.3 React Router + Fetcher Pattern

```typescript
const fetcher = useFetcher();
const handleSave = (field: string, value: string) => {
  fetcher.submit(
    { _action: "update_fields", [field]: value },
    { method: "post" }
  );
};
```

No optimistic UI needed - the server response is fast enough for an internal tool.

---

## 6. Saelim No (발주번호) Conventions

### 6.1 Korean Import Business

- 발주번호 formats vary by company
- Common patterns: `SL-2603-001`, `24-0315`, `SEL20260301`
- No universal standard - each buyer has their own format

### 6.2 Recommendation

- **Manual entry** (not auto-generated)
- Max 50 characters
- Allow: alphanumeric + hyphen + underscore
- No uniqueness constraint (format not standardized)
- Optional field (can be filled later)

---

## 7. Aggregation Status Logic

### 7.1 Options

| Approach | Description | Pros | Cons |
|----------|-------------|------|------|
| A) Manual toggle | User manually marks complete | Simple, consistent with PO/PI | User must remember |
| B) All docs complete | Auto-complete when all linked docs = complete | Automatic | Complex: which docs are required? |
| C) Milestone-based | Complete when customs cleared + delivered | Business-meaningful | Requires both Phase 7+8 |

### 7.2 Recommendation: Option A (Manual Toggle)

**Rationale:**
- Consistent with existing `DocStatus` pattern (process/complete)
- Reuses `DocStatusBadge` component
- No dependency on unimplemented modules (Customs, Delivery)
- Add `status` column to `orders` table (currently missing)

**Schema change needed:**
```sql
ALTER TABLE orders ADD COLUMN status TEXT NOT NULL DEFAULT 'process';
```

Or use application default if column doesn't exist.

---

## 8. Performance Summary

| Operation | Expected Latency | Bottleneck |
|-----------|-----------------|------------|
| List (5 JOINs, 100 rows) | < 50ms | Single SQL query |
| Detail (5 JOINs, 1 row) | < 20ms | Single SQL query |
| Cascade link (3 rounds) | 150-300ms | Sequential DB calls |
| CY calculation | < 1ms | Client-side arithmetic |
| Inline field update | < 50ms | Single UPDATE |

No performance concerns for the expected data volume (< 500 orders). Pagination deferred.

---

## 9. Missing Schema Consideration: `status` Column

The current `orders` table does NOT have a `status` column. Options:

**A) Add `status` column (recommended):**
```sql
ALTER TABLE orders ADD COLUMN status TEXT NOT NULL DEFAULT 'process';
```
- Enables filter tabs, DocStatusBadge, toggle action
- Consistent with PO/PI/Shipping patterns

**B) Compute from linked docs:**
- Complex: need to define which linked docs determine "complete"
- Depends on unimplemented modules
- Performance cost on list page

**C) No status (just show dates):**
- Orders don't have a clear "done" state
- Users track progress via timeline instead
- Simplest, but inconsistent with other modules

**Decision: A) Add `status` column.** Request DB migration before Phase 6 implementation.

---

## 10. Key Findings Summary

1. **CY Free Time**: 14 days standard for Korean ports. Client-side calculation for real-time accuracy.
2. **PostgREST JOINs**: 5 FK JOINs perform well, no N+1, single SQL query. No need for Views/RPCs.
3. **Timeline UI**: Custom Tailwind CSS, no extra dependencies needed.
4. **Inline Editing**: Hybrid approach (click-to-edit for text, always-visible for dates).
5. **Order Status**: Recommend adding `status` column to `orders` table for consistency.
6. **Saelim No**: Manual entry, no auto-generation, max 50 chars.
7. **No pagination** needed initially for < 500 orders.
