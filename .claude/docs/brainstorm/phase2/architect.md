# Phase 2: Purchase Order (PO) Module - Architect Notes

**Date:** 2026-03-06
**Phase:** 2 (PO Module)
**Dependencies:** Phase 0 (Foundation Prep) + Phase 1 (Auth + Settings) - both complete

---

## 1. Routing Strategy (라우팅 전략)

### Decision: Separate Pages (not Dialog)

PO는 Settings의 단순 CRUD와 달리 **문서(Document) 모듈**이다. 별도 페이지 방식을 선택한다.

**Settings와의 차이점:**
- Settings: 5-7개 필드, 단순 CRUD, 전체 목록이 화면에 들어감 -> Dialog 적합
- PO: 10+ 필드 + 동적 라인아이템, 상세 뷰 필요, 향후 Contents/Comments 연동 -> 별도 페이지 적합

**Route 구조:**

```
/po              -> PO 목록 (list + status filter)
/po/new          -> PO 생성 (full-page form)
/po/:id          -> PO 상세 (read-only detail view)
/po/:id/edit     -> PO 수정 (full-page form, pre-filled)
```

**routes.ts 변경:**

```typescript
layout("routes/_layout.tsx", [
  index("routes/_layout.home.tsx"),
  // PO routes
  route("po", "routes/_layout.po.tsx"),           // list
  route("po/new", "routes/_layout.po.new.tsx"),   // create
  route("po/:id", "routes/_layout.po.$id.tsx"),   // detail
  route("po/:id/edit", "routes/_layout.po.$id.edit.tsx"), // edit
  // ... other routes
])
```

**Trade-off:**
- (+) 각 페이지가 자체 loader를 가져서 데이터 독립적으로 로딩
- (+) URL로 직접 진입 가능 (북마크, 공유)
- (+) 브라우저 뒤로가기가 자연스럽게 작동
- (+) 향후 Contents/Comments 섹션을 detail 페이지에 추가하기 쉬움
- (-) Settings 대비 파일 수 증가 (하지만 각 파일이 단순해짐)

**대안 고려 (기각):**
- Nested layout (`po` layout + child routes): 이 시스템에서 PO 목록과 상세를 동시에 보여줄 필요 없음. 오히려 복잡성만 증가.
- Dialog/Sheet for create/edit: 라인아이템 편집이 포함되면 Dialog가 비좁음. 모바일에서 더 심각.

---

## 2. Data Flow Architecture (데이터 흐름)

### 2.1 List Page (`/po`)

**Loader:**
```
requireGVUser -> supabase.from("purchase_orders")
  .select("id, po_no, po_date, status, currency, amount, supplier:organizations!supplier_id(name_en), buyer:organizations!buyer_id(name_en)")
  .is("deleted_at", null)
  .order("po_date", { ascending: false })
```

**Status Filter:**
- URL search param: `?status=process` / `?status=complete` / (없으면 전체)
- Loader에서 `searchParams.get("status")` 읽어서 `.eq("status", status)` 조건부 추가
- 클라이언트에서 `useSearchParams`로 필터 제어

**검색 (Phase 2-D에서 추가):**
- `?q=GVPO2603` -> `.ilike("po_no", "%GVPO2603%")`

### 2.2 Detail Page (`/po/:id`)

**Loader:**
```
requireGVUser -> supabase.from("purchase_orders")
  .select("*, supplier:organizations!supplier_id(*), buyer:organizations!buyer_id(*)")
  .eq("id", params.id)
  .is("deleted_at", null)
  .single()
```

- 존재하지 않으면 404 throw
- `details` JSONB는 자동으로 parsed array로 반환됨

### 2.3 Create Page (`/po/new`)

**Loader:**
- Organizations 목록 (supplier, buyer 선택용)
- Products 목록 (라인아이템 product 선택용)

```
requireGVUser -> Promise.all([
  supabase.from("organizations").select("id, name_en, type").is("deleted_at", null),
  supabase.from("products").select("id, name, gsm, width_mm").is("deleted_at", null)
])
```

**Action (intent: "create"):**
1. Zod validation (po_date, supplier_id, buyer_id, details 등)
2. `supabase.rpc("generate_doc_number", { doc_type: "PO", ref_date: po_date })` -> po_no
3. Client-side에서 amount 계산해서 전송 (각 라인아이템 quantity_kg * unit_price 합계)
4. `supabase.from("purchase_orders").insert({ po_no, ...fields, created_by: user.id })`
5. 성공 시 redirect(`/po/${newId}`)

**PO 번호 생성 타이밍:**
- **Decision: Create 시점에 생성** (pre-allocate 아님)
- 이유: pre-allocate하면 취소 시 번호 gap 발생. 소규모 시스템에서 gap은 혼란 유발.
- generate_doc_number RPC가 insert와 같은 action 안에서 호출되므로 안전.

### 2.4 Edit Page (`/po/:id/edit`)

**Loader:**
- 기존 PO 데이터 + Organizations + Products (Create와 동일한 참조 데이터)

**Action (intent: "update"):**
1. Zod validation
2. `supabase.from("purchase_orders").update({ ...fields }).eq("id", id)`
3. 성공 시 redirect(`/po/${id}`)

**주의: po_no는 수정 불가.** po_date 변경해도 번호는 유지.

### 2.5 Delete (Soft Delete)

- Detail 페이지에서 "삭제" 버튼 -> AlertDialog 확인
- Action intent: "delete" -> `update({ deleted_at: new Date().toISOString() })`
- 성공 시 redirect(`/po`)

### 2.6 Clone

- Detail 페이지에서 "복제" 버튼
- Action intent: "clone"
- 기존 PO의 데이터를 복사하되: po_no 새로 생성, po_date는 오늘, status는 "process"
- 성공 시 redirect(`/po/${newId}`)

### 2.7 Status Toggle

- Detail 페이지에서 상태 배지 클릭 또는 토글 버튼
- Action intent: "toggle_status"
- `process` <-> `complete` 토글
- fetcher.submit으로 처리 (페이지 이동 없음)

---

## 3. Component Hierarchy (컴포넌트 구조)

```
app/components/po/
  po-table.tsx          # Desktop: PO 목록 테이블
  po-card-list.tsx      # Mobile: PO 카드 목록
  po-status-filter.tsx  # 상태 필터 탭 (전체/진행/완료)
  po-form.tsx           # Create/Edit 공유 폼
  po-line-items.tsx     # 라인아이템 동적 폼 (add/remove rows)
  po-detail-info.tsx    # Detail 페이지 정보 섹션
  po-detail-items.tsx   # Detail 페이지 라인아이템 테이블
  po-actions.tsx        # Detail 페이지 액션 버튼들 (수정/복제/삭제/상태변경)
```

### 3.1 PO List Page 구조

```
_layout.po.tsx
  <Header title="구매주문">
    <Link to="/po/new"><Button>PO 작성</Button></Link>
  </Header>
  <PageContainer fullWidth>
    <POStatusFilter />               -- 상태 필터 (searchParams 기반)
    <div className="hidden md:block">
      <POTable />                    -- Desktop 테이블
    </div>
    <div className="md:hidden">
      <POCardList />                 -- Mobile 카드
    </div>
  </PageContainer>
```

### 3.2 PO Detail Page 구조

```
_layout.po.$id.tsx
  <Header title={po.po_no}>
    <POActions />                    -- 수정/복제/삭제/상태토글
  </Header>
  <PageContainer>
    <PODetailInfo />                 -- 기본 정보 (날짜, 거래처, 조건 등)
    <PODetailItems />                -- 라인아이템 테이블
    -- (Phase 4에서 ContentsSection 추가 예정)
  </PageContainer>
```

### 3.3 PO Form Page 구조 (Create / Edit 공유)

```
_layout.po.new.tsx / _layout.po.$id.edit.tsx
  <Header title="PO 작성" / "PO 수정" />
  <PageContainer>
    <POForm>
      -- 기본 정보 필드 (날짜, 거래처, 통화, 조건, 항구 등)
      <POLineItems />               -- 동적 라인아이템 편집
      -- 합계 표시
      <Button type="submit" />
    </POForm>
  </PageContainer>
```

### 3.4 라인아이템 편집기 (POLineItems)

**Decision: Inline form (별도 step 아님)**

라인아이템을 PO 폼 내에 inline으로 배치한다.

- "품목 추가" 버튼으로 행 추가
- 각 행: product 선택(Select) -> gsm/width 자동입력, quantity_kg(Input), unit_price(Input), amount(자동계산)
- 행 삭제 버튼
- React state로 관리 (`useState<LineItem[]>`)
- Submit 시 hidden input 또는 JSON.stringify로 FormData에 포함

**Amount 계산: Client-side**
- `amount = quantity_kg * unit_price` (각 행)
- `total_amount = sum(all line amounts)` (합계)
- 실시간 표시, submit 시 서버에 전송
- 서버에서 재검증 (integrity check)

**FormData 전송 방식:**
- `details` 필드에 `JSON.stringify(lineItems)` 전송
- 서버에서 `JSON.parse` + Zod array 스키마로 검증

---

## 4. Types (타입 정의)

### `app/types/po.ts`

```typescript
export interface POLineItem {
  product_id: string;
  product_name: string;
  gsm: number | null;
  width_mm: number | null;
  quantity_kg: number;
  unit_price: number;
  amount: number;
}

export interface PurchaseOrder {
  id: string;
  po_no: string;
  po_date: string;
  validity: string | null;
  ref_no: string | null;
  supplier_id: string;
  buyer_id: string;
  currency: string;
  amount: number | null;
  payment_term: string | null;
  delivery_term: string | null;
  loading_port: string | null;
  discharge_port: string | null;
  details: POLineItem[];
  notes: string | null;
  status: "process" | "complete";
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderWithOrgs extends PurchaseOrder {
  supplier: { id: string; name_en: string } | null;
  buyer: { id: string; name_en: string } | null;
}

// List 페이지용 경량 타입
export interface POListItem {
  id: string;
  po_no: string;
  po_date: string;
  status: "process" | "complete";
  currency: string;
  amount: number | null;
  supplier: { name_en: string } | null;
  buyer: { name_en: string } | null;
}
```

---

## 5. Zod Validation Schema

### Server-side (`app/loaders/po.server.ts`)

```typescript
const lineItemSchema = z.object({
  product_id: z.string().uuid(),
  product_name: z.string().min(1),
  gsm: z.number().nullable(),
  width_mm: z.number().nullable(),
  quantity_kg: z.number().positive("수량을 입력하세요"),
  unit_price: z.number().positive("단가를 입력하세요"),
  amount: z.number().nonnegative(),
});

const poSchema = z.object({
  po_date: z.string().min(1, "날짜를 입력하세요"),
  validity: z.string().optional(),
  ref_no: z.string().optional(),
  supplier_id: z.string().uuid("공급자를 선택하세요"),
  buyer_id: z.string().uuid("구매자를 선택하세요"),
  currency: z.enum(["USD", "KRW"]).default("USD"),
  payment_term: z.string().optional(),
  delivery_term: z.string().optional(),
  loading_port: z.string().optional(),
  discharge_port: z.string().optional(),
  details: z.string().transform((val) => JSON.parse(val)).pipe(z.array(lineItemSchema).min(1, "품목을 1개 이상 추가하세요")),
  notes: z.string().optional(),
});
```

**Key:** `details`는 FormData에서 string으로 오므로 `.transform(JSON.parse).pipe(z.array(...))` 패턴 사용.

---

## 6. Implementation Sub-phases (구현 순서)

### Phase 2-A: PO List + Create (기본 CRUD)

**Files:**
1. `app/types/po.ts` - PO 타입 정의
2. `app/loaders/po.server.ts` - loader (list) + action (create)
3. `app/routes/_layout.po.tsx` - 목록 페이지 (기존 placeholder 교체)
4. `app/loaders/po.new.server.ts` - loader (orgs/products) + action (create)
5. `app/routes/_layout.po.new.tsx` - 생성 페이지
6. `app/components/po/po-table.tsx` - 목록 테이블
7. `app/components/po/po-form.tsx` - 생성/수정 공유 폼
8. `app/components/po/po-line-items.tsx` - 라인아이템 편집기
9. `app/routes.ts` - 새 route 추가

**Loader file decision:** `po.server.ts`에 list loader + list page actions (delete from list 등), `po.new.server.ts`에 create form loader + create action. 이유: create form은 참조 데이터(orgs, products)를 추가로 로드해야 하므로 loader가 다르다.

### Phase 2-B: PO Detail

**Files:**
1. `app/loaders/po.$id.server.ts` - detail loader + actions (delete, clone, toggle_status)
2. `app/routes/_layout.po.$id.tsx` - 상세 페이지
3. `app/components/po/po-detail-info.tsx` - 정보 섹션
4. `app/components/po/po-detail-items.tsx` - 라인아이템 표시
5. `app/components/po/po-actions.tsx` - 액션 버튼 그룹

### Phase 2-C: PO Edit + Clone + Status Toggle

**Files:**
1. `app/loaders/po.$id.edit.server.ts` - edit loader + action
2. `app/routes/_layout.po.$id.edit.tsx` - 수정 페이지
3. Clone / Status toggle actions -> `po.$id.server.ts`에 추가 (Phase 2-B 파일)

### Phase 2-D: Polish

**Files (기존 파일 수정):**
1. `app/components/po/po-card-list.tsx` - 모바일 카드 목록
2. `app/components/po/po-status-filter.tsx` - 상태 필터 탭
3. 검색 기능 추가 (list loader에 `q` param 처리)
4. Empty states, loading states 개선

---

## 7. Key Design Decisions Summary (핵심 설계 결정)

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | 라우팅 | 별도 페이지 | 문서 모듈 = 복잡한 폼 + 상세 뷰 필요 |
| 2 | 라인아이템 | Inline form (same page) | 별도 step은 과도함. 품목 1-5개로 적음 |
| 3 | Amount 계산 | Client-side + Server 검증 | UX: 실시간 표시, 안전: 서버 재검증 |
| 4 | PO 번호 | Create 시점 생성 | Gap 방지, 단순함 |
| 5 | Supplier/Buyer | 드롭다운 선택 | 기본값 없음 (CHP/GV가 대부분이지만 강제하지 않음) |
| 6 | details 전송 | JSON.stringify in FormData | JSONB 필드에 대한 가장 단순한 접근 |
| 7 | Loader 분리 | list / new / $id / $id.edit 각각 | 각 페이지의 데이터 요구사항이 다름 |
| 8 | Delete 위치 | Detail 페이지에서만 | List에서 바로 삭제는 위험. 상세 확인 후 삭제 |

---

## 8. Supplier/Buyer Default 전략

PO에서 supplier는 거의 항상 CHP, buyer는 거의 항상 GV이다. 하지만:

- **하드코딩하지 않는다.** Organizations에서 동적으로 로드.
- **가장 최근 PO의 supplier/buyer를 기본값으로 사용**하는 것도 고려했으나, Phase 2에서는 불필요한 복잡성.
- **Simple approach:** 드롭다운에서 수동 선택. 타입별로 필터링하여 보여준다.
  - Supplier 드롭다운: `type = "supplier"` 필터
  - Buyer 드롭다운: `type = "seller"` 또는 `type = "buyer"` 필터 (GV는 seller)

---

## 9. Integration Points for Future Phases (향후 연동 포인트)

### Phase 3: PI 참조 생성
- PI 생성 시 PO 선택 -> PO의 details를 복사 (가격 제외)
- `purchase_orders.id`를 `proforma_invoices.po_id`로 참조
- PO detail 페이지에서 "PI 생성" 버튼 추가 예정
- **Now:** PO 타입에 PI 관련 필드 없음. Phase 3에서 PO detail에 linked PI 표시 추가.

### Phase 6: Order Management
- Order 생성 시 PO 선택 -> `orders.po_id` 연결
- PO list/detail에서 linked order 표시 (Phase 6에서 추가)
- **Now:** PO에 order 관련 필드 없음. 별도 orders 테이블에서 FK로 참조.

### Phase 9: PDF Generation
- PO PDF에 필요한 데이터: PO 전체 필드 + supplier/buyer 주소 + details
- PO detail 페이지에 "PDF 다운로드" 버튼 추가 예정
- **Now:** PDF 관련 코드 없음. Detail 페이지의 데이터 구조가 PDF에 그대로 사용 가능하도록 설계.

### Data Exposure for Future Use
- `PurchaseOrderWithOrgs` 타입이 org의 full 정보를 포함하도록 설계 (Phase 9 PDF용)
- Detail loader에서 `supplier:organizations!supplier_id(*)` 로 full org 데이터 로드 (주소, 전화 등 PDF에 필요)

---

## 10. File Ownership Map (파일 소유 에이전트)

### Backend Dev (서버 + 타입)
| File | Description |
|------|-------------|
| `app/types/po.ts` | PO 관련 TypeScript 타입 |
| `app/loaders/po.server.ts` | PO list loader + list-level actions |
| `app/loaders/po.new.server.ts` | PO create form loader + create action |
| `app/loaders/po.$id.server.ts` | PO detail loader + detail actions (delete, clone, toggle) |
| `app/loaders/po.$id.edit.server.ts` | PO edit form loader + update action |

### Frontend Dev (라우트 + 컴포넌트)
| File | Description |
|------|-------------|
| `app/routes/_layout.po.tsx` | PO 목록 페이지 (기존 파일 교체) |
| `app/routes/_layout.po.new.tsx` | PO 생성 페이지 |
| `app/routes/_layout.po.$id.tsx` | PO 상세 페이지 |
| `app/routes/_layout.po.$id.edit.tsx` | PO 수정 페이지 |
| `app/routes.ts` | Route 추가 (수정) |
| `app/components/po/po-table.tsx` | Desktop 목록 테이블 |
| `app/components/po/po-card-list.tsx` | Mobile 카드 목록 |
| `app/components/po/po-status-filter.tsx` | 상태 필터 |
| `app/components/po/po-form.tsx` | 생성/수정 공유 폼 |
| `app/components/po/po-line-items.tsx` | 라인아이템 편집기 |
| `app/components/po/po-detail-info.tsx` | 상세 정보 표시 |
| `app/components/po/po-detail-items.tsx` | 상세 라인아이템 표시 |
| `app/components/po/po-actions.tsx` | 상세 액션 버튼 |

### Shared (Architect decision, implemented by either)
| File | Description |
|------|-------------|
| `app/lib/constants.ts` | 변경 없음 (이미 필요한 상수 존재) |
| `app/lib/format.ts` | 변경 없음 (이미 필요한 formatter 존재) |

---

## 11. 추가 고려사항

### 11.1 Pagination
- Phase 2에서는 pagination 불필요. PO는 월 5-10건 수준.
- 데이터가 100건 넘으면 Phase 2-D에서 cursor-based pagination 추가.

### 11.2 Optimistic UI
- Status toggle: fetcher 사용으로 자연스러운 optimistic update (React Router의 fetcher.formData 활용)
- Create/Edit: redirect이므로 optimistic 불필요.

### 11.3 Error Handling
- Loader 에러: `data({ error: message })` 반환, UI에서 에러 표시
- Action 에러: `data({ success: false, error: message })` 반환, 폼 위에 에러 메시지
- 404: `throw data(null, { status: 404 })` -> root error boundary

### 11.4 Loading States
- Route transition: React Router의 `useNavigation()` 으로 loading indicator
- Form submission: `fetcher.state !== "idle"` 로 버튼 비활성화
- 이 패턴은 Phase 1 Settings에서 이미 확립됨.

### 11.5 Mobile Layout
- List: 카드 형태 (po_no, date, amount, status badge)
- Detail: 수직 스택 (label-value 쌍)
- Form: 전체 너비 single column
- 라인아이템: 카드 형태 (테이블 대신)

---

## 12. Shared Document Pattern (공유 문서 패턴)

PO가 첫 번째 문서 모듈이므로, 여기서 확립한 패턴이 PI/Shipping/Customs에도 적용된다.

### 재사용 가능한 패턴 (PI/Shipping에서 동일하게 적용):
1. **Route 구조:** `module/` (list), `module/new` (create), `module/:id` (detail), `module/:id/edit` (edit)
2. **Loader 분리:** list / new / $id / $id.edit 각각 별도 파일
3. **Status filter:** searchParams 기반, 전체/진행/완료
4. **Soft delete:** `deleted_at` 패턴
5. **Details JSONB:** JSON.stringify -> FormData -> JSON.parse + Zod pipe
6. **Amount 계산:** Client-side 실시간 + Server 검증

### 향후 shared component 후보 (Phase 2에서는 PO 전용으로 구현, 공통화는 Phase 3에서):
- `DocumentStatusFilter` (po-status-filter -> shared)
- `DocumentActions` (po-actions -> shared, 공통 버튼: 수정/삭제/복제/상태변경)
- `LineItemsEditor` (po-line-items -> shared, PI에서도 동일 구조)

**Phase 2에서는 PO 전용으로 구현하고, Phase 3에서 PI 구현 시 공통 패턴을 추출한다.** 조기 추상화를 피한다.

---

## 13. routes.ts 최종 변경안

```typescript
export default [
  route("login", "routes/_auth.login.tsx"),
  route("logout", "routes/_auth.logout.tsx"),

  layout("routes/_layout.tsx", [
    index("routes/_layout.home.tsx"),
    // PO
    route("po", "routes/_layout.po.tsx"),
    route("po/new", "routes/_layout.po.new.tsx"),
    route("po/:id", "routes/_layout.po.$id.tsx"),
    route("po/:id/edit", "routes/_layout.po.$id.edit.tsx"),
    // PI (placeholder)
    route("pi", "routes/_layout.pi.tsx"),
    // ... rest unchanged
  ]),

  layout("routes/_saelim.tsx", [
    route("saelim/delivery", "routes/_saelim.delivery.tsx"),
  ]),
] satisfies RouteConfig;
```

---

## 14. Summary (요약)

PO 모듈은 별도 페이지 방식으로 구현하며, list/create/detail/edit 4개 route로 구성한다. 라인아이템은 폼 내 inline 편집, amount는 client-side 계산 + server 검증, PO 번호는 create 시점 생성이다. Phase 2를 4개 sub-phase (A: list+create, B: detail, C: edit+clone+toggle, D: polish)로 나누어 점진적으로 구현한다. PO에서 확립한 패턴은 이후 PI/Shipping/Customs 모듈에서 재사용된다.
