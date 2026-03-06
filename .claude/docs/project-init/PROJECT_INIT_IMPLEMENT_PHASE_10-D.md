# Phase 10-D: UI/UX Consistency & Accessibility - 구현 계획

**Date:** 2026-03-06
**Status:** 구현 중
**Brainstorming Ref:** `.claude/docs/PROJECT_INIT_BRAINSTORMING_PHASE_10.md` § Phase 10-D
**Dependencies:** 10-A 완료 후

---

## Scope

| ID | Priority | Description |
|----|----------|-------------|
| P1-6 | High | 검색 Input aria-label 추가 (모든 목록 페이지) |
| P2-1 | Medium | Detail 페이지 gap 표준화: `flex flex-col gap-6` |
| P2-2 | Medium | CardTitle 스타일 표준화: 커스텀 className 제거 (기본값 사용) |
| P2-3 | Medium | 메타 푸터 문구: `생성:` → `작성:` |
| P2-5 | Medium | 필터 바 breakpoint: `sm:flex-row` → `md:flex-row` |
| P2-7 | Medium | 메타 텍스트 색상: `text-zinc-400` → `text-zinc-500` (WCAG AA) |
| P2-8 | Medium | 삭제 다이얼로그 Loader2 스피너 추가 |
| P2-11 | Medium | Dropdown trigger: `size="sm"` → `size="icon" className="h-8 w-8"` |
| P3-1 | Low | 네비게이션 로딩 바 추가 (`_layout.tsx`) |

---

## Agent Team

| Role | 담당 |
|------|------|
| Frontend Dev | 모든 UI 일관성 수정, 접근성 추가 |
| Code Reviewer | 패턴 검증, 타입 안전성 확인 |

---

## File Ownership

| File | 작업 내용 |
|------|----------|
| `app/routes/_layout.tsx` | 네비게이션 로딩 바 (P3-1) |
| `app/routes/_layout.orders.$id.tsx` | gap-6, CardTitle, 작성:, zinc-500, dropdown size, delete spinner |
| `app/routes/_layout.customs.$id.tsx` | gap-6, 작성:, zinc-500, delete spinner |
| `app/routes/_layout.delivery.$id.tsx` | gap-6, 작성:, zinc-500, dropdown size, delete spinner |
| `app/routes/_layout.po.tsx` | md:flex-row, md:w-56, aria-label |
| `app/routes/_layout.pi.tsx` | md:flex-row, md:w-64, aria-label |
| `app/routes/_layout.shipping.tsx` | md:flex-row, md:w-64, aria-label |
| `app/routes/_layout.orders.tsx` | md:flex-row, md:w-72, aria-label |
| `app/routes/_layout.customs.tsx` | aria-label (이미 md: 사용) |
| `app/routes/_layout.delivery.tsx` | md:flex-row, md:w-72, aria-label |

---

## Tasks

| ID | 설명 | 파일 | 상태 |
|----|------|------|------|
| T1 | _layout.tsx 네비게이션 로딩 바 | `app/routes/_layout.tsx` | ✅ 완료 |
| T2 | orders.$id: gap-6, CardTitle, 작성:, zinc-500, dropdown, spinner | `app/routes/_layout.orders.$id.tsx` | ✅ 완료 |
| T3 | customs.$id: gap-6, 작성:, zinc-500, spinner | `app/routes/_layout.customs.$id.tsx` | ✅ 완료 |
| T4 | delivery.$id: gap-6, 작성:, zinc-500, dropdown, spinner | `app/routes/_layout.delivery.$id.tsx` | ✅ 완료 |
| T5 | po list: md:flex-row, aria-label | `app/routes/_layout.po.tsx` | ✅ 완료 |
| T6 | pi list: md:flex-row, aria-label | `app/routes/_layout.pi.tsx` | ✅ 완료 |
| T7 | shipping list: md:flex-row, aria-label | `app/routes/_layout.shipping.tsx` | ✅ 완료 |
| T8 | orders list: md:flex-row, aria-label | `app/routes/_layout.orders.tsx` | ✅ 완료 |
| T9 | customs list: aria-label | `app/routes/_layout.customs.tsx` | ✅ 완료 |
| T10 | delivery list: md:flex-row, aria-label | `app/routes/_layout.delivery.tsx` | ✅ 완료 |

---

## Design Decisions

### P2-1: Detail page gap 표준화
`space-y-4` (orders), `space-y-6` (customs, delivery) → `flex flex-col gap-6`
gap-6 = 24px, space-y-4 = 16px, space-y-6 = 24px. gap-6 선택.

### P2-2: CardTitle 표준화
Orders.$id에서 `className="text-sm font-semibold text-zinc-700"` 제거 → shadcn/ui 기본값 사용
PO/PI 상세 페이지와 동일한 스타일.

### P2-3: 메타 푸터 문구 표준화
PO/PI/Shipping 상세 페이지는 `작성:` 사용. Orders/Customs/Delivery는 `생성:` 사용.
→ `작성:` / `수정:` 으로 통일.

### P2-8: Delete dialog Loader2 스피너
AlertDialogAction에 `disabled={isDeleting}` 추가 + Loader2 스피너 표시.
삭제 중 이중 클릭 방지 및 시각적 피드백 제공.

### P3-1: Navigation Loading Bar
useNavigation().state === "loading" 일 때 상단 고정 0.5px 바 표시.
색상: bg-primary, animate-pulse 애니메이션.

---

## Completion Summary

**완료일:** 2026-03-06

### 변경 파일
1. **`app/routes/_layout.tsx`** - 네비게이션 로딩 바 추가 (useNavigation)
2. **`app/routes/_layout.orders.$id.tsx`** - gap-6, CardTitle 정리, 작성:, zinc-500, dropdown size="icon", delete spinner
3. **`app/routes/_layout.customs.$id.tsx`** - gap-6, 작성:, zinc-500, delete spinner
4. **`app/routes/_layout.delivery.$id.tsx`** - gap-6, 작성:, zinc-500, dropdown size="icon", delete spinner
5. **`app/routes/_layout.po.tsx`** - md:flex-row, md:w-56, aria-label="검색"
6. **`app/routes/_layout.pi.tsx`** - md:flex-row, md:w-64, aria-label="검색"
7. **`app/routes/_layout.shipping.tsx`** - md:flex-row, md:w-64, aria-label="검색"
8. **`app/routes/_layout.orders.tsx`** - md:flex-row, md:w-72, aria-label="검색"
9. **`app/routes/_layout.customs.tsx`** - aria-label="검색"
10. **`app/routes/_layout.delivery.tsx`** - md:flex-row, md:w-72, aria-label="검색"

### 효과
- 모든 상세 페이지 섹션 간격 통일 (gap-6)
- CardTitle 스타일 일관성 확보
- 메타 텍스트 WCAG AA 대비율 확보 (zinc-500)
- 메타 푸터 문구 통일 (작성:)
- 필터 바 breakpoint 통일 (md:)
- 검색 입력 접근성 개선 (aria-label)
- 삭제 다이얼로그 UX 개선 (Loader2 스피너)
- 드롭다운 트리거 크기 통일 (size="icon" h-8 w-8)
- 라우트 전환 시각 피드백 (로딩 바)
