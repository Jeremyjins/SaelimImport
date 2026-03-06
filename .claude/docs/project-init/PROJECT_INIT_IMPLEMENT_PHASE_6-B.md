# Phase 6-B 구현 계획 및 현황

**Date:** 2026-03-06
**Phase:** 6-B - 오더 상세 + Inline 수정 + 문서 링크
**Status:** ✅ 완료

---

## 에이전트 팀 구성

| # | Role | 담당 파일 | 역할 |
|---|------|-----------|------|
| 1 | **Architect** | 구현계획 문서, 타입/스키마 검토 | 아키텍처 확인, 기존 스키마 재사용 |
| 2 | **Backend Dev** | `app/loaders/orders.$id.server.ts` | 상세 loader + 7개 action 구현 |
| 3 | **Frontend Dev** | `app/components/orders/order-date-timeline.tsx`, `order-doc-links.tsx`, `order-inline-fields.tsx`, `app/routes/_layout.orders.$id.tsx` | UI 컴포넌트 + 상세 페이지 |
| 4 | **Security Reviewer** | 코드 리뷰 | UUID 검증, requireGVUser, doc_type enum 검증 |

*제외: Tester, Perf-analyzer, Code-reviewer (6-B 범위 한정, 단순 상세 페이지)*

---

## Supabase DB 상태 확인

- orders 테이블: status 컬럼 Migration 완료 (Phase 6-A)
- RLS: gv_all 정책 (GV 유저만 전체 접근)
- FK: orders.pi_id, shipping_doc_id, customs_id, delivery_id (ON DELETE SET NULL)

---

## 구현 태스크

### Task 1: 구현계획 문서 작성 ✅
**파일:** `.claude/docs/PROJECT_INIT_IMPLEMENT_PHASE_6-B.md`

### Task 2: Pencil MCP 드래프트 디자인 ✅
**파일:** `saelim.pen` (Pencil MCP)
- Order 상세 페이지 레이아웃 디자인
  - Header: 세림번호 + 상태 배지 + CY 경고 + 액션 버튼
  - Section 1: 날짜 타임라인 (6단계)
  - Section 2: 문서 링크 카드 그리드 (5개)
  - Section 3: Inline 수정 필드
  - Section 4: Content 시스템

### Task 3: Backend Loader + Actions ✅
**파일:** `app/loaders/orders.$id.server.ts`
- [x] `loader` - orders 상세 쿼리 (5개 FK JOIN) + content 로드
- [x] `action` routing - 7개 액션 처리
  - [x] `update_fields` - saelim_no, advice_date, arrival_date, delivery_date 수정
  - [x] `toggle_status` - process ↔ complete
  - [x] `toggle_customs_fee` - DB 현재값 읽어서 토글
  - [x] `link_document` - doc_type + doc_id → FK 연결 (존재 + 미연결 확인)
  - [x] `unlink_document` - doc_type → FK null
  - [x] `refresh_links` - null FK만 cascade 재실행
  - [x] `delete` - soft delete → redirect /orders
  - [x] `content_*` - handleContentAction 위임

### Task 4: OrderDateTimeline 컴포넌트 ✅
**파일:** `app/components/orders/order-date-timeline.tsx`
- [x] 6단계: 어드바이스 → ETD → ETA → 도착 → 통관 → 배송
- [x] Desktop: 수평 타임라인 (스텝 형태)
- [x] Mobile: 세로 타임라인
- [x] 완료/진행중/미완 상태 표시

### Task 5: OrderDocLinks 컴포넌트 ✅
**파일:** `app/components/orders/order-doc-links.tsx`
- [x] 5개 카드: PO / PI / Shipping / Customs / Delivery
- [x] 연결됨: 문서번호 + 상태 배지 + 링크 + "연결 해제" 버튼
- [x] 미연결: "미연결" 표시 + "연결" 버튼 (Dialog)
- [x] Customs/Delivery: enabled: false (미구현 모듈)
- [x] Desktop: 5열, Tablet: 3열, Mobile: 1열

### Task 6: OrderInlineFields 컴포넌트 ✅
**파일:** `app/components/orders/order-inline-fields.tsx`
- [x] saelim_no - 텍스트 Inline 수정
- [x] advice_date, arrival_date, delivery_date - 날짜 Inline 수정
- [x] customs_fee_received - Toggle (별도 fetcher)
- [x] Click-to-edit 패턴 (보기 → 수정 토글)
- [x] fetcher.submit으로 즉시 저장

### Task 7: Order Detail Page ✅
**파일:** `app/routes/_layout.orders.$id.tsx`
- [x] loader + action export
- [x] Header: 세림번호 + 상태 배지 + CY 경고 + 액션 드롭다운
- [x] Section 1: OrderDateTimeline
- [x] Section 2: OrderDocLinks (with refresh_links)
- [x] Section 3: OrderInlineFields
- [x] Section 4: ContentSection (type="order")
- [x] Toast 피드백
- [x] 삭제 AlertDialog

---

## 파일 목록 (Phase 6-B)

### 신규 파일
| 파일 | 담당 | 상태 |
|------|------|------|
| `app/loaders/orders.$id.server.ts` | Backend Dev | ✅ |
| `app/components/orders/order-date-timeline.tsx` | Frontend Dev | ✅ |
| `app/components/orders/order-doc-links.tsx` | Frontend Dev | ✅ |
| `app/components/orders/order-inline-fields.tsx` | Frontend Dev | ✅ |

### 수정 파일
| 파일 | 변경 내용 | 상태 |
|------|-----------|------|
| `app/routes/_layout.orders.$id.tsx` | placeholder → 상세 페이지 구현 | ✅ |

---

## 주요 설계 결정

1. **Inline 수정**: Click-to-edit 패턴 - 필드 클릭 시 input 표시, blur/Enter에서 fetcher.submit
2. **문서 링크**: PI/Shipping은 링크/해제 가능. Customs/Delivery는 Phase 7/8에서 활성화
3. **refresh_links**: null인 FK만 채움. 기존 연결된 FK는 덮어쓰지 않음 (안전)
4. **toggle_customs_fee**: 반드시 DB 현재값 조회 후 토글 (클라이언트 값 신뢰 금지)
5. **Content**: type="order", parentId=orderId 로 기존 ContentSection 재사용

---

## 보안 검토 (Security Reviewer)

- [x] 모든 loader/action에 `requireGVUser()` 사용
- [x] URL param `$id` UUID 검증 (z.string().uuid())
- [x] `doc_type` enum 검증 (linkDocumentSchema, unlinkDocumentSchema 사용)
- [x] link 시 대상 문서 존재 + 미연결 확인
- [x] unlink은 FK null만 (연결된 doc 삭제 금지)
- [x] `toggle_customs_fee`는 DB에서 현재값 읽기 (client 값 무시)
- [x] `responseHeaders` 모든 data()/redirect()에 전달
