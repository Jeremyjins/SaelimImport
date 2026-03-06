# Phase 2-A 구현 계획 및 진행 현황
## PO List + Create (기본 CRUD)

**Date:** 2026-03-06
**Status:** ✅ 구현 완료
**참조:** [Phase 2 브레인스토밍](PROJECT_INIT_BRAINSTORMING_PHASE_2.md)

---

## 사전 확인 (DB/RPC)

| 항목 | 상태 | 비고 |
|------|------|------|
| `purchase_orders` 테이블 | ✅ 확인 | 모든 컬럼 존재 |
| `generate_doc_number` RPC | ✅ 확인 | `GVPO2603-001` 형식 반환 |
| RLS 정책 | ✅ 확인 | GV-only full CRUD |
| organizations.type 컬럼 | ✅ 확인 | `type` (not `org_type`) |
| 기존 거래처 | ✅ 확인 | CHP(supplier), GV Int'l(seller), Saelim(buyer) |

---

## Task 목록

### T1. 구현 계획 문서 생성
- [x] `.claude/docs/PROJECT_INIT_IMPLEMENT_PHASE_2-A.md` 작성

### T2. Pencil 디자인 (PO List + Create Draft)
- [x] saelim.pen에 PO List 프레임 추가 (y:2000)
- [x] saelim.pen에 PO Create 프레임 추가 (x:1540, y:2000)

### T3. shadcn tabs 컴포넌트 설치
- [x] `npx shadcn@latest add tabs` → `app/components/ui/tabs.tsx` 생성

### T4. 타입 정의
- [x] `app/types/po.ts` 생성 - `POLineItem`, `POWithOrgs`, `POListItem`

### T5. 서버 로더/액션
- [x] `app/loaders/po.server.ts` 생성
  - `loader` (PO 목록 + Supabase FK join)
  - `poFormLoader` (suppliers/buyers/products 데이터 병렬 로드)
  - `createPOAction` (Zod 검증, 서버사이드 재계산, RPC 번호 생성, 저장)

### T6. Route 설정
- [x] `app/routes.ts` - po/new, po/:id, po/:id/edit 추가

### T7. 공용 컴포넌트
- [x] `app/components/ui/icons.tsx` - ChevronLeft 추가
- [x] `app/components/shared/doc-status-badge.tsx` 생성
- [x] `app/components/layout/header.tsx` - backTo prop 추가

### T8. PO 컴포넌트
- [x] `app/components/po/po-line-items.tsx` 생성 (Desktop 테이블/Mobile 카드, 자동계산)
- [x] `app/components/po/po-form.tsx` 생성 (기본정보+거래조건 2열 카드)

### T9. Route 페이지
- [x] `app/routes/_layout.po.tsx` - PO 목록 페이지 (탭필터, 검색, Desktop테이블+Mobile카드)
- [x] `app/routes/_layout.po.new.tsx` - PO 생성 페이지
- [x] `app/routes/_layout.po.$id.tsx` - Placeholder (Phase 2-B에서 구현)
- [x] `app/routes/_layout.po.$id.edit.tsx` - Placeholder (Phase 2-C에서 구현)

### T10. 빌드 검증
- [x] `npm run typecheck` - 에러 없음
- [x] `npm run build` - 성공

---

## File Ownership

| 파일 | 담당 | 상태 |
|------|------|------|
| `app/types/po.ts` | Backend | ✅ 완료 |
| `app/loaders/po.server.ts` | Backend | ✅ 완료 |
| `app/routes.ts` | Shared | ✅ 완료 |
| `app/components/ui/icons.tsx` | Frontend | ✅ ChevronLeft 추가 |
| `app/components/ui/tabs.tsx` | Frontend | ✅ shadcn 설치 |
| `app/components/layout/header.tsx` | Frontend | ✅ backTo prop 추가 |
| `app/components/shared/doc-status-badge.tsx` | Frontend | ✅ 완료 |
| `app/components/po/po-line-items.tsx` | Frontend | ✅ 완료 |
| `app/components/po/po-form.tsx` | Frontend | ✅ 완료 |
| `app/routes/_layout.po.tsx` | Frontend | ✅ 완료 |
| `app/routes/_layout.po.new.tsx` | Frontend | ✅ 완료 |
| `app/routes/_layout.po.$id.tsx` | Frontend | ⏳ Phase 2-B placeholder |
| `app/routes/_layout.po.$id.edit.tsx` | Frontend | ⏳ Phase 2-C placeholder |

---

## 핵심 구현 메모

- `organizations.type` 컬럼명 (`org_type` 아님)
- Supabase FK join: `!supplier_id` / `!buyer_id` disambiguator 사용 시 TypeScript가 `GenericStringError`로 추론 → `useLoaderData(...) as unknown as { pos: POListItem[] }` 캐스팅으로 해결
- `createPOAction`은 redirect를 throw하므로 `useActionData`로 action 성공 후 데이터 접근 불가 (redirect 됨)
- shadcn tabs는 URL searchParams 기반 필터와 잘 연동됨

---

## Phase 2-B 준비 (다음 단계)

**목표:** PO 상세 조회 + 삭제

**필요 파일:**
1. `app/loaders/po.$id.server.ts` - detail loader + delete action
2. `app/components/po/po-detail-info.tsx` - 정보 섹션
3. `app/components/po/po-detail-items.tsx` - 라인아이템 read-only 테이블
4. `app/routes/_layout.po.$id.tsx` - 상세 페이지 (placeholder 교체)

---

## 완료 기준 체크

- [x] PO 목록 조회 (Desktop Table + Mobile Card)
- [x] 상태 필터 (전체/진행/완료) - URL searchParams
- [x] PO 번호 검색 (client-side filter)
- [x] PO 생성 (폼 + 라인아이템 + 자동 번호 생성)
- [x] `npm run typecheck` 에러 없음
- [x] `npm run build` 성공
- [ ] 실제 브라우저 동작 확인 (수동 테스트)
