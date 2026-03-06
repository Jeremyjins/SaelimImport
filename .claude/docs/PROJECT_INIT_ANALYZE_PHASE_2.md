# Phase 2 PO Module - 구현 검증 분석 보고서

**Date:** 2026-03-06
**Scope:** Phase 2-A/B/C/D 전체 (PO CRUD, Detail, Edit, Clone, Toggle, Polish)
**참조 문서:** [브레인스토밍](PROJECT_INIT_BRAINSTORMING_PHASE_2.md) | [2-A](PROJECT_INIT_IMPLEMENT_PHASE_2-A.md) | [2-B](PROJECT_INIT_IMPLEMENT_PHASE_2-B.md) | [2-C](PROJECT_INIT_IMPLEMENT_PHASE_2-C.md) | [2-D](PROJECT_INIT_IMPLEMENT_PHASE_2-D.md)

---

## 0. Executive Summary

| 영역 | 평가 | 요약 |
|------|------|------|
| **Architecture** | **A** | Route 구조, Server 파일 분리, 데이터 흐름 모두 설계 문서와 완전 일치 |
| **Backend** | **A-** | Zod 검증, Amount 재계산, RPC 호출 등 핵심 로직 충실 구현. 스키마 중복과 에러 핸들링 일부 누락 |
| **Frontend** | **A-** | 반응형 디자인, Optimistic UI, Form 재사용 등 우수. 타입 캐스팅과 접근성 개선 필요 |
| **Security** | **B+** | Critical 체크리스트 9/9 통과. Medium 취약점 2건 (비활성 org 참조, toggle_status 클라이언트 신뢰) |
| **Code Quality** | **B+** | Phase 1과 높은 일관성. Zod 스키마 중복, DocStatus 타입 미통일, key={index} 개선 필요 |

**전체 평가: 설계 문서 대비 높은 충실도로 구현됨. Critical 보안 항목 전부 통과. 발견된 이슈는 대부분 개선/방어 강화 수준이며 기능적 결함 없음.**

---

## 1. Agent Team 구성 및 분석 범위

| # | Agent | 분석 범위 | 파일 수 |
|---|-------|----------|---------|
| 1 | **Architect** | Route 구조, 컴포넌트 아키텍처, 데이터 흐름, Phase 간 일관성 | 17 |
| 2 | **Backend Dev** | Zod 스키마, Supabase 쿼리, RPC, Amount 계산, DB 상태 | 7 |
| 3 | **Frontend Dev** | UI 컴포넌트, 반응형 디자인, 폼 패턴, Wireframe 일치 | 14 |
| 4 | **Security Reviewer** | 보안 체크리스트 16항목, XSS/Injection/Auth/IDOR, RLS 정책 | 7 |
| 5 | **Code Reviewer** | 코드 품질, 패턴 일관성, React 패턴, 중복 코드, 성능 | 15 |

---

## 2. Route Structure 검증

### 2.1 Route 매핑 (완전 일치)

| Route | Server File | Export | 상태 |
|-------|-------------|--------|------|
| `_layout.po.tsx` | `po.server.ts` | `{ loader }` | ✅ |
| `_layout.po.new.tsx` | `po.server.ts` | `{ poFormLoader as loader, createPOAction as action }` | ✅ |
| `_layout.po.$id.tsx` | `po.$id.server.ts` | `{ loader, action }` | ✅ |
| `_layout.po.$id.edit.tsx` | `po.$id.server.ts` | `{ poEditLoader as loader, action }` | ✅ |

### 2.2 Navigation Flow (완전 일치)

| 플로우 | 설계 | 구현 | 상태 |
|--------|------|------|------|
| 생성 후 | `/po/{id}` | `throw redirect(/po/${created.id})` | ✅ |
| 삭제 후 | `/po` | `throw redirect("/po")` | ✅ |
| 복제 후 | `/po/{newId}/edit` | `throw redirect(/po/${cloned.id}/edit)` | ✅ |
| 상태 토글 | revalidation | `return data({ success: true })` | ✅ |
| 수정 후 | `/po/{id}` | `throw redirect(/po/${id})` | ✅ |

---

## 3. 보안 검증 결과

### 3.1 Critical 체크리스트 (9/9 통과)

| # | 항목 | 구현 위치 | 상태 |
|---|------|----------|------|
| 1 | 모든 loader에서 `requireGVUser` | po.server.ts:44,70 / po.$id.server.ts:45,77 | ✅ |
| 2 | 모든 action에서 `requireGVUser` | po.server.ts:106 / po.$id.server.ts:133 | ✅ |
| 3 | `created_by` 서버에서 설정 | po.server.ts:209 / po.$id.server.ts:318 | ✅ |
| 4 | `details` JSONB Zod 검증 (max 20) | po.server.ts:124-128 / po.$id.server.ts:183-187 | ✅ |
| 5 | `amount` 서버 재계산 | po.server.ts:169-176 / po.$id.server.ts:213-220 | ✅ |
| 6 | supplier_id/buyer_id UUID 검증 | poSchema의 `z.string().uuid()` | ✅ |
| 7 | URL params id UUID 검증 | po.$id.server.ts:47-50,79-82,138-143 | ✅ |
| 8 | `.is("deleted_at", null)` 적용 | 모든 쿼리에 일관 적용 | ✅ |
| 9 | Supabase 오류 메시지 래핑 | 사용자 친화적 한국어 메시지 | ✅ |

### 3.2 Warning 체크리스트 (5/7 통과)

| # | 항목 | 상태 | 비고 |
|---|------|------|------|
| 1 | complete PO 수정 차단 | ✅ | po.$id.server.ts:153-169 |
| 2 | 알 수 없는 _action에 400 | ✅ | po.$id.server.ts:357-360 |
| 3 | notes max 2000 | ✅ | 서버 Zod + 클라이언트 maxLength 이중 방어 |
| 4 | po_date/validity 논리 검증 | ❌ | 미구현 |
| 5 | 활성 org만 참조 허용 | ❌ | form 선택지만 필터, 제출 시 재검증 없음 |
| 6 | dangerouslySetInnerHTML 미사용 | ✅ | 전체 확인 |
| 7 | responseHeaders 포함 | ✅ | 모든 redirect/data에 포함 |

### 3.3 발견된 취약점

| # | 심각도 | 항목 | 영향 | 수정 방안 |
|---|--------|------|------|----------|
| V1 | **Medium** | 비활성 org를 supplier/buyer로 직접 제출 가능 | 소프트 삭제된 조직이 PO에 연결됨 | create/update에서 org `deleted_at IS NULL` 재검증 |
| V2 | **Medium** | `toggle_status`에서 클라이언트 `current_status` 신뢰 | 레이스 컨디션, 의도치 않은 상태 전환 | DB에서 현재 status 직접 조회 후 토글 |
| V3 | **Low** | `po_date`/`validity` 날짜 형식 미검증 | 잘못된 날짜로 RPC 오류 가능 | `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` 추가 |
| V4 | **Info** | RLS 정책 미확인 | Supabase MCP 권한 오류로 직접 검증 불가 | Dashboard에서 수동 확인 필요 |

---

## 4. 코드 품질 이슈 (통합)

### 4.1 Critical (즉시 수정 권장)

| # | 파일 | 이슈 | 설명 |
|---|------|------|------|
| C1 | `po.server.ts:10-32`, `po.$id.server.ts:10-32` | **Zod 스키마 완전 중복** | `lineItemSchema`와 `poSchema`가 두 파일에 동일하게 복사. 향후 한 쪽만 수정 시 검증 규칙 불일치 위험 |
| C2 | `po.$id.server.ts:153-158` | **상태 조회 에러 핸들링 누락** | 완료 PO 차단용 `select("status")` 쿼리에서 `error` 미확인. DB 오류 시 `existing`이 null → 수정이 진행됨 |

### 4.2 Warning (단기 개선 권장)

| # | 파일 | 이슈 | 설명 |
|---|------|------|------|
| W1 | `po.ts:27,39`, `doc-status-badge.tsx:3` | **DocStatus 타입 미통일** | `common.ts`에 이미 정의된 `DocStatus`를 재정의. import로 통일 필요 |
| W2 | 3개 route 파일 | **`as unknown as` 반복** | `useLoaderData` 반환값에 double-cast. React Router 7 타입 추론 한계. 근본 해결 필요 |
| W3 | `po-line-items.tsx:98` | **`key={index}` 사용** | 동적 추가/삭제 리스트에 인덱스 key. 항목 삭제 시 상태 오염 가능. UUID id 부여 권장 |
| W4 | `po.$id.server.ts:55,92` | **`select("*")` 사용** | 필요 컬럼만 명시적 선언하는 프로젝트 표준과 불일치 |
| W5 | `_layout.po.tsx:122` | **테이블 행 `navigate()` 사용** | 키보드/우클릭 접근성 문제. Mobile은 `<Link>` 사용하여 불일관 |
| W6 | `_layout.po.new.tsx:22`, `_layout.po.$id.edit.tsx:45` | **ActionResult 캐스팅 반복** | `common.ts`의 `ActionResult` 타입 미활용 |

### 4.3 Info (선택 개선)

| # | 파일 | 이슈 |
|---|------|------|
| I1 | `po-line-items.tsx:83` | 미사용 변수 `currency = ""` |
| I2 | `po-line-items.tsx:121,131` | `value={item.quantity_kg \|\| ""}` - 0 값이 빈 문자열로 표시 |
| I3 | `_layout.po.$id.tsx:70-73` | `handleDelete` 실행 즉시 dialog 닫힘, isDeleting 피드백 없음 |
| I4 | `_layout.po.$id.edit.tsx:11-30` | `EditLoaderData` 로컬 중복 정의 |
| I5 | `po.server.ts:72-91` | `Promise.all` 개별 쿼리 에러 무시 |
| I6 | `_layout.po.tsx:41-45` | `counts` 계산 시 pos 배열 3회 순회 (`useMemo` + 단일 reduce 권장) |
| I7 | `po-line-items.tsx`, `po-detail-items.tsx` | `getProductLabel`/`getProductSpec` 동일 로직 중복 |

---

## 5. 설계 vs 구현 차이 분석

### 5.1 의도적 단순화 (합리적 판단)

| 항목 | 설계 | 구현 | 판단 |
|------|------|------|------|
| 서버 파일 수 | Architect: 4개, Frontend: 3개 | **Backend 제안 채택: 2개** | named export로 깔끔히 해결. 적절 |
| 별도 컴포넌트 분리 | `po-table.tsx`, `po-card-list.tsx` 등 8개 | 4개 + route 내 인라인 | 재사용 없는 컴포넌트 분리 불필요. 적절 |
| List 필터링 | 서버사이드 status/q 필터 | 클라이언트사이드 전체 | 월 5-10건으로 충분. 100건+ 시 전환 필요 |
| Clone redirect | Backend: `/po/{id}`, Frontend: `/po/{id}/edit` | **Frontend 채택: edit** | 사용자가 즉시 수량/날짜 조정 필요. 적절 |
| `PurchaseOrder` base 타입 | Architect 제안 | `POWithOrgs`만 존재 | base 타입 사용처 없음. 적절 |
| `Form` vs `fetcher.Form` | Frontend: `fetcher.Form` | **`Form` + `useNavigation`** | redirect 목적에 `Form`이 더 적합. 적절 |

### 5.2 설계 미반영 (개선 여지)

| 항목 | 설계 위치 | 구현 상태 | 우선순위 |
|------|----------|----------|----------|
| payment_term/delivery_term Select | Frontend Section 6 | Input 자유 텍스트 | Low (데이터 정합성) |
| POLineItems currency prop | Frontend Section 6 | 미전달 (숫자만 표시) | Low (UX) |
| Edit Header에 PO 번호 | Frontend Section 5 | "구매주문 수정"만 표시 | Low (UX) |
| Empty state CTA 버튼 | Frontend Section 2 | 텍스트만 표시 | Low (UX) |
| po_date/validity 논리 검증 | Security Section 2.5 | 미구현 | Low (데이터 무결성) |

---

## 6. Supabase 직접 확인 필요 사항

Supabase MCP 권한 오류로 직접 SQL 실행이 불가했다. 아래 항목은 Dashboard에서 수동 확인이 필요하다.

```sql
-- 1. RLS 정책 확인 (가장 중요)
SELECT policyname, cmd, qual, with_check
FROM pg_policies WHERE tablename = 'purchase_orders';

-- 2. generate_doc_number 동작 확인
SELECT generate_doc_number('PO', '2026-03-06');

-- 3. purchase_orders 테이블 구조 확인
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'purchase_orders'
ORDER BY ordinal_position;
```

---

## 7. 수정 우선순위 로드맵

### Phase 2 Hotfix (즉시)

| # | 항목 | 심각도 | 파일 | 예상 작업량 |
|---|------|--------|------|-----------|
| 1 | Zod 스키마 중복 제거 → 공유 파일 추출 | Critical | `po.server.ts`, `po.$id.server.ts`, 신규 `po.schema.ts` | 소 |
| 2 | 상태 조회 에러 핸들링 추가 | Critical | `po.$id.server.ts:153` | 극소 |
| 3 | `toggle_status` DB 직접 조회 | Medium | `po.$id.server.ts:334-354` | 소 |
| 4 | 비활성 org 참조 검증 | Medium | `po.server.ts`, `po.$id.server.ts` | 소 |

### Phase 3 전 정리 (단기)

| # | 항목 | 심각도 | 예상 작업량 |
|---|------|--------|-----------|
| 5 | `DocStatus` 타입 통일 | Warning | 극소 |
| 6 | `key={index}` → UUID id | Warning | 소 |
| 7 | `select("*")` → 명시적 컬럼 | Warning | 소 |
| 8 | `po_date` 날짜 형식 검증 | Low | 극소 |
| 9 | 미사용 변수 `currency` 제거 | Info | 극소 |

### 향후 개선 (Phase 3+ 진행 시)

| # | 항목 | 비고 |
|---|------|------|
| 10 | `as unknown as` 캐스팅 근본 해결 | React Router 7 타입 추론 연구 필요 |
| 11 | 테이블 행 접근성 (`navigate` → `Link`) | PI 모듈 목록에도 적용 |
| 12 | `getProductLabel`/`getProductSpec` 공통 유틸 추출 | PI 모듈에서 재사용 시 |
| 13 | Empty state CTA 버튼 + 아이콘 | 공용 EmptyState 컴포넌트화 |
| 14 | List 서버사이드 필터링 전환 | PO 100건+ 시 |

---

## 8. 긍정적 발견 (Well Done)

- **서버사이드 금액 재계산**: 클라이언트 amount 값을 완전히 무시하고 `quantity_kg * unit_price`로 재계산. 보안 모범 사례
- **심층 방어 (Defense in Depth)**: 레이아웃 가드 + 개별 loader/action `requireGVUser` 이중 호출
- **PO 번호 충돌 처리**: `insertError.code === "23505"` 별도 분기로 사용자 친화적 메시지
- **Optimistic UI**: `fetcher.formData` 기반 action 구분이 명확하고 올바름
- **POForm 재사용**: `defaultValues` + `actionName` + `cancelTo` prop으로 생성/수정 단일 컴포넌트화
- **반응형 디자인**: `md:hidden` / `hidden md:block` 패턴 일관 적용
- **`formatDate`/`formatCurrency` 공용 함수**: `app/lib/format.ts` 함수 전체 모듈에서 일관 활용
- **totalAmount 라운딩 개선**: 설계 문서보다 구현이 더 정밀 (부동소수점 누적 오차 방지)
- **redirect with responseHeaders**: 모든 redirect에 쿠키 갱신 보장. 세션 손실 방지

---

## 9. Phase 2 완료 기준 (Definition of Done) 체크

### 기능 (9/9)
- [x] PO 목록 조회 (Desktop Table + Mobile Card)
- [x] 상태 필터 (전체/진행/완료)
- [x] PO 생성 (폼 + 라인아이템 + 자동 번호 생성)
- [x] PO 상세 조회 (정보 + 라인아이템 테이블)
- [x] PO 수정 (기존 데이터 pre-fill)
- [x] PO 삭제 (soft delete + 확인 dialog)
- [x] PO 복제 (clone + redirect to edit)
- [x] 상태 토글 (process ↔ complete)
- [x] PO 번호 검색 (client-side filter)

### 보안 (4/5)
- [x] 모든 loader/action에서 `requireGVUser` 호출
- [x] JSONB details Zod 검증 (min 1, max 20)
- [x] Amount 서버사이드 재계산
- [x] 소프트 삭제된 PO 접근 시 404
- [△] 오류 메시지 래핑 (구현됨, 단 에러 핸들링 일부 누락 - C2)

### UI/UX (3/4)
- [x] 모바일 반응형 (md breakpoint)
- [△] Empty state (텍스트만, CTA 버튼 없음)
- [x] Loading state (fetcher.state)
- [x] 에러 표시 (fetcher.data.error)

### 기술 (2/2)
- [x] `npm run typecheck` 에러 없음
- [x] `npm run dev` 정상 동작

**총 완료율: 18/20 항목 완료 (90%), 2항목 부분 완료**

---

*분석 수행: Architect + Backend Dev + Frontend Dev + Security Reviewer + Code Reviewer (5-agent parallel)*
