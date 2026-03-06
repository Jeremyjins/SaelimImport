# Phase 8: Delivery Management - Security Review Notes

**Date:** 2026-03-06
**Reviewer:** Security Agent
**Scope:** deliveries table, delivery_change_requests table, Saelim portal write access

---

## Executive Summary

Phase 8 is the first module where Saelim users (external buyer, org_type: "saelim") are granted
write access. This makes it categorically more sensitive than all previous phases. The primary
risks are: (1) data leakage of GV's purchase pricing through FK join paths, (2) Saelim users
manipulating change requests they did not author or self-approving requests, and (3) insufficient
RLS allowing Saelim to access delivery data outside their own scope.

---

## 1. Critical (Must Fix)

### [CRIT-1] Saelim Loader Must Not Join PI Pricing Columns

If the Saelim delivery loader joins proforma_invoices with `(*)`, it exposes amount, currency, details
(per-kg unit prices GV pays to CHP in USD). This is the most serious data isolation requirement.

Safe Saelim SELECT:
```
"id, delivery_date, created_at, " +
"pi:proforma_invoices!pi_id(pi_no, pi_date), " +
"shipping:shipping_documents!shipping_doc_id(ci_no, vessel, voyage, etd, eta)"
```

Safe vs Forbidden fields:

| Table | Safe for Saelim | Forbidden |
|-------|----------------|-----------|
| proforma_invoices | pi_no, pi_date | amount, currency, details, supplier_id, buyer_id, po_id, payment_term, delivery_term, notes, validity, ref_no |
| shipping_documents | ci_no, vessel, voyage, etd, eta | amount, currency, details, shipper_id, consignee_id, payment_term, notes, ci_date, ship_date, ref_no, weights, package_no, pl_no |

### [CRIT-2] Every Saelim Loader/Action Must Independently Verify org_type

The `_saelim.tsx` layout loader checks org_type, but layout loaders run independently from child
route loaders. Direct POST bypasses layout. Required in ALL Saelim loaders/actions:

```typescript
const { user, supabase, responseHeaders } = await requireAuth(request, context);
if (user.app_metadata?.org_type !== ORG_TYPES.SAELIM) {
  throw redirect("/", { headers: responseHeaders });
}
```

### [CRIT-3] Verify requested_by Ownership Before Mutation

When Saelim cancels a change request, verify ownership server-side:
```typescript
if (!reqCheck || reqCheck.requested_by !== user.id) {
  return data({ success: false, error: "요청을 찾을 수 없습니다." }, { status: 404 });
}
```

### [CRIT-4] GV Approve/Reject Must Use requireGVUser

The action for approving/rejecting must call `requireGVUser`, not `requireAuth`.
Saelim must never reach approve/reject intents.

### [CRIT-5] GV Delivery Routes Must Call requireGVUser

`_layout.delivery.tsx` is currently a stub with no loader. Must add auth before Phase 8 ships.

---

## 2. RLS Policy Design

### deliveries table
```sql
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

-- GV: full CRUD
CREATE POLICY "gv_all" ON public.deliveries
  FOR ALL
  USING (get_user_org_type() = 'gv')
  WITH CHECK (get_user_org_type() = 'gv');

-- Saelim: SELECT only
CREATE POLICY "saelim_select" ON public.deliveries
  FOR SELECT
  USING (get_user_org_type() = 'saelim' AND deleted_at IS NULL);
```

### delivery_change_requests table
```sql
ALTER TABLE public.delivery_change_requests ENABLE ROW LEVEL SECURITY;

-- GV: full CRUD
CREATE POLICY "gv_all" ON public.delivery_change_requests
  FOR ALL
  USING (get_user_org_type() = 'gv')
  WITH CHECK (get_user_org_type() = 'gv');

-- Saelim: INSERT own
CREATE POLICY "saelim_insert" ON public.delivery_change_requests
  FOR INSERT
  WITH CHECK (get_user_org_type() = 'saelim' AND requested_by = auth.uid());

-- Saelim: SELECT own
CREATE POLICY "saelim_select" ON public.delivery_change_requests
  FOR SELECT
  USING (get_user_org_type() = 'saelim' AND requested_by = auth.uid());
```

No UPDATE/DELETE for Saelim (cannot self-approve).

---

## 3. Attack Vectors

| # | Attack | Mitigation |
|---|--------|-----------|
| 1 | Submit request for soft-deleted delivery | App-level: check `deleted_at IS NULL` before INSERT |
| 2 | Self-approve by POSTing status=approved | RLS: no UPDATE for Saelim. Approve intent only in GV action. |
| 3 | Modify another user's request | RLS: `requested_by = auth.uid()`. App-level ownership check. |
| 4 | Spam unlimited requests | App-level: reject if pending request already exists for delivery |
| 5 | Past/absurd future date | Server-side: validate `requested_date > today` and `< 2 years` |
| 6 | Spoof requested_by in FormData | Never read from FormData. Always set `requested_by: user.id` server-side. |

---

## 4. Data Leakage Prevention

- Saelim loader must NOT join customs, orders, or purchase_orders tables
- Error messages must be generic Korean strings (no Supabase error.message forwarding)
- `responseHeaders` must always be forwarded in every `data()` and `redirect()` call
- `responded_by` set from `user.id` server-side (never from FormData)

---

## 5. Performance Indexes

```sql
CREATE INDEX idx_deliveries_active ON public.deliveries (created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_dcr_delivery_id ON public.delivery_change_requests (delivery_id);
CREATE INDEX idx_dcr_requested_by ON public.delivery_change_requests (requested_by);
CREATE INDEX idx_dcr_status_pending ON public.delivery_change_requests (delivery_id) WHERE status = 'pending';
```

---

## 6. Security Checklist

### DB Layer
- [ ] deliveries RLS enabled + gv_all + saelim_select policies
- [ ] delivery_change_requests RLS enabled + gv_all + saelim_insert + saelim_select policies
- [ ] No UPDATE/DELETE policy for Saelim on delivery_change_requests
- [ ] Performance indexes created

### Saelim Application Layer
- [ ] requireAuth + org_type === 'saelim' in every loader AND action
- [ ] SELECT uses only safe columns (no PI amount/currency/details)
- [ ] No FK join to customs, purchase_orders, or orders
- [ ] requested_by set from user.id server-side
- [ ] requested_date validated as future date
- [ ] reason: min 1 char, max 500 chars
- [ ] Pending request guard before INSERT
- [ ] Delivery existence check (not soft-deleted)
- [ ] All data()/redirect() pass responseHeaders
- [ ] Generic error messages only

### GV Application Layer
- [ ] requireGVUser in all loaders AND actions
- [ ] URL param $id validated as UUID
- [ ] responded_by set from user.id server-side
- [ ] responseHeaders forwarded

### Passed (Inherited)
- app_metadata.org_type used for role (tamper-proof)
- get_user_org_type() reads from JWT app_metadata claim
- requireAuth calls getUser() (not getSession())
- Soft delete pattern consistent
- Zod safeParse used throughout
- No service role key in client code
