# Phase 3-B 구현 계획: PI 상세 + 수정 + 크로스모듈

**Date:** 2026-03-06
**Branch:** main
**참조:** `.claude/docs/PROJECT_INIT_BRAINSTORMING_PHASE_3.md`

---

## 에이전트 팀

| 역할 | 담당 파일 |
|------|----------|
| **Backend Dev** | `app/loaders/pi.$id.server.ts`, `app/loaders/po.$id.server.ts` (수정) |
| **Frontend Dev** | `app/components/pi/pi-detail-info.tsx`, `app/components/pi/pi-detail-items.tsx`, `app/routes/_layout.pi.$id.tsx`, `app/routes/_layout.pi.$id.edit.tsx`, `app/routes/_layout.po.$id.tsx` (수정) |

---

## Task 체크리스트

### Backend
- [x] `app/loaders/pi.$id.server.ts` — loader + piEditLoader + action (update/delete/clone/toggle)
- [x] `app/loaders/po.$id.server.ts` — 연결 PI 조회 추가 (loader 수정)

### Frontend Components
- [x] `app/components/pi/pi-detail-info.tsx` — PI 상세 기본정보/거래조건 2열 카드 (참조 PO 링크 포함)
- [x] `app/components/pi/pi-detail-items.tsx` — 품목 읽기전용 테이블 (Desktop + Mobile)

### Routes
- [x] `app/routes/_layout.pi.$id.tsx` — PI 상세 페이지 (Optimistic Toggle, Clone, Delete AlertDialog)
- [x] `app/routes/_layout.pi.$id.edit.tsx` — PI 수정 페이지 (PIForm pre-fill)
- [x] `app/routes/_layout.po.$id.tsx` — "PI 작성" 버튼 + 연결 PI 목록 섹션 추가

### Design
- [x] Pencil 디자인 — PI 상세 페이지 draft (saelim.pen)

---

## 구현 상세

### pi.$id.server.ts actions

| Intent | 동작 |
|--------|------|
| `update` | complete 상태 차단 → org 검증 → Amount 재계산 → UPDATE |
| `delete` | PI soft delete → 연결 Delivery soft delete → redirect /pi |
| `clone` | PI 복제 (po_id=null) → Delivery 자동 생성 → redirect /pi/:id/edit |
| `toggle_status` | DB에서 status 직접 조회 → 토글 |

### 크로스모듈: PO 상세 수정사항

- `po.$id.server.ts` loader: 연결 PI 목록 추가 (`proforma_invoices where po_id = :id`)
- `_layout.po.$id.tsx`: 드롭다운에 "PI 작성" 메뉴 추가, 연결 PI 목록 카드 추가

### 보안
- 모든 loader/action: `requireGVUser` 독립 호출
- PI 가격 관련 데이터는 GV only (RLS 정책)

---

## 완료 확인

- [x] PI 상세 페이지 동작 (상태 토글, 복제, 삭제)
- [x] PI 수정 페이지 동작 (complete 차단)
- [x] PO 상세에서 "PI 작성" 진입점
- [x] PO 상세에서 연결 PI 목록 표시
