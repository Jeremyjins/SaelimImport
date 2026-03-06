# Phase 6: Order Management - 구현검증 분석 보고서

**Date:** 2026-03-06
**Status:** 분석 완료
**Scope:** Phase 6-A, 6-B, 6-C 전체 검증

---

## 에이전트 팀 구성

| # | Role | 분석 범위 | 파일 소유권 |
|---|------|----------|------------|
| 1 | **Architect** | 타입/스키마/라우트/DB 정합성 | `order.ts`, `orders.schema.ts`, `routes.ts`, `database.ts` |
| 2 | **Backend Dev** | 로더/액션/sync 헬퍼 코드 검증 | `orders.server.ts`, `orders.$id.server.ts`, `order-sync.server.ts` |
| 3 | **Frontend Dev** | UI 컴포넌트/페이지 스펙 대비 검증 | `_layout.orders.tsx`, `_layout.orders.$id.tsx`, `order-*.tsx` 5개 |
| 4 | **Security Reviewer** | RLS/인증/입력검증/마진노출 보안 감사 | 전체 (읽기 전용) |
| 5 | **Code Reviewer** | 코드 품질/패턴 일관성/TypeScript | 전체 (읽기 전용) |

**제외:** Tester (테스트 파일 없음), Perf-analyzer (시기상조), Researcher (구현 검증 단계)

---

## 종합 평가

### 전체 결과: PASS (조건부)

Phase 6 코드는 브레인스토밍 스펙과 높은 정합성을 보이며, 기존 프로젝트 패턴(auth, data helper, responseHeaders, content system, FK cast)을 정확히 따르고 있음. **Critical 이슈 없음**. Phase 7/8 통합 전 수정이 필요한 High 이슈 2건과 Medium 이슈 3건이 존재.

### 검증 파일 목록 (12개)

| 파일 | Phase | 역할 |
|------|-------|------|
| `app/types/order.ts` | 6-A | 타입 정의 |
| `app/loaders/orders.schema.ts` | 6-A | Zod 스키마 |
| `app/loaders/orders.server.ts` | 6-A | 목록 loader + create action |
| `app/lib/order-sync.server.ts` | 6-A/C | cross-module sync 헬퍼 |
| `app/components/orders/order-cy-warning.tsx` | 6-A | CY 경고 배지 |
| `app/components/orders/order-create-dialog.tsx` | 6-A | 생성 다이얼로그 |
| `app/routes/_layout.orders.tsx` | 6-A | 목록 페이지 |
| `app/loaders/orders.$id.server.ts` | 6-B | 상세 loader + 7개 action |
| `app/components/orders/order-date-timeline.tsx` | 6-B | 날짜 타임라인 |
| `app/components/orders/order-doc-links.tsx` | 6-B | 문서 링크 카드 |
| `app/components/orders/order-inline-fields.tsx` | 6-B | Inline 수정 |
| `app/routes/_layout.orders.$id.tsx` | 6-B | 상세 페이지 |

---

## 이슈 목록 (심각도 순)

### HIGH (2건) - Phase 7/8 통합 전 수정 권장

#### H1. `order-sync.server.ts` try/catch 누락
- **파일:** `app/lib/order-sync.server.ts` (전체)
- **발견:** Backend Dev, Code Reviewer
- **설명:** 4개 sync 함수(`syncCustomsFeeToOrder`, `syncDeliveryDateToOrder`, `linkCustomsToOrder`, `linkDeliveryToOrder`) 모두 에러를 잡지 않음. 브레인스토밍에서 "best-effort 패턴: sync 실패해도 원본 CRUD 롤백 없음 (console.error만 기록)"으로 명시했으나, 실제 코드에 try/catch가 없어 sync 함수가 throw하면 호출측 액션 전체가 실패할 수 있음.
- **조치:** 각 함수에 try/catch + console.error 래핑 추가
```typescript
export async function syncCustomsFeeToOrder(supabase: SupabaseClient, customsId: string, value: boolean) {
  try {
    await supabase.from("orders").update({ customs_fee_received: value })
      .eq("customs_id", customsId).is("deleted_at", null);
  } catch (err) {
    console.error("syncCustomsFeeToOrder failed:", err);
  }
}
```

#### H2. `link_document`의 타입 캐스팅 오류
- **파일:** `app/loaders/orders.$id.server.ts:290`
- **발견:** Code Reviewer
- **설명:** `tableName as "proforma_invoices"` 캐스팅으로 테이블명이 `"customs"` 또는 `"deliveries"`일 때 Supabase 타입 추론이 잘못된 테이블 스키마를 사용하게 됨. 런타임 동작은 정상이나 타입 안전성 훼손.
- **조치:** `doc_type` 분기별 개별 쿼리 또는 `as any` 대신 제네릭 타입 assertion 사용

---

### MEDIUM (3건) - 품질 개선 권장

#### M1. `link_document` 중복 연결 방지 누락
- **파일:** `app/loaders/orders.$id.server.ts:289-314`
- **발견:** Backend Dev, Security Reviewer
- **설명:** 대상 문서(PI/Shipping/Customs/Delivery)가 다른 활성 오더에 이미 연결되어 있는지 확인하지 않음. 동일 문서가 여러 오더에 중복 연결 가능. 브레인스토밍 SS11에서 "link 시 대상 문서 존재 + **미연결 확인**" 요구.
- **조치:**
```typescript
const { count: existingLink } = await supabase
  .from("orders")
  .select("id", { count: "exact", head: true })
  .eq(fkCol, doc_id)
  .is("deleted_at", null)
  .neq("id", id); // 현재 오더 제외
if (existingLink && existingLink > 0) {
  return data({ success: false, error: "이미 다른 오더에 연결된 서류입니다." }, { headers: responseHeaders, status: 400 });
}
```

#### M2. `cascadeLink` / `cascadeLinkPartial` 코드 중복
- **파일:** `app/loaders/orders.server.ts:63-115` + `app/loaders/orders.$id.server.ts:44-114`
- **발견:** Code Reviewer
- **설명:** 두 파일에 거의 동일한 cascade link 로직이 중복 구현됨. 주석에도 "orders.server.ts에서 복사"라고 명시.
- **조치:** `app/lib/order-sync.server.ts`로 통합하여 `cascadeLinkFull(supabase, poId)`, `cascadeLinkPartial(supabase, order)` 함수로 export

#### M3. `availablePos` 메모리 필터링
- **파일:** `app/loaders/orders.server.ts:47-54`
- **발견:** Code Reviewer
- **설명:** PO 전체 목록을 조회 후 서버 메모리에서 필터링. PO 수가 증가하면 불필요한 데이터 전송.
- **조치:** DB 쿼리 레벨에서 `.not("id", "in", usedPoIds)` 필터 적용 (빈 배열 처리 주의)

---

### LOW (7건) - 선택적 개선

| # | 파일:라인 | 설명 | 발견자 |
|---|----------|------|--------|
| L1 | `orders.$id.server.ts:348-358` | `refresh_links` 이중 캐스팅 및 객체 재구성 중복 | Code Reviewer |
| L2 | `orders.$id.tsx:68` | `fetcher.formData as unknown as FormData` 불필요한 이중 캐스팅 | Code Reviewer, Frontend Dev |
| L3 | `order-date-timeline.tsx:64,88` | `key={i}` 인덱스 key → `key={step.label}` 권장 | Code Reviewer |
| L4 | `order-doc-links.tsx:63-78` | "미구현" 버튼 텍스트 프로덕션 UI 노출 (Phase 7/8 전까지) | Code Reviewer |
| L5 | `order-cy-warning.tsx:49` | `warning` variant `"default"` vs amber class 충돌 가능성 | Code Reviewer |
| L6 | `orders.schema.ts:10-12` | date 형식만 검증, 실제 날짜 유효성 미검증 (`9999-13-99` 통과) | Security Reviewer |
| L7 | `order-doc-links.tsx:92-131` | UUID 직접 입력 방식 UX (향후 Select/검색 개선 권장) | Frontend Dev |

---

### INFO (경미한 불일치)

| # | 항목 | 기대 (스펙) | 실제 (코드) | 판정 |
|---|------|-----------|-----------|------|
| I1 | Desktop 테이블 7열 | "통관비" | "CY" | 의도적 개선 (CY가 더 유용) |
| I2 | 타임라인 카드 제목 | "진행 현황" | "진행 타임라인" | 의미 동일 |
| I3 | CY ok 표시 | "CY 체류 N일" | "CY N일 (14일 중)" | 코드가 더 정보적 |

---

## 팀원별 검증 결과 요약

### Architect
- **결과:** 전체 PASS
- 타입 9종 모두 스펙 일치, Zod 스키마 4종 일치, 라우트 설정 정확
- `database.ts` orders 테이블 정의 완전 (status, FK 5개, soft delete)
- Supabase DB 직접 확인: SKIP (MCP 권한 오류)

### Backend Dev
- **결과:** 대부분 PASS, 이슈 2건 (H1, M1)
- orders.server.ts: 5개 FK JOIN, cascadeLink Exactly-1 Rule, create action 모두 정확
- orders.$id.server.ts: 7개 action 모두 스펙 일치, UUID 검증 양쪽 적용
- order-sync.server.ts: 4개 함수 존재, Exactly-1 안전장치 적용 (try/catch 누락)
- Supabase DB 직접 확인: SKIP (MCP 권한 오류)

### Frontend Dev
- **결과:** 대부분 PASS, 경미한 이슈
- 목록 페이지: Tabs, 검색, Desktop 테이블, Mobile 카드, CY 배지 모두 구현
- 상세 페이지: Header, Timeline, DocLinks, InlineFields, Content, Toast 모두 구현
- 5개 컴포넌트 모두 스펙 일치, 반응형 올바름
- Icons 5개 추가 확인
- 한국어 레이블 대부분 일치 (I1~I3 경미한 차이)

### Security Reviewer
- **결과:** PASS (Medium 1건)
- 인증: requireGVUser 전체 적용, Saelim 유저 차단 확인
- 입력 검증: UUID, enum, ISO date 검증 모두 적용
- 마진 노출: amount만 포함, 단가/마진율/라인아이템 미포함
- SQL 인젝션: Zod enum → tableMap 매핑, PostgREST ORM 사용
- 미구현: link 시 중복 연결 방지 (M1)
- DB RLS 직접 확인 불가 (MCP 권한)

### Code Reviewer
- **결과:** 전반적 양호, High 2건 + Medium 3건
- 패턴 일관성: 기존 프로젝트 패턴 높은 정확도로 따름
- TypeScript: `any` 없음, Zod infer 활용 (타입 캐스팅 이슈 H2)
- React: 의존성 배열 정확, toast 패턴 올바름 (경미한 key 이슈)
- 코드 스멜: cascadeLink 중복(M2), tableMap 위치, 주석 오해 가능성
- Tailwind: mobile-first 패턴, 색상 토큰 일관성 양호

---

## Supabase DB 수동 확인 필요 항목

MCP 권한 오류로 DB 직접 확인이 불가했으므로, Supabase Dashboard에서 수동 확인 필요:

```sql
-- 1. orders 테이블 컬럼 (status 컬럼 존재 + DEFAULT 확인)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'orders' ORDER BY ordinal_position;

-- 2. RLS 정책 (gv_all 정책 존재 확인)
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'orders';

-- 3. 인덱스 (partial unique index 확인)
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'orders';

-- 4. 제약조건 (FK ON DELETE SET NULL 확인)
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'orders'::regclass;

-- 5. contents.type CHECK에 'order' 포함 확인
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'contents'::regclass AND contype = 'c';
```

---

## 권장 조치 우선순위

### 즉시 (Phase 7 시작 전)
1. **H1** - `order-sync.server.ts` 4개 함수에 try/catch + console.error 추가
2. **M1** - `link_document` 중복 연결 방지 로직 추가
3. **DB 확인** - Supabase Dashboard에서 RLS/인덱스/제약조건 수동 확인

### Phase 7/8 통합 시
4. **H2** - `link_document`의 tableName 타입 캐스팅 개선
5. **M2** - cascadeLink 함수 통합 (`order-sync.server.ts`로 이전)
6. **M3** - availablePos DB 레벨 필터링으로 전환

### 선택적
7. L1~L7 경미한 이슈들 (코드 정리 시 함께 처리)

---

## 브레인스토밍 대비 구현 완료율

| Sub-phase | 계획 항목 | 구현 완료 | 완료율 |
|-----------|----------|----------|--------|
| 6-A (목록+생성) | 10 Tasks | 10/10 | 100% |
| 6-B (상세+수정+링크) | 7 Tasks | 7/7 | 100% |
| 6-C (Cross-Module Sync) | 3 Tasks | 3/3 | 100% |
| **전체** | **20 Tasks** | **20/20** | **100%** |

**보안 체크리스트 (SS11):**
- DB 사전 작업: 6/6 계획 (수동 확인 필요)
- 애플리케이션 보안: 7/8 구현 (M1 미구현)

---

*분석 완료. Critical 이슈 없음. Phase 7 진행 가능 (H1, M1 수정 후).*
