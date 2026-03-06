# Phase 3 구현 검증 분석서 — PI (Proforma Invoice) Module

**Date:** 2026-03-06
**Status:** 분석 완료
**참조:** [Phase 3 브레인스토밍](PROJECT_INIT_BRAINSTORMING_PHASE_3.md) | [Phase 3-A 구현](PROJECT_INIT_IMPLEMENT_PHASE_3-A.md) | [Phase 3-B 구현](PROJECT_INIT_IMPLEMENT_PHASE_3-B.md)

---

## 분석 팀 구성

| # | Role | Scope | 담당 파일 |
|---|------|-------|----------|
| 1 | **Architect** | 완성도, 설계 일관성, 크로스모듈, 데이터 플로우 | 전체 15개 파일 검증 |
| 2 | **Backend Dev** | Supabase 스키마/RLS/인덱스/FK 검증 (MCP 직접 실행) | DB 테이블 7개 SQL 쿼리 |
| 3 | **Security Reviewer** | 가격 격리, 인증 가드, RLS, 입력 검증 | server 파일 + RLS 정책 |
| 4 | **Code Reviewer** | 코드 품질, 복사 오류, 패턴 일관성 | PI 12개 vs PO 12개 비교 |
| 5 | **Perf Analyzer** | 쿼리 효율, React 최적화, CF Workers 호환성 | loader/component/wrangler |

**제외:** Tester (테스트 코드 미존재), Researcher (열린 질문 없음)

---

## 1. 전체 요약

| 카테고리 | 결과 |
|----------|------|
| 파일 체크리스트 (15개) | **PASS** (11 신규 + 4 수정, 전부 존재) |
| 라우트 설정 (4개) | **PASS** (pi, pi/new, pi/:id, pi/:id/edit) |
| 타입 정의 (5개) | **PASS** (PILineItem, PIWithOrgs, PIListItem, PIEditData, SourcePO) |
| Zod 스키마 | **PASS** (lineItemSchema 재사용 + piSchema) |
| PO→PI 참조 플로우 | **PASS** (8/8 체크포인트) |
| 조직 역할 역전 | **PASS** (supplier=seller, buyer=buyer) |
| Delivery 자동생성 | **PASS** (생성/복제/삭제 전부 처리) |
| Action 인텐트 (4개) | **PASS** (update/delete/clone/toggle) |
| 크로스모듈 통합 | **PASS** (PO 상세에 PI 작성 버튼 + 연결 PI 목록) |
| PO 패턴 일관성 (18항목) | **PASS** (18/18) |
| DB 스키마/RLS/인덱스/FK | **PASS** (7/7 Supabase MCP 검증) |
| TypeScript 컴파일 | **PASS** (typecheck 에러 0건) |

**전체 판정: PASS — 버그 3건 + 개선사항 12건 발견**

---

## 2. 발견 사항 — 버그 (Must Fix)

### B1. [Critical] po_id 수정 시 소실 — 데이터 무결성 위반

**파일:** `app/components/pi/pi-form.tsx:99-102`

PI 폼의 `po_id` hidden input이 `sourcePO` 존재 시에만 렌더링됨. PI 수정 시에는 `sourcePO`가 전달되지 않고 `defaultValues.po_id`로 전달되므로, **PO 연결된 PI를 수정 저장하면 po_id가 null로 초기화되어 PO 연결이 소실됨.**

```tsx
// 현재 (버그)
{sourcePO && (
  <input type="hidden" name="po_id" value={sourcePO.id} />
)}

// 수정안
{(sourcePO?.id || mergedDefaults?.po_id) && (
  <input
    type="hidden"
    name="po_id"
    value={sourcePO?.id ?? mergedDefaults?.po_id ?? ""}
  />
)}
```

### B2. [High] po_id 수정 시 유효성 미검증

**파일:** `app/loaders/pi.$id.server.ts:241-263`

create action은 po_id 존재 시 PO 유효성 검증 (존재 + deleted_at IS NULL)을 수행하지만, update action은 `resolvedPoId`를 검증 없이 직접 UPDATE에 전달. soft-deleted PO UUID가 FK로 설정될 수 있음 (FK 제약은 물리 삭제만 차단).

**수정:** create action의 검증 로직을 update action에도 미러링.

### B3. [Medium] Delivery soft-delete 실패 무시 — 고아 레코드 가능

**파일:** `app/loaders/pi.$id.server.ts:291-296`

PI 삭제 시 연결 Delivery soft-delete의 에러를 확인하지 않고 redirect 진행. 생성/복제 경로에서는 Delivery 실패 시 PI rollback을 수행하지만, 삭제 경로에서는 에러가 무시됨. Saelim에게 고아 Delivery가 노출될 수 있음.

**수정:** Delivery soft-delete 에러 체크 후 에러 반환 또는 로깅.

---

## 3. 발견 사항 — 보안 (Security)

### S1. [High] PO 구매단가가 PI 폼에 프리필

**파일:** `app/loaders/pi.server.ts:97-108`

`piFormLoader`가 `sourcePO.details`에 PO의 `unit_price`를 포함하여 클라이언트에 전달. GV 사용자 전용이므로 외부 노출은 아니지만, **PO 구매단가가 PI 판매단가 기본값으로 설정되어 실수로 원가 그대로 Saelim에게 견적될 위험.**

**수정안 (권장):**
```typescript
details: Array.isArray(poData.details)
  ? poData.details.map(({ product_id, product_name, gsm, width_mm, quantity_kg }) => ({
      product_id, product_name, gsm, width_mm, quantity_kg,
      unit_price: 0,
      amount: 0,
    }))
  : [],
```

> **참고:** 브레인스토밍 문서 §4.1에서 "PO 단가를 기본값 (사용자 수정 가능)"으로 명시했으므로, 이는 **의도된 설계**. 하지만 Security Reviewer는 원가 노출 위험을 지적. 사용자 판단 필요.

### S2. [High] Clone action `select("*")` — 미래 필드 노출 위험

**파일:** `app/loaders/pi.$id.server.ts:303` + `app/loaders/po.$id.server.ts:297`

PI/PO 복제 시 `select("*")` 사용. 향후 스키마에 민감 컬럼 추가 시 자동 포함됨.

**수정:** 명시적 컬럼 목록으로 교체.

### S3. [Medium] 자유 텍스트 필드 길이 제한 부재

**파일:** `app/loaders/pi.schema.ts:27-30`

`payment_term`, `delivery_term`, `loading_port`, `discharge_port`에 `.max()` 미적용. `notes`(2000자)와 `ref_no`(100자)는 제한됨.

**수정:** `.max(200)` 추가.

### S4. [Medium] Zod 스키마 `po_id` 이중 `.optional()`

**파일:** `app/loaders/pi.schema.ts:23`

```typescript
// 현재
po_id: z.string().uuid().optional().or(z.literal("")).optional(),
// 수정안
po_id: z.union([z.string().uuid(), z.literal("")]).optional(),
```

### S5. [Low] `generate_doc_number` RPC — 인증 사용자 누구나 호출 가능

Saelim 사용자가 Supabase 클라이언트에서 직접 RPC 호출 시 문서 번호 시퀀스 증가 가능. 실제 위험은 낮으나 (앱 레벨 `requireGVUser` 가드), DB 함수 내부에 `get_user_org_type()` 체크 추가 권장.

### S6. 보안 검증 통과 항목 (전부 PASS)

| 항목 | 결과 |
|------|------|
| 모든 PI loader/action `requireGVUser` 독립 호출 (6개) | PASS |
| `proforma_invoices` RLS: gv_all only (Saelim 접근 불가) | PASS |
| `deliveries` RLS: gv_all + saelim_read (SELECT only) | PASS |
| RLS 활성화 (15개 public 테이블 전부) | PASS |
| Amount 서버사이드 재계산 (클라이언트 미신뢰) | PASS |
| Complete 상태 수정 차단 (DB 상태 직접 조회) | PASS |
| toggle_status 서버에서 현재 상태 조회 (클라이언트 미신뢰) | PASS |
| UUID 라우트 파라미터 Zod 검증 | PASS |
| XSS: dangerouslySetInnerHTML 미사용, JSX 자동 이스케이프 | PASS |
| 에러 메시지에 SQL/테이블명 미노출 | PASS |
| responseHeaders 모든 응답에 전달 | PASS |
| Saelim 라우트에 PI 데이터 미노출 | PASS |

---

## 4. 발견 사항 — 코드 품질 (Code Quality)

### C1. [Warning] 에러 메시지 불일치

**파일:** `pi.$id.server.ts:220` vs `pi.server.ts:205`

| 파일 | 메시지 |
|------|--------|
| create | "선택한 공급업체가 유효하지 않습니다." |
| update | "선택한 판매업체가 유효하지 않습니다." |

PI 컨텍스트에서 supplier는 GV(판매자)이므로 "판매업체"가 맞지만, 양쪽 통일 필요.

### C2. [Warning] PI 폼 자동선택 — PO와 불일치

**파일:** `app/components/pi/pi-form.tsx:164,183`

```typescript
defaultValue={mergedDefaults?.supplier_id ?? (suppliers[0]?.id)}
```

PO 폼은 자동선택 없음 (빈 상태). PI 폼은 첫 번째 org 자동선택. PI의 seller/buyer 목록이 각각 1개씩일 가능성 높아 실용적이지만, PO와 패턴 불일치.

### C3. [Suggestion] List loader 타입 캐스팅 위치

**파일:** `app/loaders/pi.server.ts:40`

FK join 결과의 `as unknown as` 캐스팅이 route에서만 수행됨. PO와 동일 패턴이지만, loader 반환 시점에서 캐스팅하면 route 코드가 깔끔해짐.

### C4. 코드 품질 통과 항목

| 항목 | 결과 |
|------|------|
| PO→PI 네이밍 변환 (po_ → pi_, PO → PI) | PASS (잔여 PO 참조 없음) |
| Import 경로 정확성 | PASS |
| Route re-export 패턴 | PASS |
| `data()` helper 일관 사용 | PASS |
| 한국어 에러 메시지 | PASS (PI 컨텍스트 적합) |
| Keyboard 접근성 (tabIndex + onKeyDown) | PASS |
| useMemo 최적화 (counts) | PASS |
| _rowId UUID 키 + 직렬화 제외 | PASS |

---

## 5. 발견 사항 — 성능 (Performance)

### P1. [High] PI 목록 정렬 인덱스 부재

**현재:** `ORDER BY pi_date DESC, created_at DESC` — `idx_pi_created_at`만 존재 (created_at DESC).
`pi_date` 정렬에 인덱스 미사용 → 인메모리 정렬 발생.

**수정:**
```sql
CREATE INDEX idx_pi_date_created_at
  ON proforma_invoices (pi_date DESC, created_at DESC)
  WHERE deleted_at IS NULL;
```

> **참고:** PO 목록도 동일 문제 (po_date 정렬 인덱스 부재). 함께 추가 권장.

### P2. [High] `idx_pi_po_id` partial index 미적용

**현재:** `CREATE INDEX idx_pi_po_id ON proforma_invoices (po_id)` — deleted_at 필터 없음.
PO 상세에서 연결 PI 조회 시 전체 PI 스캔.

**수정:**
```sql
DROP INDEX idx_pi_po_id;
CREATE INDEX idx_pi_po_id
  ON proforma_invoices (po_id)
  WHERE deleted_at IS NULL;
```

### P3. [Medium] createPIAction PO 검증 순차 실행

**파일:** `app/loaders/pi.server.ts:191-231`

org 검증 2개는 `Promise.all` 병렬이지만, po_id 검증은 순차. 3개 모두 독립적이므로 병렬 가능.

**수정안:**
```typescript
const [{ count: supplierCount }, { count: buyerCount }, { count: poCount }] =
  await Promise.all([
    supabase.from("organizations").select("id", { count: "exact", head: true })
      .eq("id", supplier_id).is("deleted_at", null),
    supabase.from("organizations").select("id", { count: "exact", head: true })
      .eq("id", buyer_id).is("deleted_at", null),
    resolvedPoId
      ? supabase.from("purchase_orders").select("id", { count: "exact", head: true })
          .eq("id", resolvedPoId).is("deleted_at", null)
      : Promise.resolve({ count: 1 }),
  ]);
```

### P4. [Medium] piFormLoader 순차 PO 조회

**파일:** `app/loaders/pi.server.ts:76-110`

`?from_po=` 존재 시 3-way `Promise.all` 후 순차 PO fetch. UUID 검증을 앞으로 옮기면 4-way 병렬 가능. ~40-80ms RTT 절감.

### P5. [Low] filtered 배열 useMemo 미적용

**파일:** `app/routes/_layout.pi.tsx:34-42`

`counts`는 useMemo 적용됨. `filtered`는 매 렌더 재계산. 현재 규모에서는 무시 가능하나, useMemo 래핑 권장.

### P6. [Info] Smart Placement 비활성

**파일:** `wrangler.jsonc`

Supabase (Asia)와 CF Worker 간 RTT 최적화를 위해 Smart Placement 활성화 권장. 모든 SSR 로더에서 ~30-60ms 절감 가능.

### P7. 성능 통과 항목

| 항목 | 결과 |
|------|------|
| Loader 병렬화 (piEditLoader 4-way, piFormLoader 3-way) | PASS |
| PO detail + PI 쿼리 병렬 (Promise.all) | PASS |
| details JSONB 목록 쿼리에서 제외 | PASS |
| lineItemSchema .max(20) 제한 | PASS |
| Amount 재계산 O(n) | PASS |
| crypto.randomUUID() 클라이언트 전용 | PASS |
| new Date().toISOString() UTC 안전 | PASS |
| Node.js API 미사용 (CF Workers 호환) | PASS |
| 부분 인덱스 (idx_pi_status, idx_pi_created_at) WHERE deleted_at IS NULL | PASS |

---

## 6. DB 스키마 검증 결과 (Supabase MCP)

| 항목 | 결과 | 비고 |
|------|------|------|
| proforma_invoices 테이블 (21개 컬럼) | PASS | 모든 컬럼 정확 |
| deliveries 테이블 (7개 컬럼) | PASS | pi_id FK 포함 |
| RLS 정책 (PI: gv_all / Delivery: gv_all + saelim_read) | PASS | Saelim PI 접근 불가 확인 |
| RLS 활성화 | PASS | 두 테이블 모두 rowsecurity=true |
| 인덱스 (4개 필수 + 4개 보너스) | PASS | partial index 적용 확인 |
| FK 제약 (5개) | PASS | po_id→PO, supplier_id→org, buyer_id→org, pi_id→PI, shipping_doc_id→SD |
| generate_doc_number RPC ('PI' 지원) | PASS | GVPIYYMM-XXX 형식 생성 확인 |

---

## 7. 우선순위별 액션 아이템

### 즉시 수정 (Before Use)

| # | 항목 | 파일 | 난이도 |
|---|------|------|--------|
| B1 | po_id hidden input 수정 → 수정 모드에서도 렌더링 | `pi-form.tsx:99-102` | Low |
| B2 | update action에 po_id 유효성 검증 추가 | `pi.$id.server.ts:241` | Low |
| S4 | Zod 스키마 이중 `.optional()` 정리 | `pi.schema.ts:23` | Trivial |

### 조기 수정 권장

| # | 항목 | 파일 | 난이도 |
|---|------|------|--------|
| B3 | Delivery soft-delete 에러 핸들링 | `pi.$id.server.ts:291-296` | Low |
| S2 | Clone `select("*")` → 명시적 컬럼 | `pi.$id.server.ts:303` + `po.$id.server.ts:297` | Low |
| S3 | 자유 텍스트 필드 `.max(200)` 추가 | `pi.schema.ts:27-30` | Trivial |
| C1 | 에러 메시지 통일 | `pi.server.ts` + `pi.$id.server.ts` | Trivial |
| P1 | PI 목록 정렬 복합 인덱스 추가 | DB migration | Low |
| P2 | idx_pi_po_id partial index 교체 | DB migration | Low |

### 선택적 개선

| # | 항목 | 파일 | 난이도 |
|---|------|------|--------|
| S1 | sourcePO.details에서 unit_price 제거 여부 | `pi.server.ts:97-108` | Low (사용자 결정) |
| P3 | createPIAction 검증 3-way 병렬화 | `pi.server.ts:191-231` | Low |
| P4 | piFormLoader PO 조회 4-way 병렬화 | `pi.server.ts:76-110` | Low |
| P5 | filtered useMemo 래핑 | `_layout.pi.tsx:34-42` | Trivial |
| C2 | 폼 자동선택 제거 (PO 패턴 통일) | `pi-form.tsx:164,183` | Trivial |
| P6 | Smart Placement 활성화 | `wrangler.jsonc` | Trivial |
| S5 | generate_doc_number RPC org_type 체크 | DB function | Low |

---

## 8. 결론

Phase 3 PI 모듈은 브레인스토밍 사양의 **95% 이상을 정확히 구현**함. PO 모듈과의 패턴 일관성, 보안(RLS/인증), DB 스키마 모두 검증 통과.

**핵심 수정 필요 사항:**
1. `po_id` hidden input 수정 (B1) — PI-PO 연결이 수정 시 소실되는 데이터 무결성 버그
2. update action po_id 검증 추가 (B2) — soft-deleted PO 참조 가능
3. Zod 스키마 정리 (S4) — 이중 optional 제거

이 3건 수정 후 Phase 3는 프로덕션 사용 가능 상태.
