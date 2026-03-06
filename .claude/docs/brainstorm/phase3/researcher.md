# Phase 3: PI Module - Researcher Notes

**Date:** 2026-03-06
**Role:** Researcher

---

## 1. Supabase 트랜잭션 처리

### 조사 결과

**supabase-js 클라이언트는 클라이언트 수준 트랜잭션을 지원하지 않는다.**

PostgREST는 stateless이므로 여러 API 호출에 걸친 트랜잭션 불가. 트랜잭션이 필요하면 PostgreSQL 함수(RPC)를 통한 DB 레벨 트랜잭션만 가능.

### Phase 3 결론: 트랜잭션 불필요

`deliveries.pi_id`는 nullable이고 Delivery는 단일 필드 INSERT. PI 생성과 순차 처리로 충분.

### 향후 RPC 트랜잭션 패턴 (Phase 6+ 참고)

```sql
CREATE OR REPLACE FUNCTION create_pi_with_order(
  p_pi_data JSONB, p_created_by UUID
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_pi_id UUID;
BEGIN
  INSERT INTO proforma_invoices (...) VALUES (...) RETURNING id INTO v_pi_id;
  INSERT INTO orders (pi_id, created_by) VALUES (v_pi_id, p_created_by);
  RETURN v_pi_id;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'PI 생성 실패: %', SQLERRM;
  -- PL/pgSQL RAISE EXCEPTION -> 전체 트랜잭션 자동 롤백
END;
$$;
```

---

## 2. React Router 7 참조 생성 패턴

### URL searchParams 패턴 (권장)

```typescript
// loader에서 URL params 파싱
export async function piFormLoader({ request, context }: LoaderArgs) {
  const url = new URL(request.url);
  const fromPoId = url.searchParams.get("from_po");

  const [{ data: suppliers }, { data: buyers }, { data: products }, poResult] =
    await Promise.all([
      // ... org/product 쿼리
      fromPoId
        ? supabase.from("purchase_orders")
            .select("id, po_no, currency, payment_term, ...")
            .eq("id", fromPoId)
            .is("deleted_at", null)
            .single()
        : Promise.resolve({ data: null }),
    ]);

  return data({
    suppliers, buyers, products,
    sourcePO: poResult.data ?? null,
  }, { headers: responseHeaders });
}
```

### PO 상세에서 진입점

```tsx
<Link to={`/pi/new?from_po=${po.id}`}>PI 작성</Link>
```

---

## 3. 문서 참조 생성 UI/UX 패턴

### ERP 표준 분석

| 패턴 | 설명 | Saelim 적합성 |
|------|------|--------------|
| A. 소스 문서 컨텍스트 버튼 | PO 상세에서 "PI 작성" 버튼 | **최우선 권장** |
| B. 독립 폼 + Combobox | PI 목록에서 "작성" -> 폼 내 PO 선택 | 보조 수단 |
| C. Single-click 전체 복제 | 즉시 복제 | 비권장 (단가 조정 필요) |

### 프리필 시 사용자 안내

```tsx
{sourcePO && (
  <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
    PO {sourcePO.po_no}에서 정보를 가져왔습니다. 판매단가를 확인하세요.
  </div>
)}
```

---

## 4. Supabase FK Join 타입 문제

### 문제 원인

같은 테이블(`organizations`)을 여러 FK로 참조할 때 supabase-js 타입이 `GenericStringError` 반환. postgrest-js 알려진 이슈 (#327, #449, #536).

### 해결책 비교

| 방법 | 타입 안전성 | 코드량 | 권장 시점 |
|------|-------------|--------|----------|
| `as unknown as PIWithOrgs` | 낮음 (수동) | 낮음 | **Phase 3 (현재)** |
| `QueryData<typeof query>` | 높음 (자동) | 중간 | Phase 10 (Polish) |

### Phase 3 구현: 명시적 타입 + 캐스팅

```typescript
// app/types/pi.ts
export interface PIWithOrgs {
  id: string;
  pi_no: string;
  pi_date: string;
  po_id: string | null;
  // ... 기타 필드
  supplier: { id: string; name_en: string; name_ko: string | null; address_en: string | null } | null;
  buyer: { id: string; name_en: string; name_ko: string | null; address_en: string | null } | null;
  po: { id: string; po_no: string; po_date: string } | null;
}

// loader에서
const typedPi = pi as unknown as PIWithOrgs;
```

---

## 5. 마크업/판매단가 관리

### Phase 3 전략: 수동 입력 + PO 단가 참고

| 전략 | 복잡도 | Phase 3 필요 |
|------|--------|-------------|
| 수동 입력 (PO 단가 참고) | 낮음 | **권장** |
| 고정 마크업 % | 중간 | Phase 10 이후 |
| 품목별 마크업 | 높음 | 불필요 |

### 구현 방식

- PO 참조 생성 시 PO 단가를 PI 단가 기본값으로 제공 (사용자 수정 가능)
- PO 참고단가는 UI state에만 보관, DB 저장하지 않음
- 라인아이템 편집기에서 "PO 단가 (참고)" 컬럼 옵션 표시

```tsx
// PI 라인아이템에서 PO 참고단가 표시 (선택적)
{item._po_unit_price != null && (
  <span className="text-xs text-zinc-400 tabular-nums">
    PO: {item._po_unit_price.toFixed(4)}
  </span>
)}
```

---

## Sources

- Supabase Discussion #526, #4562 - Client-side transactions
- Supabase RPC Documentation
- Supabase TypeScript Support - QueryData
- postgrest-js Issues #327, #449, #536 - GenericStringError
- React Router - useSearchParams, Data Loading
- ERP.net - Invoice Orders unit price determination
