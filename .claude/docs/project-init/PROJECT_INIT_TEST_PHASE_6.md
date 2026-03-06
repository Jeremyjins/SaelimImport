# Phase 6: Order Management — 통합 테스트 보고서

**Date:** 2026-03-06
**Scope:** Phase 6-A (목록+생성), 6-B (상세+수정+링크), 6-C (Cross-Module Sync)
**Tool:** Claude Code `/sc:test`

---

## 에이전트 팀 구성

| # | Role | 담당 영역 | 파일 소유권 |
|---|------|----------|------------|
| 1 | **Architect** | DB 스키마·RLS·인덱스·FK 검증 (Supabase MCP) | 본 문서 |
| 2 | **Backend Dev** | 로더·액션·sync 헬퍼·Zod 스키마 로직 검증 | `orders.server.ts`, `orders.$id.server.ts`, `order-sync.server.ts`, `orders.schema.ts` |
| 3 | **Frontend Dev** | 컴포넌트 코드 리뷰, calcCY 로직 단위테스트 | `order-cy-warning.tsx`, 5개 컴포넌트 |
| 4 | **Tester** | 빌드/타입체크 실행, 단위테스트 스크립트 | `npm run typecheck`, `npm run build`, node 스크립트 |

**제외:** Perf-analyzer, Security-reviewer, Researcher (이번 테스트 범위 외)

---

## 전체 결과: **PASS (조건부)** ✅

| 영역 | 결과 | 비고 |
|------|------|------|
| TypeScript typecheck | ✅ PASS | 0 errors |
| Production build | ✅ PASS | client + server 모두 성공 |
| Zod schema 단위테스트 | ✅ PASS | 6/6 |
| calcCY 로직 단위테스트 | ⚠️ 5/6 | timezone 버그 발견 |
| DB 스키마 검증 | ✅ PASS | 5/5 항목 |
| RLS/보안 검증 | ✅ PASS | gv_all 정책 확인 |
| FK 제약조건 | ⚠️ 부분 | ON DELETE SET NULL 누락 (저위험) |
| Cascade Link 실데이터 | ✅ PASS | Exactly-1 Rule 정상작동 확인 |

---

## 신규 발견 이슈

### BUG-1. `calcCY` timezone 불일치 (Medium)

**파일:** `app/components/orders/order-cy-warning.tsx:20-32`
**발견:** Tester (단위테스트)
**증상:** "15일 경과" 케이스가 `overdue` 대신 `warning` 반환 (CY 14일 0일 남음)

**원인:**
```typescript
// 현재: 혼합 timezone
const arrival = new Date(arrivalDate); // ← UTC 자정 (ISO date-only 파싱)
const today = new Date();
today.setHours(0, 0, 0, 0);           // ← 로컬 자정 (UTC+9 = UTC 전날 15:00)
```
Korea(UTC+9) 기준, 14일 00:00 KST ≠ 14일 00:00 UTC → diff 최대 -9h → CY count 0~1일 낮게 계산.

**수정:**
```typescript
const today = new Date();
today.setUTCHours(0, 0, 0, 0); // UTC 자정으로 통일
```

**영향도:** 경계값(14일) 근처에서 CY 상태 1단계 낮게 표시 (warning→ok, overdue→warning). 실사용에서 체감 가능한 버그.

---

### FINDING-1. FK `ON DELETE SET NULL` 누락 (Low)

**파일:** Supabase DB constraints
**발견:** Architect (DB 직접 확인)
**내용:** orders → pi_id, shipping_doc_id, customs_id, delivery_id FK에 ON DELETE SET NULL 없음

```
실제: FOREIGN KEY (customs_id) REFERENCES customs(id)  [NO ACTION]
기대: FOREIGN KEY (customs_id) REFERENCES customs(id) ON DELETE SET NULL
```

**위험도:** LOW — 앱 전체가 soft delete(deleted_at)를 사용하므로 실제 hard delete 발생 없음. 단, 직접 DB 조작 시 FK 위반 가능.
**권장:** Phase 7 Migration 시 ON DELETE SET NULL 추가.

---

## DB 검증 결과 (Supabase MCP)

### 1. orders 테이블 컬럼 ✅
| 컬럼 | 타입 | NOT NULL | DEFAULT |
|------|------|----------|---------|
| id | uuid | YES | gen_random_uuid() |
| po_id | uuid | NO | - |
| pi_id | uuid | NO | - |
| shipping_doc_id | uuid | NO | - |
| customs_id | uuid | NO | - |
| delivery_id | uuid | NO | - |
| saelim_no | text | NO | - |
| status | text | **YES** | **'process'** |
| advice_date / arrival_date / delivery_date | date | NO | - |
| customs_fee_received | boolean | NO | false |
| deleted_at / created_at / updated_at | timestamptz | NO | now() |
| created_by | uuid | NO | - |

### 2. RLS 정책 ✅
| 테이블 | 정책 | 커맨드 | 조건 |
|--------|------|--------|------|
| orders | gv_all | ALL | get_user_org_type() = 'gv' |
| purchase_orders | gv_all | ALL | gv only |
| proforma_invoices | gv_all | ALL | gv only |
| shipping_documents | gv_all + saelim_read | ALL + SELECT | gv all / saelim read |
| customs | gv_all | ALL | gv only |
| deliveries | gv_all + saelim_read | ALL + SELECT | gv all / saelim read |

→ orders 테이블에 Saelim 정책 없음 ✅ (마진 노출 방지)

### 3. 인덱스 ✅
| 인덱스명 | 정의 |
|---------|------|
| orders_pkey | UNIQUE btree (id) |
| idx_orders_po_id | btree (po_id) |
| idx_orders_pi_id | btree (pi_id) |
| **idx_orders_po_id_unique** | **UNIQUE btree (po_id) WHERE deleted_at IS NULL AND po_id IS NOT NULL** |
| **idx_orders_created_at** | **btree (created_at DESC) WHERE deleted_at IS NULL** |

→ Partial unique index 정상 ✅, 목록 성능 인덱스 정상 ✅

### 4. FK 제약조건 ⚠️
- 모든 FK 존재 ✅
- ON DELETE SET NULL 없음 ⚠️ (FINDING-1 참조)
- status CHECK 제약 (`process` | `complete`) ✅

### 5. contents.type CHECK ✅
```sql
CHECK (type = ANY (ARRAY['po','pi','shipping','order','customs']))
-- 'order' 포함 확인 ✅
```

---

## 단위 테스트 결과

### calcCY 로직 (6/6 → 5/6 PASS)

| 케이스 | 기대 | 실제 | 결과 |
|--------|------|------|------|
| arrivalDate null → pending | pending | pending | ✅ |
| 미래 도착 → D-N pending | pending | pending (D-6) | ✅ |
| 10일 경과 → ok | ok | ok (CY 9일) | ✅ |
| 12일 경과 → warning | warning | warning (CY 11일) | ✅ |
| **15일 경과 → overdue** | **overdue** | **warning (CY 14일)** | **❌ BUG-1** |
| 15일 + 통관완료(5일) → ok | ok | ok (CY 5일) | ✅ |

### Zod 스키마 (6/6 PASS)

| 케이스 | 기대 | 실제 | 결과 |
|--------|------|------|------|
| create: valid v4 UUID | PASS | PASS | ✅ |
| create: invalid UUID | FAIL | FAIL | ✅ |
| create: saelim_no 51자 | FAIL | FAIL | ✅ |
| link: valid pi + UUID | PASS | PASS | ✅ |
| link: invalid enum (po) | FAIL | FAIL | ✅ |
| unlink: invalid enum | FAIL | FAIL | ✅ |

**Note:** Zod v4는 RFC 4122 UUID 버전 비트까지 검증 (v3보다 엄격). Supabase gen_random_uuid()는 v4 UUID 생성이므로 실사용 호환.

---

## Cascade Link Exactly-1 Rule 실데이터 검증

| 항목 | 값 |
|------|----|
| PO | GVPO2603-006 |
| PI 수 (해당 PO) | **1개** → 자동연결 가능 |
| Shipping 수 (해당 PI) | **2개** → Exactly-1 Rule로 자동연결 안됨 |
| 현재 orders | 0개 (빈 테이블) |

→ 오더 생성 시 PI는 자동연결, Shipping은 수동 연결 필요 (설계 의도 정확)

---

## 이전 분석 이슈 처리 현황 (ANALYZE_PHASE_6 → IMPLEMENT 완료 확인)

| 이슈 | 상태 | 코드 확인 |
|------|------|----------|
| H1: order-sync try/catch 누락 | ✅ 수정됨 | 4개 함수 try/catch 확인 |
| H2: link_document tableName 캐스팅 | ✅ 수정됨 | `as any` 적용 확인 |
| M1: 중복 연결 방지 | ✅ 수정됨 | `.neq("id", id)` 조회 확인 |
| M2: cascadeLink 코드 중복 | ✅ 수정됨 | order-sync.server.ts 통합 확인 |
| M3: availablePos 메모리 필터 | ✅ 수정됨 | `.not("id","in",...)` DB 필터 확인 |
| L3: key={i} → key={step.label} | ✅ 수정됨 | timeline 두 곳 모두 확인 |

---

## 권장 조치 (Phase 7 시작 전)

### 즉시 수정 권장

**BUG-1 (calcCY timezone):**
```typescript
// app/components/orders/order-cy-warning.tsx:22-23
// Before:
const today = new Date();
today.setHours(0, 0, 0, 0);
// After:
const today = new Date();
today.setUTCHours(0, 0, 0, 0);
```

### Phase 7 Migration 시 추가

**FINDING-1 (ON DELETE SET NULL):**
```sql
ALTER TABLE orders
  DROP CONSTRAINT orders_pi_id_fkey,
  DROP CONSTRAINT orders_shipping_doc_id_fkey,
  DROP CONSTRAINT orders_customs_id_fkey,
  DROP CONSTRAINT orders_delivery_id_fkey,
  ADD CONSTRAINT orders_pi_id_fkey FOREIGN KEY (pi_id) REFERENCES proforma_invoices(id) ON DELETE SET NULL,
  ADD CONSTRAINT orders_shipping_doc_id_fkey FOREIGN KEY (shipping_doc_id) REFERENCES shipping_documents(id) ON DELETE SET NULL,
  ADD CONSTRAINT orders_customs_id_fkey FOREIGN KEY (customs_id) REFERENCES customs(id) ON DELETE SET NULL,
  ADD CONSTRAINT orders_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE SET NULL;
```

### 선택적 (L4, L6 — Phase 7/8 구현 시)
- L4: "미구현" 버튼 → Customs/Delivery 구현 후 제거
- L6: 날짜 의미론적 검증 추가 (`z.string().refine(d => !isNaN(new Date(d).getTime()))`)

---

## 최종 판정

**Phase 7 (Customs Management) 진행 가능.**
단, BUG-1(calcCY timezone)은 사용자 체감 가능 버그이므로 Phase 7 시작 전 수정 권장.
