# Phase 7: Customs Management - Backend Design Notes

## 1. Zod Schemas (`app/loaders/customs.schema.ts`)

### feeBreakdownSchema (재사용 가능한 비용 구조)

```typescript
import { z } from "zod";

// 비용 항목 공통 구조: { supply, vat, total }
export const feeBreakdownSchema = z.object({
  supply: z.coerce.number().nonnegative("공급가액은 0 이상이어야 합니다").max(999_999_999),
  vat: z.coerce.number().nonnegative("부가세는 0 이상이어야 합니다").max(999_999_999),
  total: z.coerce.number().nonnegative("합계는 0 이상이어야 합니다").max(999_999_999),
});

// total은 클라이언트에서 전달하되, 서버에서 supply + vat으로 재계산하여 덮어씀
```

### customsCreateSchema

```typescript
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const customsCreateSchema = z.object({
  shipping_doc_id: z.string().uuid("유효한 선적서류를 선택하세요"),
  customs_no: z.string().max(50).optional().default(""),
  customs_date: z
    .string()
    .optional()
    .default("")
    .refine((v) => !v || ISO_DATE.test(v), "올바른 날짜 형식이 아닙니다 (YYYY-MM-DD)"),
});
```

### customsUpdateSchema (상세페이지 수정용)

```typescript
export const customsUpdateSchema = z.object({
  customs_no: z.string().max(50).optional().default(""),
  customs_date: z
    .string()
    .optional()
    .default("")
    .refine((v) => !v || ISO_DATE.test(v), "올바른 날짜 형식이 아닙니다 (YYYY-MM-DD)"),
  etc_desc: z.string().max(500).optional().default(""),
});
```

### feeUpdateSchema (비용 수정 전용 - JSONB 4종)

```typescript
export const feeUpdateSchema = z.object({
  transport_fee: z.string().optional(), // JSON string, 서버에서 파싱
  customs_fee: z.string().optional(),
  vat_fee: z.string().optional(),
  etc_fee: z.string().optional(),
  etc_desc: z.string().max(500).optional().default(""),
});
```

**설계 의도**: 비용은 FormData에서 JSON string으로 전달. 서버에서 각각 `JSON.parse` -> `feeBreakdownSchema.safeParse` -> `total` 재계산 후 저장.

---

## 2. List Loader (`app/loaders/customs.server.ts`)

```typescript
// loader: 통관 목록
const CUSTOMS_LIST_SELECT =
  "id, customs_no, customs_date, fee_received, " +
  "transport_fee, customs_fee, vat_fee, etc_fee, " +
  "created_at, " +
  "shipping:shipping_documents!shipping_doc_id(id, ci_no, vessel, voyage, etd, eta)";

export async function loader({ request, context }: LoaderArgs) {
  const { supabase, responseHeaders } = await requireGVUser(request, context);

  const { data: customsList, error } = await supabase
    .from("customs")
    .select(CUSTOMS_LIST_SELECT)
    .is("deleted_at", null)
    .order("customs_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    return data(
      { customsList: [], shippingDocs: [], error: "데이터를 불러오는 데 실패했습니다." },
      { headers: responseHeaders }
    );
  }

  return data({ customsList: customsList ?? [], shippingDocs: [] }, { headers: responseHeaders });
  // shippingDocs는 create action 전 폼에서 필요 - 아래 formLoader 참고
}
```

**목록 컬럼 참고**: 비용 JSONB에서 total만 꺼내서 목록에 합계 표시. 서버에서 전체 JSONB를 내려주고, 클라이언트에서 `.total` 추출.

---

## 3. Form Loader (`customsFormLoader`)

```typescript
export async function customsFormLoader({ request, context }: LoaderArgs) {
  const { supabase, responseHeaders } = await requireGVUser(request, context);

  // 아직 customs가 없는 shipping_documents만 후보로 제공
  // (1 shipping : 1 customs 원칙 - 중복 생성 방지)
  const { data: allShippingDocs } = await supabase
    .from("shipping_documents")
    .select("id, ci_no, ci_date, vessel, voyage")
    .is("deleted_at", null)
    .order("ci_date", { ascending: false });

  // 이미 customs가 있는 shipping_doc_id 목록
  const { data: usedDocs } = await supabase
    .from("customs")
    .select("shipping_doc_id")
    .is("deleted_at", null);

  const usedIds = new Set((usedDocs ?? []).map((d) => d.shipping_doc_id).filter(Boolean));

  const availableShippingDocs = (allShippingDocs ?? []).filter(
    (doc) => !usedIds.has(doc.id)
  );

  return data({ shippingDocs: availableShippingDocs }, { headers: responseHeaders });
}
```

**대안 검토**: DB 레벨에서 NOT IN 서브쿼리 가능하지만, Supabase JS 클라이언트의 제한으로 application-level 필터링 사용. 건수가 적으므로(수십~수백) 성능 문제 없음.

---

## 4. Create Action (`createCustomsAction`)

```typescript
export async function createCustomsAction({ request, context }: LoaderArgs) {
  const { supabase, user, responseHeaders } = await requireGVUser(request, context);
  const formData = await request.formData();

  const raw = Object.fromEntries(formData);
  const parsed = customsCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return data(
      { success: false, error: parsed.error.issues[0]?.message ?? "입력 값을 확인하세요." },
      { status: 400, headers: responseHeaders }
    );
  }

  const { shipping_doc_id, customs_no, customs_date } = parsed.data;

  // 1. Shipping Doc 존재 확인
  const { count: sdCount } = await supabase
    .from("shipping_documents")
    .select("id", { count: "exact", head: true })
    .eq("id", shipping_doc_id)
    .is("deleted_at", null);

  if (!sdCount) {
    return data(
      { success: false, error: "선택한 선적서류를 찾을 수 없습니다." },
      { status: 400, headers: responseHeaders }
    );
  }

  // 2. 중복 체크 (1 shipping : 1 customs)
  const { count: dupCount } = await supabase
    .from("customs")
    .select("id", { count: "exact", head: true })
    .eq("shipping_doc_id", shipping_doc_id)
    .is("deleted_at", null);

  if (dupCount && dupCount > 0) {
    return data(
      { success: false, error: "해당 선적서류에 대한 통관 기록이 이미 존재합니다." },
      { status: 400, headers: responseHeaders }
    );
  }

  // 3. INSERT
  const { data: created, error: insertError } = await supabase
    .from("customs")
    .insert({
      shipping_doc_id,
      customs_no: customs_no || null,
      customs_date: customs_date || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (insertError || !created) {
    return data(
      { success: false, error: "저장 중 오류가 발생했습니다." },
      { status: 500, headers: responseHeaders }
    );
  }

  // 4. Order Sync: linkCustomsToOrder (shipping_doc_id 기준으로 Order에 customs_id 연결)
  await linkCustomsToOrder(supabase, shipping_doc_id, created.id);

  // 5. Order customs_no/customs_date 동기화 (있다면)
  if (customs_no || customs_date) {
    await syncCustomsInfoToOrder(supabase, created.id, customs_no || null, customs_date || null);
  }

  throw redirect(`/customs/${created.id}`, { headers: responseHeaders });
}
```

**Order Sync 통합 포인트 #1**: `linkCustomsToOrder`는 `order-sync.server.ts`에 이미 구현. shipping_doc_id가 동일한 Order의 customs_id를 채움.

---

## 5. Detail Loader (`app/loaders/customs.$id.server.ts`)

```typescript
const CUSTOMS_DETAIL_SELECT =
  "id, customs_no, customs_date, shipping_doc_id, " +
  "transport_fee, customs_fee, vat_fee, etc_fee, etc_desc, " +
  "fee_received, created_by, created_at, updated_at, " +
  "shipping:shipping_documents!shipping_doc_id(id, ci_no, ci_date, vessel, voyage, etd, eta, status)";

export async function loader({ request, context, params }: DetailLoaderArgs) {
  const { supabase, user, responseHeaders } = await requireGVUser(request, context);

  const idResult = z.string().uuid().safeParse(params.id);
  if (!idResult.success) {
    throw data(null, { status: 404, headers: responseHeaders });
  }
  const id = idResult.data;

  const [{ data: customs, error }, { content }] = await Promise.all([
    supabase
      .from("customs")
      .select(CUSTOMS_DETAIL_SELECT)
      .eq("id", id)
      .is("deleted_at", null)
      .single(),
    loadContent(supabase, "customs", id),
  ]);

  if (error || !customs) {
    throw data(null, { status: 404, headers: responseHeaders });
  }

  return data({ customs, content, userId: user.id }, { headers: responseHeaders });
}
```

---

## 6. Detail Action (`customs.$id.server.ts` - action)

### Actions Summary (_action별 정리)

| `_action` | 설명 | 입력 | Sync 포인트 |
|---|---|---|---|
| `update` | 기본 정보 수정 (customs_no, customs_date, etc_desc) | customsUpdateSchema | syncCustomsInfoToOrder |
| `update_fees` | 비용 4종 JSONB 수정 | feeUpdateSchema + feeBreakdownSchema x4 | 없음 |
| `toggle_fee_received` | 통관비 수령 토글 | 없음 (서버에서 현재값 반전) | syncCustomsFeeToOrder |
| `delete` | Soft delete | 없음 | unlinkCustomsFromOrder |
| `content_*` | 메모/첨부/댓글 | handleContentAction 위임 | 없음 |

### 각 Action 상세

#### update (기본 정보 수정)

```typescript
if (intent === "update") {
  const raw = Object.fromEntries(formData);
  const parsed = customsUpdateSchema.safeParse(raw);
  // ... validation ...

  const { customs_no, customs_date, etc_desc } = parsed.data;

  const { error: updateError } = await supabase
    .from("customs")
    .update({
      customs_no: customs_no || null,
      customs_date: customs_date || null,
      etc_desc: etc_desc || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("deleted_at", null);

  // Order Sync: customs_no, customs_date 동기화
  await syncCustomsInfoToOrder(supabase, id, customs_no || null, customs_date || null);

  return data({ success: true }, { headers: responseHeaders });
}
```

#### update_fees (비용 수정)

```typescript
if (intent === "update_fees") {
  const FEE_FIELDS = ["transport_fee", "customs_fee", "vat_fee", "etc_fee"] as const;
  const updates: Record<string, Json | null> = {};

  for (const field of FEE_FIELDS) {
    const raw = formData.get(field) as string;
    if (!raw) {
      updates[field] = null;
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return data(
        { success: false, error: `${field} 데이터 형식이 올바르지 않습니다.` },
        { status: 400, headers: responseHeaders }
      );
    }

    const result = feeBreakdownSchema.safeParse(parsed);
    if (!result.success) {
      return data(
        { success: false, error: result.error.issues[0]?.message ?? "비용 입력을 확인하세요." },
        { status: 400, headers: responseHeaders }
      );
    }

    // 서버사이드 total 재계산 (클라이언트 값 무시)
    const recalc = {
      supply: result.data.supply,
      vat: result.data.vat,
      total: Math.round((result.data.supply + result.data.vat) * 100) / 100,
    };

    updates[field] = recalc as unknown as Json;
  }

  // etc_desc도 함께 업데이트
  const etcDesc = formData.get("etc_desc") as string;

  const { error: updateError } = await supabase
    .from("customs")
    .update({
      ...updates,
      etc_desc: etcDesc || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("deleted_at", null);

  if (updateError) {
    return data(
      { success: false, error: "비용 저장 중 오류가 발생했습니다." },
      { status: 500, headers: responseHeaders }
    );
  }

  return data({ success: true }, { headers: responseHeaders });
}
```

**fee JSONB 서버사이드 검증/재계산**:
1. FormData에서 JSON string으로 수신
2. `JSON.parse` -> `feeBreakdownSchema.safeParse` 로 구조 검증
3. `total = supply + vat` 서버사이드 재계산 (클라이언트 조작 방지)
4. 0.01원 단위 반올림: `Math.round((supply + vat) * 100) / 100`

#### toggle_fee_received

```typescript
if (intent === "toggle_fee_received") {
  // 서버에서 현재값을 읽고 반전 (클라이언트 값 무시 - orders.$id 패턴과 동일)
  const { data: current } = await supabase
    .from("customs")
    .select("fee_received")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!current) {
    return data(
      { success: false, error: "통관 기록을 찾을 수 없습니다." },
      { status: 404, headers: responseHeaders }
    );
  }

  const newValue = !current.fee_received;

  const { error: updateError } = await supabase
    .from("customs")
    .update({
      fee_received: newValue,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("deleted_at", null);

  if (updateError) {
    return data(
      { success: false, error: "통관비 수령 상태 변경 중 오류가 발생했습니다." },
      { status: 500, headers: responseHeaders }
    );
  }

  // Order Sync: 양방향 동기화
  await syncCustomsFeeToOrder(supabase, id, newValue);

  return data({ success: true, fee_received: newValue }, { headers: responseHeaders });
}
```

**Order Sync 통합 포인트 #2**: `syncCustomsFeeToOrder`는 `order-sync.server.ts`에 이미 구현. customs_id가 동일한 Order의 customs_fee_received 필드 동기화.

#### delete (Soft delete)

```typescript
if (intent === "delete") {
  const { error: deleteError } = await supabase
    .from("customs")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);

  if (deleteError) {
    return data(
      { success: false, error: "삭제 중 오류가 발생했습니다." },
      { status: 500, headers: responseHeaders }
    );
  }

  // Order unlink: customs_id null로
  await unlinkCustomsFromOrder(supabase, id);

  throw redirect("/customs", { headers: responseHeaders });
}
```

---

## 7. Order Sync 통합 포인트 (정리)

### 기존 구현 (`order-sync.server.ts`)
- `linkCustomsToOrder(supabase, shippingDocId, customsId)` - Customs 생성 시
- `syncCustomsFeeToOrder(supabase, customsId, value)` - fee_received 토글 시

### 신규 필요 (`order-sync.server.ts`에 추가)

```typescript
/** Customs 삭제 시 Order에서 customs_id 해제 */
export async function unlinkCustomsFromOrder(
  supabase: Supabase,
  customsId: string
) {
  try {
    await supabase
      .from("orders")
      .update({
        customs_id: null,
        customs_fee_received: false, // customs 삭제 시 fee_received도 초기화
        updated_at: new Date().toISOString(),
      })
      .eq("customs_id", customsId)
      .is("deleted_at", null);
  } catch (err) {
    console.error("unlinkCustomsFromOrder failed:", err);
  }
}

/** Customs 기본 정보 변경 시 Order의 customs_no, customs_date 동기화 */
export async function syncCustomsInfoToOrder(
  supabase: Supabase,
  customsId: string,
  customsNo: string | null,
  customsDate: string | null
) {
  try {
    await supabase
      .from("orders")
      .update({
        customs_no: customsNo,
        customs_date: customsDate,
        updated_at: new Date().toISOString(),
      })
      .eq("customs_id", customsId)
      .is("deleted_at", null);
  } catch (err) {
    console.error("syncCustomsInfoToOrder failed:", err);
  }
}
```

**참고**: orders 테이블에 `customs_no`와 `customs_date` 컬럼이 있는지 확인 필요. 없다면 동기화 불필요 (Order 상세에서 FK JOIN으로 조회).

현재 orders 테이블의 SELECT 절(`ORDER_DETAIL_SELECT`)을 보면 `customs:customs!customs_id(id, customs_no, customs_date, fee_received)` 로 JOIN하고 있으므로, customs_no/customs_date는 **orders 테이블에 별도 컬럼 없이 JOIN으로 조회**. 따라서 `syncCustomsInfoToOrder`는 **불필요**. 삭제.

최종 신규 sync 함수: `unlinkCustomsFromOrder` 1개만 추가.

---

## 8. 에러 처리 패턴

기존 모듈과 동일한 패턴 적용:

```
1. Zod safeParse 실패 → data({ success: false, error: "..." }, { status: 400 })
2. FK 참조 대상 미존재 → data({ success: false, error: "..." }, { status: 400 })
3. 중복 체크 위반 → data({ success: false, error: "..." }, { status: 400 })
4. DB INSERT/UPDATE 실패 → data({ success: false, error: "..." }, { status: 500 })
5. 리소스 미발견 (detail) → throw data(null, { status: 404 })
6. 성공 → data({ success: true }, { headers: responseHeaders })
7. 성공 + 리다이렉트 → throw redirect("/customs/...", { headers: responseHeaders })
```

---

## 9. 파일 구조 요약

```
app/loaders/
  customs.schema.ts        # Zod 스키마 (feeBreakdown, create, update, feeUpdate)
  customs.server.ts        # List Loader + Form Loader + Create Action
  customs.$id.server.ts    # Detail Loader + Multi-intent Action

app/lib/
  order-sync.server.ts     # + unlinkCustomsFromOrder 추가

app/routes/
  _layout.customs.tsx      # 목록 (re-export loader/action)
  _layout.customs.new.tsx  # 생성 폼 (re-export formLoader)
  _layout.customs.$id.tsx  # 상세 (re-export loader/action)
```

---

## 10. Content 연동

기존 Content 시스템 그대로 사용. `content.server.ts`의 `PARENT_TABLE_MAP`에 `customs: "customs"` 이미 등록됨.

- Detail Loader: `loadContent(supabase, "customs", id)` (Promise.all에 포함)
- Detail Action: `intent?.startsWith("content_")` -> `handleContentAction(supabase, user.id, "customs", id, ...)`

추가 작업 없음.

---

## 11. 설계 결정 요약

| 항목 | 결정 | 근거 |
|---|---|---|
| 1 Shipping : 1 Customs | Application-level 중복 체크 | DB UNIQUE 제약도 가능하나, soft delete와 호환성 위해 app 레벨 |
| Fee JSONB total 재계산 | 서버사이드 `supply + vat` | 클라이언트 조작 방지 (shipping amount 재계산 패턴과 동일) |
| fee_received 토글 | 서버에서 현재값 읽고 반전 | orders.$id toggle_customs_fee 패턴과 동일 |
| customs_no/customs_date 동기화 | 불필요 (JOIN 조회) | Order에 별도 컬럼 없음, FK JOIN으로 충분 |
| 상태(status) 필드 | 없음 | customs 테이블에 status 컬럼 없음. 필요시 Phase 7 내에서 마이그레이션 추가 |
| Edit 페이지 | 없음 (Inline 수정) | Order 상세와 동일한 click-to-edit 패턴. 비용 입력은 모달 or 인라인 폼 |
