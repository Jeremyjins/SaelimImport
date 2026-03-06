# Phase 10-A: Critical Fixes & Error Handling - 구현 계획

**Date:** 2026-03-06
**Status:** 구현 중
**Scope:** P0-1, P0-2, P1-1, P1-2, P1-7, P1-8, P2-9

---

## Agent Team

| # | Role | 담당 |
|---|------|------|
| 1 | **Architect** | 에러 경계 설계, 구조 설계 |
| 2 | **Frontend Dev** | UI 컴포넌트 구현, 반응형 수정 |
| 3 | **Code Reviewer** | 캐스팅 일관성 수정 |

---

## Task 목록

| ID | 설명 | 파일 소유 | 상태 |
|----|------|----------|------|
| T1 | ErrorBanner 공유 컴포넌트 생성 | `app/components/shared/error-banner.tsx` | ✅ 완료 |
| T2 | Layout ErrorBoundary 추가 (_layout.tsx) | `app/routes/_layout.tsx` | ✅ 완료 |
| T3 | Saelim ErrorBoundary 추가 (_saelim.tsx) | `app/routes/_saelim.tsx` | ✅ 완료 |
| T4 | Header 반응형 수정 | `app/components/layout/header.tsx` | ✅ 완료 |
| T5 | Sidebar 홈 링크 추가 | `app/components/layout/app-sidebar.tsx` | ✅ 완료 |
| T6 | icons.tsx Home 아이콘 추가 | `app/components/ui/icons.tsx` | ✅ 완료 |
| T7 | Orders 모바일 카드 Link로 교체 + ErrorBanner | `app/routes/_layout.orders.tsx` | ✅ 완료 |
| T8 | Customs 모바일 카드 Link로 교체 + ErrorBanner | `app/routes/_layout.customs.tsx` | ✅ 완료 |
| T9 | Delivery 모바일 카드 Link로 교체 + ErrorBanner | `app/routes/_layout.delivery.tsx` | ✅ 완료 |
| T10 | PO 목록 ErrorBanner 교체 | `app/routes/_layout.po.tsx` | ✅ 완료 |
| T11 | PI 목록 ErrorBanner 교체 | `app/routes/_layout.pi.tsx` | ✅ 완료 |
| T12 | Shipping 목록 ErrorBanner 교체 | `app/routes/_layout.shipping.tsx` | ✅ 완료 |
| T13 | customs-detail-info.tsx `<a>` → `<Link>` | `app/components/customs/customs-detail-info.tsx` | ✅ 완료 |
| T14 | Orders detail fetcher cast 표준화 | `app/routes/_layout.orders.$id.tsx` | ✅ 완료 |

---

## 구현 세부 내용

### T1: ErrorBanner 컴포넌트
- `app/components/shared/error-banner.tsx` 신규 생성
- `message: string` prop으로 에러 메시지 표시
- 기존 인라인 에러 배너와 동일한 스타일 (bg-red-50, border-red-200, text-red-700)

### T2: _layout.tsx ErrorBoundary
- `isRouteErrorResponse`, `useRouteError` 임포트
- 사이드바(AppSidebar)를 포함한 ErrorBoundary - 네비게이션 유지
- 404/500 등 HTTP 에러와 예상치 못한 에러 구분 처리
- `user={{ email: "unknown" }}`으로 사이드바 렌더링

### T3: _saelim.tsx ErrorBoundary
- 세림 헤더를 포함한 간단한 ErrorBoundary
- 로그아웃 없이 정적 헤더 표시

### T4: Header 반응형 수정
- `h1`: `truncate min-w-0 flex-1` 추가 → 긴 제목 모바일 overflow 방지
- children div: `shrink-0` 추가 → 버튼/배지가 줄어들지 않도록

### T5: Sidebar 홈 링크
- navItems 맨 앞에 `{ title: "대시보드", url: "/", icon: Home }` 추가
- `isActive`: `/` 경로는 `location.pathname === "/"` 만으로 체크 (startsWith 제외)

### T6: Home 아이콘
- `icons.tsx`에 `Home` lucide 아이콘 추가

### T7-T9: 모바일 카드 Link 교체
- `<button type="button" onClick={() => navigate(...)}>` →
  `<Link to={...} className="block ...">` (react-router Link)
- `navigate` import 불필요해지면 제거
- 접근성(middle-click, 키보드) 자동 개선

### T10-T12: 목록 페이지 ErrorBanner 교체
- PO/PI/Shipping 목록의 인라인 에러 배너 → `<ErrorBanner message={loaderError} />`

### T13: customs-detail-info.tsx `<a>` → `<Link>`
- `import { Link } from "react-router"` 추가
- `<a href="/shipping/...">` → `<Link to="/shipping/...">`

### T14: Fetcher cast 표준화
- `orders.$id.tsx` line 53: `as FormData | null` → `as unknown as FormData | null`

---

## 구현 결과

모든 P0/P1 Critical 이슈 해결:
- 사이드바 네비게이션이 에러 발생 시에도 유지됨
- 모바일 헤더 overflow 해결
- ErrorBanner 재사용 컴포넌트로 중복 코드 제거
- 모바일 카드 접근성 개선 (middle-click, href 지원)
- 대시보드 홈 링크 추가
- CustomsDetail 링크 SPA 네비게이션으로 수정
- fetcher.formData 타입 캐스팅 일관성 확보
