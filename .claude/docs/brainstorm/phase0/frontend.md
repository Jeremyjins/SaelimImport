# Phase 0: 프론트엔드 구현 브레인스토밍

**Date:** 2026-03-06
**Author:** Frontend Dev Agent
**Status:** Phase 0 상세 설계

---

## 현재 상태 분석

| 항목 | 상태 |
|------|------|
| Shadcn/ui | `components.json` 설정 완료, new-york 스타일, 컴포넌트 미설치 |
| Tailwind CSS v4 | `app.css`에 테마 변수 설정 완료 (neutral base), sidebar 변수 포함 |
| 폰트 | Inter만 설정 (한국어 폰트 미설정) |
| 라우팅 | `routes.ts`에 index route만 존재 |
| UI 컴포넌트 | `app/components/ui/` 디렉토리 없음 |
| 유틸리티 | `app/lib/utils.ts` (cn 함수) 설정 완료 |
| 테마 색상 | neutral (기본값), orange primary 미적용 |
| 언어 | `lang="en"` (한국어 변경 필요) |

---

## 1. Shadcn/ui 설정 및 필요 컴포넌트

### 1.1 Phase 0 필요 컴포넌트 목록

Phase 0 (Foundation)에서 필요한 컴포넌트를 기능별로 분류:

**레이아웃 (최우선)**
| 컴포넌트 | 용도 | 의존성 |
|----------|------|--------|
| `sidebar` | GV 메인 네비게이션 | tooltip, separator, sheet, input, skeleton |
| `separator` | 시각적 구분선 | 없음 |
| `sheet` | 모바일 sidebar | dialog primitive |

**인증 (로그인)**
| 컴포넌트 | 용도 | 의존성 |
|----------|------|--------|
| `button` | CTA, 폼 제출 | 없음 |
| `card` | 로그인 카드 컨테이너 | 없음 |
| `input` | 이메일/비밀번호 입력 | 없음 |
| `label` | 폼 필드 레이블 | 없음 |

**설정 (CRUD)**
| 컴포넌트 | 용도 | 의존성 |
|----------|------|--------|
| `dialog` | 생성/편집 모달 | 없음 |
| `form` | 폼 유효성 검증 | react-hook-form, zod |
| `table` | 설정 목록 테이블 | 없음 |
| `badge` | 상태 표시 | 없음 |

**네비게이션 & UX**
| 컴포넌트 | 용도 | 의존성 |
|----------|------|--------|
| `dropdown-menu` | 사용자 메뉴 | 없음 |
| `avatar` | 사용자 프로필 이미지 | 없음 |
| `tooltip` | sidebar 축소 시 힌트 | 없음 |
| `breadcrumb` | 페이지 경로 표시 | 없음 |
| `sonner` | Toast 알림 | sonner 패키지 |
| `skeleton` | 로딩 상태 | 없음 |
| `alert-dialog` | 삭제 확인 | 없음 |
| `scroll-area` | 스크롤 영역 | 없음 |

### 1.2 설치 명령어 (권장 순서)

의존성 관계를 고려한 설치 순서:

```bash
# Step 1: 기본 컴포넌트 (의존성 없음)
npx shadcn@latest add button card input label separator badge skeleton scroll-area

# Step 2: 폼 관련 (react-hook-form, zod 추가 설치)
npx shadcn@latest add form

# Step 3: 오버레이 컴포넌트
npx shadcn@latest add dialog alert-dialog sheet tooltip sonner

# Step 4: 네비게이션 & 데이터 표시
npx shadcn@latest add dropdown-menu avatar breadcrumb table

# Step 5: 레이아웃 (sidebar는 내부적으로 여러 컴포넌트에 의존)
npx shadcn@latest add sidebar
```

### 1.3 추가 패키지

```bash
# form에서 필요
npm install react-hook-form @hookform/resolvers zod

# toast
npm install sonner
```

### 1.4 참고: Phase 0에서 제외할 컴포넌트

다음은 Phase 2+ 에서 설치:
- `tabs` (문서 목록 상태 필터, Phase 2)
- `select` (폼 셀렉트, Phase 2)
- `textarea` (비고 입력, Phase 2)
- `switch` (상태 토글, Phase 2)
- `popover` + `calendar` (날짜 선택, Phase 2)
- `command` (검색 가능 셀렉트, Phase 3)
- `chart` (대시보드, Phase 10)

---

## 2. 폰트 전략

### 2.1 선택: Noto Sans KR

| 후보 | 장점 | 단점 | 결론 |
|------|------|------|------|
| **Noto Sans KR** | Google Fonts CDN, 넓은 호환성, Variable font 지원 | 파일 크기가 큼 (CDN이라 문제 없음) | **채택** |
| Pretendard | 한국어 최적화, 세련된 디자인 | 자체 호스팅 필요, CDN 불안정 | Phase 10 재검토 |
| Spoqa Han Sans Neo | 깔끔한 디자인 | 업데이트 중단 우려 | 보류 |

**Noto Sans KR 채택 이유:**
1. Google Fonts CDN 안정성 (Cloudflare Workers 환경에서 자체 폰트 호스팅 번거로움)
2. Variable font 지원으로 단일 요청으로 모든 weight 로드
3. Inter와 x-height가 유사하여 혼용 시 시각적 조화
4. PDF 생성 시에도 Noto Sans KR subset 사용 계획과 일관성

### 2.2 Google Fonts 로드 전략

```
# 로드할 폰트
- Noto Sans KR: weight 400, 500, 600, 700
- Inter: 기존 유지 (영문, 숫자)
```

**최적화 포인트:**
- `display=swap` 유지 (FOUT 허용, FOIT 방지)
- `preconnect` 이미 설정됨 (유지)
- Variable font 사용 시 단일 요청으로 모든 weight

### 2.3 root.tsx 수정 방안

```tsx
// links 함수에 Noto Sans KR 추가
export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Noto+Sans+KR:wght@400..700&display=swap",
  },
];
```

```html
<!-- lang 속성 변경 -->
<html lang="ko">
```

### 2.4 app.css 폰트 스택 수정

```css
@theme {
  --font-sans: "Noto Sans KR", "Inter", ui-sans-serif, system-ui, sans-serif,
    "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
}
```

**폰트 순서 설명:**
- Noto Sans KR을 첫 번째로: 한국어 UI 우선, 영문도 Noto Sans KR로 렌더링
- Inter를 fallback으로: Noto Sans KR 로드 실패 시 영문 폴백
- 또는 Inter를 첫 번째로 두면 영문은 Inter, 한국어만 Noto Sans KR로 렌더링 (선택 사항)

**권장: Noto Sans KR 우선** -- 통일된 시각적 느낌. 비즈니스 앱에서 한국어가 주요 텍스트이므로 일관된 글꼴이 더 좋음.

---

## 3. 기본 레이아웃 구현 상세

### 3.1 `_layout.tsx` (GV 사용자 레이아웃)

```
파일: app/routes/_layout.tsx
역할: GV International 사용자의 메인 쉘 레이아웃
```

**구조:**
```tsx
<SidebarProvider>
  <AppSidebar />
  <SidebarInset>
    <Header />     {/* breadcrumb + user menu */}
    <main>
      <Outlet />   {/* 자식 라우트 렌더링 */}
    </main>
  </SidebarInset>
</SidebarProvider>
```

**핵심 구현 사항:**
- `SidebarProvider`의 `defaultOpen` prop: 데스크톱에서는 열림, 모바일에서는 닫힘
- Cookie 기반 sidebar 상태 저장 (`sidebar_state` cookie)
- Loader에서 auth 체크: `getAuthUser(request)` 호출, 미인증 시 `/login`으로 redirect
- Loader에서 사용자 정보 반환 (sidebar 하단, header에 표시)

**서버 로더 패턴:**
```
파일: app/loaders/layout.server.ts

export async function loader({ request, context }) {
  const user = await getAuthUser(request, context);
  if (!user) throw redirect("/login");
  if (user.org_type === "buyer") throw redirect("/saelim/delivery");
  return { user };
}
```

### 3.2 `app-sidebar.tsx` (사이드바)

```
파일: app/components/layout/app-sidebar.tsx
```

**레이아웃 구조:**
```
+---------------------+
|  SidebarHeader       |
|  +-----------------+ |
|  | 세림 수입관리    | |  <- 로고 + 시스템명
|  +-----------------+ |
+---------------------+
|  SidebarContent      |
|                      |
|  # 문서관리          |  <- SidebarGroup "문서관리"
|    +- 구매오더 (PO)  |
|    +- 견적서 (PI)    |
|    +- 선적서류       |
|                      |
|  # 운영관리          |  <- SidebarGroup "운영관리"
|    +- 오더관리       |
|    +- 통관관리       |
|    +- 배송관리       |
|                      |
|  # 설정             |  <- SidebarGroup "설정"
|    +- 조직관리       |
|    +- 제품관리       |
|    +- 사용자관리     |
|                      |
+---------------------+
|  SidebarFooter       |
|  +-----------------+ |
|  | [A] 사용자명     | |  <- Avatar + 이름 + 이메일
|  |    user@gv.com   | |     DropdownMenu: 프로필, 로그아웃
|  +-----------------+ |
+---------------------+
```

**네비게이션 항목 데이터:**
```ts
const navGroups = [
  {
    label: "문서관리",
    items: [
      { title: "구매오더", url: "/po", icon: FileText },
      { title: "견적서", url: "/pi", icon: Receipt },
      { title: "선적서류", url: "/shipping", icon: Ship },
    ],
  },
  {
    label: "운영관리",
    items: [
      { title: "오더관리", url: "/orders", icon: ClipboardList },
      { title: "통관관리", url: "/customs", icon: ShieldCheck },
      { title: "배송관리", url: "/delivery", icon: Truck },
    ],
  },
  {
    label: "설정",
    items: [
      { title: "조직관리", url: "/settings/organizations", icon: Building2 },
      { title: "제품관리", url: "/settings/products", icon: Package },
      { title: "사용자관리", url: "/settings/users", icon: Users },
    ],
  },
];
```

**활성 라우트 하이라이트:**
- `useLocation()` 또는 `useMatches()`로 현재 경로 확인
- `isActive` 판별: `pathname.startsWith(item.url)` 패턴
- 활성 시 `data-active` 속성 추가 (shadcn sidebar의 기본 스타일링 활용)

**Sidebar 축소 모드:**
- `collapsible="icon"` prop으로 아이콘 전용 모드 지원
- 축소 시 Tooltip으로 메뉴명 표시
- SidebarTrigger 버튼으로 토글

### 3.3 `page-container.tsx`

```
파일: app/components/layout/page-container.tsx
역할: 모든 콘텐츠 페이지의 래퍼 컴포넌트
```

**Props 설계:**
```ts
interface PageContainerProps {
  children: React.ReactNode;
  fullWidth?: boolean;        // _layout 라우트에서 사용 (sidebar 포함 레이아웃)
  title?: string;             // 페이지 제목
  description?: string;       // 부제목/설명
  actions?: React.ReactNode;  // 우측 액션 버튼 영역
  backUrl?: string;           // 뒤로가기 링크
}
```

**구조:**
```
+----------------------------------------------+
| <- 뒤로가기    페이지 제목       [+ 새로 만들기] |  <- 헤더 행
|               부제목/설명                     |
+----------------------------------------------+
|                                              |
|  {children}                                  |  <- 콘텐츠 영역
|                                              |
+----------------------------------------------+
```

**반응형:**
- `fullWidth`: `px-4 md:px-6` (좌우 패딩만)
- 기본: `max-w-5xl mx-auto px-4 md:px-6` (중앙 정렬)
- 모바일: 제목과 액션 버튼 수직 정렬
- 데스크톱: 제목 좌측, 액션 버튼 우측

### 3.4 `header.tsx`

```
파일: app/components/layout/header.tsx
역할: SidebarInset 내 상단 헤더
```

**구조:**
```
+----------------------------------------------+
| [=] > 문서관리 > 구매오더           [A] 사용자명 v |
|  |     +- Breadcrumb                 +- User Menu |
|  +- SidebarTrigger (모바일)                       |
+----------------------------------------------+
```

**Breadcrumb 생성 전략:**
- `useMatches()` hook으로 현재 라우트 체인 가져오기
- 각 라우트의 `handle` export에서 breadcrumb 정보 추출
- 예: `export const handle = { breadcrumb: "구매오더" }`

**사용자 메뉴 (DropdownMenu):**
```
+--------------+
| 김관리자       |  <- 이름 + 이메일
| admin@gv.com  |
+--------------+
| 로그아웃      |  <- Form action으로 POST /logout
+--------------+
```

**참고:** Phase 0에서는 프로필 편집 없이 로그아웃만 구현. 프로필은 Settings > Users에서 관리.

---

## 4. 로그인 페이지 디자인

### 4.1 파일 구조

```
app/routes/_auth.login.tsx       <- 로그인 페이지 (라우트)
app/loaders/auth.server.ts       <- 로그인 loader/action
```

### 4.2 레이아웃

```
모바일 (< 768px):
+----------------------+
|                      |
|   세림 수입관리       |  <- 로고/타이틀 (중앙)
|   Import Management  |
|                      |
| +------------------+ |
| | 이메일            | |  <- full-width 입력
| +------------------+ |
| +------------------+ |
| | 비밀번호          | |
| +------------------+ |
|                      |
| +------------------+ |
| |    로그인         | |  <- full-width 버튼
| +------------------+ |
|                      |
|  에러 메시지 영역     |
|                      |
+----------------------+

데스크톱 (>= 768px):
+------------------------------------------+
|                                          |
|            +--------------+              |
|            |  세림 수입관리  |              |  <- Card 컴포넌트
|            |              |              |     max-w-sm, 중앙 배치
|            |  이메일       |              |
|            |  [________]  |              |
|            |  비밀번호     |              |
|            |  [________]  |              |
|            |              |              |
|            |  [  로그인  ] |              |
|            |              |              |
|            |  에러 메시지   |              |
|            +--------------+              |
|                                          |
+------------------------------------------+
```

### 4.3 구현 상세

**UI 요소:**
- Card: `w-full max-w-sm mx-auto`
- CardHeader: 로고 이미지 또는 텍스트 "세림 수입관리"
- CardDescription: "계정 정보를 입력하여 로그인하세요"
- Input (이메일): `type="email"`, `placeholder="이메일 주소"`, `autoComplete="email"`
- Input (비밀번호): `type="password"`, `placeholder="비밀번호"`, `autoComplete="current-password"`
- Button: `type="submit"`, `className="w-full"`, 텍스트 "로그인"
- 에러 메시지: 빨간색 텍스트, `role="alert"`

**폼 처리:**
- React Router 7 `Form` 컴포넌트 사용 (action으로 POST)
- Server action에서 Supabase `signInWithPassword` 호출
- 에러 시 `{ error: "이메일 또는 비밀번호가 올바르지 않습니다." }` 반환
- 성공 시 session cookie 설정 후 `/` redirect

**로딩 상태:**
- `useNavigation()` hook으로 submitting 상태 감지
- 버튼에 Spinner + "로그인 중..." 텍스트
- 입력 필드 disabled 처리

**접근성:**
- `aria-invalid` on inputs when error
- `aria-describedby` linking error message
- `autoFocus` on email input

### 4.4 배경/브랜딩

- 단순한 배경: `bg-muted` (연한 회색) 또는 `bg-background` (흰색)
- 복잡한 배경 패턴이나 일러스트레이션은 Phase 0에서 제외
- 오렌지 테마 적용 시: 로그인 버튼이 primary(orange) 색상

---

## 5. Saelim 레이아웃 (`_saelim.tsx`)

### 5.1 파일 구조

```
app/routes/_saelim.tsx              <- Saelim 레이아웃
app/routes/_saelim.delivery.tsx     <- 배송 목록
app/routes/_saelim.delivery.$id.tsx <- 배송 상세
app/loaders/saelim-layout.server.ts <- Saelim 레이아웃 loader
```

### 5.2 레이아웃 설계

Sidebar 없이 심플한 헤더 + 콘텐츠 구조:

```
+------------------------------------------+
|  세림 수입관리  |  배송관리  |     [A] 세림담당자 v  |
|  (로고)        |  (현재 메뉴) |     (사용자 메뉴)   |
+------------------------------------------+
|                                          |
|  콘텐츠 영역                               |
|  (배송 목록 또는 배송 상세)                   |
|                                          |
+------------------------------------------+
```

**특징:**
- 사이드바 없음 (접근 가능한 메뉴가 "배송관리" 하나뿐)
- 상단 헤더에 로고 + 현재 위치 + 사용자 메뉴
- 사용자 메뉴: 로그아웃만
- Auth 체크: org_type이 "buyer"인지 확인

### 5.3 배송 변경 요청 UI

배송 상세 페이지에서 "배송일 변경 요청" 버튼:
- Dialog 열기: 희망 배송일 (date picker) + 사유 (textarea)
- 제출 후 pending 상태로 표시
- 이전 요청 히스토리 표시 (승인/반려/대기 상태)

---

## 6. routes.ts 구성

### 6.1 React Router 7 라우트 설정

```ts
// app/routes.ts
import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  // 인증 (레이아웃 없음)
  route("login", "routes/_auth.login.tsx"),

  // GV 레이아웃
  layout("routes/_layout.tsx", [
    index("routes/_layout.dashboard.tsx"),

    // 설정
    route("settings", "routes/_layout.settings.tsx", [
      route("organizations", "routes/_layout.settings.organizations.tsx"),
      route("products", "routes/_layout.settings.products.tsx"),
      route("users", "routes/_layout.settings.users.tsx"),
    ]),

    // 문서관리 (Phase 2+에서 추가)
    // route("po", "routes/_layout.po.tsx"),
    // route("po/new", "routes/_layout.po.new.tsx"),
    // route("po/:id", "routes/_layout.po.$id.tsx"),
    // route("po/:id/edit", "routes/_layout.po.$id.edit.tsx"),
    // ... (PI, Shipping, Orders, Customs, Delivery)
  ]),

  // Saelim 레이아웃
  layout("routes/_saelim.tsx", [
    route("saelim/delivery", "routes/_saelim.delivery.tsx"),
    route("saelim/delivery/:id", "routes/_saelim.delivery.$id.tsx"),
  ]),
] satisfies RouteConfig;
```

### 6.2 Phase 0에서 구현할 라우트

| 라우트 | 파일 | 설명 |
|--------|------|------|
| `/login` | `_auth.login.tsx` | 로그인 |
| `/` | `_layout.dashboard.tsx` | GV 대시보드 (빈 페이지 또는 welcome) |
| `/settings/organizations` | `_layout.settings.organizations.tsx` | 조직 CRUD |
| `/settings/products` | `_layout.settings.products.tsx` | 제품 CRUD |
| `/settings/users` | `_layout.settings.users.tsx` | 사용자 CRUD |
| `/saelim/delivery` | `_saelim.delivery.tsx` | Saelim 배송 목록 (빈 페이지) |

### 6.3 라우트 Handle (Breadcrumb)

각 라우트 파일에서 handle export:
```ts
// routes/_layout.settings.organizations.tsx
export const handle = {
  breadcrumb: "조직관리",
  parent: "설정",
};
```

---

## 7. 공통 UI 패턴

### 7.1 Loading State (Skeleton)

```
Settings 목록 로딩 중:
+---------------------------------+
| [====]    [=======]             |  <- 제목 + 버튼 skeleton
+---------------------------------+
| ====== | ======= | ==== | === |  <- table header
| ====== | ======= | ==== | === |
| ====== | ======= | ==== | === |
| ====== | ======= | ==== | === |
+---------------------------------+
```

구현: `Skeleton` 컴포넌트 사용, 각 페이지별 skeleton 레이아웃 작성.

### 7.2 Error Boundary UI

```tsx
// 각 라우트 레벨에서 ErrorBoundary export
export function ErrorBoundary() {
  const error = useRouteError();
  // 한국어 에러 메시지
  // 404: "페이지를 찾을 수 없습니다"
  // 401: "로그인이 필요합니다" -> redirect
  // 500: "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
  // 재시도 버튼 + 홈으로 이동 버튼
}
```

**root.tsx ErrorBoundary도 한국어로 변경:**
- "Oops!" -> "오류 발생"
- "An unexpected error occurred." -> "예기치 않은 오류가 발생했습니다."
- "The requested page could not be found." -> "요청하신 페이지를 찾을 수 없습니다."

### 7.3 Empty State

설정 목록이 비어있을 때:

```
+---------------------------------+
|                                 |
|     [아이콘]                     |
|   등록된 조직이 없습니다.          |
|   조직을 추가하여 시작하세요.      |
|                                 |
|     [+ 조직 추가]                |
|                                 |
+---------------------------------+
```

공통 EmptyState 컴포넌트:
```ts
interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}
```

### 7.4 Toast/Notification (Sonner)

**사용 위치:**
- 설정 저장 성공: "조직이 등록되었습니다."
- 설정 삭제 성공: "조직이 삭제되었습니다."
- 에러: "저장에 실패했습니다. 다시 시도해주세요."
- 인증 만료: "세션이 만료되었습니다. 다시 로그인해주세요."

**설정:**
```tsx
// root.tsx에 Toaster 추가
import { Toaster } from "~/components/ui/sonner";

// Layout 내부에
<body>
  {children}
  <Toaster position="top-right" richColors />
  <ScrollRestoration />
  <Scripts />
</body>
```

### 7.5 Confirmation Dialog (삭제 확인)

AlertDialog 사용, 상태 제어 방식 (trigger 없이):
```
+---------------------------------+
|  조직 삭제                       |
|                                 |
|  "GV International"을            |
|  삭제하시겠습니까?                |
|  이 작업은 되돌릴 수 없습니다.     |
|                                 |
|        [취소]    [삭제]          |
+---------------------------------+
```

패턴: state-controlled dialog (반응형 레이아웃에서 AlertDialogTrigger 사용 지양)

```tsx
const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

<AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
  ...
</AlertDialog>
```

---

## 8. 아이콘 전략 (icons.tsx)

### 8.1 파일 구조

```
app/components/ui/icons.tsx
```

모든 아이콘을 중앙에서 re-export하여 관리:

```tsx
export {
  // 네비게이션
  FileText,        // PO (구매오더)
  Receipt,         // PI (견적서)
  Ship,            // Shipping (선적서류)
  ClipboardList,   // Orders (오더관리)
  ShieldCheck,     // Customs (통관관리)
  Truck,           // Delivery (배송관리)
  Building2,       // Organizations (조직관리)
  Package,         // Products (제품관리)
  Users,           // Users (사용자관리)
  LayoutDashboard, // Dashboard

  // 액션
  Plus,            // 추가/생성
  Pencil,          // 편집
  Trash2,          // 삭제
  Copy,            // 복제/클론
  Download,        // 다운로드/PDF
  Upload,          // 업로드
  Search,          // 검색
  Filter,          // 필터
  MoreHorizontal,  // 더보기 메뉴
  ArrowLeft,       // 뒤로가기
  ChevronRight,    // breadcrumb 구분자
  X,               // 닫기/취소
  Check,           // 확인/완료
  RefreshCw,       // 새로고침

  // 상태
  CircleDot,       // 진행 중
  CheckCircle2,    // 완료
  AlertCircle,     // 경고
  Clock,           // 대기 중
  Loader2,         // 로딩 스피너

  // 사용자/인증
  LogOut,          // 로그아웃
  User,            // 사용자 프로필
  Mail,            // 이메일
  Lock,            // 비밀번호/보안
  Eye,             // 비밀번호 보기
  EyeOff,          // 비밀번호 숨기기

  // 레이아웃
  PanelLeft,       // Sidebar 토글
  Menu,            // 모바일 메뉴
  ChevronDown,     // 드롭다운
  ChevronsUpDown,  // 정렬
} from "lucide-react";
```

### 8.2 사용 규칙

1. 모든 컴포넌트에서 `~/components/ui/icons`에서 import
2. `lucide-react`에서 직접 import 금지 (일관성)
3. 새 아이콘 필요 시 icons.tsx에 먼저 추가
4. 아이콘 크기: sidebar `size={20}`, inline `size={16}`, page title `size={24}`

---

## 9. 테마 색상 변경 (Orange Primary)

### 9.1 현재 문제

현재 `app.css`의 primary가 neutral(검정/회색) 기반:
```css
--primary: oklch(0.205 0 0);          /* 거의 검정 */
--primary-foreground: oklch(0.985 0 0); /* 거의 흰색 */
```

### 9.2 Orange Primary 적용

브랜딩 가이드에 따라 `oklch(0.7 0.18 50)` 기반의 orange 테마:

```css
:root {
  /* Primary - Orange */
  --primary: oklch(0.7 0.18 50);
  --primary-foreground: oklch(0.985 0 0);

  /* Ring도 primary에 맞춤 */
  --ring: oklch(0.7 0.18 50);
}

.dark {
  /* Dark mode에서는 약간 밝은 orange */
  --primary: oklch(0.75 0.16 50);
  --primary-foreground: oklch(0.15 0 0);

  --ring: oklch(0.75 0.16 50);
}
```

### 9.3 Sidebar 테마

Sidebar primary도 orange로 일관성 유지:
```css
:root {
  --sidebar-primary: oklch(0.7 0.18 50);
  --sidebar-primary-foreground: oklch(0.985 0 0);
}
```

### 9.4 적용 효과

- 로그인 버튼: 오렌지
- Sidebar 활성 메뉴: 오렌지 배경
- Focus ring: 오렌지
- 주요 CTA 버튼 (추가, 저장): 오렌지
- Destructive는 유지 (빨간색, 삭제 등)

---

## 10. Phase 0 구현 순서 (권장)

### Step 1: 기반 설정
1. `lang="ko"` 변경
2. Noto Sans KR 폰트 추가
3. Orange primary 테마 적용
4. shadcn 컴포넌트 일괄 설치
5. `icons.tsx` 생성

### Step 2: 레이아웃 쉘
1. `app-sidebar.tsx` 구현
2. `header.tsx` (breadcrumb + user menu) 구현
3. `page-container.tsx` 구현
4. `_layout.tsx` 라우트 (GV 레이아웃)
5. `routes.ts` 업데이트

### Step 3: 인증
1. `_auth.login.tsx` 로그인 페이지
2. `auth.server.ts` 로그인 loader/action
3. 로그아웃 action

### Step 4: 설정 페이지
1. `_layout.settings.tsx` 설정 레이아웃
2. 조직관리 CRUD
3. 제품관리 CRUD
4. 사용자관리 CRUD

### Step 5: Saelim 레이아웃
1. `_saelim.tsx` 레이아웃
2. 배송 빈 페이지 (Phase 8에서 구현)

### Step 6: 공통 패턴
1. EmptyState 컴포넌트
2. ErrorBoundary (한국어)
3. Sonner Toast 설정
4. Skeleton 패턴

---

## 11. 파일 생성 체크리스트

### 새로 생성할 파일

```
app/
+- components/
|   +- ui/
|   |   +- icons.tsx                    <- lucide-react 중앙 관리
|   |   +- (shadcn 자동 생성 파일들)
|   +- layout/
|   |   +- app-sidebar.tsx              <- GV 사이드바
|   |   +- saelim-header.tsx            <- Saelim 간소화 헤더
|   |   +- header.tsx                   <- GV 헤더 (breadcrumb)
|   |   +- page-container.tsx           <- 페이지 래퍼
|   |   +- empty-state.tsx              <- 빈 상태 공통 컴포넌트
|   +- shared/
|       +- confirm-dialog.tsx           <- 삭제 확인 다이얼로그
+- routes/
|   +- _auth.login.tsx                  <- 로그인
|   +- _layout.tsx                      <- GV 레이아웃
|   +- _layout.dashboard.tsx            <- 대시보드 (placeholder)
|   +- _layout.settings.tsx             <- 설정 레이아웃
|   +- _layout.settings.organizations.tsx
|   +- _layout.settings.products.tsx
|   +- _layout.settings.users.tsx
|   +- _saelim.tsx                      <- Saelim 레이아웃
|   +- _saelim.delivery.tsx             <- Saelim 배송 (placeholder)
|   +- _saelim.delivery.$id.tsx         <- Saelim 배송 상세 (placeholder)
+- loaders/
|   +- layout.server.ts                 <- GV 레이아웃 loader (auth 체크)
|   +- saelim-layout.server.ts          <- Saelim 레이아웃 loader
|   +- auth.server.ts                   <- 로그인/로그아웃 action
|   +- settings-organizations.server.ts
|   +- settings-products.server.ts
|   +- settings-users.server.ts
+- lib/
|   +- utils.ts                         <- 기존 (cn 함수)
|   +- supabase.server.ts               <- Supabase 클라이언트 생성
|   +- auth.server.ts                   <- getAuthUser 헬퍼
+- types/
    +- database.ts                      <- Supabase 타입 (supabase gen types)
    +- navigation.ts                    <- 네비게이션 아이템 타입
```

### 수정할 기존 파일

| 파일 | 변경 내용 |
|------|----------|
| `app/root.tsx` | `lang="ko"`, Noto Sans KR 추가, Toaster 추가, ErrorBoundary 한국어화 |
| `app/app.css` | font-sans 변경, orange primary 테마 적용 |
| `app/routes.ts` | 전체 라우트 구성 재작성 |
| `app/routes/home.tsx` | 삭제 또는 대시보드로 대체 |

---

## 12. 주의 사항 및 열린 질문

### 주의 사항

1. **Server/Client 분리 철저**: `.server.ts` 파일은 절대 클라이언트에서 import하지 않는다
2. **반응형 패턴 일관성**: 모바일 `md:hidden`, 데스크톱 `hidden md:block` 패턴 준수
3. **State-controlled dialogs**: AlertDialogTrigger 대신 상태로 제어 (반응형 대응)
4. **Cloudflare Workers 제약**: `node:*` 내장 모듈 사용 불가, Workers 호환 라이브러리만 사용
5. **Supabase Auth in Workers**: `@supabase/ssr` 패키지의 cookie 기반 세션 관리 필요

### 열린 질문

| # | 질문 | 선택지 | 기본값 |
|---|------|--------|--------|
| 1 | 폰트 순서 | Noto Sans KR 우선 / Inter 우선 | Noto Sans KR 우선 |
| 2 | Dark mode 지원 시기 | Phase 0 / Phase 10 | Phase 10 (light only 우선) |
| 3 | Dashboard 페이지 | 빈 페이지 / Welcome 메시지 / 설정으로 redirect | Welcome 메시지 |
| 4 | Settings 라우트 구조 | 중첩 layout / 개별 페이지 | 개별 페이지 (settings는 index route로 organizations redirect) |
| 5 | form 라이브러리 | react-hook-form + zod / React Router Form만 | RR Form으로 시작, 복잡해지면 RHF 추가 |
| 6 | TanStack Query 도입 시기 | Phase 0 / Phase 2 | Phase 2 (React Router loaders로 시작) |
