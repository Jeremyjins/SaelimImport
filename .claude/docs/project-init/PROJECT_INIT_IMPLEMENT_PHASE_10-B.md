# Phase 10-B: Dashboard Implementation Plan

**Date:** 2026-03-06
**Status:** Complete
**Dependencies:** Phase 10-A (Complete - ErrorBanner, ErrorBoundary, Header fix, Sidebar home link)

---

## Overview

Phase 10-A가 완료된 상태에서 Phase 10-B Dashboard를 구현한다.
P0-4 (Dashboard home page is placeholder), P1-7 (Sidebar missing home link - already done in 10-A)

---

## Agent Team

| Role | Responsibility | Files |
|------|----------------|-------|
| **architect** | 데이터 흐름 설계, loader 구조 검토 | - |
| **frontend-dev** | Dashboard UI 컴포넌트 구현 | `app/components/dashboard/*.tsx`, `app/routes/_layout.home.tsx` |
| **backend-dev** | Server-side loader 구현 | `app/loaders/home.server.ts` |

---

## Tasks

### [x] TASK-1: Create implementation plan document
- [x] `.claude/docs/PROJECT_INIT_IMPLEMENT_PHASE_10-B.md` 생성

### [x] TASK-2: Design Draft (Pencil MCP)
- [x] `saelim.pen` 파일에서 Dashboard 레이아웃 draft 생성 (node: BEDxm)
- [x] Desktop: 6-column stat cards + 2-column alert/activity
- [x] Sidebar + main content area with header

### [x] TASK-3: Backend - `app/loaders/home.server.ts`
- [x] 9개 병렬 Supabase 쿼리 (6 count stats + recentOrders + pendingRequests + cyRiskOrders)
- [x] `requireGVUser` 인증 적용
- [x] `data()` helper로 반환

### [x] TASK-4: Frontend - `app/components/dashboard/stat-card.tsx`
- [x] Reusable metric card (icon, label, count, link)
- [x] Clickable → 해당 모듈 링크
- [x] 3 variants: default / warning (orange) / info (blue)

### [x] TASK-5: Frontend - `app/components/dashboard/alert-list.tsx`
- [x] Alert 목록 컴포넌트
- [x] CY 위험 (red), 배송 변경요청 대기 (amber), 통관비 미수령 (orange)
- [x] count=0 알림은 자동 필터링, 빈 상태 메시지 표시

### [x] TASK-6: Frontend - `app/components/dashboard/recent-activity.tsx`
- [x] 최근 5개 오더 목록
- [x] saelim_no, DocStatusBadge, created_at, 상세 링크
- [x] 빈 상태 메시지

### [x] TASK-7: Route - `app/routes/_layout.home.tsx` rewrite
- [x] loader import from home.server.ts
- [x] Dashboard grid layout (mobile-first): 2cols→3cols→6cols for stat cards
- [x] 1col→2cols for alert+activity section

### [x] TASK-8: Verify TypeScript types pass
- [x] `npm run typecheck` 통과 확인 (에러 없음)

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| 8 parallel count queries | Scale <100 records, lightweight count+head |
| No DB view | Unnecessary complexity at current scale |
| CY 위험 기준: advice_date 있고 arrival_date 없는 오더 | CY 초과 위험 판단 기준 |
| Stat cards 클릭 → 해당 모듈 목록 페이지 링크 | 빠른 내비게이션 |
| Alert 최대 5개씩 표시 | 화면 공간 효율성 |

---

## File Ownership (Agent)

| File | Owner |
|------|-------|
| `app/loaders/home.server.ts` | backend-dev |
| `app/components/dashboard/stat-card.tsx` | frontend-dev |
| `app/components/dashboard/alert-list.tsx` | frontend-dev |
| `app/components/dashboard/recent-activity.tsx` | frontend-dev |
| `app/routes/_layout.home.tsx` | frontend-dev |

---

## Implementation Log

- 2026-03-06: 계획 문서 생성, Pencil MCP 디자인 draft 작성 예정
- 2026-03-06: home.server.ts loader 구현 완료
- 2026-03-06: stat-card.tsx, alert-list.tsx, recent-activity.tsx 컴포넌트 구현 완료
- 2026-03-06: _layout.home.tsx 대시보드 페이지 완전 재작성 완료
