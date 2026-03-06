# Phase 5: Shipping Documents — 구현 검증 분석 보고서

**Date:** 2026-03-06
**Status:** 분석 완료
**Scope:** Phase 5-A (목록+작성), 5-B (상세+수정+크로스모듈), 5-C (스터핑+CSV)

---

## Agent Team 구성

| # | Role | 분석 범위 | 결과 |
|---|------|-----------|------|
| 1 | **Architect** | 라우트, 데이터플로우, 타입, 스터핑 아키텍처 | 5 WARN |
| 2 | **Backend Dev** | 서버 로직, DB 스키마, Supabase MCP | 1 FAIL, 5 WARN |
| 3 | **Frontend Dev** | UI 컴포넌트, 반응형, 한국어 라벨, 패턴 일관성 | 5 WARN |
| 4 | **Security Reviewer** | RLS, 입력검증, CSV 보안, 인가 | 4 CRITICAL, 3 HIGH, 3 MEDIUM, 2 LOW |
| 5 | **Code Reviewer** | 코드 품질, 중복, 네이밍, 패턴 일관성 | 2 MUST-FIX, 6 SHOULD-FIX, 4 NIT |
| 6 | **Perf Analyzer** | 쿼리 성능, 번들, 인덱스, Edge | 1 FAIL, 5 WARN |

**참고:** Supabase MCP 접근이 차단되어 DB 직접 검증(RLS 정책, 인덱스, UNIQUE 제약조건)은 불가했음. 대시보드에서 수동 확인 필요.

---

## 전체 평가 요약

| 카테고리 | 평가 | 비고 |
|----------|------|------|
| 라우트 구조 | **PASS** | 4개 라우트 올바르게 정의 |
| 파일 구조 | **PASS** | 19/20 파일 생성 (csv-parser.ts 인라인화 — 적절) |
| 서버/클라이언트 분리 | **PASS** | 모든 서버 코드 `.server.ts`, re-export 패턴 |
| 인증/인가 | **PASS** | 모든 loader/action에 `requireGVUser` |
| 데이터 검증 | **PASS** | Zod, UUID, 서버사이드 amount 재계산 |
| 크로스모듈 | **PASS** | PI→Shipping 프리필, Shipping→Delivery 링크 |
| 문서번호 | **PASS** | CI RPC + GVPL 치환 |
| 타입 정의 | **PASS** | 7개 타입 모두 존재 |
| 스터핑 CRUD | **PASS** | create/update/delete/csv + recalcWeights |
| 한국어 라벨 | **PASS** | 누락/불일치 없음 |
| 반응형 | **PASS** | md: 브레이크포인트 일관 적용 |
| 코드 품질 | **8.0/10** | 높은 패턴 일관성, 일부 중복/정리 필요 |

---

## 발견 사항 (심각도순)

### CRITICAL (즉시 수정 필요)

#### C-1. 스터핑 CRUD에 complete 상태 차단 누락
- **발견:** Architect, Backend, Security
- **위치:** `app/loaders/shipping.$id.server.ts:209-225`
- **내용:** `update` intent는 `complete` 상태를 차단하지만, `stuffing_create`, `stuffing_update`, `stuffing_delete`, `stuffing_csv` 4개 intent는 차단하지 않음
- **영향:** 완료된 선적서류의 컨테이너/롤 데이터가 변경 가능 → 중량/포장수 변경 → 비즈니스 무결성 훼손
- **수정:** `docCheck.status === "complete"` 시 400 반환 로직을 스터핑 블록 진입 시점(L224 이후)에 추가

#### C-2. `stuffing_delete` hard delete 사용
- **발견:** Architect, Backend, Security, Code Reviewer
- **위치:** `app/loaders/shipping.$id.server.ts:390-394`
- **내용:** `.delete()` 호출로 영구 삭제. 프로젝트 전체가 soft delete 패턴(`deleted_at` update)
- **영향:** 감사 추적(audit trail) 불가, 패턴 일관성 위반
- **수정:** `.update({ deleted_at: new Date().toISOString() })` + `.eq("shipping_doc_id", id)` 로 변경

#### C-3. `delete` action에 complete 상태 차단 누락
- **발견:** Backend, Security
- **위치:** `app/loaders/shipping.$id.server.ts:666-687`
- **내용:** `update`는 complete 차단하지만 `delete`는 미차단. 브레인스토밍 보안 체크리스트에서 "Block edit AND delete" 명시
- **영향:** 완료된 선적서류 삭제 가능
- **수정:** delete intent 진입 시 status 조회 + complete 시 400 반환

#### C-4. `saelim_read` RLS 정책의 pricing 노출 (DB 확인 필요)
- **발견:** Security
- **위치:** Supabase `shipping_documents` RLS 정책
- **내용:** `saelim_read`가 `amount`, `details` (unit_price 포함) 컬럼에 SELECT 허용 가능
- **영향:** Saelim 사용자가 직접 Supabase 쿼리로 GV 가격 정보 열람 가능
- **수정:** Phase 8 전 반드시 안전 컬럼만 노출하는 VIEW 기반 정책으로 변경. 대시보드에서 현재 정책 확인 우선

---

### HIGH (수정 권장)

#### H-1. `update` action에 `pi_id` 활성 검증 누락
- **발견:** Architect, Backend, Security
- **위치:** `app/loaders/shipping.$id.server.ts:559-616`
- **내용:** create에는 pi_id 존재/활성 검증이 있으나, update에는 org 검증만 있고 pi_id 검증 없음
- **영향:** soft-deleted PI에 링크하는 dangling reference 가능
- **수정:** create의 pi_id 검증 패턴을 update에도 추가 (guarded by `if (resolvedPiId)`)

#### H-2. CSV `append` 모드 병합 후 롤 수 상한 미검증
- **발견:** Security
- **위치:** `app/loaders/shipping.$id.server.ts:443-456`
- **내용:** 수신 CSV는 `.max(500)` Zod 제한이 있으나, 기존 롤과 병합 후 총 수 검증 없음
- **영향:** JSONB 페이로드 무한 증가 가능 (490 기존 + 500 추가 = 990)
- **수정:** 병합 후 `finalRolls.length > 500` 시 400 반환

#### H-3. `clone` action이 원본 `amount` 복사 (재계산 미수행)
- **발견:** Security
- **위치:** `app/loaders/shipping.$id.server.ts:753`
- **내용:** 원본의 `amount`를 그대로 복제. 서버사이드 재계산 원칙 위반
- **수정:** `details`에서 `totalAmount` 재계산 후 저장

#### H-4. Delivery link가 update 시 pi_id 변경을 반영 안 함
- **발견:** Architect
- **위치:** `app/loaders/shipping.$id.server.ts:493-663`
- **내용:** 생성 시 delivery link, 삭제 시 unlink하지만, update에서 pi_id 변경 시 link 미갱신
- **영향:** stale `deliveries.shipping_doc_id` reference
- **수정:** update에서 old/new pi_id 비교, 변경 시 old unlink + new link

#### H-5. `recalcWeightsFromStuffing` 에러 무시
- **발견:** Code Reviewer
- **위치:** `app/loaders/shipping.$id.server.ts:145-177`
- **내용:** DB 업데이트 실패 시 반환값 미확인. 중량값이 틀린 채로 유지 가능
- **수정:** 에러 반환 처리 또는 "실패해도 무시 가능" 의도를 주석으로 명시

---

### MEDIUM (개선 권장)

#### M-1. CSV 파일 magic-byte 검증 없음
- **발견:** Security
- **위치:** `app/components/shipping/stuffing-csv-upload.tsx:200-203`
- **내용:** .csv 확장자만 검증. PDF/ZIP magic byte 거부 없음 (브레인스토밍 보안 체크리스트에 명시)
- **수정:** `file.slice(0, 4).arrayBuffer()`로 첫 4바이트 확인, `%PDF`/`PK` 거부

#### M-2. `stuffingListSchema`에 수식 인젝션 방지 미적용
- **발견:** Backend, Security
- **위치:** `app/loaders/shipping.schema.ts:26-31`
- **내용:** `sl_no`, `cntr_no`, `seal_no`에 `sanitizeFormulaInjection` transform 없음
- **영향:** Phase 9 CSV/PDF export 시 인젝션 위험
- **수정:** 세 필드에 `.transform(sanitizeFormulaInjection)` 추가

#### M-3. `sanitizeFormulaInjection` 함수 중복 정의
- **발견:** Architect, Code Reviewer
- **위치:** `app/loaders/shipping.schema.ts:8` + `app/components/shipping/stuffing-csv-upload.tsx:21`
- **수정:** `app/lib/sanitize.ts`로 추출

#### M-4. `formatWeight` 함수 3곳 중복 정의
- **발견:** Frontend, Code Reviewer
- **위치:** `stuffing-section.tsx:15`, `stuffing-container-card.tsx:38`, `shipping-weight-summary.tsx`
- **내용:** `~/lib/format.ts`에 이미 존재하는 함수를 재정의
- **수정:** `import { formatWeight } from "~/lib/format"` 으로 교체

#### M-5. PapaParse 정적 import (번들 46KB 낭비)
- **발견:** Perf Analyzer
- **위치:** `app/components/shipping/stuffing-csv-upload.tsx:3`
- **내용:** CSV 업로드 Dialog 미사용 시에도 상세 페이지에 항상 포함
- **수정:** `StuffingCSVUpload`를 `React.lazy()` 분리 또는 `await import("papaparse")` 동적 import

#### M-6. 빈 `useEffect` + dead `onActionComplete` prop
- **발견:** Frontend, Code Reviewer
- **위치:** `stuffing-section.tsx:27-32`, `stuffing-container-card.tsx:35`
- **수정:** 빈 useEffect/prevState/fetcher 제거, onActionComplete prop 제거

#### M-7. create/update 공통 검증 로직 ~100줄 중복
- **발견:** Code Reviewer
- **위치:** `shipping.server.ts:237-262` ↔ `shipping.$id.server.ts:559-624`
- **수정:** `validateAndRecalcShippingDetails()` 공유 헬퍼 추출

---

### LOW (참고)

#### L-1. `stuffing_lists` RLS 정책 실제 상태 미확인
- **발견:** Security
- **내용:** 문서상 `gv_all` 정책 확인됨이나 MCP 차단으로 live DB 미검증
- **대응:** Supabase 대시보드에서 수동 확인 필요

#### L-2. `ci_no`/`pl_no` UNIQUE 제약조건 미확인
- **발견:** Backend
- **내용:** 코드에서 23505 에러 핸들링 존재하나 DB 제약조건 자체 미검증
- **대응:** Supabase 대시보드에서 수동 확인 필요

#### L-3. `lineItemSchema.product_name` 수식 인젝션 방지 없음
- **발견:** Security
- **위치:** `app/loaders/po.schema.ts:8`
- **내용:** shipping의 `stuffingRollSchema.product_name`에는 적용되었으나 공유 `lineItemSchema`에는 없음
- **영향:** Phase 9 CI/PL PDF export 시 위험

#### L-4. `roll_no` 중복 검증 없음
- **발견:** Security
- **내용:** 같은 컨테이너 내 동일 `roll_no` 허용. CSV append 시 중복 발생 가능

#### L-5. 목록 로더에 페이지네이션 없음 (장기)
- **발견:** Perf Analyzer
- **위치:** `app/loaders/shipping.server.ts:21-31`
- **내용:** 현재 데이터량에서는 문제 없으나 증가 시 대응 필요

#### L-6. `recalcWeightsFromStuffing` 2-hop 직렬 (성능)
- **발견:** Perf Analyzer
- **위치:** `app/loaders/shipping.$id.server.ts:145-177`
- **내용:** 매 스터핑 변경마다 SELECT + UPDATE 추가 왕복 (60~120ms)
- **개선:** PostgreSQL RPC로 단일 SQL 대체 가능

#### L-7. PI 상세에서 `DocStatus` shipping 타입 직접 import
- **발견:** Frontend
- **위치:** `app/routes/_layout.pi.$id.tsx:49`
- **내용:** 모듈 경계 약화 신호. `~/types/common`에서 import이 더 적절

#### L-8. 인덱스 상태 미확인
- **발견:** Perf Analyzer
- **내용:** `shipping_documents(deleted_at, ci_date, pi_id)`, `stuffing_lists(shipping_doc_id, deleted_at)` 인덱스 존재 여부 미확인
- **대응:** Supabase 대시보드에서 `pg_indexes` 쿼리 실행

---

## Supabase 대시보드 수동 확인 필요 항목

MCP 접근 차단으로 아래 항목은 Supabase SQL Editor에서 직접 확인 필요:

```sql
-- 1. RLS 정책 확인
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN ('shipping_documents', 'stuffing_lists');

-- 2. UNIQUE 제약조건 확인
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'shipping_documents'::regclass AND contype = 'u';

-- 3. 인덱스 확인
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('shipping_documents', 'stuffing_lists')
ORDER BY tablename, indexname;

-- 4. stuffing_lists 컬럼 확인 (deleted_at, created_by)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'stuffing_lists'
ORDER BY ordinal_position;

-- 5. generate_doc_number RPC가 'CI' 지원하는지
SELECT prosrc FROM pg_proc WHERE proname = 'generate_doc_number';
```

---

## 수정 우선순위 로드맵

### 즉시 수정 (Phase 6 시작 전)
1. **C-1** 스터핑 CRUD complete 상태 차단
2. **C-2** `stuffing_delete` soft delete 전환
3. **C-3** `delete` action complete 상태 차단
4. **H-1** update action pi_id 검증 추가
5. **H-2** CSV append 병합 후 롤 수 상한 검증
6. **H-3** clone amount 재계산

### 조기 수정 권장
7. **H-4** update 시 delivery link 갱신
8. **H-5** recalcWeights 에러 처리
9. **M-1** CSV magic-byte 검증
10. **M-2** stuffingListSchema 수식 인젝션 방지

### 코드 정리 (편의 시)
11. **M-3** sanitize 함수 통합
12. **M-4** formatWeight 중복 제거
13. **M-5** PapaParse lazy import
14. **M-6** dead code 제거 (빈 useEffect, unused prop)
15. **M-7** 공통 검증 헬퍼 추출

### Phase 8 전 필수
16. **C-4** saelim_read RLS pricing 노출 수정

### 장기 개선
17. **L-5** 목록 페이지네이션
18. **L-6** recalcWeights PostgreSQL RPC 전환
19. **L-8** 인덱스 최적화

---

## 파일별 수정 필요 매핑

| 파일 | 수정 항목 |
|------|-----------|
| `app/loaders/shipping.$id.server.ts` | C-1, C-2, C-3, H-1, H-2, H-3, H-4, H-5, M-7 |
| `app/loaders/shipping.schema.ts` | M-2, M-3 |
| `app/loaders/shipping.server.ts` | M-7 |
| `app/components/shipping/stuffing-csv-upload.tsx` | M-1, M-3, M-5 |
| `app/components/shipping/stuffing-section.tsx` | M-4, M-6 |
| `app/components/shipping/stuffing-container-card.tsx` | M-4, M-6 |
| `app/components/shipping/shipping-weight-summary.tsx` | M-4 |
| Supabase DB (대시보드) | C-4, L-1, L-2, L-8 |

---

## 결론

Phase 5 Shipping Documents는 **전체적으로 우수한 구현 품질**을 보여줍니다. 기존 PO/PI 모듈과의 패턴 일관성이 높고, 스터핑 리스트/CSV 업로드 같은 신규 기능도 프로젝트 컨벤션을 잘 따르고 있습니다.

**핵심 문제는 3가지:**
1. **Complete 상태 불변성 미보장** (스터핑 CRUD + delete에서 차단 누락) — 비즈니스 무결성 위협
2. **Stuffing hard delete** — 감사 추적/패턴 일관성 위반
3. **saelim_read pricing 노출** — 데이터 기밀성 위험 (DB 수준)

이 3가지를 Phase 6 시작 전에 반드시 수정하면, Phase 5는 프로덕션 수준의 안정적인 모듈이 됩니다.
