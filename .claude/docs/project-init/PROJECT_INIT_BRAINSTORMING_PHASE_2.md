# Saelim Import Management System - Phase 2 상세 브레인스토밍

**Date:** 2026-03-06
**Status:** Phase 2 상세 설계 완료
**참조:** [종합 브레인스토밍](PROJECT_INIT_BRAINSTORMING.md) | [Phase 0](PROJECT_INIT_BRAINSTORMING_PHASE_0.md)
**Phase 상태:** Phase 0 완료, Phase 1 완료 → **Phase 2 구현 준비**

---

## 1. Phase 2 개요

### 정의
Purchase Order (PO) 모듈. GV International이 CHP(대만 공급자)에게 Glassine Paper를 구매하는 주문서를 관리한다.
PO는 전체 문서 체인(PO → PI → Shipping → Customs → Delivery)의 시작점이다.

### 현재 상태
| 항목 | 상태 |
|------|------|
| DB 스키마 (purchase_orders) | 완료 (Phase 0에서 생성) |
| RLS 정책 | 완료 (GV-only full CRUD) |
| generate_doc_number RPC | 완료 |
| 라우트 placeholder | 완료 (`_layout.po.tsx` - "준비 중") |
| Auth (requireGVUser) | 완료 |
| Organizations/Products CRUD | 완료 (Phase 1) |

### 범위 (Scope)
- PO CRUD (생성, 조회, 수정, 삭제)
- 자동 번호 생성 (GVPO2603-001 형식)
- PO 목록 (상태 필터: 전체/진행/완료)
- PO 상세 페이지
- PO 복제 (Clone) 기능
- Status Toggle (진행 ↔ 완료)

---

## 2. Agent Team & File Ownership

| # | Role | File | Scope |
|---|------|------|-------|
| 1 | **Architect** | [architect.md](../brainstorm/phase2/architect.md) | 라우팅 전략, 컴포넌트 구조, 구현 단계, 핵심 설계 결정 |
| 2 | **Frontend Dev** | [frontend.md](../brainstorm/phase2/frontend.md) | UI 컴포넌트, 폼 설계, 반응형, 와이어프레임 |
| 3 | **Backend Dev** | [backend.md](../brainstorm/phase2/backend.md) | Loader/Action, Zod 스키마, Supabase 쿼리 패턴 |
| 4 | **Security Reviewer** | [security.md](../brainstorm/phase2/security.md) | 보안 체크리스트, 입력 검증, 데이터 무결성 |
| 5 | **Researcher** | [researcher.md](../brainstorm/phase2/researcher.md) | 기술 패턴 조사, JSONB, RPC, Form 패턴 |

**제외:** Tester (코드 없음), Perf-analyzer (시기상조), Code-reviewer (코드 없음)

---

## 3. 핵심 설계 결정 (Key Design Decisions)

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | 라우팅 | **별도 페이지** (not Dialog) | PO는 10+ 필드 + 동적 라인아이템. Settings Dialog 패턴으로는 비좁음 |
| 2 | 라인아이템 | **Inline form** (same page) | 품목 1-5개로 적음. 별도 step은 과도함 |
| 3 | Amount 계산 | **Client-side + Server 검증** | UX: 실시간 표시, 안전: 서버 재검증 |
| 4 | PO 번호 | **Create 시점 생성** | Gap 방지, 단순함. Pre-allocate 시 취소 gap 발생 |
| 5 | details 전송 | **JSON.stringify in FormData** | Hidden input의 `value=`(controlled). JSONB → 가장 단순한 접근 |
| 6 | Loader 분리 | **route별 별도 파일** | 각 페이지의 데이터 요구사항이 다름 |
| 7 | 조기 추상화 | **PO 전용으로 구현** | Phase 3 PI 구현 시 공통 패턴 추출. 지금은 과도 |
| 8 | Clone 후 이동 | **Edit 페이지로 redirect** | Clone 직후 사용자가 날짜/수량 조정 필요 |

---

## 4. Route Structure

### 4.1 라우트 구조

```
/po              → PO 목록 (list + status filter)
/po/new          → PO 생성 (full-page form)
/po/:id          → PO 상세 (read-only detail view)
/po/:id/edit     → PO 수정 (full-page form, pre-filled)
```

### 4.2 routes.ts 변경

```typescript
layout("routes/_layout.tsx", [
  index("routes/_layout.home.tsx"),
  // PO routes
  route("po", "routes/_layout.po.tsx"),
  route("po/new", "routes/_layout.po.new.tsx"),
  route("po/:id", "routes/_layout.po.$id.tsx"),
  route("po/:id/edit", "routes/_layout.po.$id.edit.tsx"),
  // ... (기존 placeholder routes)
])
```

### 4.3 Server Files (Loader/Action)

```
app/loaders/po.server.ts          → list loader + create action (poFormLoader, createPOAction)
app/loaders/po.$id.server.ts      → detail loader + edit loader + actions (update/delete/clone/toggle)
```

### 4.4 Route ↔ Server File 매핑

```typescript
// routes/_layout.po.tsx
export { loader } from "~/loaders/po.server";

// routes/_layout.po.new.tsx
export { poFormLoader as loader, createPOAction as action } from "~/loaders/po.server";

// routes/_layout.po.$id.tsx
export { loader, action } from "~/loaders/po.$id.server";

// routes/_layout.po.$id.edit.tsx
export { poEditLoader as loader, action } from "~/loaders/po.$id.server";
```

---

## 5. DB Schema & Types

### 5.1 purchase_orders 테이블 (이미 존재)

```sql
CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_no TEXT UNIQUE NOT NULL,           -- GVPO2603-001 형식
  po_date DATE NOT NULL,
  validity DATE,
  ref_no TEXT,
  supplier_id UUID REFERENCES organizations(id),  -- CHP
  buyer_id UUID REFERENCES organizations(id),      -- GV
  currency TEXT DEFAULT 'USD',
  amount DECIMAL(15,2),                 -- 서버에서 재계산
  payment_term TEXT,
  delivery_term TEXT,
  loading_port TEXT,
  discharge_port TEXT,
  details JSONB DEFAULT '[]',           -- line items
  notes TEXT,
  status TEXT DEFAULT 'process' CHECK (status IN ('process', 'complete')),
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 5.2 Line Item JSONB 구조

```json
[
  {
    "product_id": "uuid",
    "product_name": "Glassine Paper 40gsm",
    "gsm": 40,
    "width_mm": 620,
    "quantity_kg": 5000,
    "unit_price": 1.25,
    "amount": 6250.00
  }
]
```

### 5.3 TypeScript 타입 (`app/types/po.ts`)

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

export interface POWithOrgs {
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
  supplier: { id: string; name_en: string; name_ko: string | null; address_en: string | null } | null;
  buyer: { id: string; name_en: string; name_ko: string | null; address_en: string | null } | null;
}

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

## 6. Zod Validation Schema

```typescript
const lineItemSchema = z.object({
  product_id: z.string().uuid("유효한 제품을 선택하세요"),
  product_name: z.string().min(1).max(200),
  gsm: z.number().nullable(),
  width_mm: z.number().nullable(),
  quantity_kg: z.number().positive("수량은 0보다 커야 합니다"),
  unit_price: z.number().positive("단가는 0보다 커야 합니다"),
  amount: z.number().nonnegative(),
});

const poSchema = z.object({
  po_date: z.string().min(1, "PO 일자를 입력하세요"),
  validity: z.string().optional().default(""),
  ref_no: z.string().max(100).optional().default(""),
  supplier_id: z.string().uuid("공급업체를 선택하세요"),
  buyer_id: z.string().uuid("구매업체를 선택하세요"),
  currency: z.enum(["USD", "KRW"]),
  payment_term: z.string().optional().default(""),
  delivery_term: z.string().optional().default(""),
  loading_port: z.string().optional().default(""),
  discharge_port: z.string().optional().default(""),
  notes: z.string().max(2000).optional().default(""),
});
```

**JSONB details 검증** (별도 처리):
```typescript
const detailsRaw = formData.get("details") as string;
const parsed = JSON.parse(detailsRaw);
const validated = z.array(lineItemSchema).min(1, "품목 1개 이상 필요").max(20).safeParse(parsed);
```

---

## 7. Backend 핵심 패턴

### 7.1 List Loader (Supabase FK Join)

```typescript
const { data: pos } = await supabase
  .from("purchase_orders")
  .select(
    "id, po_no, po_date, status, amount, currency, " +
    "supplier:organizations!supplier_id(name_en), " +
    "buyer:organizations!buyer_id(name_en)"
  )
  .is("deleted_at", null)
  .order("po_date", { ascending: false })
  .order("created_at", { ascending: false });
```

**FK 이름 명시 필수:** `!supplier_id` / `!buyer_id` 없으면 PostgREST ambiguous 오류.

### 7.2 PO 번호 생성 (RPC)

```typescript
const { data: poNo } = await supabase.rpc("generate_doc_number", {
  doc_type: "PO",
  ref_date: parsed.data.po_date, // PO 일자 기준 (오늘 아님)
});
// → "GVPO2603-001"
```

### 7.3 Amount 서버사이드 재계산

```typescript
const recalculated = lineItems.map(item => ({
  ...item,
  amount: Math.round(item.quantity_kg * item.unit_price * 100) / 100,
}));
const totalAmount = Math.round(
  recalculated.reduce((sum, item) => sum + item.amount, 0) * 100
) / 100;
```

### 7.4 JSONB TypeScript Cast

```typescript
// POLineItem[] → Json 타입 캐스팅 필요
details: recalculated as unknown as Json,
```

### 7.5 Multi-intent Action Pattern

```typescript
export async function action({ request, context, params }: DetailLoaderArgs) {
  const { supabase, user, responseHeaders } = await requireGVUser(request, context);
  const formData = await request.formData();
  const intent = formData.get("_action") as string;

  switch (intent) {
    case "update":  return handleUpdate(supabase, formData, params.id, responseHeaders);
    case "delete":  return handleDelete(supabase, params.id, responseHeaders);
    case "clone":   return handleClone(supabase, user.id, params.id, responseHeaders);
    case "toggle_status": return handleToggleStatus(supabase, params.id, formData, responseHeaders);
    default: return data({ success: false, error: "알 수 없는 요청입니다." }, { status: 400 });
  }
}
```

---

## 8. Frontend 핵심 패턴

### 8.1 PO List Page 구조

```
<Header title="구매주문">
  <Link to="/po/new"><Button>PO 작성</Button></Link>
</Header>
<PageContainer fullWidth>
  <Tabs> 전체 / 진행 / 완료 </Tabs>    -- URL searchParams 기반
  <Search />                           -- 클라이언트 필터
  <Table />  (hidden md:block)          -- Desktop
  <CardList /> (md:hidden)              -- Mobile
</PageContainer>
```

### 8.2 PO Form 구조 (Create/Edit 공유)

```
<Card> 기본 정보 </Card>  +  <Card> 거래 조건 </Card>   -- 2-column (desktop)
<Card> 품목 내역 (POLineItems) </Card>                   -- 동적 행 추가/삭제
<Card> 비고 </Card>
<Button> 취소 / 저장 </Button>
<input type="hidden" name="details" value={JSON.stringify(lineItems)} />
```

### 8.3 PO Detail 구조

```
<Header title={po.po_no}>
  <StatusBadge />  <ToggleButton />  <DropdownMenu> 수정/복제/삭제 </DropdownMenu>
</Header>
<Card> 기본 정보 </Card>  +  <Card> 거래 조건 </Card>   -- 2-column
<Card> 품목 내역 (read-only Table) </Card>
<Footer> 작성일 / 수정일 </Footer>
```

### 8.4 라인아이템 편집기 UX

- Desktop: 테이블 형태 (Product Select | 수량 | 단가 | 금액 | 삭제)
- Mobile: 카드 스택 형태 (각 행이 bordered card)
- Product Select: `name (gsm, width_mm)` 형식
- 자동 계산: quantity_kg * unit_price = amount (실시간)
- 최소 1행 유지 (삭제 불가)
- Hidden input: **`value=`(controlled)** 사용 (`defaultValue=` 금지)

### 8.5 Status Filter (URL Search Params)

```tsx
const [searchParams, setSearchParams] = useSearchParams();
// 필터 변경 시 replace: true (뒤로가기에서 필터 상태 순회 방지)
setSearchParams(newParams, { replace: true });
```

---

## 9. 보안 체크리스트 (Security)

### Critical (반드시 지킬 것)

- [ ] **모든 PO loader에서** `requireGVUser` 호출 (레이아웃 가드에만 의존 금지)
- [ ] **모든 PO action에서** `requireGVUser` 호출
- [ ] `created_by`는 `user.id`로 서버에서 설정 (form 입력 무시)
- [ ] `details` JSONB를 Zod로 파싱 + 검증 (최대 20개 line item)
- [ ] `amount`를 서버에서 재계산 (클라이언트 값 무시)
- [ ] `supplier_id`, `buyer_id`를 `z.string().uuid()`로 검증
- [ ] URL params `id`를 UUID로 검증
- [ ] 소프트 삭제된 PO에 `.is("deleted_at", null)` 조건 적용
- [ ] Supabase 오류 메시지를 사용자 친화적 메시지로 래핑

### Warning (강력 권장)

- [ ] `complete` 상태 PO의 update 차단
- [ ] 알 수 없는 `_action`에 400 반환
- [ ] `notes` 필드 최대 길이 제한 (2000자)
- [ ] `po_date`와 `validity` 논리적 일관성 검증
- [ ] 활성 organization만 supplier_id/buyer_id로 허용
- [ ] `dangerouslySetInnerHTML` 절대 미사용
- [ ] `{ headers: responseHeaders }` 모든 redirect에 포함 (세션 쿠키 손실 방지)

---

## 10. Component Architecture

### 10.1 파일 구조

```
app/components/po/
  po-form.tsx           # Create/Edit 공유 폼
  po-line-items.tsx     # 동적 라인아이템 편집기
  po-detail-info.tsx    # Detail 정보 섹션
  po-detail-items.tsx   # Detail 라인아이템 테이블

app/components/shared/
  doc-status-badge.tsx  # 범용 문서 상태 배지 (PO/PI/Shipping 공용)
```

### 10.2 File Ownership Map

| Owner | File | Description |
|-------|------|-------------|
| **Backend** | `app/types/po.ts` | PO 타입 정의 |
| **Backend** | `app/loaders/po.server.ts` | List loader + Create action |
| **Backend** | `app/loaders/po.$id.server.ts` | Detail/Edit loader + Update/Delete/Clone/Toggle actions |
| **Frontend** | `app/routes/_layout.po.tsx` | PO 목록 페이지 (기존 교체) |
| **Frontend** | `app/routes/_layout.po.new.tsx` | PO 생성 페이지 |
| **Frontend** | `app/routes/_layout.po.$id.tsx` | PO 상세 페이지 |
| **Frontend** | `app/routes/_layout.po.$id.edit.tsx` | PO 수정 페이지 |
| **Frontend** | `app/components/po/*.tsx` | PO 컴포넌트 (4개) |
| **Frontend** | `app/components/shared/doc-status-badge.tsx` | 공용 상태 배지 |
| **Shared** | `app/routes.ts` | Route 추가 |
| **Shared** | `app/components/ui/icons.tsx` | ChevronLeft, MoreHorizontal 추가 |

---

## 11. Implementation Sub-phases (구현 순서)

### Phase 2-A: PO List + Create (기본 CRUD)

**목표:** PO 목록 조회 + 새 PO 작성이 동작하는 최소 단위

**파일 생성 순서:**
1. `app/types/po.ts` - 타입 정의
2. `app/loaders/po.server.ts` - list loader + poFormLoader + createPOAction
3. `app/routes.ts` - 새 route 추가
4. `app/components/ui/icons.tsx` - ChevronLeft, MoreHorizontal 추가
5. `app/components/shared/doc-status-badge.tsx` - 상태 배지
6. `app/components/po/po-line-items.tsx` - 라인아이템 편집기
7. `app/components/po/po-form.tsx` - 공용 폼
8. `app/routes/_layout.po.tsx` - 목록 페이지 (Desktop Table + Mobile Card)
9. `app/routes/_layout.po.new.tsx` - 생성 페이지

**shadcn 설치:**
```bash
npx shadcn@latest add tabs
# card는 이미 설치됨
```

### Phase 2-B: PO Detail

**목표:** PO 상세 조회 + 삭제

**파일:**
1. `app/loaders/po.$id.server.ts` - detail loader + actions
2. `app/components/po/po-detail-info.tsx` - 정보 섹션
3. `app/components/po/po-detail-items.tsx` - 라인아이템 표시
4. `app/routes/_layout.po.$id.tsx` - 상세 페이지

### Phase 2-C: PO Edit + Clone + Status Toggle

**목표:** 기존 PO 수정, 복제, 상태 변경

**파일:**
1. `app/loaders/po.$id.server.ts` - poEditLoader + handleUpdate/handleClone/handleToggleStatus 추가
2. `app/routes/_layout.po.$id.edit.tsx` - 수정 페이지

### Phase 2-D: Polish

**목표:** 모바일 최적화, 검색, 빈 상태

**파일 (기존 수정):**
1. 검색 기능 추가 (list loader + UI)
2. 모바일 카드 목록 개선
3. Empty states, loading states
4. 에러 처리 강화

---

## 12. UI Wireframes

### PO List - Desktop
```
+----------------------------------------------------------+
| [=] | 구매주문                              [PO 작성] btn |
+----------------------------------------------------------+
| [전체(12)] [진행(8)] [완료(4)]    [PO 번호 검색...]       |
+----------------------------------------------------------+
| PO No.        | 일자       | 공급자 | 통화 | 총액       |상태|⋯|
|---------------|------------|--------|------|-----------|----|----|
| GVPO2603-003  | 2026.03.05 | CHP    | USD  | $18,750   |진행| ⋯ |
| GVPO2603-002  | 2026.03.01 | CHP    | USD  | $12,500   |진행| ⋯ |
| GVPO2602-001  | 2026.02.15 | CHP    | KRW  | ₩8,500,000|완료| ⋯ |
+----------------------------------------------------------+
```

### PO List - Mobile
```
+----------------------------+
| [=] 구매주문    [PO 작성]  |
+----------------------------+
| [전체] [진행] [완료]       |
+----------------------------+
| +------------------------+ |
| | GVPO2603-003     [진행]| |
| | CHP | 2026.03.05       | |
| |            $18,750.00  | |
| +------------------------+ |
| +------------------------+ |
| | GVPO2603-002     [진행]| |
| | CHP | 2026.03.01       | |
| |            $12,500.00  | |
| +------------------------+ |
+----------------------------+
```

### PO Create - Desktop
```
+----------------------------------------------------------+
| [=] | 구매주문 작성                                       |
+----------------------------------------------------------+
| +-------------------------+ +---------------------------+ |
| | 기본 정보               | | 거래 조건                 | |
| | PO 일자: [2026-03-06]   | | 공급자: [CHP        ▼]  | |
| | 유효기간: [          ]   | | 구매자: [GV Int'l   ▼]  | |
| | 참조번호: [          ]   | | 통화: [USD ▼] 결제:[▼]  | |
| |                         | | 인도: [▼]   선적항: [▼]  | |
| |                         | | 양륙항: [▼]              | |
| +-------------------------+ +---------------------------+ |
| +-------------------------------------------------------+ |
| | 품목 내역                              [품목 추가] btn | |
| | 품목               | 수량(KG) | 단가   | 금액      | X | |
| |--------------------+----------+--------+-----------+---| |
| | [Glassine 40g ▼]  | [5000]   | [1.25] | $6,250.00 | X | |
| | [Glassine 50g ▼]  | [3000]   | [1.30] | $3,900.00 | X | |
| |                    |          |  합계  |$10,150.00 |   | |
| +-------------------------------------------------------+ |
| +-------------------------------------------------------+ |
| | 비고: [                                              ] | |
| +-------------------------------------------------------+ |
|                                      [취소]  [작성] btn  |
+----------------------------------------------------------+
```

### PO Detail - Desktop
```
+----------------------------------------------------------+
| [< 목록으로] | GVPO2603-003 [진행] [완료 처리] [⋯]       |
+----------------------------------------------------------+
| +-------------------------+ +---------------------------+ |
| | 기본 정보               | | 거래 조건                 | |
| | PO 번호  GVPO2603-003   | | 공급자         CHP       | |
| | 일자     2026.03.05     | | 구매자   GV Int'l        | |
| | 유효기간 2026.04.05     | | 결제조건  T/T in advance | |
| | 참조번호 REF-123        | | 인도조건  CFR Busan      | |
| |                         | | 선적항  Keelung, Taiwan  | |
| |                         | | 양륙항  Busan, Korea     | |
| +-------------------------+ +---------------------------+ |
| +-------------------------------------------------------+ |
| | 품목 내역                                              | |
| | # | 품목                | 수량(KG)  | 단가  | 금액     | |
| |---|---------------------|-----------|-------|---------|  |
| | 1 | Glassine 40g, 620mm | 5,000 KG  | $1.25 |$6,250  | |
| | 2 | Glassine 50g, 780mm | 3,000 KG  | $1.30 |$3,900  | |
| |   |                     |           | 합계  |$10,150 | |
| +-------------------------------------------------------+ |
| 작성: 2026.03.05  수정: 2026.03.05                        |
+----------------------------------------------------------+
```

---

## 13. Navigation Flow

```
/po (리스트)
  ├── /po/new (작성) → 저장 후 redirect to /po/{id}
  ├── /po/{id} (상세)
  │   ├── /po/{id}/edit (수정) → 저장 후 redirect to /po/{id}
  │   ├── 복제 → server clone → redirect to /po/{newId}/edit
  │   ├── 삭제 → server delete → redirect to /po
  │   └── 상태 변경 → server toggle → revalidation (페이지 유지)
  └── 행 클릭 → /po/{id}
```

---

## 14. Researcher 핵심 발견사항

| # | Topic | Finding |
|---|-------|---------|
| 1 | JSONB FormData 전송 | Hidden input `value=`(controlled) 필수. `defaultValue=`는 state 변경 반영 안됨 |
| 2 | Supabase FK Join | `!supplier_id` / `!buyer_id` disambiguator 필수 |
| 3 | `generate_doc_number` RPC | `SECURITY DEFINER` 필수. `ref_date`에 `po_date` 전달 (오늘 아님) |
| 4 | Status Filter | `setSearchParams(newParams, { replace: true })` - 뒤로가기 필터 순회 방지 |
| 5 | Redirect | 항상 `throw redirect(url, { headers: responseHeaders })` - 세션 쿠키 손실 방지 |
| 6 | Clone redirect | Edit 페이지로 (`/po/${newId}/edit`) - 사용자가 즉시 조정 가능 |
| 7 | Optimistic toggle | `fetcher.formData?.get("_action") === "toggle_status"` 활용 |
| 8 | JSONB TypeScript | `as unknown as Json` double-cast 필요 (Supabase 타입 한계) |

---

## 15. Supabase MCP 직접 실행 사항

Phase 2에서 Supabase MCP로 직접 처리할 항목:

### 15.1 DB 확인 (execute_sql)
```sql
-- purchase_orders 테이블 존재 확인
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'purchase_orders' ORDER BY ordinal_position;

-- generate_doc_number 함수 동작 확인
SELECT generate_doc_number('PO', '2026-03-06');

-- RLS 정책 확인
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'purchase_orders';
```

### 15.2 Seed Data (선택사항)
```sql
-- 테스트용 PO 데이터 (구현 후 확인용)
-- Phase 2 구현 완료 후 UI에서 직접 생성 가능하므로 seed 불필요
```

### 15.3 Type 재생성
```
mcp__supabase__generate_typescript_types → app/types/database.ts 업데이트
```

---

## 16. 새 shadcn 컴포넌트 설치

```bash
npx shadcn@latest add tabs
```

`card`, `table`, `badge`, `select`, `dialog`, `alert-dialog`, `dropdown-menu` 등은 이미 설치됨.

---

## 17. icons.tsx 추가

```typescript
export {
  // 기존...
  ChevronLeft,      // 뒤로가기 (상세 → 목록)
  MoreHorizontal,   // Actions 드롭다운
} from "lucide-react";
```

---

## 18. 에러 처리 패턴

| Category | Pattern | HTTP Status |
|----------|---------|-------------|
| 유효성 검증 | `return data({ success: false, error: "..." }, { status: 400, headers })` | 400 |
| Not found | `throw data(null, { status: 404, headers })` | 404 |
| DB 오류 | `return data({ success: false, error: "저장 중 오류" }, { status: 500, headers })` | 500 |
| Unique 위반 | `error: "이미 존재하는 PO 번호입니다."` (error.code === '23505') | 409 |
| FK 위반 | `error: "유효하지 않은 거래처입니다."` (error.code === '23503') | 400 |

---

## 19. 향후 연동 포인트

### Phase 3: PI 참조 생성
- PI 생성 시 PO 선택 → PO details 복사 (**가격 제외**)
- PO detail에 "PI 생성" 버튼 추가 예정
- `proforma_invoices.po_id` FK로 참조

### Phase 6: Order Management
- Order 생성 시 PO 선택 → `orders.po_id` 연결
- PO list/detail에 linked order 표시

### Phase 9: PDF Generation
- PO detail의 데이터 구조가 PDF에 그대로 사용 가능하도록 설계
- Detail loader에서 supplier/buyer full org 데이터 포함 (주소, 전화 등)

---

## 20. Open Questions (열린 질문)

| # | 질문 | 현재 결정 |
|---|------|----------|
| 1 | PO 번호 형식 | `GVPOYYMM-NNN` (generate_doc_number RPC 사용) |
| 2 | Pagination | Phase 2에서 불필요 (월 5-10건). 100건 넘으면 추가 |
| 3 | Clone 후 redirect | Edit 페이지로 (`/po/${newId}/edit`) |
| 4 | Complete PO 수정 가능 여부 | 차단 권장 (status toggle로 process 전환 후 수정) |
| 5 | Concurrent edit 보호 | Phase 2 MVP에서 불필요 (last write wins). 필요시 version 컬럼 |
| 6 | Notes 필드 | Phase 2: Textarea plain text. Phase 4에서 Tiptap 전환 |

---

## 21. Phase 2 완료 기준 (Definition of Done)

### 기능
- [ ] PO 목록 조회 (Desktop Table + Mobile Card)
- [ ] 상태 필터 (전체/진행/완료)
- [ ] PO 생성 (폼 + 라인아이템 + 자동 번호 생성)
- [ ] PO 상세 조회 (정보 + 라인아이템 테이블)
- [ ] PO 수정 (기존 데이터 pre-fill)
- [ ] PO 삭제 (soft delete + 확인 dialog)
- [ ] PO 복제 (clone + redirect to edit)
- [ ] 상태 토글 (process ↔ complete)
- [ ] PO 번호 검색 (client-side filter)

### 보안
- [ ] 모든 loader/action에서 `requireGVUser` 호출
- [ ] JSONB details Zod 검증 (min 1, max 20)
- [ ] Amount 서버사이드 재계산
- [ ] 소프트 삭제된 PO 접근 시 404
- [ ] 오류 메시지 사용자 친화적 래핑

### UI/UX
- [ ] 모바일 반응형 (md breakpoint)
- [ ] Empty state
- [ ] Loading state (fetcher.state)
- [ ] 에러 표시 (fetcher.data.error)

### 기술
- [ ] `npm run typecheck` 에러 없음
- [ ] `npm run dev` 정상 동작
- [ ] PO CRUD 전체 흐름 동작 확인

---

## 22. 에이전트별 상세 노트

| Agent | File | 주요 내용 |
|-------|------|----------|
| Architect | [architect.md](../brainstorm/phase2/architect.md) | 라우팅 전략, 4개 sub-phase, 컴포넌트 구조, 향후 연동 |
| Frontend | [frontend.md](../brainstorm/phase2/frontend.md) | UI 와이어프레임, 폼 설계, 라인아이템 UX, 반응형 |
| Backend | [backend.md](../brainstorm/phase2/backend.md) | Loader/Action 코드, Zod 스키마, Supabase 쿼리 패턴 |
| Security | [security.md](../brainstorm/phase2/security.md) | 보안 체크리스트, 입력 검증, 데이터 무결성 |
| Researcher | [researcher.md](../brainstorm/phase2/researcher.md) | JSONB FormData, FK Join, RPC, Clone 패턴 |

---

## 23. Next Steps

1. **Phase 2-A 실행:** shadcn tabs 설치 → 타입 → loader → 컴포넌트 → route 순서
2. **Supabase 확인:** DB 스키마/RPC/RLS 동작 확인 (MCP execute_sql)
3. **구현 → 테스트 → 다음 sub-phase** 반복
4. **Phase 2 완료 후:** Phase 3 (PI) 브레인스토밍 진행
