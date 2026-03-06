# Phase 2 PO Module - Security Review

**Date:** 2026-03-06
**Role:** Security Reviewer
**Scope:** Phase 2 PO 모듈 보안 분석 (구현 전 사전 검토)

---

## 요약 (Executive Summary)

PO 모듈의 가장 큰 위험은 **가격 민감 데이터 유출**이다. `purchase_orders.details` JSONB에는
`unit_price`, `amount` 등 공급자 원가 정보가 포함된다. Saelim 사용자가 이 데이터를 보면
GV의 마진이 노출되어 사업적으로 심각한 피해가 발생한다.

현재 방어 아키텍처 (RLS + `requireGVUser` 이중 방어)는 건전하다. Phase 2 구현 시 이
계층을 일관되게 적용하는 것이 핵심이다.

---

## 1. Auth & Authorization

### 1.1 GV-only 접근 강제 - 이중 방어 레이어

**현재 구현 (양호):** `_layout.tsx`의 loader가 `requireGVUser`를 호출하여 레이아웃 레벨에서 가드.

**경고: 레이아웃 가드만으로 충분하지 않다.** PO 관련 모든 loader와 action에서 독립적으로 `requireGVUser`를 호출해야 한다.

```typescript
// 올바른 패턴 - 모든 PO loader/action에서 반드시
export async function loader({ request, context }: LoaderArgs) {
  const { supabase, responseHeaders } = await requireGVUser(request, context);
  // ...
}

export async function action({ request, context }: LoaderArgs) {
  const { supabase, user, responseHeaders } = await requireGVUser(request, context);
  // ...
}
```

### 1.2 RLS 이중 방어 - app_metadata 확인 필수

RLS 함수 `get_user_org_type()`이 `app_metadata`를 참조하는지 반드시 확인.
`user_metadata`는 사용자가 직접 수정 가능하므로 위험:
```javascript
// Saelim 사용자가 브라우저에서 실행 가능 (user_metadata인 경우)
supabase.auth.updateUser({ data: { org_type: 'gv' } })
```

실제 배포된 함수는 `app_metadata`를 사용 (올바름):
```sql
CREATE OR REPLACE FUNCTION get_user_org_type()
RETURNS TEXT AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'org_type')::TEXT,
    ''
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

### 1.3 PO CRUD 권한 모델

모든 GV 사용자가 모든 PO를 CRUD 가능 (5-10명 소규모 팀에 적합).
`created_by`는 감사 추적 목적으로만 사용.

### 1.4 `created_by` 필드 - 서버에서 설정 강제

```typescript
// 올바른 패턴 - requireGVUser에서 반환된 user.id 사용
const { supabase, user } = await requireGVUser(request, context);
await supabase.from("purchase_orders").insert({ ...fields, created_by: user.id });

// 잘못된 패턴 - 절대 금지
const created_by = formData.get("created_by"); // 위조 가능
```

---

## 2. Input Validation

### 2.1 Zod 스키마 완전성

```typescript
const poLineItemSchema = z.object({
  product_id: z.string().uuid(),
  product_name: z.string().min(1).max(200),
  gsm: z.coerce.number().int().positive().optional(),
  width_mm: z.coerce.number().int().positive().optional(),
  quantity_kg: z.coerce.number().positive(),
  unit_price: z.coerce.number().nonnegative(),
  amount: z.coerce.number().nonnegative(), // 서버에서 재계산으로 덮어씀
});

const poCreateSchema = z.object({
  _action: z.literal("create"),
  po_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validity: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  ref_no: z.string().max(100).optional(),
  supplier_id: z.string().uuid("공급업체를 선택하세요"),
  buyer_id: z.string().uuid("구매업체를 선택하세요"),
  currency: z.enum(["USD", "KRW"]),
  payment_term: z.enum(["T/T in advance", "T/T 30 days", "L/C at sight"]),
  delivery_term: z.enum(["CFR Busan", "CIF Busan", "FOB Keelung"]),
  loading_port: z.enum(["Keelung, Taiwan", "Kaohsiung, Taiwan"]),
  discharge_port: z.enum(["Busan, Korea", "Incheon, Korea"]),
  notes: z.string().max(2000).optional(),
  details: z.string(), // JSON string - 별도 파싱 후 검증
});
```

**중요:** `payment_term` 등은 `z.string()`이 아닌 `z.enum()`으로 검증. `constants.ts` 상수 활용.

### 2.2 JSONB details 검증 - 가장 중요한 항목

**위험 시나리오:**
1. 거대한 배열 (10,000개 line item) → 파싱/DB 과부하
2. 중첩 객체 → 예상치 못한 동작
3. 음수/0 가격 → amount 계산 왜곡
4. XSS 페이로드 → `product_name: "<script>alert(1)</script>"`

**올바른 검증 패턴:**
```typescript
let parsedDetails: unknown;
try {
  parsedDetails = JSON.parse(detailsRaw);
} catch {
  return data({ success: false, error: "품목 데이터 형식이 올바르지 않습니다." }, { status: 400 });
}

const detailsResult = z.array(poLineItemSchema).min(1).max(20).safeParse(parsedDetails);
if (!detailsResult.success) {
  return data({ success: false, error: "품목 정보를 확인하세요." }, { status: 400 });
}
```

### 2.3 UUID 파라미터 검증

```typescript
// URL params.id 검증
const idResult = z.string().uuid().safeParse(params.id);
if (!idResult.success) {
  throw new Response("Not Found", { status: 404 });
}
```

### 2.4 Amount 재계산 - 서버사이드 강제

```typescript
const recalculatedDetails = details.map(item => ({
  ...item,
  amount: Math.round(item.quantity_kg * item.unit_price * 100) / 100,
}));
const totalAmount = Math.round(
  recalculatedDetails.reduce((sum, item) => sum + item.amount, 0) * 100
) / 100;
```

### 2.5 날짜 검증 - 논리적 일관성

```typescript
if (parsed.data.validity) {
  const validityParsed = new Date(parsed.data.validity);
  const poDateParsed = new Date(parsed.data.po_date);
  if (validityParsed < poDateParsed) {
    return data({ success: false, error: "유효기간은 PO 날짜 이후여야 합니다." }, { status: 400 });
  }
}
```

---

## 3. Data Integrity

### 3.1 소프트 삭제된 PO - 편집/복제 방지

Phase 1의 update action은 `deleted_at`을 체크하지 않는 문제가 있다.
**PO 모듈에서는 반드시 수정:**

```typescript
// update, delete, clone, toggle_status 모든 mutation에서
const { data: po } = await supabase
  .from("purchase_orders")
  .select("id, deleted_at, status")
  .eq("id", id)
  .is("deleted_at", null)
  .single();

if (!po) {
  return data({ success: false, error: "존재하지 않는 PO입니다." }, { status: 404 });
}
```

### 3.2 PO 번호 유일성

`po_no TEXT UNIQUE NOT NULL` + `generate_doc_number` RPC의 `pg_advisory_xact_lock`.
UNIQUE 제약이 최후 방어선. RPC 실패 시 오류 처리 필수:

```typescript
const { data: poNo, error: seqError } = await supabase
  .rpc("generate_doc_number", { doc_type: "PO" });

if (seqError || !poNo) {
  return data({ success: false, error: "PO 번호 생성 중 오류가 발생했습니다." }, { status: 500 });
}
```

### 3.3 참조 무결성 - supplier_id, buyer_id

삭제된 organization 참조 방지:
```typescript
const { data: orgs } = await supabase
  .from("organizations")
  .select("id")
  .in("id", [parsed.data.supplier_id, parsed.data.buyer_id])
  .is("deleted_at", null);

if (!orgs || orgs.length !== 2) {
  return data({ success: false, error: "유효하지 않은 거래처입니다." }, { status: 400 });
}
```

---

## 4. Information Leakage

### 4.1 PO 금액/가격 - Saelim에게 절대 노출 금지

RLS + `requireGVUser` 이중 방어로 차단됨.
Phase 3에서 `create_pi_from_po` RPC가 `unit_price`를 제거하는지 확인 필요.

### 4.2 오류 메시지 - 내부 정보 노출 방지

Supabase 오류 메시지를 사용자 친화적으로 래핑:
```typescript
if (error) {
  if (error.code === '23505') return data({ success: false, error: "이미 존재하는 PO 번호입니다." }, { status: 409 });
  if (error.code === '23503') return data({ success: false, error: "유효하지 않은 거래처 또는 제품입니다." }, { status: 400 });
  return data({ success: false, error: "저장 중 오류가 발생했습니다." }, { status: 500 });
}
```

---

## 5. CSRF/XSS

### 5.1 CSRF
`SameSite=Lax` 쿠키 + POST-only mutations으로 방어됨.

### 5.2 XSS - JSONB details 렌더링
React JSX의 자동 escape로 안전. `dangerouslySetInnerHTML` 절대 사용 금지.
`notes` 필드도 plain text로 처리.

### 5.3 `_action` 필드 위조
Zod enum으로 검증: `z.enum(["create", "update", "delete", "clone", "toggle_status"])`.
알 수 없는 `_action`은 400 오류 반환.

---

## 6. 특정 공격 벡터

### 6.1 Complete 상태 PO 재편집

```typescript
if (intent === "update") {
  if (po?.status === "complete") {
    return data({ success: false, error: "완료된 PO는 수정할 수 없습니다." }, { status: 400 });
  }
}
```

### 6.2 Clone 공격 - 시퀀스 번호 고갈
소규모 운영에서 위험도 낮음. 필요시 Cloudflare Workers rate limiting 적용.

---

## 7. Phase 2 구현 보안 체크리스트

### Critical (반드시 지킬 것)

- [ ] 모든 PO loader에서 `requireGVUser` 호출
- [ ] 모든 PO action에서 `requireGVUser` 호출
- [ ] `get_user_org_type()` RLS 함수가 `app_metadata` 참조 확인
- [ ] `created_by`는 `user.id`로 서버에서 설정
- [ ] `details` JSONB를 Zod로 파싱 + 검증 (최대 20개 line item)
- [ ] `amount`를 서버에서 재계산 (클라이언트 값 무시)
- [ ] `supplier_id`, `buyer_id`를 `z.string().uuid()`로 검증
- [ ] URL params `id`를 UUID로 검증
- [ ] 소프트 삭제된 PO에 `.is("deleted_at", null)` 조건 적용
- [ ] Supabase 오류 메시지를 사용자 친화적 메시지로 래핑

### Warning (강력 권장)

- [ ] `payment_term` 등 열거형 필드를 `z.enum()`으로 검증
- [ ] `complete` 상태 PO의 update 차단
- [ ] 알 수 없는 `_action`에 400 반환
- [ ] `notes` 필드 최대 길이 제한 (2000자)
- [ ] `po_date`와 `validity` 논리적 일관성 검증
- [ ] 활성 organization만 supplier_id/buyer_id로 허용
- [ ] `dangerouslySetInnerHTML` 미사용 확인

### Info (고려 사항)

- [ ] Cloudflare Workers rate limiting (clone 공격 완화)
- [ ] PostgreSQL 오류 코드별 사용자 메시지 분기
- [ ] `updated_by` 필드 추가 고려
- [ ] Phase 3 PI 생성 시 `unit_price` 제거 확인

---

## 8. 통과 확인 항목 (Passed Checks)

- app_metadata 사용: 사용자 초대 플로우에서 올바르게 `app_metadata`로 `org_type` 설정
- 서비스 롤 키 격리: `*.server.ts` 파일에만 존재, 클라이언트 노출 없음
- 환경 변수 런타임 주입: `context.cloudflare.env`는 빌드 시 인라인 안됨
- GV 레이아웃 가드: `_layout.tsx`에서 `requireGVUser` 호출
- Supabase `getUser()` 사용: 서버 검증 (클라이언트 JWT decode 아님)
- Invite-only 패턴: admin API를 통한 사용자 초대만 허용
- UUID primary key: 순차 ID 대신 UUID (열거 공격 방지)
- SQL injection 방어: Supabase client의 parameterized query 자동 적용
- XSS 방어: React JSX 기본 escape
