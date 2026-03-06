# Phase 10 Testing Strategy — Tester Notes

## 1. Current Test State

### What Exists

The project has a working Vitest configuration and a modest but well-structured set of existing tests:

**`vitest.config.ts`**
```
environment: "node"
include: ["app/**/*.test.ts"]       // only .test.ts, not .test.tsx
coverage.include: ["app/loaders/**/*.server.ts", "app/lib/**/*.server.ts"]
```

**Existing test files** (all in `app/loaders/__tests__/`):
| File | What it covers |
|------|---------------|
| `auth.schema.test.ts` | loginSchema, org_type redirect logic, requireAuth/GV/Saelim guard simulations |
| `po.schema.test.ts` | lineItemSchema, poSchema, amount recalculation, status toggle, UUID param validation |
| `settings.organizations.schema.test.ts` | orgSchema create/update, deleteSchema UUID guard |
| `settings.products.schema.test.ts` | productSchema, optionalPositiveInt preprocess, deleteSchema |
| `settings.users.schema.test.ts` | inviteSchema (role enum, S-1/S-2 security), deleteSchema self-delete prevention |

**Current test count**: ~120 tests across 5 files

**What is missing entirely**: Tests for PI, Shipping, Customs, Orders, Delivery schemas; all loader/action integration tests; all component tests; all utility function tests (`format.ts`, `customs-utils.ts`, `sanitize.ts`, `order-sync.server.ts`, `pdf-utils.ts`).

### Test Infrastructure Assessment

- **Vitest**: Already installed (v4.0.18) and configured. Zero setup cost.
- **@vitest/coverage-v8**: Already installed. Coverage command (`npm run test:coverage`) already defined.
- **React Testing Library**: NOT installed. Component tests require adding `@testing-library/react` + `@testing-library/user-event`.
- **Playwright**: NOT installed. E2E tests require separate setup.
- **MSW**: IS installed (present in node_modules) but not configured for project use — available for HTTP-level mocking if needed.
- **`vitest.config.ts` gap**: `include` pattern is `app/**/*.test.ts` only. Component tests using `.test.tsx` will not be picked up without config update.

### Key Constraint: Cloudflare Workers

Server files import from `react-router` and `@supabase/supabase-js`. These run fine in Node `environment` because they are pure function calls. The `context.cloudflare.env` access in loaders is a problem for true loader integration tests — the workaround is to mock `requireGVUser`/`requireAuth` entirely, which the existing tests already do implicitly (schema-only tests avoid the CF context).

---

## 2. Testing Strategy

### Tier 1: Unit Tests (Vitest, no React)

Pure logic tests with zero infrastructure dependencies. These are the fastest and most valuable per line of code.

**Priority order:**

1. **`app/lib/format.ts`** — `formatDate`, `formatCurrency`, `formatWeight`, `formatNumber` — null/undefined edge cases, KRW vs USD formatting, zero values.
2. **`app/components/pdf/shared/pdf-utils.ts`** — `formatPdfDate`, `formatPdfCurrency`, `formatPdfNumber`, `formatPdfWeight`, `triggerDownload` (partial) — tests that the en-US locale is used (NOT ko-KR), UTC date handling, KRW round behavior.
3. **`app/lib/sanitize.ts`** — `sanitizeFormulaInjection` — leading `=`, `+`, `-`, `@`, multi-char, unicode, safe strings.
4. **`app/lib/customs-utils.ts`** — `calcTotalFees`, `computeFeeTotal` — null inputs, partial nulls, KRW rounding, grand total arithmetic.
5. **`app/lib/constants.ts`** — passive, no logic tests needed.
6. **`app/lib/utils.ts`** (`cn`) — minimal, but the class merging behavior is worth a quick smoke test.

**Schema tests still needed** (Tier 1, follow existing pattern in `app/loaders/__tests__/`):

| Schema File | Missing Coverage |
|-------------|-----------------|
| `pi.schema.ts` | piSchema full field validation, po_id optional UUID or empty string |
| `shipping.schema.ts` | stuffingRollSchema, stuffingListSchema formula injection via sanitize transform, shippingSchema date optionals |
| `customs.schema.ts` | customsCreateSchema (shipping_doc_id UUID required), customsUpdateSchema, fee field coercion from form strings, MAX_FEE boundary |
| `delivery.schema.ts` | submitChangeRequestSchema (future-date refine), rejectRequestSchema (min 1 reason), approveRequestSchema UUID |
| `orders.schema.ts` | createOrderSchema, updateFieldsSchema date regex, linkDocumentSchema enum, unlinkDocumentSchema |

### Tier 2: Integration Tests — Loaders and Actions (Vitest, mocked Supabase)

These test the server-side loader/action functions directly. The key mock pattern established in the codebase is: mock `~/lib/auth.server` to skip CF context, mock `~/lib/supabase.server` to provide a controlled Supabase mock.

**Mock template** (extend existing approach):
```typescript
import { vi } from "vitest";

const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  is: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  single: vi.fn(),
  rpc: vi.fn(),
  auth: { getUser: vi.fn() },
};

vi.mock("~/lib/auth.server", () => ({
  requireGVUser: vi.fn().mockResolvedValue({
    user: { id: "test-user-id", app_metadata: { org_type: "gv" } },
    supabase: mockSupabase,
    responseHeaders: new Headers(),
  }),
  requireAuth: vi.fn().mockResolvedValue({
    user: { id: "test-user-id", app_metadata: { org_type: "gv" } },
    supabase: mockSupabase,
    responseHeaders: new Headers(),
  }),
}));
```

**Priority loader/action tests:**

#### `po.server.ts` + `po.$id.server.ts`
Critical paths:
- `loader`: requireGVUser called, correct Supabase query, error path returns `{ pos: [], error: "..." }`, success returns `{ pos }`
- `createPOAction`: invalid details JSON → 400, empty details array → 400, invalid poSchema → 400, inactive supplier → 400, rpc failure → 500, insert duplicate → 500 with "이미 존재하는 PO 번호입니다.", success → redirect to `/po/:id`
- `action` update: complete-status block (cannot edit complete PO), amount recalculation confirmed server-side
- `action` delete: soft delete sets `deleted_at`, redirects to `/po`
- `action` clone: today's date used for new po_date, status reset to `process`
- `action` toggle_status: reads DB status, not client-submitted value

#### `pi.server.ts` + `pi.$id.server.ts`
Critical paths:
- PI create from PO reference: `po_id` correctly copied from source PO
- Auto-delivery creation on PI create (verify `deliveries` insert call)
- PI detail loader: 404 on non-UUID param, 404 on deleted_at not null

#### `shipping.$id.server.ts`
Critical paths:
- CSV upload / stuffingRollSchema validation: formula injection sanitization applied
- Weight totals computed server-side (not from client)
- ETD/ETA optional date validation

#### `customs.server.ts` + `customs.$id.server.ts`
Critical paths:
- `createCustomsAction`: fee fields coerced from FormData strings, fee totals computed server-side
- `linkCustomsToOrder` called after create
- `unlinkCustomsFromOrder` called before delete (blocking), delete aborted if unlink fails
- `syncCustomsFeeToOrder` called when fee_received toggled

#### `orders.$id.server.ts`
Critical paths:
- `update_fields` action: delivery_date change → `syncDeliveryDateFromOrder` called
- `toggle_customs_fee`: reads DB value, not client value; `syncCustomsFeeToOrder` called
- `link_document` / `unlink_document`: correct FK column updated via `DOC_TYPE_TO_FK`
- `cascade_link`: only applied when exactly-1 candidates exist (test 0, 1, 2 candidate cases)
- CY warning logic (advice_date present)

#### `delivery.$id.server.ts`
Critical paths:
- `approve_request`: pending request → approved + delivery_date updated + `syncDeliveryDateToOrder` called
- `reject_request`: requires non-empty response_text
- `mark_delivered`: sets status to `delivered`

#### `saelim.delivery.server.ts` + `saelim.delivery.$id.server.ts`
Critical paths:
- Saelim loader redirects to `/` if `org_type !== 'saelim'`
- CRIT-1: price fields absent from SELECT (verify query string does NOT contain `amount`, `currency`)
- CRIT-3: `delivery_change_requests` filtered by `requested_by = user.id`
- `submit_change_request`: future-date validation, pending request exists → 409, `requested_by` forced to `user.id` server-side (not from FormData)
- Saelim user cannot call GV-only actions (approve/reject/mark_delivered)

### Tier 3: Component Tests (Vitest + React Testing Library)

Requires adding `@testing-library/react` and updating `vitest.config.ts` to include `.test.tsx`.

**Infrastructure change needed in `vitest.config.ts`**:
```typescript
test: {
  environment: "jsdom",           // change from "node"
  include: ["app/**/*.test.{ts,tsx}"],   // add .tsx
  setupFiles: ["app/test/setup.ts"],     // add RTL setup
}
```

Or use a dual-environment approach with per-file environment annotations.

**Setup file** (`app/test/setup.ts`):
```typescript
import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
afterEach(() => cleanup());
```

**Priority component tests:**

| Component | What to Test |
|-----------|-------------|
| PO list page | Korean tab labels (전체/진행/완료), PO number format display, date column |
| PI detail page | "PI 상세" heading, connected PO section visible, line items table |
| Shipping form | ETD/ETA fields present, CSV upload section present |
| Order detail | Inline edit click-to-edit pattern triggers fetcher, CY warning banner |
| Delivery (GV) | Approve/reject buttons visible, mark delivered only when scheduled |
| Delivery (Saelim) | Price fields NOT rendered, change request form visible, pending request disables form |

**Mock pattern for components** (using `createRoutesStub` from react-router):
```tsx
import { createRoutesStub } from "react-router";

const Stub = createRoutesStub([
  {
    path: "/po/:id",
    Component: PODetailPage,
    loader() {
      return { po: mockPO, pis: [], content: null, userId: "test-user" };
    },
  },
]);
render(<Stub initialEntries={["/po/test-uuid"]} />);
```

### Tier 4: E2E Tests (Playwright)

Highest value but highest setup cost. Recommend deferring to after Tier 1-2 are complete.

**Installation**:
```
npm install -D @playwright/test
npx playwright install chromium
```

**Critical user flows (ordered by business risk)**:

1. **Login → GV dashboard** — correct org_type routing
2. **Login → Saelim dashboard** — redirected to `/saelim/delivery`, PO/PI menu absent
3. **Create PO** — fill form, add line items, submit, verify redirect and PO number format `GVPOYYMM-XXX`
4. **Create PI from PO** — `?from_po=UUID` prefills fields, verify delivery auto-created
5. **Shipping CSV upload** — upload a stuffing list CSV, verify rolls imported and formula injection blocked
6. **Customs create → Order fee sync** — create customs record, verify linked order's `customs_fee_received` state
7. **Delivery approve flow** — GV approves Saelim change request, verify delivery_date updated on both delivery and order
8. **PDF download** — click PO PDF button, verify download (blob URL created)
9. **Saelim change request** — future date accepted, past date rejected, duplicate pending request blocked

---

## 3. Critical Test Scenarios by Module

### Auth
| Scenario | Risk | Priority |
|----------|------|----------|
| GV user redirected to `/` after login | HIGH | P1 |
| Saelim user redirected to `/saelim/delivery` after login | HIGH | P1 |
| Already-logged-in GV visits `/login` → redirect to `/` | MEDIUM | P1 |
| Unauthenticated request to any loader → redirect to `/login` | HIGH | P1 |
| Saelim user hitting GV route → redirect to `/saelim/delivery` | HIGH (SECURITY) | P1 |
| GV user hitting Saelim route → redirect to `/` | HIGH (SECURITY) | P1 |
| org_type case sensitivity: `GV` (uppercase) rejected | MEDIUM | P2 |

### PO Module
| Scenario | Risk | Priority |
|----------|------|----------|
| Amount recalculation: client-submitted amount ignored | HIGH (data integrity) | P1 |
| Status guard: complete PO cannot be edited | HIGH | P1 |
| Toggle reads DB, not client value (V2 pattern) | HIGH (security) | P1 |
| Clone resets status to `process` | MEDIUM | P1 |
| Delete uses soft delete, not hard delete | HIGH | P1 |
| Inactive org reference blocked | MEDIUM | P2 |
| PO number generated by RPC, not sequential int | HIGH | P2 |
| Duplicate PO number → 23505 code → Korean error message | MEDIUM | P2 |

### PI Module
| Scenario | Risk | Priority |
|----------|------|----------|
| Create from PO copies supplier/buyer/terms | HIGH | P1 |
| Auto-delivery creation on PI save | HIGH | P1 |
| po_id can be empty string or UUID (union type) | MEDIUM | P1 |
| Amount recalculation server-side (same as PO) | HIGH | P1 |

### Shipping Module
| Scenario | Risk | Priority |
|----------|------|----------|
| `stuffingRollSchema` sanitizes formula injection (`=SUM(...)` → `SUM(...)`) | HIGH (security) | P1 |
| Weight totals computed server-side | HIGH (data integrity) | P1 |
| ETD/ETA: empty string allowed, invalid date rejected | MEDIUM | P2 |
| CSV upload: `sanitizeFormulaInjection` applied to product_name | HIGH (security) | P1 |
| `pi_id` accepts `"__none__"` sentinel value | LOW (edge case) | P3 |

### Customs Module
| Scenario | Risk | Priority |
|----------|------|----------|
| `computeFeeTotal`: supply + vat → integer round | HIGH (KRW precision) | P1 |
| `calcTotalFees`: all 4 fee JSONB fields summed correctly, null-safe | HIGH | P1 |
| `linkCustomsToOrder`: only fires when `customs_id IS NULL` (no double-link) | HIGH | P1 |
| `unlinkCustomsFromOrder` blocking: delete aborted if unlink fails | HIGH | P1 |
| `syncCustomsFeeToOrder` fires on fee_received toggle | HIGH | P1 |
| Fee field MAX boundary (999,000,000) not exceeded | MEDIUM | P2 |

### Orders Module
| Scenario | Risk | Priority |
|----------|------|----------|
| `cascadeLinkFull` Exactly-1 Rule: 0 candidates → null (no link) | HIGH | P1 |
| `cascadeLinkFull` Exactly-1 Rule: 2 candidates → null (ambiguous) | HIGH | P1 |
| `cascadeLinkFull` Exactly-1 Rule: 1 candidate → link | HIGH | P1 |
| `cascadeLinkPartial` only fills null FKs, never overwrites | HIGH | P1 |
| `delivery_date` change → `syncDeliveryDateFromOrder` called | HIGH | P1 |
| `toggle_customs_fee` reads DB, toggles, calls sync | HIGH | P1 |
| `linkDocumentSchema` doc_type enum prevents arbitrary FK injection | HIGH (security) | P1 |
| `syncDeliveryDateFromOrder` skips `status = 'delivered'` | HIGH | P1 |

### Delivery Module (GV)
| Scenario | Risk | Priority |
|----------|------|----------|
| `approve_request`: pending→approved, delivery_date updated, order sync fired | HIGH | P1 |
| `reject_request`: response_text required (min 1), stored correctly | HIGH | P1 |
| `mark_delivered`: only transitions from `scheduled` → `delivered` | MEDIUM | P2 |
| `syncDeliveryDateToOrder` fires on date change | HIGH | P1 |
| `unlinkDeliveryFromOrder` blocking on delete | HIGH | P1 |

### Delivery Module (Saelim)
| Scenario | Risk | Priority |
|----------|------|----------|
| Price fields excluded from SELECT query (CRIT-1 security) | CRITICAL | P1 |
| Non-saelim user redirected to `/` (CRIT-2) | CRITICAL | P1 |
| `requested_by` set server-side, ignores FormData value (security) | CRITICAL | P1 |
| Past date rejected by `submitChangeRequestSchema` refine | HIGH | P1 |
| Duplicate pending request → 409 blocked | HIGH | P1 |
| Spam prevention: pending exists → new request rejected | HIGH | P1 |

### PDF Generation
| Scenario | Risk | Priority |
|----------|------|----------|
| `formatPdfDate`: en-US locale used, NOT ko-KR | HIGH | P1 |
| `formatPdfDate`: UTC timezone prevents date-shift (e.g., "2026-03-06T00:00:00Z" → "Mar 6, 2026") | HIGH | P1 |
| `formatPdfCurrency`: KRW rounded to integer | HIGH | P1 |
| `formatPdfCurrency`: USD shows 2 decimal places | MEDIUM | P2 |
| `triggerDownload`: filename sanitization (removes non-safe chars) | MEDIUM (security) | P2 |
| PDF notes excluded (internal memos, Korean content) | MEDIUM | P2 |

### Cross-Module Sync
| Scenario | Risk | Priority |
|----------|------|----------|
| Create Customs → `linkCustomsToOrder` fires for matching shipping_doc_id | HIGH | P1 |
| Delete Customs → `unlinkCustomsFromOrder` clears order.customs_id and customs_fee_received | HIGH | P1 |
| Order.delivery_date inline edit → `syncDeliveryDateFromOrder` | HIGH | P1 |
| Delivery.delivery_date update → `syncDeliveryDateToOrder` | HIGH | P1 |
| Delivered status prevents sync overwrite | HIGH | P1 |

---

## 4. Test Infrastructure Setup

### Step 1: Update `vitest.config.ts`

The current config runs only `.test.ts` in node environment. To support component tests, split environments:

```typescript
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // Use per-file environments via docblock annotation
    // Server/unit tests: @vitest-environment node (default)
    // Component tests: @vitest-environment jsdom
    environment: "node",
    include: ["app/**/*.test.{ts,tsx}"],
    setupFiles: ["app/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: [
        "app/loaders/**/*.server.ts",
        "app/lib/**/*.server.ts",
        "app/lib/format.ts",
        "app/lib/sanitize.ts",
        "app/lib/customs-utils.ts",
        "app/components/pdf/shared/pdf-utils.ts",
      ],
    },
  },
});
```

For component test files, add `// @vitest-environment jsdom` at the top of `.test.tsx` files.

### Step 2: Install Missing Testing Dependencies

```bash
npm install -D @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

Do NOT install Playwright during Phase 10 scoping — defer until the unit/integration layer is stable.

### Step 3: Create Test Setup File

**`app/test/setup.ts`**:
```typescript
import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => cleanup());

// Silence console.error in sync helper fire-and-forget functions during tests
vi.spyOn(console, "error").mockImplementation(() => {});
```

### Step 4: Supabase Mock Factory

Create `app/test/supabase-mock.ts` as a reusable factory:

```typescript
import { vi } from "vitest";

export function createMockSupabase(overrides: Record<string, unknown> = {}) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  };
  return {
    from: vi.fn().mockReturnValue(chain),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
    storage: {
      from: vi.fn().mockReturnValue({
        createSignedUrls: vi.fn().mockResolvedValue({ data: [], error: null }),
        upload: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    },
    _chain: chain, // expose for assertion
  };
}

export function createMockAuthResult(orgType: "gv" | "saelim" = "gv") {
  const supabase = createMockSupabase();
  return {
    user: {
      id: "00000000-0000-0000-0000-000000000001",
      app_metadata: { org_type: orgType },
    },
    supabase,
    responseHeaders: new Headers(),
  };
}
```

### Step 5: Request Factory Helper

```typescript
// app/test/request-factory.ts
export function makeRequest(
  path: string,
  options: { method?: string; body?: FormData | URLSearchParams } = {}
): Request {
  return new Request(`http://localhost${path}`, {
    method: options.method ?? "GET",
    body: options.body,
  });
}

export function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    fd.append(key, value);
  }
  return fd;
}
```

### Step 6: Test Data Fixtures

```typescript
// app/test/fixtures.ts
export const TEST_UUID = {
  supplier: "10000000-0000-0000-0000-000000000001",
  buyer:    "10000000-0000-0000-0000-000000000002",
  product:  "10000000-0000-0000-0000-000000000003",
  po:       "20000000-0000-0000-0000-000000000001",
  pi:       "20000000-0000-0000-0000-000000000002",
  shipping: "20000000-0000-0000-0000-000000000003",
  customs:  "20000000-0000-0000-0000-000000000004",
  order:    "20000000-0000-0000-0000-000000000005",
  delivery: "20000000-0000-0000-0000-000000000006",
  user:     "00000000-0000-0000-0000-000000000001",
};

export const mockPO = {
  id: TEST_UUID.po,
  po_no: "GVPO2603-001",
  po_date: "2026-03-06",
  status: "process",
  amount: 1250.00,
  currency: "USD",
  supplier_id: TEST_UUID.supplier,
  buyer_id: TEST_UUID.buyer,
  supplier: { id: TEST_UUID.supplier, name_en: "CHP Taiwan" },
  buyer: { id: TEST_UUID.buyer, name_en: "Saelim" },
  details: [{ product_id: TEST_UUID.product, product_name: "Glassine 40gsm", quantity_kg: 500, unit_price: 2.5, amount: 1250 }],
};

export const mockLineItem = {
  product_id: TEST_UUID.product,
  product_name: "Glassine Paper 40gsm",
  gsm: 40,
  width_mm: 1000,
  quantity_kg: 500,
  unit_price: 2.5,
  amount: 1250,
};
```

---

## 5. Priority Matrix

Impact = risk of data loss, security breach, or business error if not tested.
Likelihood = probability of regression or bugs given code complexity.

### Priority Matrix (Impact × Likelihood)

| Area | Impact | Likelihood | Priority | Status |
|------|--------|------------|----------|--------|
| Auth guards (requireGVUser/requireAuth) | CRITICAL | HIGH | **P0** | Missing |
| Saelim org_type security checks (CRIT-1/2/3) | CRITICAL | MEDIUM | **P0** | Missing |
| `requested_by` server-side enforcement | CRITICAL | MEDIUM | **P0** | Missing |
| Amount recalculation server-side | HIGH | MEDIUM | **P1** | Partially covered (logic only) |
| Status toggle DB-read (V2) | HIGH | LOW | **P1** | Partially covered (logic only) |
| Cross-module sync functions | HIGH | HIGH | **P1** | Missing |
| Exactly-1 cascade link rule | HIGH | HIGH | **P1** | Missing |
| `unlinkCustomsFromOrder` blocking | HIGH | MEDIUM | **P1** | Missing |
| Customs fee computation | HIGH | MEDIUM | **P1** | Missing |
| `sanitizeFormulaInjection` in CSV | HIGH | LOW | **P1** | Missing |
| PI schema (po_id union) | MEDIUM | MEDIUM | **P2** | Missing |
| Shipping schema (weight, dates) | MEDIUM | MEDIUM | **P2** | Missing |
| Delivery schema (future-date refine) | HIGH | LOW | **P1** | Missing |
| PDF formatters (en-US vs ko-KR) | MEDIUM | LOW | **P2** | Missing |
| `format.ts` utility functions | LOW | LOW | **P3** | Missing |
| Component rendering | MEDIUM | HIGH | **P2** | Missing |
| E2E login flows | HIGH | LOW | **P2** | Missing |
| E2E PO create workflow | MEDIUM | LOW | **P3** | Missing |

### Recommended Implementation Order

**Week 1 (Tier 1 — Schema & Utility Tests):**
1. `app/loaders/__tests__/pi.schema.test.ts`
2. `app/loaders/__tests__/shipping.schema.test.ts`
3. `app/loaders/__tests__/customs.schema.test.ts`
4. `app/loaders/__tests__/delivery.schema.test.ts`
5. `app/loaders/__tests__/orders.schema.test.ts`
6. `app/lib/__tests__/format.test.ts`
7. `app/lib/__tests__/sanitize.test.ts`
8. `app/lib/__tests__/customs-utils.test.ts`
9. `app/lib/__tests__/pdf-utils.test.ts` (pdf-utils.ts in components/pdf/shared/)

**Week 2 (Tier 2 — Loader/Action Integration Tests):**
1. `app/loaders/__tests__/po.server.test.ts` (createPOAction, toggle, delete, clone)
2. `app/loaders/__tests__/saelim.delivery.server.test.ts` (CRIT-1/2/3 security)
3. `app/loaders/__tests__/order-sync.server.test.ts` (all sync functions)
4. `app/loaders/__tests__/customs.server.test.ts` (create, delete, fee sync)
5. `app/loaders/__tests__/delivery.$id.server.test.ts` (approve, reject, mark_delivered)

**Week 3 (Tier 2 continued + Tier 3 Component Tests):**
1. `app/loaders/__tests__/pi.server.test.ts`
2. `app/loaders/__tests__/orders.$id.server.test.ts` (cascade link, inline edit sync)
3. Install RTL, update vitest config
4. Component tests for PO list, Delivery pages

---

## 6. Specific Implementation Notes

### Note 1: Vitest Config — `.test.tsx` Currently Excluded

The `include: ["app/**/*.test.ts"]` pattern misses `.test.tsx`. This is a bug in the current config that will silently drop any component tests written. Fix by changing to `["app/**/*.test.{ts,tsx}"]`.

### Note 2: Schema Duplication Pattern

The existing tests for settings schemas deliberately inline-redefine the Zod schemas rather than importing from the server file. This avoids Cloudflare `context` dependency errors during Vitest import resolution. This pattern should be **continued for all new schema tests**.

For the new schemas (`pi.schema.ts`, `shipping.schema.ts`, `customs.schema.ts`, `delivery.schema.ts`, `orders.schema.ts`), these can be imported directly because they have no CF dependencies — only `zod` and `~/lib/sanitize`. Verify with `npx vitest run` after each import.

### Note 3: `order-sync.server.ts` Test Strategy

The sync functions in `order-sync.server.ts` use `try/catch` fire-and-forget. Tests need to verify both:
- Success path: correct Supabase query called with correct arguments
- Failure path: error swallowed (no throw), `console.error` called

The `unlinkCustomsFromOrder` / `unlinkDeliveryFromOrder` functions are blocking and must return `false` on Supabase error — test this explicitly.

### Note 4: `cascadeLinkFull` Exactly-1 Rule

This is business-critical logic with three paths per FK level. Test all three for the first FK link (PO→PI), then at minimum the 0/1/2 case for the full chain:

```typescript
// Test: 2 PIs → shipping_doc_id and beyond remain null
mockSupabase._chain.limit.mockResolvedValueOnce({ data: [{ id: "pi-1" }, { id: "pi-2" }] });
const result = await cascadeLinkFull(mockSupabase, TEST_UUID.po);
expect(result.pi_id).toBeNull();
expect(result.shipping_doc_id).toBeNull();
```

### Note 5: `submitChangeRequestSchema` Date Refine

The `requested_date` future-date validation uses `new Date().toISOString().slice(0, 10)` dynamically. Tests need to use `vi.useFakeTimers()` to freeze time, otherwise the test will fail on the day the "today" boundary shifts.

```typescript
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-06T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

it("rejects today's date", () => {
  const result = submitChangeRequestSchema.safeParse({
    _action: "submit_change_request",
    requested_date: "2026-03-06",
  });
  expect(result.success).toBe(false);
});
```

### Note 6: PDF Utils `triggerDownload`

`triggerDownload` manipulates `document.createElement` and `URL.createObjectURL` — both browser APIs unavailable in node environment. Either:
- Skip `triggerDownload` in tests (it's a thin DOM wrapper)
- Test only the filename sanitization regex logic inline
- Use `jsdom` environment for that specific test file

Recommendation: test the filename sanitization logic directly without calling `triggerDownload`:
```typescript
it("sanitizes filename", () => {
  const raw = "GV PO/2026-03-06 (copy).pdf";
  const safe = raw.replace(/[^a-zA-Z0-9._\-]/g, "_");
  expect(safe).toBe("GV_PO_2026-03-06__copy_.pdf");
});
```

### Note 7: Coverage Targets

Realistic targets for Phase 10:

| Layer | Current | Target |
|-------|---------|--------|
| Schema files (`app/loaders/*.schema.ts`) | ~35% (PO, auth, settings only) | 90% |
| Loader/action files (`app/loaders/*.server.ts`) | 0% | 60% (critical paths) |
| Lib utilities (`app/lib/*.ts`) | 0% | 80% |
| Sync functions (`order-sync.server.ts`) | 0% | 70% |
| Components | 0% | 20% (key pages only) |

Overall statement coverage target: **50%** by end of Phase 10.

---

## 7. CI/CD Recommendations

### GitHub Actions Workflow

```yaml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run test:coverage
      - uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/
```

### Pre-commit Hook (optional)

Run schema tests only (fast, ~1s) on pre-commit:
```json
// package.json
"test:schemas": "vitest run app/loaders/__tests__/*.schema.test.ts"
```

### Recommended `package.json` Scripts to Add

```json
"test:unit": "vitest run app/lib/__tests__/",
"test:schemas": "vitest run app/loaders/__tests__/*.schema.test.ts",
"test:loaders": "vitest run app/loaders/__tests__/*.server.test.ts",
"test:watch": "vitest",
"test:ui": "vitest --ui"
```

---

## 8. Summary of Gaps

The existing test suite covers Zod schema validation well for PO and settings modules. The following are completely untested:

1. All loader/action server logic (authentication flow, DB calls, error paths)
2. Cross-module sync functions (`order-sync.server.ts`) — highest business risk
3. Saelim security controls (CRIT-1/2/3) — highest security risk
4. PI, Shipping, Customs, Orders, Delivery schemas
5. All utility functions (`format.ts`, `sanitize.ts`, `customs-utils.ts`, `pdf-utils.ts`)
6. All components
7. E2E user journeys

The most impactful next step is writing integration tests for `saelim.delivery.server.ts` (security) and `order-sync.server.ts` (data integrity), followed by completing the missing schema tests which follow the established pattern and can be written quickly.
