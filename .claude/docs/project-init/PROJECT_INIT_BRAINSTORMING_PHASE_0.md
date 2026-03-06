# Saelim Import Management System - Phase 0 상세 브레인스토밍

**Date:** 2026-03-06
**Status:** Phase 0 상세 설계 완료
**참조:** [종합 브레인스토밍](../PROJECT_INIT_BRAINSTORMING.md)

---

## 1. Phase 0 개요

### 정의
Phase 1(Foundation: Auth + Settings + DB) 구현 전에 필요한 **모든 인프라 준비 단계**.
코드 작성의 기반이 되는 환경 설정, DB 스키마, Auth 인프라, 기본 레이아웃을 구축한다.

### 현재 상태
| 항목 | 상태 |
|------|------|
| 프로젝트 스캐폴딩 | 완료 (React Router 7 + CF Workers) |
| Shadcn/ui | components.json 설정됨, 컴포넌트 미설치 |
| TailwindCSS v4 | app.css 테마 변수 설정됨 (neutral) |
| 폰트 | Inter만 (한국어 폰트 미설정) |
| 라우팅 | index route만 (home.tsx) |
| Supabase | 미연결 |
| Auth | 미구현 |
| DB | 미생성 |

---

## 2. Sub-phases & 의존성

### Phase 0-A: Supabase 인프라
### Phase 0-B: 프로젝트 의존성 & 설정
### Phase 0-C: Auth 시스템
### Phase 0-D: 기본 레이아웃 & 라우팅
### Phase 0-E: 공통 유틸리티 & 타입

```
Phase 0-A (Supabase)          Phase 0-B (의존성)
    │                               │
    │  ┌────────────────────────────┘
    │  │
    ▼  ▼
Phase 0-C (Auth)              Phase 0-E (유틸리티)  ← 부분 병렬
    │                               │
    │  ┌────────────────────────────┘
    │  │
    ▼  ▼
Phase 0-D (레이아웃 & 라우팅)
    │
    ▼
Phase 0 완료 → Phase 1 시작
```

**병렬 가능:** 0-A + 0-B, 0-C + 0-E (format.ts, constants.ts)

---

## 3. Phase 0-A: Supabase 인프라

### 3.1 MCP 실행 순서

```
Step 1: mcp__supabase__list_organizations     → 기존 org 확인
Step 2: mcp__supabase__list_projects          → 기존 프로젝트 확인
Step 3: mcp__supabase__create_project         → "saelim" (ap-northeast-1)
Step 4: mcp__supabase__get_project            → project_id
Step 5: mcp__supabase__get_project_url        → URL 확인
Step 6: mcp__supabase__get_publishable_keys   → anon key
Step 7: mcp__supabase__apply_migration × 10   → DB 스키마
Step 8: mcp__supabase__execute_sql            → Seed 데이터
Step 9: mcp__supabase__generate_typescript_types → 타입 생성
```

### 3.2 DB 마이그레이션 (10개 파일)

#### 001_extensions_and_helpers
```sql
-- moddatetime extension for auto-updating updated_at
CREATE EXTENSION IF NOT EXISTS moddatetime SCHEMA extensions;

-- Helper: updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Helper: get user org type from app_metadata (NOT user_metadata)
CREATE OR REPLACE FUNCTION get_user_org_type()
RETURNS TEXT AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'org_type')::TEXT,
    ''
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: get user org id from app_metadata
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'org_id')::UUID,
    '00000000-0000-0000-0000-000000000000'::UUID
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

#### 002_core_tables
```sql
-- Organizations
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('supplier', 'seller', 'buyer')),
  name_en TEXT NOT NULL,
  name_ko TEXT,
  address_en TEXT,
  address_ko TEXT,
  phone TEXT,
  fax TEXT,
  signature_image_url TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Products
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  gsm INT,
  width_mm INT,
  hs_code TEXT,           -- 관세 분류코드
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Profiles (extends auth.users)
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  org_id UUID REFERENCES organizations(id),
  role TEXT DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Document Number Sequences
CREATE TABLE document_sequences (
  doc_prefix TEXT NOT NULL,
  doc_yymm TEXT NOT NULL,
  seq_no INT NOT NULL DEFAULT 0,
  PRIMARY KEY (doc_prefix, doc_yymm)
);

-- updated_at triggers
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

#### 003_document_tables
```sql
-- Purchase Orders
CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_no TEXT UNIQUE NOT NULL,
  po_date DATE NOT NULL,
  validity DATE,
  ref_no TEXT,
  supplier_id UUID REFERENCES organizations(id),
  buyer_id UUID REFERENCES organizations(id),
  currency TEXT DEFAULT 'USD',
  amount DECIMAL(15,2),
  payment_term TEXT,
  delivery_term TEXT,
  loading_port TEXT,
  discharge_port TEXT,
  details JSONB DEFAULT '[]',
  notes TEXT,
  status TEXT DEFAULT 'process' CHECK (status IN ('process', 'complete')),
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Proforma Invoices
CREATE TABLE proforma_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pi_no TEXT UNIQUE NOT NULL,
  pi_date DATE NOT NULL,
  validity DATE,
  ref_no TEXT,
  supplier_id UUID REFERENCES organizations(id),
  buyer_id UUID REFERENCES organizations(id),
  currency TEXT DEFAULT 'USD',
  amount DECIMAL(15,2),
  payment_term TEXT,
  delivery_term TEXT,
  loading_port TEXT,
  discharge_port TEXT,
  details JSONB DEFAULT '[]',
  notes TEXT,
  status TEXT DEFAULT 'process' CHECK (status IN ('process', 'complete')),
  po_id UUID REFERENCES purchase_orders(id),
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Deliveries (PI 생성 시 자동 생성)
CREATE TABLE deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pi_id UUID REFERENCES proforma_invoices(id),
  shipping_doc_id UUID,  -- FK는 shipping_documents 생성 후 추가
  delivery_date DATE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Shipping Documents
CREATE TABLE shipping_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ci_no TEXT UNIQUE NOT NULL,
  pl_no TEXT UNIQUE NOT NULL,
  ci_date DATE NOT NULL,
  ref_no TEXT,
  shipper_id UUID REFERENCES organizations(id),
  consignee_id UUID REFERENCES organizations(id),
  currency TEXT DEFAULT 'USD',
  amount DECIMAL(15,2),
  payment_term TEXT,
  delivery_term TEXT,
  loading_port TEXT,
  discharge_port TEXT,
  details JSONB DEFAULT '[]',
  notes TEXT,
  status TEXT DEFAULT 'process' CHECK (status IN ('process', 'complete')),
  pi_id UUID REFERENCES proforma_invoices(id),
  vessel TEXT,
  voyage TEXT,
  ship_date DATE,
  etd DATE,
  eta DATE,
  net_weight DECIMAL(12,3),
  gross_weight DECIMAL(12,3),
  package_no INT,
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add FK to deliveries
ALTER TABLE deliveries
  ADD CONSTRAINT deliveries_shipping_doc_id_fkey
  FOREIGN KEY (shipping_doc_id) REFERENCES shipping_documents(id);

-- Stuffing Lists
CREATE TABLE stuffing_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sl_no TEXT,
  cntr_no TEXT,
  seal_no TEXT,
  roll_no_range TEXT,
  roll_details JSONB DEFAULT '[]',
  shipping_doc_id UUID REFERENCES shipping_documents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customs
CREATE TABLE customs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customs_no TEXT,
  customs_date DATE,
  shipping_doc_id UUID REFERENCES shipping_documents(id),
  transport_fee JSONB DEFAULT '{"supply":0,"vat":0,"total":0}',
  customs_fee JSONB DEFAULT '{"supply":0,"vat":0,"total":0}',
  vat_fee JSONB DEFAULT '{"supply":0,"vat":0,"total":0}',
  etc_desc TEXT,
  etc_fee JSONB DEFAULT '{"supply":0,"vat":0,"total":0}',
  fee_received BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Orders (Aggregation)
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID REFERENCES purchase_orders(id),
  pi_id UUID REFERENCES proforma_invoices(id),
  shipping_doc_id UUID REFERENCES shipping_documents(id),
  customs_id UUID REFERENCES customs(id),
  delivery_id UUID REFERENCES deliveries(id),
  saelim_no TEXT,
  delivery_date DATE,
  advice_date DATE,
  arrival_date DATE,
  customs_fee_received BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- updated_at triggers
CREATE TRIGGER update_po_updated_at BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_pi_updated_at BEFORE UPDATE ON proforma_invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_deliveries_updated_at BEFORE UPDATE ON deliveries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_shipping_updated_at BEFORE UPDATE ON shipping_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_stuffing_updated_at BEFORE UPDATE ON stuffing_lists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_customs_updated_at BEFORE UPDATE ON customs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

#### 004_content_system
```sql
-- Contents (Polymorphic)
CREATE TABLE contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('po', 'pi', 'shipping', 'order', 'customs')),
  parent_id UUID NOT NULL,
  title TEXT,
  body JSONB,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Content Attachments
CREATE TABLE content_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID REFERENCES contents(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comments
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID REFERENCES contents(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_contents_updated_at BEFORE UPDATE ON contents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

#### 005_delivery_changes
```sql
CREATE TABLE delivery_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID REFERENCES deliveries(id) ON DELETE CASCADE,
  requested_date DATE NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  response_text TEXT,
  requested_by UUID REFERENCES auth.users(id),
  responded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_dcr_updated_at BEFORE UPDATE ON delivery_change_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

#### 006_rls_policies
```sql
-- Enable RLS on ALL tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE proforma_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE stuffing_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE customs ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- GV: Full access to all tables (soft delete filter)
CREATE POLICY "gv_all" ON organizations FOR ALL USING (get_user_org_type() = 'gv');
CREATE POLICY "gv_all" ON products FOR ALL USING (get_user_org_type() = 'gv');
CREATE POLICY "gv_all" ON user_profiles FOR ALL USING (get_user_org_type() = 'gv');
CREATE POLICY "gv_all" ON document_sequences FOR ALL USING (get_user_org_type() = 'gv');
CREATE POLICY "gv_all" ON purchase_orders FOR ALL USING (get_user_org_type() = 'gv');
CREATE POLICY "gv_all" ON proforma_invoices FOR ALL USING (get_user_org_type() = 'gv');
CREATE POLICY "gv_all" ON deliveries FOR ALL USING (get_user_org_type() = 'gv');
CREATE POLICY "gv_all" ON shipping_documents FOR ALL USING (get_user_org_type() = 'gv');
CREATE POLICY "gv_all" ON stuffing_lists FOR ALL USING (get_user_org_type() = 'gv');
CREATE POLICY "gv_all" ON customs FOR ALL USING (get_user_org_type() = 'gv');
CREATE POLICY "gv_all" ON orders FOR ALL USING (get_user_org_type() = 'gv');
CREATE POLICY "gv_all" ON delivery_change_requests FOR ALL USING (get_user_org_type() = 'gv');
CREATE POLICY "gv_all" ON contents FOR ALL USING (get_user_org_type() = 'gv');
CREATE POLICY "gv_all" ON content_attachments FOR ALL USING (get_user_org_type() = 'gv');
CREATE POLICY "gv_all" ON comments FOR ALL USING (get_user_org_type() = 'gv');

-- Saelim: Read deliveries only
CREATE POLICY "saelim_read" ON deliveries
  FOR SELECT USING (get_user_org_type() = 'saelim');

-- Saelim: Read shipping docs (limited - application filters sensitive columns)
CREATE POLICY "saelim_read" ON shipping_documents
  FOR SELECT USING (get_user_org_type() = 'saelim');

-- Saelim: Read organizations (for display)
CREATE POLICY "saelim_read" ON organizations
  FOR SELECT USING (get_user_org_type() = 'saelim');

-- Saelim: Read products (for display)
CREATE POLICY "saelim_read" ON products
  FOR SELECT USING (get_user_org_type() = 'saelim');

-- Saelim: Manage own delivery change requests
CREATE POLICY "saelim_select" ON delivery_change_requests
  FOR SELECT USING (
    get_user_org_type() = 'saelim' AND requested_by = auth.uid()
  );
CREATE POLICY "saelim_insert" ON delivery_change_requests
  FOR INSERT WITH CHECK (
    get_user_org_type() = 'saelim' AND requested_by = auth.uid()
  );

-- Saelim: Read own user profile
CREATE POLICY "saelim_read_own" ON user_profiles
  FOR SELECT USING (id = auth.uid());
```

#### 007_rpc_functions
```sql
-- Document number generation (concurrent-safe)
CREATE OR REPLACE FUNCTION generate_doc_number(
  doc_type TEXT,
  ref_date DATE DEFAULT CURRENT_DATE
) RETURNS TEXT AS $$
DECLARE
  prefix TEXT;
  yymm TEXT;
  next_seq INT;
  result TEXT;
BEGIN
  prefix := 'GV' || doc_type;
  yymm := TO_CHAR(ref_date, 'YYMM');

  PERFORM pg_advisory_xact_lock(hashtext(prefix || yymm));

  SELECT COALESCE(MAX(seq_no), 0) + 1 INTO next_seq
  FROM document_sequences
  WHERE doc_prefix = prefix AND doc_yymm = yymm;

  INSERT INTO document_sequences (doc_prefix, doc_yymm, seq_no)
  VALUES (prefix, yymm, next_seq)
  ON CONFLICT (doc_prefix, doc_yymm)
  DO UPDATE SET seq_no = next_seq;

  result := prefix || yymm || '-' || LPAD(next_seq::TEXT, 3, '0');
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### 008_indexes
```sql
-- Performance indexes
CREATE INDEX idx_user_profiles_org_id ON user_profiles(org_id);
CREATE INDEX idx_po_status ON purchase_orders(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_po_created_at ON purchase_orders(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_pi_status ON proforma_invoices(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_pi_po_id ON proforma_invoices(po_id);
CREATE INDEX idx_pi_created_at ON proforma_invoices(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_shipping_pi_id ON shipping_documents(pi_id);
CREATE INDEX idx_shipping_status ON shipping_documents(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_customs_shipping_doc_id ON customs(shipping_doc_id);
CREATE INDEX idx_deliveries_pi_id ON deliveries(pi_id);
CREATE INDEX idx_deliveries_shipping_doc_id ON deliveries(shipping_doc_id);
CREATE INDEX idx_orders_po_id ON orders(po_id);
CREATE INDEX idx_orders_pi_id ON orders(pi_id);
CREATE INDEX idx_contents_type_parent ON contents(type, parent_id);
CREATE INDEX idx_comments_content_id ON comments(content_id);
CREATE INDEX idx_dcr_delivery_id ON delivery_change_requests(delivery_id);
```

#### 009_storage_buckets
```sql
-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES
  ('signatures', 'signatures', false),
  ('content-images', 'content-images', true),
  ('attachments', 'attachments', false);

-- Storage policies
CREATE POLICY "gv_signatures" ON storage.objects
  FOR ALL USING (bucket_id = 'signatures' AND get_user_org_type() = 'gv');

CREATE POLICY "auth_upload_images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'content-images' AND auth.role() = 'authenticated');

CREATE POLICY "public_read_images" ON storage.objects
  FOR SELECT USING (bucket_id = 'content-images');

CREATE POLICY "gv_attachments" ON storage.objects
  FOR ALL USING (bucket_id = 'attachments' AND get_user_org_type() = 'gv');
```

#### 010_seed_data
```sql
INSERT INTO organizations (type, name_en, name_ko, address_en) VALUES
  ('supplier', 'Chung Hwa Pulp Corporation', NULL, 'No. 2, Zhongshan Rd., Hualien City, Hualien County, Taiwan'),
  ('seller', 'GV International Co., Ltd.', 'GV 인터내셔널', 'Seoul, Korea'),
  ('buyer', 'Saelim Co., Ltd.', '세림', 'Seoul, Korea');
```

---

## 4. Phase 0-B: 프로젝트 의존성 & 설정

### 4.1 npm 패키지 설치

```bash
# Supabase
npm install @supabase/supabase-js @supabase/ssr

# Validation
npm install zod

# 이미 설치됨: react-router, tailwindcss, shadcn 관련
```

### 4.2 Shadcn/ui 컴포넌트 설치

```bash
# 레이아웃 (최우선)
npx shadcn@latest add sidebar
npx shadcn@latest add separator
npx shadcn@latest add sheet
npx shadcn@latest add collapsible
npx shadcn@latest add tooltip

# 인증 (로그인 폼)
npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add input
npx shadcn@latest add label

# 인터랙션
npx shadcn@latest add dialog
npx shadcn@latest add dropdown-menu
npx shadcn@latest add avatar
npx shadcn@latest add sonner

# Phase 2+에서 추가: table, tabs, form, select, textarea, badge, skeleton
```

### 4.3 환경변수

**.dev.vars (로컬 개발):**
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

**프로덕션:**
```bash
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_ANON_KEY
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

### 4.4 workers/app.ts Env 타입 수정

```typescript
interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}
```

---

## 5. Phase 0-C: Auth 시스템

### 5.1 supabase.server.ts

```typescript
// app/lib/supabase.server.ts
import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import type { AppLoadContext } from "react-router";

export function createSupabaseServerClient(request: Request, context: AppLoadContext) {
  const responseHeaders = new Headers();

  const supabase = createServerClient(
    context.cloudflare.env.SUPABASE_URL,
    context.cloudflare.env.SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(request.headers.get("Cookie") ?? "");
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            responseHeaders.append(
              "Set-Cookie",
              serializeCookieHeader(name, value, options)
            );
          });
        },
      },
    }
  );

  return { supabase, responseHeaders };
}
```

### 5.2 auth.server.ts

```typescript
// app/lib/auth.server.ts
import { redirect, data } from "react-router";
import { createSupabaseServerClient } from "./supabase.server";
import type { AppLoadContext } from "react-router";

export async function requireAuth(request: Request, context: AppLoadContext) {
  const { supabase, responseHeaders } = createSupabaseServerClient(request, context);
  const { data: { user }, error } = await supabase.auth.getUser();

  if (!user || error) {
    throw redirect("/login", { headers: responseHeaders });
  }

  return { user, supabase, responseHeaders };
}

export function requireGVUser(user: { app_metadata?: { org_type?: string } }) {
  if (user.app_metadata?.org_type !== 'gv') {
    throw redirect('/saelim/delivery');
  }
}

export async function getOptionalUser(request: Request, context: AppLoadContext) {
  const { supabase, responseHeaders } = createSupabaseServerClient(request, context);
  const { data: { user } } = await supabase.auth.getUser();
  return { user, supabase, responseHeaders };
}
```

### 5.3 로그인 action

```typescript
// app/loaders/auth.server.ts
export async function loginAction({ request, context }: Route.ActionArgs) {
  const { supabase, responseHeaders } = createSupabaseServerClient(request, context);
  const formData = await request.formData();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return data({ error: "이메일 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  // org_type에 따라 redirect
  const { data: { user } } = await supabase.auth.getUser();
  const orgType = user?.app_metadata?.org_type;
  const redirectTo = orgType === 'saelim' ? '/saelim/delivery' : '/po';

  throw redirect(redirectTo, { headers: responseHeaders });
}

export async function logoutAction({ request, context }: Route.ActionArgs) {
  const { supabase, responseHeaders } = createSupabaseServerClient(request, context);
  await supabase.auth.signOut();
  throw redirect("/login", { headers: responseHeaders });
}
```

### 5.4 초기 사용자 생성

**Supabase Dashboard 또는 MCP execute_sql:**
```sql
-- GV Admin 사용자 생성 후 app_metadata 설정
UPDATE auth.users
SET raw_app_meta_data = jsonb_build_object(
  'org_type', 'gv',
  'org_id', (SELECT id FROM organizations WHERE type = 'seller' LIMIT 1)::text
)
WHERE email = 'admin@gvinternational.com';

-- Saelim 테스트 사용자
UPDATE auth.users
SET raw_app_meta_data = jsonb_build_object(
  'org_type', 'saelim',
  'org_id', (SELECT id FROM organizations WHERE type = 'buyer' LIMIT 1)::text
)
WHERE email = 'user@saelim.co.kr';
```

---

## 6. Phase 0-D: 기본 레이아웃 & 라우팅

### 6.1 폰트 전략

**Pretendard Variable Dynamic Subset (권장)**
- 페이지에 사용된 글자만 로드 (평균 80-150KB)
- Variable Font: 단일 파일로 weight 100-900 지원

```tsx
// root.tsx links
export const links: Route.LinksFunction = () => [
  {
    rel: "stylesheet",
    href: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css",
  },
];
```

```css
/* app.css */
@theme {
  --font-sans: "Pretendard Variable", "Pretendard", ui-sans-serif, system-ui, sans-serif;
}
```

`root.tsx`: `lang="en"` → `lang="ko"` 변경.

### 6.2 GV 레이아웃 (_layout.tsx)

```
┌──────────────┬──────────────────────────────────┐
│  GV Logo     │  SidebarTrigger  Breadcrumb  User│
│              ├──────────────────────────────────┤
│  ──────────  │                                  │
│  구매주문     │         <Outlet />                │
│  견적서       │                                  │
│  선적서류     │                                  │
│  오더관리     │                                  │
│  통관관리     │                                  │
│  배송관리     │                                  │
│  ──────────  │                                  │
│  설정 ▾      │                                  │
│   거래처      │                                  │
│   제품        │                                  │
│   사용자      │                                  │
│  ──────────  │                                  │
│  사용자 정보  │                                  │
└──────────────┴──────────────────────────────────┘
```

구성: `SidebarProvider` → `Sidebar` + `SidebarInset` → `Header` + `Outlet`

### 6.3 Saelim 레이아웃 (_saelim.tsx)

Sidebar 없는 간소화 헤더 구조:
```
┌────────────────────────────────────────────────┐
│  세림 수입관리     배송관리          사용자 메뉴 │
├────────────────────────────────────────────────┤
│                                                │
│                 <Outlet />                      │
│                                                │
└────────────────────────────────────────────────┘
```

### 6.4 routes.ts 구성

```typescript
import { type RouteConfig, route, layout, index } from "@react-router/dev/routes";

export default [
  // Auth routes
  route("login", "routes/_auth.login.tsx"),

  // GV Layout
  layout("routes/_layout.tsx", [
    index("routes/_layout.home.tsx"),
    route("po", "routes/_layout.po.tsx"),
    route("pi", "routes/_layout.pi.tsx"),
    route("shipping", "routes/_layout.shipping.tsx"),
    route("orders", "routes/_layout.orders.tsx"),
    route("customs", "routes/_layout.customs.tsx"),
    route("delivery", "routes/_layout.delivery.tsx"),
    route("settings/organizations", "routes/_layout.settings.organizations.tsx"),
    route("settings/products", "routes/_layout.settings.products.tsx"),
    route("settings/users", "routes/_layout.settings.users.tsx"),
  ]),

  // Saelim Layout
  layout("routes/_saelim.tsx", [
    route("saelim/delivery", "routes/_saelim.delivery.tsx"),
  ]),
] satisfies RouteConfig;
```

### 6.5 아이콘 전략

```typescript
// app/components/ui/icons.tsx
export {
  ShoppingCart,     // PO
  FileText,         // PI
  Ship,             // Shipping
  Package,          // Orders
  Landmark,         // Customs
  Truck,            // Delivery
  Building2,        // Organizations
  Box,              // Products
  Users,            // Users
  Settings,         // Settings
  LogOut,           // Logout
  ChevronDown,      // Collapsible
  Menu,             // Mobile trigger
  Plus,             // Create
  Pencil,           // Edit
  Trash2,           // Delete
  Copy,             // Clone
  FileDown,         // PDF/Export
  Search,           // Search
  Filter,           // Filter
} from "lucide-react";
```

---

## 7. Phase 0-E: 공통 유틸리티

### 7.1 constants.ts

```typescript
// app/lib/constants.ts
export const CURRENCIES = ['USD', 'KRW'] as const;
export const PORTS = {
  loading: ['Keelung, Taiwan', 'Kaohsiung, Taiwan'],
  discharge: ['Busan, Korea', 'Incheon, Korea'],
} as const;
export const PAYMENT_TERMS = ['T/T in advance', 'T/T 30 days', 'L/C at sight'] as const;
export const DELIVERY_TERMS = ['CFR Busan', 'CIF Busan', 'FOB Keelung'] as const;
export const DOC_STATUS = { PROCESS: 'process', COMPLETE: 'complete' } as const;
```

### 7.2 format.ts

```typescript
// app/lib/format.ts
export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
}

export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat(currency === 'KRW' ? 'ko-KR' : 'en-US', {
    style: 'currency', currency,
    minimumFractionDigits: currency === 'KRW' ? 0 : 2,
  }).format(amount);
}

export function formatWeight(kg: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(kg) + ' KG';
}
```

---

## 8. 보안 핵심 사항

| 항목 | 결정 | 이유 |
|------|------|------|
| Auth metadata | **app_metadata** (not user_metadata) | 사용자가 직접 변경 불가 |
| Signup | **DISABLE_SIGNUP=true** | Invite-only (5-10명) |
| RLS | **모든 테이블 활성화** | Defense in depth |
| Cookie | **httpOnly, SameSite=Lax** | XSS/CSRF 방지 |
| SERVICE_ROLE_KEY | **서버 코드에서만** | 절대 클라이언트 노출 금지 |
| Supabase client | **요청당 단일 인스턴스** | Set-Cookie 중복 방지 |

---

## 9. 기술 패턴 핵심 발견

### Researcher 조사 결과

1. **@supabase/ssr + CF Workers:** `nodejs_compat` 이미 설정 → 바로 사용 가능
2. **React Router 7.9+ 미들웨어:** `future.v8_middleware`로 opt-in 가능 → Phase 0는 loader 패턴 사용
3. **Cookie 처리:** `getAll`/`setAll`만 사용, `parseCookieHeader`/`serializeCookieHeader` 활용
4. **Pretendard:** Dynamic Subset CDN → 평균 80-150KB/페이지
5. **Zod:** `safeParse` 직접 사용, `@conform-to/zod`는 복잡한 폼에서만

---

## 10. Phase 0 완료 기준 (Definition of Done)

### 인프라
- [ ] Supabase 프로젝트 생성
- [ ] 모든 테이블 마이그레이션 완료
- [ ] RLS 정책 적용 (모든 테이블)
- [ ] RPC 함수 생성 (generate_doc_number)
- [ ] Storage 버킷 3개 생성
- [ ] Seed 데이터 투입 (CHP, GV, Saelim)
- [ ] TypeScript 타입 자동생성

### Auth
- [ ] 환경변수 설정 (.dev.vars)
- [ ] supabase.server.ts 동작
- [ ] auth.server.ts 동작
- [ ] 로그인/로그아웃 동작
- [ ] 테스트 사용자 2명 (GV, Saelim)

### UI
- [ ] root.tsx: lang="ko", Pretendard 폰트
- [ ] _layout.tsx: Sidebar 레이아웃
- [ ] app-sidebar.tsx: 네비게이션 메뉴
- [ ] _saelim.tsx: 제한 레이아웃
- [ ] _auth.login.tsx: 로그인 폼
- [ ] 모바일 반응형 확인

### 개발 환경
- [ ] `npm run dev` 정상 실행
- [ ] `npm run typecheck` 에러 없음
- [ ] 로그인 → Sidebar → 빈 콘텐츠 영역 흐름 동작

---

## 11. 파일 생성 체크리스트

### 새로 생성
```
.dev.vars                                    # 환경변수
app/lib/supabase.server.ts                   # Supabase 서버 클라이언트
app/lib/auth.server.ts                       # Auth 헬퍼
app/lib/constants.ts                         # 상수
app/lib/format.ts                            # 포맷 유틸리티
app/types/database.ts                        # Supabase 자동생성 타입
app/types/common.ts                          # 공통 타입
app/loaders/auth.server.ts                   # 로그인/로그아웃 action
app/components/ui/icons.tsx                  # 아이콘 모음
app/components/layout/app-sidebar.tsx        # Sidebar
app/components/layout/page-container.tsx     # 페이지 래퍼
app/components/layout/header.tsx             # 헤더
app/routes/_auth.login.tsx                   # 로그인 페이지
app/routes/_layout.tsx                       # GV 레이아웃
app/routes/_layout.home.tsx                  # GV 홈 (임시)
app/routes/_saelim.tsx                       # Saelim 레이아웃
app/routes/_saelim.delivery.tsx              # Saelim 배송 (임시)
```

### 수정
```
app/root.tsx                                 # lang="ko", Pretendard 폰트
app/routes.ts                                # 전체 라우트 구조
app/app.css                                  # --font-sans 수정
workers/app.ts                               # Env 타입 추가
```

---

## 12. 에이전트별 상세 노트

| Agent | File | 주요 내용 |
|-------|------|----------|
| Architect | [architect.md](../brainstorm/phase0/architect.md) | 로드맵, 의존성, MCP 전략, DoD |
| Frontend Dev | [frontend.md](../brainstorm/phase0/frontend.md) | Shadcn 설정, 레이아웃, 라우팅, 폰트 |
| Backend Dev | [backend.md](../brainstorm/phase0/backend.md) | DB 스키마, RLS, Auth 구현 |
| Security | [security.md](../brainstorm/phase0/security.md) | 보안 체크리스트, 위협 모델 |
| Researcher | [researcher.md](../brainstorm/phase0/researcher.md) | 최신 기술 패턴, 라이브러리 조사 |

---

## 13. 열린 질문

| # | 질문 | 권장 |
|---|------|------|
| 1 | Dark mode 지원 시기 | Phase 10 (Polish) |
| 2 | Dashboard 홈 화면 내용 | Phase 2+ (PO 완료 후) |
| 3 | Form 라이브러리 | Zod 직접 사용, conform은 복잡한 폼에서만 |
| 4 | TanStack Query 도입 시기 | Phase 6+ (cross-module 업데이트 필요 시) |
| 5 | Settings 페이지 구조 | 탭 vs 별도 라우트 → 별도 라우트 권장 |
| 6 | 미들웨어 API 사용 | Phase 0는 loader 패턴, 필요 시 전환 |

---

## 14. Next Steps

1. **Phase 0-A 실행:** Supabase MCP로 프로젝트 생성 + 마이그레이션
2. **Phase 0-B 실행:** npm install + shadcn 컴포넌트 설치
3. **Phase 0-C 실행:** Auth 시스템 구현
4. **Phase 0-D 실행:** 레이아웃 + 라우팅
5. **Phase 0-E 실행:** 유틸리티 + 타입
6. **Phase 0 검증:** DoD 체크리스트 확인
7. **Phase 1 시작:** Settings CRUD (Organizations, Products, Users)
