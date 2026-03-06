# Phase 7: Customs Module - Implementation Verification Report

**Date:** 2026-03-06
**Status:** Analysis Complete
**Scope:** Phase 7-A (Types/Schema/List/Create) + 7-B (Detail/Edit/Delete/Sync) + 7-C (Cross-Module Links)

---

## Executive Summary

Phase 7 Customs 모듈 구현이 브레인스토밍 설계를 충실히 따르고 있음을 확인.
전체적으로 **GOOD** 등급. 치명적 결함 없음, 개선 가능 항목 존재.

| Category | Rating | Critical | High | Medium | Low |
|----------|--------|----------|------|--------|-----|
| Architecture | PASS | 0 | 0 | 0 | 2 |
| Backend | PASS | 0 | 0 | 1 | 0 |
| Frontend | GOOD | 0 | 1 | 1 | 2 |
| Security | PASS | 0 | 0 | 0 | 2 |
| Code Quality | GOOD | 0 | 2 | 7 | 6 |
| Performance | GOOD | 0 | 0 | 2 | 3 |
| **Total** | **GOOD** | **0** | **3** | **11** | **15** |

---

## Agent Team Results

### Agent 1: Architect

**Files:** `types/customs.ts`, `routes.ts`, `lib/customs-utils.ts`, `lib/order-sync.server.ts`

| Check | Status | Notes |
|-------|--------|-------|
| FeeBreakdown type | PASS | `{ supply, vat, total }` spec 일치 |
| CustomsListItem | PASS | 4x fee + shipping join 포함 |
| CustomsDetail | PASS | 상세 JOIN 확장 (shipping + pi) |
| SourceShipping / AvailableShipping | PASS | eta 추가 (enhancement) |
| Route structure (4-route CRUD) | PASS | customs, customs/new, customs/:id, customs/:id/edit |
| calcTotalFees | PASS | 4-fee 합산 정상 |
| computeFeeTotal | PASS | `Math.round((supply+vat)*100)/100` |
| unlinkCustomsFromOrder | PASS | customs_id=null, customs_fee_received=null |
| No status column (fee_received 기반) | PASS | |
| Shipping:Customs 1:1 enforcement | PASS | FormLoader 필터링 + Create 중복체크 |
| from_shipping prefill flow | PASS | UUID 검증 + available 목록 매칭 |

**Minor Deviations (Justified):**
- `customs_fee_received: null` (spec: `false`) - null이 의미론적으로 더 정확
- `update`+`update_fees` 통합 - 별도 intent 대신 단일 update action으로 간소화

---

### Agent 2: Backend Dev

**Files:** `loaders/customs.schema.ts`, `loaders/customs.server.ts`, `loaders/customs.$id.server.ts`

| Check | Status | Notes |
|-------|--------|-------|
| feeBreakdownSchema | PASS | supply/vat min(0) max(999M) |
| customsCreateSchema | PASS | shipping_doc_id UUID + fee flat fields |
| customsUpdateSchema | PASS | shipping_doc_id 제외, all optional |
| List loader auth | PASS | requireGVUser |
| List loader fee_received filter | PASS | all/not_received/received |
| List loader deleted_at filter | PASS | .is("deleted_at", null) |
| FormLoader available shippings | PASS | 중복 제거 필터링 |
| FormLoader from_shipping prefill | PASS | UUID safeParse |
| Create duplicate check | PASS | 동일 shipping_doc_id 차단 |
| Create shipping existence check | PASS | 삭제된 shipping 차단 |
| Create fee total recomputation | PASS | computeFeeTotal 서버 재계산 |
| Create linkCustomsToOrder | PASS | insert 후 호출 |
| Detail loader UUID validation | PASS | z.string().uuid() |
| Detail loader Promise.all | PASS | data + content 병렬 |
| Edit loader (lighter) | PASS | content/availableShippings 불필요 |
| Action: update | PASS | basic info + fees 통합 |
| Action: toggle_fee_received | PASS | DB 현재값 읽기 후 반전 |
| Action: delete | PASS | unlinkCustomsFromOrder 먼저 |
| Action: content_* | PASS | handleContentAction 위임 |
| Pattern: data() helper | PASS | Response.json() 미사용 |
| Pattern: responseHeaders | PASS | 모든 data()/redirect()에 전달 |
| Pattern: AppLoadContext | PASS | Route.LoaderArgs 미사용 |

**Issue Found:**
- **[MEDIUM] 서버사이드 검색 미구현**: spec의 "검색: customs_no, ci_no" 기능이 서버 loader에 없음. 현재 클라이언트 사이드 필터링으로 대체됨. 데이터 규모가 작아 당장 문제 없으나, spec과 불일치.

---

### Agent 3: Frontend Dev

**Files:** 모든 route/component 파일 (8개) + cross-module (2개)

| Check | Status | Notes |
|-------|--------|-------|
| List: header/tabs/search | PASS | 전체/미수령/수령완료 탭, 검색 placeholder |
| List: desktop table | PASS | 9열 (선박명 추가 = enhancement) |
| List: mobile cards | PASS | md:hidden 패턴 |
| List: FeeReceivedBadge | PASS | green/outline |
| Create page | PASS | backTo, PageContainer, CustomsForm |
| CustomsForm layout | PASS | md:grid-cols-2 |
| CustomsForm isEditing | PASS | _action dynamic |
| CustomsFeeInput | PASS | supply/vat -> total auto-calc |
| Detail: sections | PASS | Info + Fee Summary + Content + Meta |
| Detail: toast feedback | PASS | useEffect + prevStateRef |
| Detail: delete dialog | PASS | AlertDialog |
| DetailInfo card | PASS | toggle, shipping link |
| FeeSummary grid | PASS | grid-cols-2 md:grid-cols-4 |
| Edit page | PASS | isEditing=true, prefilled |
| Shipping cross-link | PASS | "통관 생성" dropdown item |
| Order cross-link | PASS | getLink returns /customs/{id} |
| Korean labels | PASS | 전체 일치 |

**Issues Found:**

1. **[HIGH] 탭 카운트 부정확 (BUG)**
   - `_layout.customs.tsx`: counts가 서버 필터링된 `customs` 배열에서 계산됨
   - "미수령" 탭 선택 시 "수령완료" 카운트가 0으로 표시
   - **Fix**: 서버에서 전체 데이터 반환 + 클라이언트 필터링, 또는 서버에서 별도 카운트 반환

2. **[MEDIUM] Clone 기능 미구현**
   - brainstorming spec에 "복제" 언급되어 있으나 구현되지 않음
   - 우선순위 낮음 (polish 단계에서 추가 가능)

3. **[LOW] Order doc links customs enabled: false**
   - 수동 customs 연결이 Order에서 불가 (auto-sync만 동작)
   - 의도적 설계이나, 수동 연결 시나리오에서 제한

4. **[LOW] Desktop table에 "선박명" 추가 (spec 대비)**
   - Enhancement로 인정, 문제 아님

---

### Agent 4: Security Reviewer

**Files:** loaders + schema + order-sync

| Check | Status | Notes |
|-------|--------|-------|
| All loaders/actions: requireGVUser | PASS | |
| Non-GV redirect to /saelim/delivery | PASS | |
| Anon key (no service role key) | PASS | |
| URL param UUID validation | PASS | safeParse |
| shipping_doc_id UUID validation | PASS | |
| Fee JSONB server validation | PASS | feeBreakdownSchema fields |
| Fee total server recomputation | PASS | 클라이언트 값 무시 |
| customs_no max(50) | PASS | |
| etc_desc max(500) | PASS | |
| Shipping existence + not-deleted check | PASS | |
| Duplicate shipping_doc_id check | PASS | |
| fee_received: DB read then invert | PASS | |
| Delete: unlink before soft delete | PASS | |
| responseHeaders all paths | PASS | |
| Supabase cookie pattern | PASS | |
| No hardcoded keys | PASS | |
| Non-UUID params → 404/400 | PASS | |
| Deleted record → 404 | PASS | |
| Unknown _action → 400 | PASS | |

**Issues Found:**

1. **[LOW] Date validation - 의미론적 검증 부재**
   - `/^\d{4}-\d{2}-\d{2}$/` regex는 `2024-13-45` 같은 무효 날짜 통과
   - DB `date` 컬럼이면 Postgres가 거부하지만 에러 메시지가 generic
   - **Fix**: `.refine(val => !val || !isNaN(Date.parse(val)))` 추가 권장

2. **[LOW] order-sync silent failure**
   - `unlinkCustomsFromOrder` 실패 시 console.error만 출력, caller에게 미전달
   - delete 시 unlink 실패해도 customs soft-delete 진행 → stale FK 가능
   - 현재 프로젝트 전체 sync 패턴이 non-blocking이므로 일관성 있으나, 문서화 필요

**Supabase MCP 미확인 항목 (수동 확인 필요):**
```sql
-- RLS 정책 확인
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'customs';

-- 인덱스 확인
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename IN ('customs', 'orders') AND indexname LIKE 'idx_%';

-- 컬럼 타입 확인 (customs_date: date vs text)
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'customs' ORDER BY ordinal_position;
```

---

### Agent 5: Code Reviewer

**Overall Rating: GOOD**

| Category | Status | Count |
|----------|--------|-------|
| TypeScript Strictness | PASS | No `any`, proper FK casting |
| Pattern Consistency | PASS | data(), responseHeaders, AppLoadContext |
| React Patterns | PASS | useEffect+prevStateRef, useMemo |
| Error Handling | WARN | customsFormLoader silent failure |
| Responsive Design | PASS | md:hidden / hidden md:block |
| Korean UI Text | PASS | 전체 한국어 |

**Key Findings:**

1. **[HIGH] `feeBreakdownSchema` dead export** - 정의되어 있으나 어디서도 import되지 않음
2. **[HIGH] `unlinkCustomsFromOrder` 에러 미확인** - delete 전 unlink 실패 시 soft-delete 계속 진행
3. **[MEDIUM] `customsFormLoader` Supabase 에러 무시** - allDocs/usedDocs 쿼리 실패 시 빈 배열 반환, 에러 표시 없음
4. **[MEDIUM] 중복 포맷터** - `Intl.NumberFormat` 3곳 별도 인스턴스화 (`customs-form.tsx`, `customs-fee-input.tsx`, `customs-fee-summary.tsx`). `formatCurrency` 공유 유틸 사용 권장
5. **[MEDIUM] `customsUpdateSchema` 텍스트 필드 중복** - `customsCreateSchema`와 중복. base schema 추출 가능
6. **[MEDIUM] `LoaderData` 인터페이스 drift risk** - Route 파일마다 로컬 정의. 서버 반환 타입 변경 시 동기화 필요
7. **[LOW] `computeFeeTotal` KRW 반올림** - `*100/100`은 소수점 2자리용. KRW는 정수 → `Math.round(supply+vat)` 충분
8. **[LOW] `sm:` breakpoint 사용** - search input에서 `sm:w-72` 사용. 프로젝트 표준은 `md:` breakpoint

---

### Agent 6: Performance Analyzer

**Overall Rating: GOOD**

| Operation | Target | Actual | Status |
|-----------|--------|--------|--------|
| List (1 JOIN, 100 rows) | < 30ms | 0.113ms (DB) | OK |
| Detail (2 JOINs, 1 row) | < 15ms | 0.141ms (DB) | OK |
| FormLoader (2 queries) | < 30ms | ~0.195ms (DB) | OK |
| Create (3 queries) | < 100ms | ~30-60ms (RTT) | OK |
| fee_received toggle | < 50ms | ~20-40ms (RTT) | OK |
| Fee calc (client) | < 1ms | negligible | OK |

**Supabase EXPLAIN ANALYZE 결과:**
- List: `Index Scan using idx_customs_deleted_at` → optimal
- Detail: `Nested Loop → PK Index Scan` x3 → optimal
- syncCustomsFeeToOrder: `Index Scan using idx_orders_customs_id` → optimal
- linkCustomsToOrder: `idx_orders_customs_id` 사용 후 `shipping_doc_id` post-filter → **suboptimal**

**Issues Found:**

1. **[MEDIUM] `orders.shipping_doc_id` 인덱스 부재**
   - `linkCustomsToOrder`가 `customs_id IS NULL`인 모든 order 스캔 후 `shipping_doc_id` 필터
   - 현재 데이터 소량으로 문제 없으나, 200+ orders에서 성능 저하
   - **Fix**: `CREATE INDEX idx_orders_shipping_doc_id ON orders (shipping_doc_id) WHERE deleted_at IS NULL;`

2. **[MEDIUM] Create action 3 sequential round-trips**
   - existence check → duplicate check → insert = 3회 연속 HTTP 요청
   - ~30-60ms edge RTT 오버헤드
   - **Fix (Optional)**: Supabase RPC로 3쿼리 통합 (effort: medium)

3. **[LOW] Delete action parallelization 가능**
   - `unlinkCustomsFromOrder` + soft-delete를 `Promise.all`로 병렬화 가능
   - ~10-20ms 절감

4. **[LOW] `calcTotalFees` desktop/mobile 이중 호출**
   - 양쪽 DOM 트리에서 각각 호출. `filtered` memo에 포함 권장

5. **[LOW] shipping_documents ci_date sort index 부재**
   - FormLoader의 `ORDER BY ci_date DESC`에 runtime sort 필요
   - 현재 row count에서는 무의미

**Well-Optimized:**
- idx_customs_deleted_at partial index → list query index-only
- Promise.all (detail: data+content, formLoader: allDocs+usedDocs)
- ContentEditor React.lazy
- Optimistic UI (toggle: no loader revalidation)
- Smart Placement in wrangler.jsonc
- useMemo on filtered/counts

---

## Consolidated Issue List (Priority Order)

### HIGH (3건)

| # | Source | Issue | Fix |
|---|--------|-------|-----|
| H1 | Frontend | **탭 카운트 BUG**: 서버 필터링된 배열에서 카운트 계산 → 비활성 탭 카운트 0 | 서버에서 전체 반환 + 클라이언트 필터링, 또는 서버 카운트 별도 반환 |
| H2 | Code Review | **feeBreakdownSchema dead export**: 정의만 있고 미사용 | 제거 또는 서버 validation에 활용 |
| H3 | Code Review | **unlinkCustomsFromOrder 에러 미확인**: delete 시 unlink 실패해도 진행 | 반환값 확인 후 실패 시 500 반환 |

### MEDIUM (11건)

| # | Source | Issue | Fix |
|---|--------|-------|-----|
| M1 | Backend | 서버사이드 검색 미구현 (spec 불일치) | `q` param + `.or()` 필터 추가 |
| M2 | Frontend | Clone 기능 미구현 (spec 언급) | polish 단계 추가 |
| M3 | Performance | `orders.shipping_doc_id` 인덱스 부재 | `CREATE INDEX` migration |
| M4 | Performance | Create action 3 sequential round-trips | RPC 통합 (optional) |
| M5 | Code Review | customsFormLoader Supabase 에러 무시 | error 체크 추가 |
| M6 | Code Review | Intl.NumberFormat 3곳 중복 | formatCurrency 공유 유틸 사용 |
| M7 | Code Review | customsUpdateSchema 텍스트 필드 중복 | base schema 추출 |
| M8 | Code Review | LoaderData 인터페이스 drift risk | 서버 타입 변경 시 동기화 주의 |
| M9 | Code Review | Fee total calculation 이중 소유 | 단일 source of truth 권장 |
| M10 | Code Review | sm: breakpoint 비일관 | md: 로 통일 |
| M11 | Frontend | Order doc-links customs enabled:false | auto-sync 외 수동 연결 불가 |

### LOW (15건)

| # | Source | Issue |
|---|--------|-------|
| L1 | Security | Date regex 의미론적 검증 부재 (`.refine()` 추가 권장) |
| L2 | Security | order-sync silent failure 문서화 필요 |
| L3 | Performance | Delete action parallelization (Promise.all) |
| L4 | Performance | calcTotalFees 이중 호출 (desktop/mobile) |
| L5 | Performance | shipping_documents ci_date sort index |
| L6 | Code Review | computeFeeTotal KRW 반올림 과잉 (`*100/100`) |
| L7 | Code Review | params.id optional type convention |
| L8 | Code Review | existence-check에서 fee_received 불필요 fetch |
| L9 | Code Review | Detail page title fallback (CI번호 활용 가능) |
| L10 | Architect | customs_fee_received null vs false (의미론적 개선) |
| L11 | Architect | update/update_fees 통합 (설계 간소화) |
| L12 | Frontend | Desktop table 선박명 추가 (enhancement) |
| L13 | Code Review | customsFormLoader allDocs cast 주석 부재 |
| L14 | Frontend | Intl.NumberFormat render path 재생성 |
| L15 | Code Review | Fee input Number(e.target.value) double total calc |

---

## Supabase MCP Action Items

Security Reviewer에서 MCP 권한 제한으로 미확인된 항목:

### 수동 확인 필요 (Supabase Dashboard 또는 MCP)
```sql
-- 1. RLS 정책 확인
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'customs';
-- Expected: gv_all policy, no Saelim access

-- 2. 인덱스 확인
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename IN ('customs', 'orders') AND indexname LIKE 'idx_%';
-- Expected: idx_customs_deleted_at, idx_orders_customs_id

-- 3. customs_date 컬럼 타입 확인
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'customs' AND column_name = 'customs_date';
-- date 타입이면 DB 레벨 날짜 검증 가능
```

### 신규 Migration 권장
```sql
-- M3: orders.shipping_doc_id 인덱스 (MEDIUM priority)
CREATE INDEX idx_orders_shipping_doc_id
ON public.orders (shipping_doc_id)
WHERE deleted_at IS NULL;
```

---

## Recommendations Summary

### Immediate (Phase 7 완료 전)
1. **H1 Fix**: 탭 카운트 버그 수정 (서버에서 전체 데이터 반환 방식 권장)
2. **H2 Fix**: `feeBreakdownSchema` 미사용 export 제거
3. **M3 Fix**: `idx_orders_shipping_doc_id` 인덱스 추가

### Short-term (Phase 8 시작 전)
4. **H3**: unlinkCustomsFromOrder 에러 핸들링 강화
5. **M5**: customsFormLoader 에러 처리 추가
6. **M6**: formatCurrency 공유 유틸 통일
7. **L1**: Date schema `.refine()` 추가

### Deferred (Polish/QA)
8. **M1**: 서버사이드 검색 (데이터 증가 시)
9. **M2**: Clone 기능
10. **M4**: Create RPC 통합 (성능 최적화)
11. 기타 LOW 항목

---

## Conclusion

Phase 7 Customs 모듈은 브레인스토밍 설계를 충실히 구현.
Architecture/Backend/Security 모두 PASS. Frontend에서 탭 카운트 BUG 1건 발견.
Code Quality GOOD (포맷터 중복, dead export 등 개선 가능).
Performance GOOD (모든 쿼리 index-driven, target 내 동작).

**치명적 결함: 0건 | 즉시 수정 권장: 3건 (H1, H2, M3)**
