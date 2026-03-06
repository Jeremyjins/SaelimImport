# Phase 2 PO Module - Research Findings

**Date:** 2026-03-06
**Role:** Researcher
**Scope:** Phase 2 PO 모듈 기술 패턴 조사

---

## Topic 1: React Router 7 Form Patterns for JSONB Line Items

**권장: Hidden input + JSON.stringify**

| Option | 판정 |
|--------|------|
| A: `<input type="hidden" name="details" value={JSON.stringify(lineItems)} />` | 권장 - Remix 커뮤니티 표준 |
| B: Indexed fields `details[0][product_id]` | 비권장 - `qs` 라이브러리 필요, 행 삭제 시 fragile |
| C: 별도 submission | 비권장 - 트랜잭션 복잡도 불필요 |

**Critical:** Hidden input은 반드시 **controlled** (`value=`)로 사용. `defaultValue=`는 state 변경 시 업데이트 안됨.

---

## Topic 2: Supabase JSONB Query Patterns

1. JSONB는 1-5개 line item에 적합. 정규화 테이블 불필요.
2. GIN index 불필요 - `details` 내부 쿼리 없음, 전체 읽기만.
3. DB-level JSONB validation (pg_jsonschema) 불필요. Zod 서버 검증으로 충분.
4. TypeScript: `as unknown as Json` double-cast 필요 (Supabase postgrest-js Issue #420).
5. 향후 cross-PO JSONB 필터링: `.contains("details", [{ product_id: "uuid" }])`

---

## Topic 3: Supabase Relation Queries - Multiple FK to Same Table

**FK 이름 명시 필수.** 없으면 PostgREST ambiguous relationship 오류.

```typescript
.select(`
  *,
  supplier:organizations!supplier_id(id, name_en, name_ko, address_en),
  buyer:organizations!buyer_id(id, name_en, name_ko, address_en)
`)
```

Alias 형식: `alias:table!fk_column_name(columns)`. `!column_name` shorthand는 Postgres 기본 FK 제약 이름 `tablename_columnname_fkey` 규칙 활용.

---

## Topic 4: Dynamic Form Rows UX

### Auto-calculate with functional state update:
```typescript
const handleFieldChange = (index: number, field: "quantity_kg" | "unit_price", value: number) => {
  setLineItems(prev => prev.map((item, i) => {
    if (i !== index) return item;
    const updated = { ...item, [field]: value };
    updated.amount = Math.round(updated.quantity_kg * updated.unit_price * 100) / 100;
    return updated;
  }));
};
```

### Number input edge case:
`value={item.quantity_kg || ""}` - 필드 비우기 허용.

### shadcn Select in line items:
Controlled `value={item.product_id}` + `onValueChange` 사용 (state 기반이므로).

---

## Topic 5: Supabase RPC for Document Number Generation

`pg_advisory_xact_lock(hashtext(...))` 설계 확인 - 올바름.

- Transaction-level advisory lock → 트랜잭션 종료 시 자동 해제, 누수 위험 없음
- 48개 lock key (4 prefix x 12 months), 32-bit hash: 충돌 확률 ~0.00000027%
- 함수 **반드시 `SECURITY DEFINER`** → anon-role이 `document_sequences` 테이블에 쓰기 가능
- RPC 호출 시 `po_date`를 `ref_date`로 전달 (오늘 날짜 아님) → YYMM prefix가 문서 날짜와 일치

---

## Topic 6: Status Filter with URL Search Params

Phase 2 MVP에서는 **client-side useMemo filter** 적합. 페이지네이션 추가 시 서버사이드로 전환.

### Critical UX detail:
```tsx
// replace: true → 뒤로가기가 필터 상태 순회하지 않음
setSearchParams(newParams, { replace: true });
```

### 기존 params 보존:
```tsx
const newParams = new URLSearchParams(searchParams); // copy first
newParams.set("status", value);
setSearchParams(newParams, { replace: true });
```

---

## Topic 7: Redirect After Form Submission

### 핵심 결정사항:

1. 항상 `throw redirect(url, { headers: responseHeaders })` - responseHeaders 누락 시 세션 쿠키 손실
2. Phase 2 MVP에서 toast notification 불필요. Redirect가 충분한 확인.
3. Toast 필요 시: URL query param (`?created=1`)이 가장 간단. Cookie flash는 Phase 10에서.

### Tool 선택:

| Operation | Tool |
|-----------|------|
| PO Create/Edit (full form) | `fetcher.Form method="post"` |
| Status toggle | `useFetcher` + `fetcher.submit` |
| Delete | `useFetcher`, action redirects |
| Clone | `useFetcher.submit`, action redirects |

### Optimistic status toggle:
```tsx
const optimisticStatus = fetcher.formData?.get("_action") === "toggle_status"
  ? (po.status === "process" ? "complete" : "process")
  : po.status;
```

---

## Topic 8: PO Clone Feature

**Server-side action clone 확인 - 올바름.**

### 권장 변경: Clone 후 edit 페이지로 redirect

```typescript
// 기존: redirect(`/po/${newPO.id}`)
// 권장: redirect(`/po/${newPO.id}/edit`)
```

이유: Clone 직후 사용자는 `po_date`, `validity`, `ref_no`, 수량 등을 조정해야 함. Detail 페이지 거치면 불필요한 클릭 추가.

나머지 clone 결정사항 확인:
- 새 `po_no` (오늘 날짜 기준)
- `status` = "process"로 리셋
- `created_by` = 현재 사용자
- `details` JSONB 그대로 복사

---

## Critical Risks to Watch

1. **`value=` not `defaultValue=`** on the hidden details input
2. **`SECURITY DEFINER`** on `generate_doc_number` RPC function
3. **`{ headers: responseHeaders }`** on every `throw redirect()`
4. **Currency change** does not auto-convert amounts - UI에서 명확히 표시
5. **`{ replace: true }`** on filter `setSearchParams` - 뒤로가기 UX

---

## Sources

- React Router - Form vs Fetcher
- Jacob Paris - Dynamic form inputs with Remix
- Remix Discussion #3680 - Raw JSON best practices
- Supabase - Querying Joins and Nested tables
- Supabase - JSON and unstructured data
- Supabase - JavaScript RPC reference
- PostgREST v12 - Resource Embedding
- PostgreSQL - Advisory Locks
