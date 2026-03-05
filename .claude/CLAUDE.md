# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` - Start dev server with HMR (http://localhost:5173)
- `npm run build` - Production build via react-router
- `npm run preview` - Build + preview locally
- `npm run deploy` - Build + deploy to Cloudflare Workers
- `npm run typecheck` - Generate Cloudflare types, React Router types, then run `tsc -b`
- `npm run cf-typegen` - Generate Cloudflare Worker types via wrangler
- `npx wrangler versions upload` - Deploy preview URL
- `npx vitest run` - Run tests (if configured)

## Architecture

### Stack
- **Framework**: React Router 7 with SSR, file-based routing
- **Runtime**: Cloudflare Workers (edge, `workers/app.ts` is the entry point)
- **Styling**: Tailwind CSS v4 + shadcn/ui (new-york style)
- **Database**: Supabase (PostgreSQL + RLS + RPC)
- **Language**: TypeScript (strict mode, `verbatimModuleSyntax`)
- **UI Language**: Korean

### Project Structure
```
workers/app.ts          # Cloudflare Worker entry - creates React Router request handler
app/
  root.tsx              # Root layout with Inter font
  routes.ts             # Route config using @react-router/dev/routes
  routes/               # Route pages (file-based routing)
  loaders/*.server.ts   # Server-side loaders and actions
  lib/*.server.ts       # Server utilities (auth, supabase client)
  components/           # Components organized by domain
    ui/                 # shadcn/ui components + icons.tsx (lucide-react)
    charts/             # Recharts wrappers
    club/, companion/, course/, score/, stats/, layout/
  types/                # TypeScript types
```

### Key Patterns

**Server/Client Separation**: All server code lives in `app/loaders/*.server.ts`. Routes re-export loaders/actions:
```typescript
// app/routes/_layout.feature.tsx
export { loader, action } from "~/loaders/feature.server";
```

**Cloudflare context**: Access env vars via `context.cloudflare.env` in loaders. The `AppLoadContext` type is augmented in `workers/app.ts`.

**Responsive Design**: Mobile-first with `md:` breakpoint (768px). Mobile sections use `md:hidden`, desktop sections use `hidden md:block`. Layout pages use `PageContainer fullWidth`.

**Auth pattern**: Always call `getAuthUser(request)` before data access in loaders/actions.

### Configuration
- `wrangler.jsonc` - Cloudflare Worker config (name: "saelim", nodejs_compat enabled)
- `react-router.config.ts` - SSR enabled, v8 vite environment API
- `vite.config.ts` - Cloudflare + Tailwind + React Router + tsconfig paths plugins
- Path alias `~` maps to `app/` directory
