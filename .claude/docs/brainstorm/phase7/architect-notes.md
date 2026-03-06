# Phase 7: Customs Management - Architecture Design

## 1. Implementation Sub-phases

### Phase 7-A: Types, Schema, List + Create
- TypeScript 타입 정의 (`app/types/customs.ts`)
- Zod 검증 스키마 (`app/loaders/customs.schema.ts`)
- List 라우트 + Loader (`_layout.customs.tsx`, `customs.server.ts`)
- Create 라우트 + Action (`_layout.customs.new.tsx`, `customs.server.ts`)
- Shipping 참조 생성 (`?from_shipping=uuid`)
- Order 자동 연결 (`linkCustomsToOrder`)
- `routes.ts` 업데이트

### Phase 7-B: Detail + Edit + Delete
- Detail 라우트 (`_layout.customs.$id.tsx`, `customs.$id.server.ts`)
- Edit 라우트 (`_layout.customs.$id.edit.tsx`, `customs.$id.server.ts`)
- Delete (soft delete)
- fee_received 토글 + Order sync (`syncCustomsFeeToOrder`)
- Content 시스템 통합 (notes/attachments)
- Shipping 상세 페이지에 "통관 생성" 버튼 추가

### Phase 7-C: UI Components + Polish
- 컴포넌트 분리 (`app/components/customs/`)
- 비용 요약 카드 (4개 fee 합계)
- 모바일 대응
- 기존 모듈 링크 (Order 상세에서 Customs 카드 클릭 → 이동)
- 네비게이션 아이콘 활성화 (이미 사이드바에 있다면)

---

## 2. Route Structure

```
routes.ts 변경:
  route("customs", "routes/_layout.customs.tsx"),          // 이미 존재 (placeholder 교체)
+ route("customs/new", "routes/_layout.customs.new.tsx"),
+ route("customs/:id", "routes/_layout.customs.$id.tsx"),
+ route("customs/:id/edit", "routes/_layout.customs.$id.edit.tsx"),
```

PO/PI/Shipping과 동일한 표준 CRUD 4-라우트 패턴.

### 결정 근거: 별도 페이지 vs Inline

Customs는 **별도 페이지 CRUD** 방식이 적합하다.

- 4개 비용 필드 각각 `{supply, vat, total}` 3 sub-fields = 12개 숫자 입력
- `customs_no`, `customs_date`, `etc_desc` 추가
- Inline 수정(Order 패턴)으로 처리하기엔 필드가 너무 많음
- Shipping Document처럼 폼 기반 생성/수정이 자연스러움

---

## 3. TypeScript Types

### `app/types/customs.ts`

```typescript
import type { DocStatus } from "~/types/common";

// ── Fee Breakdown (JSONB 구조) ──────────────────────────
export interface FeeBreakdown {
  supply: number;   // 공급가
  vat: number;      // 부가세
  total: number;    // 합계 (supply + vat)
}

// ── List Item (compact) ─────────────────────────────────
export interface CustomsListItem {
  id: string;
  customs_no: string | null;
  customs_date: string | null;
  transport_fee: FeeBreakdown | null;
  customs_fee: FeeBreakdown | null;
  vat_fee: FeeBreakdown | null;
  etc_fee: FeeBreakdown | null;
  etc_desc: string | null;
  fee_received: boolean | null;
  created_at: string;
  // FK join
  shipping: {
    id: string;
    ci_no: string;
    vessel: string | null;
    eta: string | null;
  } | null;
}

// ── Detail (full) ───────────────────────────────────────
export interface CustomsDetail extends CustomsListItem {
  shipping_doc_id: string | null;
  created_by: string | null;
  updated_at: string | null;
  // 확장 join
  shipping: {
    id: string;
    ci_no: string;
    pl_no: string;
    vessel: string | null;
    voyage: string | null;
    eta: string | null;
    etd: string | null;
    status: DocStatus;
    pi: { pi_no: string } | null;
  } | null;
}

// ── Shipping 참조 생성 시 프리필 데이터 ──────────────────
export interface SourceShipping {
  id: string;
  ci_no: string;
  vessel: string | null;
  eta: string | null;
}
```

### 비용 합계 헬퍼 (서버/클라이언트 공용)

```typescript
// app/lib/customs-utils.ts (공용 유틸, .server 아님)
export function calcTotalFees(customs: {
  transport_fee: FeeBreakdown | null;
  customs_fee: FeeBreakdown | null;
  vat_fee: FeeBreakdown | null;
  etc_fee: FeeBreakdown | null;
}): { totalSupply: number; totalVat: number; grandTotal: number } {
  const fees = [customs.transport_fee, customs.customs_fee, customs.vat_fee, customs.etc_fee];
  const totalSupply = fees.reduce((s, f) => s + (f?.supply ?? 0), 0);
  const totalVat = fees.reduce((s, f) => s + (f?.vat ?? 0), 0);
  const grandTotal = fees.reduce((s, f) => s + (f?.total ?? 0), 0);
  return { totalSupply, totalVat, grandTotal };
}
```

---

## 4. Data Flow Diagram

```
Shipping Document
       |
       | "통관 생성" 버튼 (?from_shipping=uuid)
       v
Customs /new (Create)
       |
       | insert → customs record
       | linkCustomsToOrder(shipping_doc_id, customs_id)
       v
  Order (customs_id 자동 연결)

Customs /$id (Detail)
       |
       | fee_received 토글 → update customs
       | syncCustomsFeeToOrder(customs_id, value)
       v
  Order (customs_fee_received 동기화)

Customs /$id/edit (Edit)
       |
       | update customs fields
       | (fee_received 변경 시 sync)
       v
  Order (필요 시 동기화)

Customs delete (soft)
       |
       | deleted_at 설정
       | Order.customs_id → null 정리
       v
  Order (customs_id 해제)
```

### 참조 생성 체인

```
PI → Shipping Doc → Customs
     (pi_id FK)    (shipping_doc_id FK)

Shipping 상세 페이지: [통관 생성] 버튼 → /customs/new?from_shipping={id}
Customs /new loader: from_shipping 파라미터로 Shipping 데이터 프리필
```

---

## 5. Key Architectural Decisions

### D1: 비용(Fee) JSONB 구조 - `{supply, vat, total}`

**결정**: total은 서버사이드 재계산 (supply + vat). 클라이언트에서 입력받지 않음.

**근거**:
- 클라이언트-서버 불일치 방지
- 소수점 오차 서버에서 통일 처리
- Shipping의 amount 재계산 패턴과 일관

**구현**:
```typescript
// Zod schema에서 supply, vat만 입력 → action에서 total 계산
const computeTotal = (supply: number, vat: number) =>
  Math.round((supply + vat) * 100) / 100;
```

### D2: Shipping → Customs 관계 = 1:N (but 실무상 1:1)

**결정**: DB FK는 1:N이지만, UI에서는 1개 Shipping당 1개 Customs만 생성 가능하도록 안내.

**근거**:
- `customs.shipping_doc_id` FK에 UNIQUE 제약이 없으므로 1:N 가능
- 실무상 1:1이 일반적이므로 UI에서 이미 Customs가 있으면 경고
- Order cascade link도 Exactly-1 Rule 적용 중

**구현**:
- 생성 시 동일 shipping_doc_id로 기존 customs 존재 여부 체크
- 존재하면 경고 표시 (생성 자체는 차단하지 않음 - 예외 케이스 허용)

### D3: 문서번호 자동 생성 없음

**결정**: Customs는 `generate_doc_number` RPC를 사용하지 않음.

**근거**:
- PO/PI/Shipping은 시스템이 번호를 생성 (GVPO, GVPI, GVCI 접두어)
- 통관번호(`customs_no`)는 **관세사/세관에서 부여**하는 외부 번호
- 사용자가 직접 입력하며, nullable (아직 번호를 받지 못한 상태 가능)

### D4: Delete 시 Order customs_id 해제

**결정**: Customs soft delete 시 연결된 Order의 `customs_id`를 null로 정리.

**근거**:
- Order 상세에서 deleted customs를 참조하면 깨진 링크 발생
- Shipping delete 시 동일 패턴 적용 (있다면) → 일관성

### D5: RLS 정책 - GV 전용

**결정**: Customs는 GV 사용자만 접근 (Saelim은 delivery만).

**근거**:
- 비용 정보(supply, vat, total)가 포함 → Saelim 노출 불가
- 기존 PO/PI/Shipping과 동일한 GV-only 패턴
- `requireGVUser(request, context)` 사용

---

## 6. File Ownership

### 신규 파일

| 파일 | 설명 |
|------|------|
| `app/types/customs.ts` | TypeScript 타입 정의 |
| `app/lib/customs-utils.ts` | 비용 합계 헬퍼 (공용) |
| `app/loaders/customs.schema.ts` | Zod 검증 스키마 |
| `app/loaders/customs.server.ts` | List loader + Create action + Form loader |
| `app/loaders/customs.$id.server.ts` | Detail loader + Edit loader + Detail action |
| `app/routes/_layout.customs.new.tsx` | 생성 페이지 |
| `app/routes/_layout.customs.$id.tsx` | 상세 페이지 |
| `app/routes/_layout.customs.$id.edit.tsx` | 수정 페이지 |
| `app/components/customs/customs-form.tsx` | 생성/수정 공용 폼 |
| `app/components/customs/customs-detail-info.tsx` | 상세 정보 표시 |
| `app/components/customs/customs-fee-card.tsx` | 비용 카드 (4개 fee 표시) |
| `app/components/customs/customs-fee-summary.tsx` | 비용 합계 요약 |

### 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `app/routes.ts` | customs 하위 라우트 3개 추가 |
| `app/routes/_layout.customs.tsx` | placeholder → 실제 목록 페이지 |
| `app/routes/_layout.shipping.$id.tsx` | "통관 생성" 버튼 추가 |
| `app/components/ui/icons.tsx` | 필요 시 아이콘 추가 (Landmark, Receipt 등) |

### 기존 재사용

| 파일 | 용도 |
|------|------|
| `app/lib/order-sync.server.ts` | `linkCustomsToOrder`, `syncCustomsFeeToOrder` |
| `app/lib/content.server.ts` | `loadContent`, `handleContentAction` |
| `app/components/content/content-section.tsx` | notes/attachments |
| `app/components/shared/doc-status-badge.tsx` | 상태 뱃지 |

---

## 7. Order Integration Points

### 7-A: Customs 생성 시 (customs.server.ts → createCustomsAction)

```typescript
// insert 성공 후:
await linkCustomsToOrder(supabase, shippingDocId, createdCustoms.id);
```

- `linkCustomsToOrder`는 `shipping_doc_id`가 같은 Order를 찾아 `customs_id` 연결
- Exactly-1 Rule: `customs_id IS NULL`인 Order만 대상

### 7-B: fee_received 토글 시 (customs.$id.server.ts → action)

```typescript
// intent === "toggle_fee_received"
const newValue = !currentCustoms.fee_received;
await supabase.from("customs").update({ fee_received: newValue, ... }).eq("id", id);
await syncCustomsFeeToOrder(supabase, id, newValue);
```

- 양방향 sync: Customs.fee_received ↔ Order.customs_fee_received
- Order에서 toggle_customs_fee 할 때도 Customs 쪽을 업데이트해야 하는지?
  - **결정**: 현재 Order의 toggle_customs_fee는 Order 자체만 변경. Customs 모듈 구현 후에도 동일 유지.
  - **이유**: Order는 집계 뷰이므로 독립적 상태 가능. Customs가 연결되면 Customs에서 관리하는 것이 정석.
  - **향후**: Order 상세에서 customs가 연결되어 있을 때 toggle_customs_fee를 Customs쪽으로 위임하는 것도 고려 (Phase 7-C에서 판단).

### 7-C: Customs 삭제 시 (customs.$id.server.ts → action)

```typescript
// intent === "delete"
await supabase.from("customs").update({ deleted_at: ... }).eq("id", id);
// Order 정리
await supabase.from("orders")
  .update({ customs_id: null, customs_fee_received: null, updated_at: ... })
  .eq("customs_id", id)
  .is("deleted_at", null);
```

### 7-D: Order → Customs 네비게이션

- Order 상세 페이지의 Customs 카드에 이미 `customs_no`, `customs_date`, `fee_received` 표시 중
- 클릭 시 `/customs/{id}` 이동 링크 추가 (Phase 7-C)

---

## 8. Zod Schema Design

### `app/loaders/customs.schema.ts`

```typescript
import { z } from "zod";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const feeBreakdownSchema = z.object({
  supply: z.coerce.number().nonnegative("공급가는 0 이상이어야 합니다").max(9_999_999_999),
  vat: z.coerce.number().nonnegative("부가세는 0 이상이어야 합니다").max(9_999_999_999),
  // total은 서버에서 계산 → 스키마에 포함하지 않음
});

export const customsSchema = z.object({
  shipping_doc_id: z.string().uuid("선적서류를 선택하세요"),
  customs_no: z.string().max(100, "통관번호는 100자 이내").optional().default(""),
  customs_date: z.string()
    .optional()
    .default("")
    .refine((v) => !v || ISO_DATE.test(v), "올바른 날짜 형식이 아닙니다 (YYYY-MM-DD)"),
  transport_fee: feeBreakdownSchema.optional(),
  customs_fee: feeBreakdownSchema.optional(),
  vat_fee: feeBreakdownSchema.optional(),
  etc_fee: feeBreakdownSchema.optional(),
  etc_desc: z.string().max(500, "기타비용 설명은 500자 이내").optional().default(""),
});
```

### Fee FormData 파싱 전략

비용 필드는 4개 x 2 sub-fields = 8개 숫자 입력. FormData에서 flat key로 전달:

```
transport_fee_supply=100000
transport_fee_vat=10000
customs_fee_supply=50000
customs_fee_vat=5000
...
```

Action에서 그룹핑 후 Zod 검증:

```typescript
function parseFeeFromFormData(formData: FormData, prefix: string): FeeBreakdown | null {
  const supply = Number(formData.get(`${prefix}_supply`) || 0);
  const vat = Number(formData.get(`${prefix}_vat`) || 0);
  if (supply === 0 && vat === 0) return null;
  return { supply, vat, total: Math.round((supply + vat) * 100) / 100 };
}
```

---

## 9. Edge Cases

### E1: Shipping 없이 Customs 생성

- **상황**: shipping_doc_id가 필수이므로 반드시 Shipping 연결 필요
- **처리**: `from_shipping` 없이 `/customs/new` 접근 시 Shipping 선택 드롭다운 제공
- shipping_doc_id는 Zod 필수 필드

### E2: 동일 Shipping에 Customs 중복 생성

- **상황**: 1개 Shipping에 이미 Customs가 존재하는데 또 생성 시도
- **처리**: DB 제약 없으므로 생성은 허용하되, 경고 메시지 표시
- Order cascade link는 Exactly-1 Rule이므로 2개째부터는 자동 연결 안 됨
- 실무상 수동 Order 연결 필요

### E3: 비용 전체 0원

- **상황**: 모든 fee가 0 또는 미입력
- **처리**: 허용 (통관 초기 단계에서 비용 미확정 상태)
- fee가 null이면 JSONB 저장 안 함 (null 유지)

### E4: Customs 삭제 후 Order 정합성

- **상황**: Order에 customs_id 연결 상태에서 Customs 삭제
- **처리**: Order의 customs_id = null, customs_fee_received = null 로 정리
- Order 상세에서 Customs 카드가 빈 상태로 표시됨

### E5: Shipping이 삭제된 Customs

- **상황**: Customs가 참조하는 Shipping이 soft delete됨
- **처리**: Customs 목록/상세에서 shipping join 시 deleted_at 체크하지 않음 (FK 존재하므로)
- 실무상 Shipping 삭제 시 연결된 Customs도 함께 삭제하는 것이 이상적 → Phase 7-C에서 cascade soft delete 고려

### E6: KRW 금액 소수점

- **상황**: 통관비는 KRW(원화)이므로 소수점 불필요
- **처리**: Zod에서 `z.coerce.number()` 사용 (정수 제한하지 않음, 실무에서 원 단위 절사는 UI 표시에서 처리)
- FeeBreakdown.total 계산 시 `Math.round` 적용

---

## 10. UI Component Structure

### 목록 페이지 (_layout.customs.tsx)

```
+---------------------------------------------------------------+
| Header: 통관관리                           [새 통관 등록]       |
+---------------------------------------------------------------+
| 테이블 (모바일: 카드)                                          |
| | CI 번호 | 통관번호 | 통관일 | 운송비 | 통관비 | 수령 | ... | |
+---------------------------------------------------------------+
```

### 생성/수정 폼 (customs-form.tsx)

```
+---------------------------------------------------------------+
| 선적서류 선택 (드롭다운 또는 from_shipping 프리필)               |
+---------------------------------------------------------------+
| 통관번호        | 통관일                                       |
+---------------------------------------------------------------+
| 운송비    공급가 [______]  부가세 [______]  합계 XXX           |
| 통관비    공급가 [______]  부가세 [______]  합계 XXX           |
| 부가세    공급가 [______]  부가세 [______]  합계 XXX           |
| 기타비용  공급가 [______]  부가세 [______]  합계 XXX           |
|           설명   [______________________________]              |
+---------------------------------------------------------------+
| 총합계                                    XXXXXXXXX 원         |
+---------------------------------------------------------------+
```

### 상세 페이지 (_layout.customs.$id.tsx)

```
+---------------------------------------------------------------+
| Header: 통관 상세 (CUST-XXX)      [수정] [더보기 ▼]           |
+---------------------------------------------------------------+
| 기본 정보 카드                                                 |
|   통관번호 | 통관일 | 참조 선적서류 (링크)                      |
|   수령 여부 토글                                               |
+---------------------------------------------------------------+
| 비용 요약 카드                                                 |
|   4개 fee 행 + 합계                                            |
+---------------------------------------------------------------+
| Content (메모/첨부파일)                                        |
+---------------------------------------------------------------+
```

---

## 11. SELECT Queries

### List SELECT

```sql
id, customs_no, customs_date, transport_fee, customs_fee, vat_fee, etc_fee,
etc_desc, fee_received, created_at,
shipping:shipping_documents!shipping_doc_id(id, ci_no, vessel, eta)
```

### Detail SELECT

```sql
id, customs_no, customs_date, shipping_doc_id, transport_fee, customs_fee,
vat_fee, etc_fee, etc_desc, fee_received, created_by, created_at, updated_at,
shipping:shipping_documents!shipping_doc_id(
  id, ci_no, pl_no, vessel, voyage, eta, etd, status,
  pi:proforma_invoices!pi_id(pi_no)
)
```

---

## 12. Implementation Priority Summary

| Phase | 범위 | 의존성 | 예상 파일 수 |
|-------|------|--------|-------------|
| 7-A | Types + Schema + List + Create | DB 스키마 (이미 존재) | ~6 신규, ~2 수정 |
| 7-B | Detail + Edit + Delete + Sync | 7-A | ~4 신규, ~1 수정 |
| 7-C | Components 분리 + Polish + Cross-links | 7-B | ~3 신규, ~3 수정 |

총 예상: 신규 ~13개, 수정 ~6개 파일.
