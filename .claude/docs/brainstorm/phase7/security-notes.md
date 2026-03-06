# Phase 7: Customs Management - Security Audit Notes

**Date:** 2026-03-06
**Role:** Security Reviewer

---

## 1. Database Layer (Supabase MCP 확인 완료)

### RLS Status
- `customs` 테이블: `relrowsecurity = true` (활성화 확인)
- `gv_all` 정책 (ALL commands): `get_user_org_type() = 'gv'` - GV 사용자만 CRUD 가능
- Saelim 정책 없음 - 통관 비용 데이터 접근 차단 (정상)

### `get_user_org_type()` 함수
```sql
SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'org_type')::TEXT, '');
```
- `app_metadata` 사용 (server-controlled, tamper-proof) - 올바름

### 기존 인덱스
- `customs_pkey` - PK on `id`
- `idx_customs_shipping_doc_id` - btree on `shipping_doc_id`

---

## 2. Critical (Must Fix)

### [CRIT-1] orders.customs_id 인덱스 누락

`syncCustomsFeeToOrder`, `linkCustomsToOrder`가 `.eq("customs_id", customsId)`로 조회하지만 인덱스 없음.

```sql
CREATE INDEX idx_orders_customs_id ON public.orders USING btree (customs_id)
WHERE deleted_at IS NULL;
```

---

## 3. Warning (Should Fix)

### [WARN-1] requireGVUser 필수
현재 `_layout.customs.tsx`는 stub(loader 없음). Phase 7 구현 시 모든 loader/action에 `requireGVUser()` 호출 필수. Layout loader에만 의존 금지.

### [WARN-2] fee_received 토글: DB 현재값 기반
```typescript
// CORRECT
const { data: current } = await supabase
  .from("customs").select("fee_received").eq("id", id).is("deleted_at", null).single();
const newValue = !current.fee_received;

// WRONG - 클라이언트 값 신뢰 금지
const newValue = !formData.get("current_value");
```

### [WARN-3] JSONB fee 검증 - 숫자 범위 + strict
```typescript
const feeSchema = z.object({
  supply: z.coerce.number().nonnegative().max(999_999_999_999).optional(),
  vat: z.coerce.number().nonnegative().max(999_999_999_999).optional(),
  total: z.coerce.number().nonnegative().max(999_999_999_999).optional(),
}).strict(); // reject unknown keys
```

### [WARN-4] customs_no, etc_desc Formula Injection
`sanitizeFormulaInjection` 적용 필수 (CSV/Excel export 시 `=`, `+`, `-`, `@` 시작 방지).

### [WARN-5] shipping_doc_id 존재 확인
```typescript
if (shipping_doc_id) {
  const { count } = await supabase
    .from("shipping_documents")
    .select("id", { count: "exact", head: true })
    .eq("id", shipping_doc_id).is("deleted_at", null);
  if (!count) return data({ success: false, error: "..." }, { status: 400 });
}
```

---

## 4. Info (Consider)

### [INFO-1] Content 시스템 호환
- `content.schema.ts` documentType enum에 `"customs"` 이미 포함
- `content.server.ts` PARENT_TABLE_MAP에 `customs: "customs"` 이미 등록
- 추가 작업 없이 바로 사용 가능

### [INFO-2] orders.customs_id unique 미설정
두 오더가 같은 customs에 연결될 수 있음. `linkCustomsToOrder`의 `is("customs_id", null)` 가드가 방어하지만 edge case 존재. 현재 규모에서 허용 가능.

### [INFO-3] customs 테이블 partial index 권장
```sql
CREATE INDEX idx_customs_deleted_at ON public.customs (created_at DESC)
WHERE deleted_at IS NULL;
```

### [INFO-4] dual-write: orders.customs_fee_received + customs.fee_received
Application-level sync 패턴. `toggle_fee_received` action에서 `syncCustomsFeeToOrder` 호출 필수.

---

## 5. DB Migration (Phase 7 구현 전 실행)

```sql
-- CRIT-1: orders.customs_id 인덱스
CREATE INDEX idx_orders_customs_id ON public.orders USING btree (customs_id)
WHERE deleted_at IS NULL;

-- INFO-3: customs 목록 쿼리용 부분 인덱스
CREATE INDEX idx_customs_deleted_at ON public.customs (created_at DESC)
WHERE deleted_at IS NULL;
```

---

## 6. Security Checklist

### DB 사전 작업
- [x] customs RLS 활성화 확인
- [x] gv_all 정책 확인 (app_metadata 기반)
- [x] Saelim 정책 없음 확인
- [ ] idx_orders_customs_id 인덱스 추가
- [ ] idx_customs_deleted_at 부분 인덱스 추가

### Application 보안
- [ ] 모든 loader/action에 `requireGVUser()` 사용
- [ ] URL param `$id` UUID 검증 (z.string().uuid())
- [ ] `responseHeaders` 모든 data()/redirect()에 전달
- [ ] JSONB fee 서버사이드 검증 (feeSchema.strict())
- [ ] `customs_no`, `etc_desc`에 sanitizeFormulaInjection 적용
- [ ] `shipping_doc_id` 존재 + 미삭제 확인
- [ ] `fee_received` 토글: DB 현재값 읽기 후 반전
- [ ] `toggle_fee_received` 시 syncCustomsFeeToOrder 호출
- [ ] Customs 삭제 시 Order.customs_id = null 정리

### Passed Checks
- RLS 활성화 + gv_all 정책 (app_metadata 기반)
- Saelim 사용자 DB 접근 차단 완료
- GV Layout requireGVUser 1차 방어
- linkCustomsToOrder is("customs_id", null) 가드
- cascadeLink 함수들 deleted_at 필터링
- Upload endpoint requireGVUser 적용
- content attachment file_url regex 검증
- Supabase Service Role Key secrets 관리
