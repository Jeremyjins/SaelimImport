# Phase 0 구현검증 개선 실행 보고서

**Date:** 2026-03-06
**Status:** 완료
**참조:** [Phase 0 분석 보고서](PROJECT_INIT_ANALYZE_PHASE_0.md)

---

## 에이전트 팀 구성

| # | 역할 | 파일 소유권 | 비고 |
|---|------|------------|------|
| 1 | **Backend Dev** | `auth.server.ts`, `loaders/auth.server.ts`, `types/common.ts` | Zod, ORG_TYPES, getUser 수정 |
| 2 | **Frontend Dev** | `_saelim.tsx`, `_auth.login.tsx`, `root.tsx`, `page-container.tsx`, `app-sidebar.tsx`, 6개 플레이스홀더, `welcome/` | UI 수정 + 정리 |

> **제외:** Architect(소규모 수정), Tester(인프라 없음), Perf Analyzer(불필요), Security Reviewer(수정사항 명확), Code Reviewer(typecheck 검증), Researcher(불필요)

---

## 실행 결과

### Must Fix (2/2 완료)

| # | 이슈 | 파일 | 변경 내용 | 상태 |
|---|------|------|----------|------|
| 1 | `redirect` 중복 import | `_saelim.tsx` | line 1에 통합, line 14 삭제 | **완료** |
| 2 | `AppUser` 타입 미사용/불일치 | `types/common.ts` | `AppUser` 인터페이스 제거 (미사용 확인) | **완료** |

### Security (3/3 완료)

| # | 이슈 | 파일 | 변경 내용 | 상태 |
|---|------|------|----------|------|
| 3 | ORG_TYPES 상수 미사용 | `auth.server.ts` | `"gv"` → `ORG_TYPES.GV` + import 추가 | **완료** |
| 4 | Zod 검증 미적용 + getUser 이중호출 | `loaders/auth.server.ts` | Zod loginSchema 추가, signInData.user 사용 | **완료** |
| 5 | Saelim org_type denylist | `_saelim.tsx` | `=== "gv"` → `!== ORG_TYPES.SAELIM` (allowlist) | **완료** |

### Code Quality (8/8 완료)

| # | 이슈 | 파일 | 변경 내용 | 상태 |
|---|------|------|----------|------|
| 6 | ErrorBoundary 영어 | `root.tsx` | 한국어 번역 ("오류 발생", "요청하신 페이지를 찾을 수 없습니다.") | **완료** |
| 7 | PageContainer mx-auto 누락 | `page-container.tsx` | `max-w-7xl mx-auto` 추가 | **완료** |
| 8 | Sidebar active 체크 | `app-sidebar.tsx` | `===` → `startsWith` (navItems + settingsItems) | **완료** |
| 9 | 고아 DropdownMenuSeparator | `app-sidebar.tsx` | 제거 + 미사용 import 정리 | **완료** |
| 10 | 로그인 에러 색상 | `_auth.login.tsx` | `text-red-500` → `text-destructive` | **완료** |
| 11 | 플레이스홀더 영어 타이틀 | 6개 라우트 | 한국어 변경 + 미사용 Route import 제거 | **완료** |
| 12 | welcome/ scaffold | `app/welcome/` | 디렉토리 삭제 (3 파일) | **완료** |
| 13 | loginLoader responseHeaders | `loaders/auth.server.ts` | redirect에 responseHeaders 추가 | **완료** |

### 스킵 항목 (낮은 우선순위)

| # | 이슈 | 사유 |
|---|------|------|
| - | 레이아웃 loader .server.ts 분리 | 현재 inline loader가 2-3줄로 매우 간결, 분리 시 오히려 복잡도 증가 |
| - | 보안 응답 헤더 (CSP 등) | Phase 1+ 과제로 이관 (배포 전 적용) |
| - | CDN SRI 해시 | Phase 1+ 과제로 이관 |

---

## 변경 파일 상세

### `app/lib/auth.server.ts`
- `ORG_TYPES` import 추가
- `requireGVUser` 내 `"gv"` → `ORG_TYPES.GV`

### `app/loaders/auth.server.ts`
- `zod`, `ORG_TYPES` import 추가
- `loginSchema` Zod 스키마 정의 (email: max 254, password: min 1, max 128)
- `loginAction`: formData → `loginSchema.safeParse()` 로 검증
- `loginAction`: `signInWithPassword` 반환값에서 직접 user 추출 (getUser 이중호출 제거)
- `loginLoader`: redirect에 `responseHeaders` 추가
- 모든 org_type 비교에 `ORG_TYPES.SAELIM` 사용

### `app/types/common.ts`
- 미사용 `AppUser` 인터페이스 제거
- `OrgType`, `DocStatus`, `Currency`, `ActionResult` 유지

### `app/routes/_saelim.tsx`
- line 1: `redirect` 통합 import (중복 제거)
- line 14: 중복 `import { redirect }` 삭제
- `ORG_TYPES` import 추가
- org_type 체크: denylist(`=== "gv"`) → allowlist(`!== ORG_TYPES.SAELIM`)

### `app/routes/_auth.login.tsx`
- 에러 메시지 클래스: `text-red-500` → `text-destructive`

### `app/root.tsx`
- ErrorBoundary 텍스트 한국어 번역:
  - "Oops!" → "오류 발생"
  - "An unexpected error occurred." → "예기치 않은 오류가 발생했습니다."
  - "The requested page could not be found." → "요청하신 페이지를 찾을 수 없습니다."
  - "Error" → "오류"

### `app/components/layout/page-container.tsx`
- `max-w-7xl` → `max-w-7xl mx-auto` (중앙 정렬)

### `app/components/layout/app-sidebar.tsx`
- navItems active 체크: `===` → `startsWith` 포함
- settingsItems active 체크: `===` → `startsWith` 포함
- 고아 `DropdownMenuSeparator` 제거
- 미사용 `DropdownMenuSeparator` import 제거

### 플레이스홀더 라우트 (6개)
| 파일 | 이전 title | 변경 title | 기타 |
|------|-----------|-----------|------|
| `_layout.po.tsx` | "po" | "구매주문" | 미사용 Route import 제거 |
| `_layout.pi.tsx` | "pi" | "견적서" | 미사용 Route import 제거 |
| `_layout.shipping.tsx` | "shipping" | "선적서류" | 미사용 Route import 제거 |
| `_layout.orders.tsx` | "orders" | "오더관리" | 미사용 Route import 제거 |
| `_layout.customs.tsx` | "customs" | "통관관리" | 미사용 Route import 제거 |
| `_layout.delivery.tsx` | "delivery" | "배송관리" | 미사용 Route import 제거 |

### 삭제 파일
- `app/welcome/welcome.tsx` - 미사용 scaffold
- `app/welcome/logo-dark.svg` - 미사용 scaffold
- `app/welcome/logo-light.svg` - 미사용 scaffold

---

## 검증

- [x] `npm run typecheck` 에러 없음
- [x] 모든 변경 파일 충돌 없음 (에이전트별 파일 소유권 준수)
- [x] Zod v4 호환 확인 (`safeParse` + `parsed.success` 패턴은 v3/v4 모두 동작)

---

## 분석 보고서 대비 개선 현황

| 분류 | 전체 | 완료 | 스킵 |
|------|------|------|------|
| Must Fix | 2 | 2 | 0 |
| Security | 3 | 3 | 0 |
| Code Quality | 10 | 8 | 2 (layout loader 분리, 보안 헤더) |
| Cleanup | 1 | 1 | 0 |
| **합계** | **16** | **14** | **2** |

---

## Phase 1 진입 준비 완료

모든 Must Fix + Security 항목이 해결되었으며, Code Quality 개선 8건이 추가로 적용되었습니다.
스킵된 2건(layout loader 분리, 보안 응답 헤더)은 Phase 1+ 과제로 이관합니다.
