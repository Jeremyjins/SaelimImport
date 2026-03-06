# Frontend Dev Notes: Saelim Import Management System

**Date:** 2026-03-06

---

## 1. Route Structure (React Router 7 File-based)

### Layout Groups
- `_auth` - 인증 관련 (로그인, 비밀번호 재설정)
- `_layout` - GV 사용자용 메인 레이아웃 (Sidebar + Content)
- `_saelim` - 세림 사용자용 제한 레이아웃

### Route Files
```
app/routes/
├─ _auth.login.tsx
├─ _layout.tsx                         # GV Sidebar layout
│
├─ _layout.settings.tsx                # Settings layout
├─ _layout.settings.organizations.tsx
├─ _layout.settings.products.tsx
├─ _layout.settings.users.tsx
│
├─ _layout.po.tsx                      # PO list
├─ _layout.po.$id.tsx                  # PO detail
├─ _layout.po.new.tsx                  # PO create
├─ _layout.po.$id.edit.tsx             # PO edit
│
├─ _layout.pi.tsx
├─ _layout.pi.$id.tsx
├─ _layout.pi.new.tsx
├─ _layout.pi.$id.edit.tsx
│
├─ _layout.shipping.tsx
├─ _layout.shipping.$id.tsx
├─ _layout.shipping.new.tsx
├─ _layout.shipping.$id.edit.tsx
│
├─ _layout.orders.tsx
├─ _layout.orders.$id.tsx
│
├─ _layout.customs.tsx
├─ _layout.customs.$id.tsx
├─ _layout.customs.new.tsx
├─ _layout.customs.$id.edit.tsx
│
├─ _layout.delivery.tsx                # GV delivery view
├─ _layout.delivery.$id.tsx
│
├─ _layout.contents.$id.tsx            # Content detail + comments
│
├─ _saelim.tsx                         # Saelim restricted layout
├─ _saelim.delivery.tsx                # Saelim delivery list
└─ _saelim.delivery.$id.tsx            # Saelim delivery detail + change request
```

---

## 2. Layout & Navigation

### Shadcn Sidebar Design
```
┌──────────────┬──────────────────────────────────┐
│  LOGO        │  Header (breadcrumb, user menu)   │
│              ├──────────────────────────────────┤
│  Navigation  │                                  │
│  ──────────  │         Content Area              │
│  Dashboard   │                                  │
│  PO          │                                  │
│  PI          │                                  │
│  Shipping    │                                  │
│  Orders      │                                  │
│  Customs     │                                  │
│  Delivery    │                                  │
│  ──────────  │                                  │
│  Settings    │                                  │
│  ──────────  │                                  │
│  User Info   │                                  │
└──────────────┴──────────────────────────────────┘
```

### GV Navigation Items
- Dashboard (추후)
- Purchase Orders
- Proforma Invoices
- Shipping Documents
- Order Management
- Customs
- Delivery
- Settings (Organizations, Products, Users)

### Saelim Navigation Items
- Delivery (배송관리만)

### Mobile Responsive
- Sidebar → Sheet (hamburger menu)
- List → Card 형태 (md:table)
- Detail → 단일 컬럼 스택

---

## 3. Reusable Component Patterns

### DocumentList
```
Props: items, columns, statusFilter, onItemClick, createButton
- Status filter tabs: 전체 | 진행 | 완료
- Search/filter bar
- Card layout (mobile) / Table layout (desktop)
- Pagination or infinite scroll
```

### DocumentDetail
```
Props: document, actions, contentSection
- Document info card (header + fields)
- Action buttons (edit, delete, clone, status toggle, PDF)
- Linked documents section
- Contents list section (bottom)
```

### DocumentForm (shared fields)
```
Shared fields across PO/PI/Shipping:
- currency (text, default USD)
- amount (number with decimal)
- payment_term (text)
- delivery_term (text)
- loading_port (text)
- discharge_port (text)
- details (product line items editor)
- notes (textarea)
```

### ProductLineItemEditor
```
For JSONB details field:
- Product selector (dropdown from products table)
- Quantity input
- Unit price input
- Amount (auto-calculated)
- Add/remove rows
```

### StatusToggle
```
Switch component: 진행 ↔ 완료
With confirmation dialog
```

### ContentEditor (Tiptap)
```
- Rich text editing (bold, italic, headings, lists)
- Image drag & drop (uploads to Supabase Storage)
- File attachment area (multiple files)
- Save/Cancel buttons
```

### CommentSection
```
- Comment list (newest first or oldest first)
- Comment input with submit
- Edit/delete own comments
```

---

## 4. Tiptap Editor Integration

### Required Extensions
```
@tiptap/starter-kit     - Basic formatting
@tiptap/extension-image  - Image support
@tiptap/extension-link   - Links
@tiptap/extension-placeholder - Placeholder text
tiptap-extension-file-handler - Drag & drop files
```

### Image Upload Flow
1. User drags image into editor
2. FileHandler extension intercepts
3. Upload to Supabase Storage (`content-images` bucket)
4. Get public URL
5. Insert Image node with URL

### File Attachment (Separate from Tiptap)
- Dedicated file upload area below editor
- Multiple file upload support
- Progress indicator
- File list with download/delete
- Stored in `attachments` bucket

---

## 5. TanStack Query Strategy

### React Router 7 Loaders (SSR)
- Initial page data loading
- List queries with filters
- Detail page data

### TanStack Query (Client-side)
- **Mutations:** form submissions (create, update, delete)
- **Optimistic updates:** status toggle, comment add
- **Refetching:** after mutation success
- **Cross-module invalidation:**
  - Customs created → invalidate orders query
  - Shipping updated → invalidate orders query
  - Delivery change approved → invalidate delivery query

### Cache Key Structure
```
['po', 'list', { status }]
['po', 'detail', id]
['pi', 'list', { status }]
['pi', 'detail', id]
['contents', parentType, parentId]
['comments', contentId]
```

---

## 6. Form Patterns

### Auto Number Generation
```
- Server-side generated on form load (via loader)
- Displayed in readonly input with "edit" icon
- Click to enable manual override
- Validation: format must match GVXX{YYMM}-{NNN}
```

### Date Picker + Auto Calculation
```
- po_date selected → po_validity auto-set to +1 month
- User can override validity date
- Use date-fns for calculations
```

### Reference Creation Mode
```
PI 생성 시:
1. "PO 참조 생성" 버튼 클릭
2. Modal: process 상태인 PO 목록 표시
3. PO 선택
4. PO 데이터 복제 (가격 제외)
5. Supplier/Buyer 자동 전환 (CHP→GV, GV→Saelim)
6. 사용자가 가격 입력 후 저장
```

### CSV Upload (Stuffing List)
```
1. CSV 파일 업로드 버튼
2. Papa Parse로 CSV 파싱
3. 미리보기 테이블 표시
4. 매핑 확인 (seq, lot_no, length, weight)
5. 확인 → JSONB로 변환하여 저장
```

---

## 7. Component Organization

```
app/components/
├─ ui/                          # Shadcn/ui
│   ├─ button.tsx
│   ├─ card.tsx
│   ├─ dialog.tsx
│   ├─ input.tsx
│   ├─ select.tsx
│   ├─ sidebar.tsx
│   ├─ table.tsx
│   ├─ tabs.tsx
│   └─ ...
├─ layout/
│   ├─ app-sidebar.tsx          # Main sidebar
│   ├─ page-container.tsx
│   └─ header.tsx
├─ shared/
│   ├─ document-list.tsx
│   ├─ document-detail.tsx
│   ├─ document-form-fields.tsx # Shared form fields
│   ├─ product-line-editor.tsx  # JSONB detail editor
│   ├─ status-toggle.tsx
│   ├─ status-filter.tsx
│   ├─ content-editor.tsx       # Tiptap wrapper
│   ├─ content-list.tsx
│   ├─ comment-section.tsx
│   ├─ file-uploader.tsx
│   ├─ pdf-button.tsx
│   ├─ doc-number-input.tsx     # Auto-gen number with override
│   └─ reference-selector.tsx   # PO/PI reference selection modal
├─ po/
├─ pi/
├─ shipping/
│   └─ stuffing-editor.tsx      # Stuffing list editor + CSV import
├─ orders/
├─ customs/
│   └─ fee-input.tsx            # 공급가액/부가세/합계 triplet input
└─ delivery/
    ├─ change-request-form.tsx
    └─ change-history.tsx
```
