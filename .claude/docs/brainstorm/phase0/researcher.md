# Phase 0 Research Notes: 기술 패턴 및 라이브러리 조사

**Date:** 2026-03-06
**Role:** Researcher
**Scope:** React Router 7 + Supabase Auth, @supabase/ssr, Shadcn Sidebar, 한국어 폰트

---

## 요약

| 항목 | 현황 | 권장 |
|------|------|------|
| Supabase SSR + CF Workers | `nodejs_compat` 이미 설정 | `@supabase/ssr` 바로 사용 가능 |
| Auth 패턴 | RR7 loader redirect | `requireUser()` 헬퍼 패턴 |
| 미들웨어 | 7.9+ opt-in 가능 | Phase 0는 loader 패턴으로 시작 |
| Cookie 처리 | getAll/setAll 필수 | `createServerClient` 어댑터 구현 |
| Sidebar | shadcn/ui 내장 | `SidebarMenuButton isActive` |
| 한국어 폰트 | Inter 현재 설정됨 | Pretendard Variable Dynamic Subset |
| Zod 검증 | 미설정 | `zod` + `safeParse` 직접 |
| Tailwind v4 | 이미 정상 설정됨 | 추가 설정 불필요 |

---

## 1. React Router 7 + Supabase Auth 통합

### 1.1 핵심 패턴: loader에서의 인증

```typescript
// app/lib/auth.server.ts
export async function requireUser(request: Request, context: AppLoadContext) {
  const { supabase, responseHeaders } = createSupabaseServerClient(request, context);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (!user || error) {
    throw redirect("/login", { headers: responseHeaders });
  }
  return { user, supabase, responseHeaders };
}

// app/loaders/po.server.ts
export async function loader({ request, context }: Route.LoaderArgs) {
  const { user, supabase } = await requireUser(request, context);
  // ...데이터 로딩
}
```

### 1.2 React Router 7.9+ 미들웨어 API (신기능)

React Router 7.3에서 `unstable_` 접두사로 도입, 7.9.0에서 안정화. `future.v8_middleware` 플래그로 opt-in.

```typescript
// react-router.config.ts
export default {
  future: {
    v8_middleware: true,  // opt-in
  }
} satisfies Config;
```

**권장:** 현재는 loader 기반 패턴으로 시작하고, 복잡도가 올라가면 미들웨어로 전환.

### 1.3 세션 응답 처리

Supabase SSR은 세션 갱신 시 Set-Cookie 헤더를 응답에 추가해야 함.

```typescript
// loader에서 헤더를 응답에 포함
return data({ user, poList }, { headers: responseHeaders });
```

---

## 2. @supabase/ssr 패키지

### 2.1 Cloudflare Workers 호환성 (해결됨)

`@supabase/ssr`은 Node.js의 `stream` 모듈을 사용하여 Workers에서 에러 발생 가능.
**해결:** `nodejs_compat` 플래그 → 현재 프로젝트 `wrangler.jsonc`에 이미 설정됨.

```jsonc
{
  "compatibility_date": "2025-04-04",
  "compatibility_flags": ["nodejs_compat"]  // 이미 설정
}
```

### 2.2 createServerClient 구현 패턴

```typescript
// app/lib/supabase.server.ts
import { createServerClient } from "@supabase/ssr";
import type { AppLoadContext } from "react-router";

export function createSupabaseServerClient(
  request: Request,
  context: AppLoadContext
) {
  const cookieHeader = request.headers.get("Cookie") ?? "";
  const responseHeaders = new Headers();

  const supabase = createServerClient(
    context.cloudflare.env.SUPABASE_URL,
    context.cloudflare.env.SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return parseCookies(cookieHeader);
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            responseHeaders.append(
              "Set-Cookie",
              serializeCookie(name, value, options)
            );
          });
        },
      },
    }
  );

  return { supabase, responseHeaders };
}
```

**중요:** `getAll`과 `setAll`만 사용. `get`, `set`, `remove`는 deprecated.

### 2.3 Set-Cookie 헤더 중복 이슈

Cloudflare Workers에서 여러 Set-Cookie 헤더 처리:
- `headers.getSetCookie()` 메서드 사용 (모든 쿠키 반환)
- `get("Set-Cookie")`는 첫 번째만 반환 → 사용 금지

### 2.4 요청당 단일 클라이언트

**supabase/ssr Issue #144:** 동일 요청에서 `createServerClient`를 여러 번 호출하면 Set-Cookie 헤더 중복 → Cloudflare 헤더 크기 제한(16KB) 초과 가능. 요청당 단일 클라이언트 인스턴스 권장.

---

## 3. Shadcn/ui Sidebar 컴포넌트

### 3.1 구성 요소 구조

```
SidebarProvider          // 상태 관리 (open/collapsed)
  └─ Sidebar             // 컨테이너 (variant: sidebar/floating/inset)
       ├─ SidebarHeader  // 상단 (로고)
       ├─ SidebarContent // 스크롤 영역
       │   └─ SidebarGroup
       │       ├─ SidebarGroupLabel
       │       └─ SidebarGroupContent
       │           └─ SidebarMenu
       │               └─ SidebarMenuItem
       │                   └─ SidebarMenuButton (isActive prop)
       └─ SidebarFooter  // 하단 (사용자 정보)
```

### 3.2 모바일 Sheet 모드

모바일에서 Sheet(drawer)로 자동 전환. `SidebarTrigger` 배치만 하면 됨.

```tsx
<SidebarTrigger className="md:hidden" />
```

### 3.3 활성 라우트 표시

```tsx
import { useLocation, Link } from "react-router";

function NavItem({ href, label, icon: Icon }) {
  const { pathname } = useLocation();
  const isActive = pathname.startsWith(href);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive}>
        <Link to={href}>
          <Icon />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
```

### 3.4 네비게이션 구조

```tsx
const navItems = [
  { href: "/po",       label: "구매주문 (PO)",   icon: ShoppingCart },
  { href: "/pi",       label: "견적서 (PI)",      icon: FileText },
  { href: "/shipping", label: "선적서류",          icon: Ship },
  { href: "/orders",   label: "오더 관리",         icon: Package },
  { href: "/customs",  label: "통관 관리",         icon: Landmark },
  { href: "/delivery", label: "배송 관리",         icon: Truck },
];

const settingsItems = [
  { href: "/settings/organizations", label: "거래처 관리" },
  { href: "/settings/products",      label: "제품 관리" },
  { href: "/settings/users",         label: "사용자 관리" },
];
```

### 3.5 Collapsible 그룹

```tsx
<Collapsible defaultOpen>
  <SidebarGroup>
    <SidebarGroupLabel asChild>
      <CollapsibleTrigger>설정</CollapsibleTrigger>
    </SidebarGroupLabel>
    <CollapsibleContent>
      <SidebarGroupContent>
        {settingsItems.map(item => <NavItem key={item.href} {...item} />)}
      </SidebarGroupContent>
    </CollapsibleContent>
  </SidebarGroup>
</Collapsible>
```

---

## 4. TailwindCSS v4 + Shadcn/ui

### 현재 프로젝트 상태 (이미 올바르게 설정됨)

`app/app.css` 확인:
```css
@import "tailwindcss" source(".");   /* v4 방식 */
@import "tw-animate-css";            /* v3의 tailwindcss-animate 대체 */
@import "shadcn/tailwind.css";       /* shadcn 기본 스타일 */

@theme inline {                      /* CSS variables → Tailwind tokens */
  --color-background: var(--background);
}

:root {
  --background: oklch(1 0 0);        /* OKLCH 색상 공간 */
}
```

### v4 핵심 변경사항

| 항목 | v3 | v4 |
|------|-----|-----|
| 설정 파일 | `tailwind.config.js` | 없음 (CSS-first) |
| 색상 공간 | HSL | OKLCH |
| 애니메이션 | `tailwindcss-animate` | `tw-animate-css` |
| Import 방식 | PostCSS 플러그인 | `@import "tailwindcss"` |
| Theme 설정 | JS 객체 | `@theme { }` 블록 |

---

## 5. Cloudflare Workers + Supabase 통합

### Workers 제약 및 대응

| 제약 | 내용 | 대응 |
|------|------|------|
| CPU 시간 | 10ms (무료) / 30s (유료) | Supabase 호출 최소화, 인덱스 최적화 |
| 메모리 | 128MB | 대용량 파일 처리 금지 |
| 파일시스템 | 없음 | Supabase Storage 사용 |
| Node.js API | 제한적 | `nodejs_compat` 플래그로 해결 |

### Cookie 처리 주의사항

```typescript
// 올바른 방법: append 사용
responseHeaders.append('Set-Cookie', cookie1);
responseHeaders.append('Set-Cookie', cookie2);

// React Router response에 쿠키 전달
return data(result, { headers: responseHeaders });
```

---

## 6. Zod 스키마 유효성 검증

### React Router action에서의 패턴

```typescript
import { z } from "zod";

const OrganizationSchema = z.object({
  name_en: z.string().min(1, "영문명 필수"),
  name_ko: z.string().min(1, "한글명 필수"),
  type: z.enum(["supplier", "seller", "buyer"]),
  address_en: z.string().optional(),
  phone: z.string().optional(),
});

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireUser(request, context);
  const formData = await request.formData();
  const rawData = Object.fromEntries(formData);
  const result = OrganizationSchema.safeParse(rawData);

  if (!result.success) {
    return data({ errors: result.error.flatten() }, { status: 400 });
  }
  // ...
}
```

### 라이브러리 선택

| 라이브러리 | 특징 | 권장 |
|-----------|------|------|
| Zod 직접 사용 | 의존성 최소, 유연 | **권장 (기본)** |
| @conform-to/zod | Zod 통합 폼 검증 | 복잡한 폼에만 |

---

## 7. 한국어 폰트 전략

### Pretendard Variable (최우선 권장)

다이나믹 서브셋 CDN: 페이지에 사용된 글자만 로드 (평균 80-150KB/페이지)

```tsx
// root.tsx links 함수
export const links: Route.LinksFunction = () => [
  {
    rel: "stylesheet",
    href: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css",
  },
];
```

```css
/* app/app.css */
@theme {
  --font-sans: "Pretendard Variable", "Pretendard",
    ui-sans-serif, system-ui, sans-serif;
}
```

### 비교

| 항목 | Pretendard Variable (Dynamic Subset) | Noto Sans KR (Google Fonts) |
|------|--------------------------------------|------------------------------|
| 평균 로딩 크기 | ~80-150KB (사용 글자만) | ~419KB (weight당) |
| Variable Font | 지원 | 미지원 |
| CDN | jsDelivr / cdnjs | Google Fonts |
| 비즈니스 적합도 | 매우 높음 | 높음 |

**권장: Pretendard Variable Dynamic Subset** (CDN jsDelivr)

---

## 주의사항 및 리스크

1. **Set-Cookie 헤더 누락:** Supabase 세션 갱신 시 response에 `responseHeaders` 반드시 포함. 누락 시 세션 만료 후 갑자기 로그아웃.

2. **Supabase SSR Issue #144:** 요청당 `createServerClient` 여러 번 호출 → Set-Cookie 중복 → 헤더 크기 초과. 단일 인스턴스 권장.

3. **RLS app_metadata:** `app_metadata` 기반 RLS는 service_role_key로만 설정 가능. anon key로 `app_metadata` 쓰기 불가.

4. **Pretendard CDN 의존성:** 외부 CDN 장애 시 폰트 렌더링 영향. 중요도 높으면 self-hosting (R2/Supabase Storage) 고려.

---

## Sources

- [Supabase SSR Docs](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [@supabase/ssr on CF Workers - GitHub Issue #37592](https://github.com/supabase/supabase/issues/37592)
- [Middleware - React Router Docs](https://reactrouter.com/how-to/middleware)
- [Sidebar - shadcn/ui Docs](https://ui.shadcn.com/docs/components/radix/sidebar)
- [Node.js compatibility in CF Workers - 2025](https://blog.cloudflare.com/nodejs-workers-2025/)
- [orioncactus/pretendard - GitHub](https://github.com/orioncactus/pretendard)
- [supabase/ssr Issue #144](https://github.com/supabase/ssr/issues/144)
