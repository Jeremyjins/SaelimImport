# Phase 8: Delivery Management - Frontend Notes

## 1. Route Configuration Updates (`routes.ts`)

### New Routes Required

```typescript
// GV Layout - delivery routes
route("delivery", "routes/_layout.delivery.tsx"),           // existing placeholder
route("delivery/:id", "routes/_layout.delivery.$id.tsx"),   // NEW: detail page

// Saelim Layout - delivery routes
route("saelim/delivery", "routes/_saelim.delivery.tsx"),           // existing placeholder
route("saelim/delivery/:id", "routes/_saelim.delivery.$id.tsx"),   // NEW: detail page
```

No create/edit form pages needed. Deliveries are created from the GV list page via a dialog (like orders), and editing is done inline on the detail page. Saelim users never create deliveries; they only view and submit change requests.

---

## 2. GV Delivery Pages

### 2-A. List Page (`_layout.delivery.tsx`)

**Pattern**: Follow `_layout.orders.tsx` exactly (status filter tabs + desktop table + mobile cards).

**Loader data shape**:
```typescript
interface LoaderData {
  deliveries: DeliveryListItem[];
  pis: { id: string; pi_no: string }[];           // for create dialog PI dropdown
  shippingDocs: { id: string; ci_no: string }[];   // for create dialog shipping dropdown
  error: string | null;
}
```

**Filter Tabs**: Status-based filtering using URL search params (`?status=`).
- 전체 (all count)
- 진행 (process count) - deliveries without delivery_date or with pending change requests
- 완료 (complete count) - deliveries with delivery_date set and no pending requests

Note: The `deliveries` table has no `status` column. We derive status on the server:
- `process` = `delivery_date IS NULL` OR there is at least one `delivery_change_requests` with `status = 'pending'`
- `complete` = `delivery_date IS NOT NULL` AND no pending change requests

Alternatively, add a `status` column to `deliveries` if the team prefers consistency with other modules.

**Desktop Table Columns** (`hidden md:block`):

| Column | Source | Notes |
|--------|--------|-------|
| PI번호 | `pi.pi_no` | Link text, fallback "미연결" in zinc-300 |
| 선적서류 (CI) | `shipping.ci_no` | Fallback "-" |
| 선박명 | `shipping.vessel` | From joined shipping doc |
| 배송일 | `delivery_date` | `formatDate()`, "미정" if null |
| 변경요청 | `pending_request_count` | Badge with count, only show if > 0. Yellow badge: `대기 {n}건` |
| 상태 | derived | `DocStatusBadge` or custom `DeliveryStatusBadge` |

**Mobile Cards** (`md:hidden`):
```
+----------------------------------+
| PI-2024-001           [진행]     |
| CI: CI-2024-001  선박: ABC호     |
| 배송일: 2024.03.15               |
|              변경요청 대기 2건    |
+----------------------------------+
```

**Search**: PI번호, CI번호 검색 (same pattern as orders search).

**Create Dialog**: `DeliveryCreateDialog` component.
- Fields: PI 선택 (select), 선적서류 선택 (select), 배송일 (date input, optional)
- PI and shipping doc dropdowns populated from loader data
- Submit via fetcher: `{ _action: "create", pi_id, shipping_doc_id, delivery_date }`

**Empty State**: "등록된 배송이 없습니다." (consistent with other modules)

**Header**:
```tsx
<Header title="배송관리">
  <Button size="sm" onClick={() => setDialogOpen(true)}>
    <Plus className="h-4 w-4 mr-1" />
    배송 등록
  </Button>
</Header>
```

### 2-B. Detail Page (`_layout.delivery.$id.tsx`)

**Pattern**: Follow `_layout.orders.$id.tsx` (Header with backTo + Card sections + ContentSection).

**Loader data shape**:
```typescript
interface LoaderData {
  delivery: DeliveryDetail;
  changeRequests: ChangeRequestItem[];
  content: ContentItem | null;
  userId: string;
}
```

**Header**:
```tsx
<Header title={`배송 ${delivery.pi?.pi_no ?? delivery.id.slice(0, 8)}`} backTo="/delivery">
  <div className="flex items-center gap-2">
    <DeliveryStatusBadge status={derivedStatus} />
    {pendingCount > 0 && (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200">
        변경요청 {pendingCount}건
      </Badge>
    )}
    <DropdownMenu> ... (delete action) </DropdownMenu>
  </div>
</Header>
```

**Section 1: 배송 정보 Card**
- Grid layout `grid grid-cols-2 md:grid-cols-3 gap-6`
- Fields (inline-editable, reuse `InlineDateField` pattern from orders):
  - PI번호: read-only link to `/pi/{id}` (clickable)
  - 선적서류: read-only link to `/shipping/{id}` (clickable)
  - 배송일: inline date edit (click-to-edit, fetcher submit `{ _action: "update_delivery_date", delivery_date }`)

**Section 2: 변경요청 내역 Card**
- Title: "변경요청 내역" with count badge
- List of `ChangeRequestCard` components (newest first)
- Each card shows:
  - 요청일시 (requested date), 요청 배송일 (requested_date field), 사유 (reason)
  - Status badge: 대기(amber), 승인(green), 거부(red)
  - If status === "pending": Approve/Reject action buttons
  - If responded: response_text and responded_by info
- Empty state: "변경요청이 없습니다."

**Approve/Reject UI**:
- State-controlled dialog (not AlertDialogTrigger, per responsive design rules)
- `showApproveDialog` / `showRejectDialog` state booleans
- Approve dialog:
  - Title: "변경요청을 승인하시겠습니까?"
  - Shows requested date prominently
  - Optional response text (Textarea)
  - "승인하면 배송일이 {requested_date}로 변경됩니다." description
  - Action: `{ _action: "approve_request", request_id, response_text }`
  - On approval, server updates `delivery.delivery_date` to `requested_date`
- Reject dialog:
  - Title: "변경요청을 거부하시겠습니까?"
  - Required response text (Textarea, reason for rejection)
  - Action: `{ _action: "reject_request", request_id, response_text }`

**Section 3: ContentSection** (reuse existing)
```tsx
<ContentSection
  content={content}
  contentType="delivery"
  parentId={delivery.id}
  currentUserId={userId}
/>
```

**Section 4: Meta info** (same pattern as customs/orders)
```tsx
<div className="text-xs text-zinc-400 flex gap-4 pb-4">
  <span>생성: {formatDate(delivery.created_at)}</span>
  {delivery.updated_at && <span>수정: {formatDate(delivery.updated_at)}</span>}
</div>
```

**Delete Dialog**: Same AlertDialog pattern as customs/orders. Soft delete.

---

## 3. Saelim Delivery Pages

### 3-A. List Page (`_saelim.delivery.tsx`)

**Key difference from GV**: Saelim layout has no sidebar. Uses the `_saelim.tsx` layout (top header bar with "세림 수입관리" branding). No PageContainer `fullWidth` needed since no sidebar. Use a centered max-width container.

**Loader**: Must verify `org_type === "saelim"` (already handled by `_saelim.tsx` layout loader).

**Loader data shape**:
```typescript
interface LoaderData {
  deliveries: SaelimDeliveryListItem[];
  error: string | null;
}

interface SaelimDeliveryListItem {
  id: string;
  delivery_date: string | null;
  pi: { pi_no: string } | null;
  shipping: { ci_no: string; vessel: string | null } | null;
  pending_request_count: number;
  latest_request_status: string | null; // 'pending' | 'approved' | 'rejected' | null
}
```

**No pricing information shown** - Saelim users should not see amounts, currencies, or fee details.

**Layout**: Simple card list (no filter tabs since Saelim has limited deliveries).
- Optional: search by PI번호 if the list grows

**Card design** (mobile-friendly, no table needed):
```
+----------------------------------+
| PI-2024-001                      |
| CI: CI-2024-001                  |
| 배송 예정일: 2024.03.15          |
|                                  |
| [변경요청 대기중]  or  [배송완료] |
+----------------------------------+
```

Each card navigates to `/saelim/delivery/{id}`.

**Status display**:
- No `delivery_date` yet: "배송일 미정" in zinc-400
- Has `delivery_date`, no pending requests: "배송 예정" or "배송완료" in green
- Has pending request: "변경요청 대기중" badge in amber

**Empty state**:
```tsx
<div className="flex flex-col items-center justify-center py-24 text-center">
  <Truck className="h-12 w-12 text-zinc-300 mb-4" />
  <h2 className="text-lg font-semibold text-zinc-700">배송 내역이 없습니다</h2>
  <p className="mt-1 text-sm text-zinc-500">등록된 배송이 표시됩니다.</p>
</div>
```

**Header**: The Saelim layout already has a top header with "배송관리" nav link. No separate `<Header>` component needed inside the page (Saelim layout does not use `SidebarTrigger`). Instead, use a simple page title:
```tsx
<div className="max-w-3xl mx-auto px-4 py-6">
  <h1 className="text-lg font-semibold text-zinc-900 mb-4">배송 현황</h1>
  {/* card list */}
</div>
```

### 3-B. Detail Page (`_saelim.delivery.$id.tsx`)

**Loader data shape**:
```typescript
interface LoaderData {
  delivery: SaelimDeliveryDetail;
  changeRequests: ChangeRequestItem[];
  userId: string;
}
```

**Page layout**: Centered container (`max-w-2xl mx-auto`), no sidebar.

**Back navigation**: Simple link/button at top (no `<Header>` component since Saelim layout is different).
```tsx
<div className="max-w-2xl mx-auto px-4 py-6">
  <Link to="/saelim/delivery" className="text-sm text-zinc-500 hover:text-zinc-900 flex items-center gap-1 mb-4">
    <ChevronLeft className="h-4 w-4" />
    배송 목록
  </Link>
  ...
</div>
```

**Section 1: 배송 정보** (read-only for Saelim)
- PI번호 (text only, no link to PI detail since Saelim cannot access PI)
- 선적서류번호 (CI) (text only)
- 배송 예정일 (formatted date)
- No inline editing - Saelim changes dates via change requests only

**Section 2: 변경요청 제출 Form**
- Card with title "배송일 변경요청"
- Fields:
  - 희망 배송일: `<Input type="date" />` (required)
  - 변경 사유: `<Textarea />` (required, placeholder: "변경 사유를 입력해주세요")
- Submit button: "변경요청 제출"
- Validation: Zod `safeParse` with `z.object({ requested_date: z.string().min(1), reason: z.string().min(1) })`
- Action: `{ _action: "submit_request", requested_date, reason }`
- After submit success: toast "변경요청이 제출되었습니다." and form reset
- Disable form while a pending request exists? Decision: Allow multiple requests but show warning "이미 대기 중인 요청이 있습니다."

**Section 3: 내 변경요청 내역**
- List of own change requests (newest first)
- Each item shows:
  - 요청일: formatted date
  - 희망 배송일: requested_date
  - 사유: reason text
  - 상태: Badge (대기/승인/거부)
  - If rejected: show GV's response_text
  - If approved: show "승인됨 - 배송일이 변경되었습니다"

---

## 4. Component Architecture

### `app/components/delivery/`

| Component | Description | Used by |
|-----------|-------------|---------|
| `delivery-create-dialog.tsx` | Dialog form for creating new delivery | GV list page |
| `delivery-info-card.tsx` | Delivery basic info (PI/shipping links, date) | GV detail |
| `change-request-list.tsx` | List of change request cards | Both GV and Saelim detail |
| `change-request-card.tsx` | Single change request display | Shared by list component |
| `change-request-form.tsx` | Date picker + reason form for Saelim | Saelim detail |
| `change-request-badge.tsx` | Status badge (대기/승인/거부) | Shared |
| `delivery-status-badge.tsx` | Overall delivery status badge | Both list pages |

### Shared Components to Reuse (no new creation needed)

| Component | Usage |
|-----------|-------|
| `Header` | GV pages (with `backTo` prop) |
| `PageContainer` | GV pages (with `fullWidth` on list) |
| `DocStatusBadge` | If delivery gets a `status` column; otherwise use custom `DeliveryStatusBadge` |
| `ContentSection` | GV detail page (notes/attachments) |
| `Card`, `CardHeader`, `CardContent`, `CardTitle` | All detail sections |
| `AlertDialog` | Delete confirmation, approve/reject dialogs |
| `Badge` | Status indicators |
| `Tabs`, `TabsList`, `TabsTrigger` | GV list filter |
| `Table` components | GV list desktop view |
| `Input`, `Textarea`, `Button` | Forms |
| `DropdownMenu` | GV detail action menu |

### Icons to Add to `icons.tsx`

Currently available icons cover most needs. May need:
- `CalendarClock` - for change request date display
- `MessageCircle` - for response text indicator
- `Send` - for submit request button (Saelim)
- `ThumbsUp` / `ThumbsDown` or `CheckCircle` / `XCircle` - for approve/reject (already have `Check`, `X`, `CheckCircle2`)

Minimal additions needed. `CheckCircle2` and `X` already exist for approve/reject.

---

## 5. Change Request Workflow UI

### Status Color Scheme (consistent with existing codebase Badge patterns)

```typescript
const REQUEST_STATUS = {
  pending: { label: "대기", className: "bg-amber-100 text-amber-700 border-amber-200" },
  approved: { label: "승인", className: "bg-green-100 text-green-700 border-green-200" },
  rejected: { label: "거부", className: "bg-red-100 text-red-700 border-red-200" },
} as const;
```

### `ChangeRequestBadge` Component

```tsx
export function ChangeRequestBadge({ status }: { status: "pending" | "approved" | "rejected" }) {
  const config = REQUEST_STATUS[status];
  return (
    <Badge className={cn("hover:bg-transparent", config.className)}>
      {config.label}
    </Badge>
  );
}
```

### `ChangeRequestCard` Component

Used in both GV and Saelim detail pages. Accepts a `showActions` prop for GV-only approve/reject buttons.

```tsx
interface ChangeRequestCardProps {
  request: ChangeRequestItem;
  showActions?: boolean;           // true for GV, false for Saelim
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
}
```

Card layout:
```
+----------------------------------------------+
| 2024.03.10 요청                    [대기]     |
| 희망 배송일: 2024.03.20                       |
| 사유: 공장 사정으로 일정 변경 필요             |
|                                               |
| (GV only, if pending:)                        |
| [승인]  [거부]                                |
|                                               |
| (if responded:)                               |
| 답변: 승인합니다. 일정 조정 완료.              |
+----------------------------------------------+
```

### Approve Flow (GV)

1. GV clicks "승인" button on pending request card
2. State-controlled dialog opens (`showApproveDialog` + `selectedRequestId`)
3. Dialog shows:
   - Current delivery date vs requested date comparison
   - Optional response textarea
   - "승인" / "취소" buttons
4. On confirm: `fetcher.submit({ _action: "approve_request", request_id, response_text }, { method: "post" })`
5. Server: updates `delivery_change_requests.status = 'approved'`, sets `responded_by`, `response_text`, AND updates `deliveries.delivery_date = requested_date`
6. Toast: "변경요청이 승인되었습니다."

### Reject Flow (GV)

1. GV clicks "거부" button
2. Dialog with required response textarea (must explain reason)
3. On confirm: `fetcher.submit({ _action: "reject_request", request_id, response_text }, { method: "post" })`
4. Server: updates status to 'rejected', does NOT change delivery_date
5. Toast: "변경요청이 거부되었습니다."

### Submit Flow (Saelim)

1. Saelim fills in date + reason on the form
2. Clicks "변경요청 제출"
3. Client-side Zod validation
4. `fetcher.submit({ _action: "submit_request", requested_date, reason }, { method: "post" })`
5. Server: inserts into `delivery_change_requests` with `requested_by = userId`, `status = 'pending'`
6. Toast: "변경요청이 제출되었습니다."
7. Form fields reset on success

---

## 6. Responsive Design

### GV List Page

- **Desktop** (`hidden md:block`): Full table with all columns
- **Mobile** (`md:hidden`): Card list with key info (PI번호, CI번호, 배송일, 변경요청 badge)
- Filter tabs: `flex flex-col gap-3 md:flex-row md:items-center md:justify-between`
- Search input: `w-full md:w-72`

### GV Detail Page

- Info grid: `grid grid-cols-2 md:grid-cols-3 gap-6`
- Change request cards: single column, full width
- Approve/reject buttons: `flex gap-2` at card bottom, touch-friendly sizing (`size="sm"` minimum, consider `size="default"` on mobile)
- Action dialogs: standard AlertDialog (already mobile-responsive via shadcn)

### Saelim Pages

- Centered layout: `max-w-3xl mx-auto px-4 py-6` (list), `max-w-2xl mx-auto` (detail)
- Cards are naturally mobile-friendly (full width)
- Form inputs: full width, adequate touch targets
- Change request form: stacked layout (date picker above, textarea below, button full width on mobile)
  ```tsx
  <div className="space-y-4">
    <div>
      <Label>희망 배송일</Label>
      <Input type="date" className="w-full md:w-64" />
    </div>
    <div>
      <Label>변경 사유</Label>
      <Textarea rows={3} />
    </div>
    <Button className="w-full md:w-auto">변경요청 제출</Button>
  </div>
  ```
- Bottom padding for scroll accessibility: `pb-32` on Sheet/form containers if needed

### Touch-Friendly Considerations

- Approve/reject buttons: minimum 40px touch target (Button `size="default"` = h-9, acceptable)
- Card click areas: full card is tappable (using `<button>` wrapper like orders mobile cards)
- Date picker: native `<input type="date">` for best mobile UX (no custom date picker needed)

---

## 7. Types (`app/types/delivery.ts`)

```typescript
export interface DeliveryListItem {
  id: string;
  delivery_date: string | null;
  pi: { id: string; pi_no: string } | null;
  shipping: { id: string; ci_no: string; vessel: string | null } | null;
  pending_request_count: number;
  derived_status: "process" | "complete";
  created_at: string;
}

export interface DeliveryDetail {
  id: string;
  delivery_date: string | null;
  pi: { id: string; pi_no: string } | null;
  shipping: { id: string; ci_no: string; vessel: string | null } | null;
  created_at: string;
  updated_at: string | null;
}

export interface ChangeRequestItem {
  id: string;
  delivery_id: string;
  requested_date: string;
  reason: string;
  requested_by: string;
  requested_by_email?: string;   // joined from auth.users for display
  responded_by: string | null;
  responded_by_email?: string;
  response_text: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  updated_at: string | null;
}

// Saelim-specific (no pricing, limited joins)
export interface SaelimDeliveryListItem {
  id: string;
  delivery_date: string | null;
  pi: { pi_no: string } | null;
  shipping: { ci_no: string; vessel: string | null } | null;
  pending_request_count: number;
  latest_request_status: "pending" | "approved" | "rejected" | null;
}
```

---

## 8. Server Files Needed

| File | Purpose |
|------|---------|
| `app/loaders/delivery.server.ts` | GV list loader + create action |
| `app/loaders/delivery.$id.server.ts` | GV detail loader + actions (update_delivery_date, approve_request, reject_request, delete, content_*) |
| `app/loaders/saelim.delivery.server.ts` | Saelim list loader |
| `app/loaders/saelim.delivery.$id.server.ts` | Saelim detail loader + submit_request action |

All loaders must call `getAuthUser(request)` first. Saelim loaders must additionally verify `org_type === "saelim"`.

---

## 9. Action Intent Summary

### GV Detail Page Actions (`_action` values)

| Intent | Description | Form Data |
|--------|-------------|-----------|
| `update_delivery_date` | Inline date edit | `delivery_date` |
| `approve_request` | Approve change request | `request_id`, `response_text?` |
| `reject_request` | Reject change request | `request_id`, `response_text` (required) |
| `delete` | Soft delete delivery | (none) |
| `content_*` | Content system intents | Delegated to `handleContentAction` |

### GV List Page Actions

| Intent | Description | Form Data |
|--------|-------------|-----------|
| `create` | Create new delivery | `pi_id`, `shipping_doc_id?`, `delivery_date?` |

### Saelim Detail Page Actions

| Intent | Description | Form Data |
|--------|-------------|-----------|
| `submit_request` | Submit change request | `requested_date`, `reason` |

---

## 10. Edge Cases and UX Details

### Pending Request Notification on GV List
- Show amber badge with count: `대기 {n}건`
- Consider sorting deliveries with pending requests to top (server-side ordering)

### Multiple Pending Requests
- Allow multiple from Saelim (they may request different dates)
- GV processes each independently (approve one, reject another)
- If GV approves a request, other pending requests for the same delivery remain pending (GV must handle them)

### Optimistic UI
- Approve/reject: optimistic badge update while fetcher is in flight
- Delivery date inline edit: optimistic value display (same pattern as OrderInlineFields)
- Change request submit: disable form + show Loader2 spinner on button

### Error Handling
- Loader errors: red banner at top (same pattern as orders/customs)
- Action errors: toast.error via useEffect + prevStateRef pattern
- Validation errors: inline field errors for Saelim form (Zod safeParse)

### Content System Integration
- Content type: `"delivery"` (add to `ContentType` union in `types/content.ts`)
- Reuse `ContentSection` component as-is
- Only available on GV detail page (Saelim detail does not include content/notes)

### Navigation
- GV: Sidebar already has "배송관리" nav item with `Truck` icon pointing to `/delivery`
- Saelim: Top nav already has "배송관리" button pointing to `/saelim/delivery`
- Both are already configured in their respective layouts
