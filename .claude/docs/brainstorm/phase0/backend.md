# Phase 0 Backend 구현 브레인스토밍

**Date:** 2026-03-06
**Role:** Backend Dev
**Scope:** Supabase 프로젝트 설정, DB 마이그레이션, Auth 서버 구현, 환경변수, 타입 생성

---

## 1. Supabase 프로젝트 설정 (MCP 호출 순서)

### Step 1: 기존 Organization 확인
```
MCP: list_organizations
목적: Supabase 계정의 기존 org 확인
```

### Step 2: 프로젝트 생성
```
MCP: create_project
파라미터:
  - name: "saelim"
  - organization_id: (Step 1에서 확인)
  - region: "ap-northeast-1"  # 도쿄 (한국 가장 가까움)
  - db_password: (안전한 비밀번호 생성)
```

### Step 3: 프로젝트 정보 확인
```
MCP: get_project
파라미터:
  - id: (Step 2에서 반환된 project_id)
결과: project URL (https://xxx.supabase.co)
```

### Step 4: Publishable Keys 확인
```
MCP: get_publishable_keys
파라미터:
  - project_ref: (프로젝트 ref)
결과: anon key, service_role key
```

### Step 5: Auth 설정
```
Supabase Dashboard에서 수동 설정:
  - Authentication > Settings > General
  - DISABLE_SIGNUP: true (invite-only)
  - Minimum password length: 8
  - Enable email provider
  - Disable all OAuth providers (불필요)
  - JWT expiry: 3600 (1시간)
```

### Step 6: 마이그레이션 실행
```
MCP: execute_sql (각 마이그레이션 파일 순서대로)
```

---

## 2. DB 마이그레이션 SQL (개선 버전)

기존 backend-notes.md 스키마에서 개선된 사항:
- `user_metadata` -> `app_metadata` 기반 RLS (보안 강화)
- `deleted_at` 컬럼으로 soft delete 지원
- `updated_at` 자동 갱신 trigger (moddatetime)
- HS code 필드 (products 테이블)
- activity_logs 테이블 (감사 추적)
- 필수 인덱스 포함
- JWT custom claims를 위한 app_metadata 직접 참조

---

### 001_extensions_and_helpers.sql

```sql
-- ============================================
-- 001: Extensions & Helper Functions
-- ============================================

-- 필수 확장
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "moddatetime";

-- Helper: 현재 사용자의 org_type 반환 (app_metadata 기반)
-- app_metadata는 서버에서만 수정 가능하므로 user_metadata보다 안전
CREATE OR REPLACE FUNCTION get_user_org_type()
RETURNS TEXT AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'org_type'),
    ''
  )::TEXT;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: 현재 사용자의 org_id 반환
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'org_id'),
    '00000000-0000-0000-0000-000000000000'
  )::UUID;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: 현재 사용자가 GV 유저인지 확인
CREATE OR REPLACE FUNCTION is_gv_user()
RETURNS BOOLEAN AS $$
  SELECT get_user_org_type() = 'gv';
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: updated_at 자동 갱신 trigger 함수
-- moddatetime 확장 대신 직접 구현 (더 안정적)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

### 002_core_tables.sql

```sql
-- ============================================
-- 002: Core Tables
-- ============================================

-- Organizations (CHP, GV, Saelim)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('supplier', 'seller', 'buyer')),
  name_en TEXT NOT NULL,
  name_ko TEXT,
  address_en TEXT,
  address_ko TEXT,
  phone TEXT,
  fax TEXT,
  email TEXT,
  signature_image_url TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Products (Glassine Paper 종류)
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  gsm INT,                           -- g/m2
  width_mm INT,                      -- 폭 (mm)
  hs_code TEXT,                      -- 관세 분류코드 (e.g., '4806.40')
  duty_rate DECIMAL(5,2),            -- 관세율 (%)
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- User Profiles (auth.users 확장)
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  org_id UUID REFERENCES organizations(id),
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Document Number Sequences
CREATE TABLE document_sequences (
  doc_prefix TEXT NOT NULL,        -- 'GVPO', 'GVPI', 'GVCI', 'GVPL'
  doc_yymm TEXT NOT NULL,          -- '2603'
  seq_no INT NOT NULL DEFAULT 0,
  PRIMARY KEY (doc_prefix, doc_yymm)
);
```

---

### 003_document_tables.sql

```sql
-- ============================================
-- 003: Document Tables
-- ============================================

-- Purchase Orders (GV -> CHP)
CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_no TEXT UNIQUE NOT NULL,
  po_date DATE NOT NULL,
  validity DATE,
  ref_no TEXT,
  supplier_id UUID NOT NULL REFERENCES organizations(id),   -- CHP
  buyer_id UUID NOT NULL REFERENCES organizations(id),       -- GV
  currency TEXT NOT NULL DEFAULT 'USD',
  amount DECIMAL(15,2),
  payment_term TEXT,
  delivery_term TEXT,
  loading_port TEXT,
  discharge_port TEXT,
  details JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- details 구조: [{product_id, product_name, gsm, width, qty, unit_price, amount}]
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'process' CHECK (status IN ('process', 'complete')),
  created_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_purchase_orders_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Proforma Invoices (GV -> Saelim)
CREATE TABLE proforma_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pi_no TEXT UNIQUE NOT NULL,
  pi_date DATE NOT NULL,
  validity DATE,
  ref_no TEXT,
  supplier_id UUID NOT NULL REFERENCES organizations(id),    -- GV
  buyer_id UUID NOT NULL REFERENCES organizations(id),        -- Saelim
  currency TEXT NOT NULL DEFAULT 'USD',
  amount DECIMAL(15,2),
  payment_term TEXT,
  delivery_term TEXT,
  loading_port TEXT,
  discharge_port TEXT,
  details JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'process' CHECK (status IN ('process', 'complete')),
  po_id UUID REFERENCES purchase_orders(id),                  -- nullable: PO 참조
  created_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_proforma_invoices_updated_at
  BEFORE UPDATE ON proforma_invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Deliveries (PI 생성 시 자동 생성)
CREATE TABLE deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pi_id UUID REFERENCES proforma_invoices(id),
  shipping_doc_id UUID,  -- FK는 shipping_documents 생성 후 추가
  delivery_date DATE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_deliveries_updated_at
  BEFORE UPDATE ON deliveries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Shipping Documents (CI/PL)
CREATE TABLE shipping_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ci_no TEXT UNIQUE NOT NULL,
  pl_no TEXT UNIQUE NOT NULL,
  ci_date DATE NOT NULL,
  ref_no TEXT,
  shipper_id UUID NOT NULL REFERENCES organizations(id),      -- GV
  consignee_id UUID NOT NULL REFERENCES organizations(id),    -- Saelim
  currency TEXT NOT NULL DEFAULT 'USD',
  amount DECIMAL(15,2),
  payment_term TEXT,
  delivery_term TEXT,
  loading_port TEXT,
  discharge_port TEXT,
  details JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'process' CHECK (status IN ('process', 'complete')),
  pi_id UUID REFERENCES proforma_invoices(id),
  vessel TEXT,
  voyage TEXT,
  ship_date DATE,
  etd DATE,
  eta DATE,
  net_weight DECIMAL(12,3),
  gross_weight DECIMAL(12,3),
  package_no INT,
  created_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_shipping_documents_updated_at
  BEFORE UPDATE ON shipping_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- deliveries -> shipping_documents FK 추가
ALTER TABLE deliveries
  ADD CONSTRAINT fk_deliveries_shipping_doc
  FOREIGN KEY (shipping_doc_id) REFERENCES shipping_documents(id);

-- Stuffing Lists (선적 컨테이너별 롤 정보)
CREATE TABLE stuffing_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sl_no TEXT,
  cntr_no TEXT,                        -- 컨테이너 번호
  seal_no TEXT,                        -- 씰 번호
  roll_no_range TEXT,                  -- e.g., "1 - 15"
  roll_details JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- roll_details 구조: [{seq, lot_no, length, weight}]
  shipping_doc_id UUID NOT NULL REFERENCES shipping_documents(id) ON DELETE CASCADE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_stuffing_lists_updated_at
  BEFORE UPDATE ON stuffing_lists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Customs (통관)
CREATE TABLE customs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customs_no TEXT,
  customs_date DATE,
  shipping_doc_id UUID REFERENCES shipping_documents(id),
  transport_fee JSONB NOT NULL DEFAULT '{"supply":0,"vat":0,"total":0}'::jsonb,
  customs_fee JSONB NOT NULL DEFAULT '{"supply":0,"vat":0,"total":0}'::jsonb,
  vat_fee JSONB NOT NULL DEFAULT '{"supply":0,"vat":0,"total":0}'::jsonb,
  etc_desc TEXT,
  etc_fee JSONB NOT NULL DEFAULT '{"supply":0,"vat":0,"total":0}'::jsonb,
  fee_received BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_customs_updated_at
  BEFORE UPDATE ON customs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Orders (종합 집계)
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID REFERENCES purchase_orders(id),
  pi_id UUID REFERENCES proforma_invoices(id),
  shipping_doc_id UUID REFERENCES shipping_documents(id),
  customs_id UUID REFERENCES customs(id),
  delivery_id UUID REFERENCES deliveries(id),
  saelim_no TEXT,                      -- 세림 관리 번호
  delivery_date DATE,
  advice_date DATE,
  arrival_date DATE,
  customs_fee_received BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

### 004_content_system.sql

```sql
-- ============================================
-- 004: Content System (Polymorphic)
-- ============================================

-- Contents (모든 모듈에서 공유하는 콘텐츠)
CREATE TABLE contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('po', 'pi', 'shipping', 'order', 'customs')),
  parent_id UUID NOT NULL,           -- FK: 해당 type의 테이블 ID
  title TEXT,
  body JSONB,                        -- Tiptap JSON content
  version INT NOT NULL DEFAULT 1,    -- 낙관적 잠금용
  created_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_contents_updated_at
  BEFORE UPDATE ON contents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Content Attachments (파일 첨부)
CREATE TABLE content_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INT,
  mime_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Comments (콘텐츠 댓글)
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_comments_updated_at
  BEFORE UPDATE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

### 005_delivery_changes.sql

```sql
-- ============================================
-- 005: Delivery Change Requests & Activity Logs
-- ============================================

CREATE TABLE delivery_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  requested_date DATE NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  response_text TEXT,
  requested_by UUID REFERENCES auth.users(id),
  responded_by UUID REFERENCES auth.users(id),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_delivery_change_requests_updated_at
  BEFORE UPDATE ON delivery_change_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Activity Logs (감사 추적)
CREATE TABLE activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,         -- 'po', 'pi', 'shipping', 'customs', 'order', 'delivery'
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,              -- 'create', 'update', 'delete', 'status_change'
  changes JSONB,                     -- {field: {old: x, new: y}}
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### 006_rls_policies.sql

```sql
-- ============================================
-- 006: Row Level Security Policies
-- ============================================

-- ========== RLS 활성화 ==========
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
ALTER TABLE contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- ========== GV 사용자: 전체 접근 (soft delete 필터 포함) ==========

-- Organizations: GV 전체 CRUD
CREATE POLICY "gv_organizations_all" ON organizations
  FOR ALL USING (is_gv_user() AND deleted_at IS NULL)
  WITH CHECK (is_gv_user());

-- Products: GV 전체 CRUD
CREATE POLICY "gv_products_all" ON products
  FOR ALL USING (is_gv_user() AND deleted_at IS NULL)
  WITH CHECK (is_gv_user());

-- User Profiles: GV 전체 CRUD
CREATE POLICY "gv_user_profiles_all" ON user_profiles
  FOR ALL USING (is_gv_user() AND deleted_at IS NULL)
  WITH CHECK (is_gv_user());

-- Document Sequences: GV 전체 CRUD
CREATE POLICY "gv_document_sequences_all" ON document_sequences
  FOR ALL USING (is_gv_user());

-- Purchase Orders: GV 전체 CRUD
CREATE POLICY "gv_purchase_orders_all" ON purchase_orders
  FOR ALL USING (is_gv_user() AND deleted_at IS NULL)
  WITH CHECK (is_gv_user());

-- Proforma Invoices: GV 전체 CRUD
CREATE POLICY "gv_proforma_invoices_all" ON proforma_invoices
  FOR ALL USING (is_gv_user() AND deleted_at IS NULL)
  WITH CHECK (is_gv_user());

-- Deliveries: GV 전체 CRUD
CREATE POLICY "gv_deliveries_all" ON deliveries
  FOR ALL USING (is_gv_user() AND deleted_at IS NULL)
  WITH CHECK (is_gv_user());

-- Shipping Documents: GV 전체 CRUD
CREATE POLICY "gv_shipping_documents_all" ON shipping_documents
  FOR ALL USING (is_gv_user() AND deleted_at IS NULL)
  WITH CHECK (is_gv_user());

-- Stuffing Lists: GV 전체 CRUD
CREATE POLICY "gv_stuffing_lists_all" ON stuffing_lists
  FOR ALL USING (is_gv_user() AND deleted_at IS NULL)
  WITH CHECK (is_gv_user());

-- Customs: GV 전체 CRUD
CREATE POLICY "gv_customs_all" ON customs
  FOR ALL USING (is_gv_user() AND deleted_at IS NULL)
  WITH CHECK (is_gv_user());

-- Orders: GV 전체 CRUD
CREATE POLICY "gv_orders_all" ON orders
  FOR ALL USING (is_gv_user() AND deleted_at IS NULL)
  WITH CHECK (is_gv_user());

-- Contents: GV 전체 CRUD
CREATE POLICY "gv_contents_all" ON contents
  FOR ALL USING (is_gv_user() AND deleted_at IS NULL)
  WITH CHECK (is_gv_user());

-- Content Attachments: GV 전체 CRUD
CREATE POLICY "gv_content_attachments_all" ON content_attachments
  FOR ALL USING (is_gv_user());

-- Comments: GV 전체 CRUD
CREATE POLICY "gv_comments_all" ON comments
  FOR ALL USING (is_gv_user() AND deleted_at IS NULL)
  WITH CHECK (is_gv_user());

-- Delivery Change Requests: GV 전체 CRUD (승인/반려 포함)
CREATE POLICY "gv_delivery_change_requests_all" ON delivery_change_requests
  FOR ALL USING (is_gv_user())
  WITH CHECK (is_gv_user());

-- Activity Logs: GV 읽기 전용
CREATE POLICY "gv_activity_logs_select" ON activity_logs
  FOR SELECT USING (is_gv_user());

-- Activity Logs: INSERT는 인증된 사용자 모두 가능
CREATE POLICY "authenticated_activity_logs_insert" ON activity_logs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ========== Saelim 사용자: 제한적 접근 ==========

-- Deliveries: Saelim 읽기 전용
CREATE POLICY "saelim_deliveries_select" ON deliveries
  FOR SELECT USING (
    get_user_org_type() = 'saelim'
    AND deleted_at IS NULL
  );

-- Shipping Documents: Saelim 읽기 전용 (배송 정보만 필요)
-- 주의: amount, details 등 민감 컬럼은 application level에서 필터링
CREATE POLICY "saelim_shipping_documents_select" ON shipping_documents
  FOR SELECT USING (
    get_user_org_type() = 'saelim'
    AND deleted_at IS NULL
  );

-- Delivery Change Requests: Saelim 본인 것 읽기
CREATE POLICY "saelim_delivery_change_requests_select" ON delivery_change_requests
  FOR SELECT USING (
    get_user_org_type() = 'saelim'
    AND requested_by = auth.uid()
  );

-- Delivery Change Requests: Saelim 생성 (본인 명의)
CREATE POLICY "saelim_delivery_change_requests_insert" ON delivery_change_requests
  FOR INSERT WITH CHECK (
    get_user_org_type() = 'saelim'
    AND requested_by = auth.uid()
  );

-- User Profiles: 본인 프로필 읽기
CREATE POLICY "saelim_own_profile_select" ON user_profiles
  FOR SELECT USING (
    get_user_org_type() = 'saelim'
    AND id = auth.uid()
    AND deleted_at IS NULL
  );

-- Organizations: Saelim 읽기 전용 (자기 조직 정보)
CREATE POLICY "saelim_own_org_select" ON organizations
  FOR SELECT USING (
    get_user_org_type() = 'saelim'
    AND id = get_user_org_id()
    AND deleted_at IS NULL
  );

-- Products: Saelim 읽기 전용 (배송 정보에서 제품명 참조)
CREATE POLICY "saelim_products_select" ON products
  FOR SELECT USING (
    get_user_org_type() = 'saelim'
    AND deleted_at IS NULL
  );
```

---

### 007_rpc_functions.sql

```sql
-- ============================================
-- 007: RPC Functions
-- ============================================

-- 문서 번호 생성 (동시성 안전)
CREATE OR REPLACE FUNCTION generate_doc_number(
  doc_type TEXT,      -- 'PO', 'PI', 'CI', 'PL'
  ref_date DATE DEFAULT CURRENT_DATE
)
RETURNS TEXT AS $$
DECLARE
  prefix TEXT;
  yymm TEXT;
  next_seq INT;
  result TEXT;
BEGIN
  prefix := 'GV' || doc_type;
  yymm := TO_CHAR(ref_date, 'YYMM');

  -- Advisory lock으로 동시성 안전 보장
  PERFORM pg_advisory_xact_lock(hashtext(prefix || yymm));

  -- 현재 시퀀스 가져오기
  SELECT COALESCE(MAX(seq_no), 0) + 1 INTO next_seq
  FROM document_sequences
  WHERE doc_prefix = prefix AND doc_yymm = yymm;

  -- 시퀀스 업데이트 (upsert)
  INSERT INTO document_sequences (doc_prefix, doc_yymm, seq_no)
  VALUES (prefix, yymm, next_seq)
  ON CONFLICT (doc_prefix, doc_yymm)
  DO UPDATE SET seq_no = next_seq;

  -- 포맷: GVPO2603-001
  result := prefix || yymm || '-' || LPAD(next_seq::TEXT, 3, '0');
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- PO에서 PI 생성 (가격 정보 제외하고 복제)
CREATE OR REPLACE FUNCTION create_pi_from_po(
  source_po_id UUID,
  gv_org_id UUID,
  saelim_org_id UUID
)
RETURNS UUID AS $$
DECLARE
  new_pi_id UUID;
  po_record RECORD;
  new_pi_no TEXT;
BEGIN
  -- PO 데이터 조회
  SELECT * INTO po_record FROM purchase_orders
  WHERE id = source_po_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found: %', source_po_id;
  END IF;

  -- PI 번호 생성
  new_pi_no := generate_doc_number('PI', CURRENT_DATE);

  -- PI 생성 (가격 정보 제외)
  INSERT INTO proforma_invoices (
    pi_no, pi_date, validity, ref_no,
    supplier_id, buyer_id, currency,
    payment_term, delivery_term, loading_port, discharge_port,
    details, notes, po_id, created_by
  ) VALUES (
    new_pi_no,
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '1 month',
    po_record.ref_no,
    gv_org_id,
    saelim_org_id,
    po_record.currency,
    po_record.payment_term,
    po_record.delivery_term,
    po_record.loading_port,
    po_record.discharge_port,
    -- details에서 가격 정보 제거, 제품 정보만 유지
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'product_id', d->>'product_id',
        'product_name', d->>'product_name',
        'gsm', d->>'gsm',
        'width', d->>'width',
        'qty', d->>'qty'
      )) FROM jsonb_array_elements(po_record.details) d),
      '[]'::jsonb
    ),
    po_record.notes,
    source_po_id,
    auth.uid()
  ) RETURNING id INTO new_pi_id;

  -- Delivery 자동 생성
  INSERT INTO deliveries (pi_id, created_at)
  VALUES (new_pi_id, NOW());

  RETURN new_pi_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- PI에서 Shipping Document 생성
CREATE OR REPLACE FUNCTION create_shipping_from_pi(
  source_pi_id UUID
)
RETURNS UUID AS $$
DECLARE
  new_sd_id UUID;
  pi_record RECORD;
  new_ci_no TEXT;
  new_pl_no TEXT;
BEGIN
  SELECT * INTO pi_record FROM proforma_invoices
  WHERE id = source_pi_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PI not found: %', source_pi_id;
  END IF;

  new_ci_no := generate_doc_number('CI', CURRENT_DATE);
  new_pl_no := generate_doc_number('PL', CURRENT_DATE);

  INSERT INTO shipping_documents (
    ci_no, pl_no, ci_date, ref_no,
    shipper_id, consignee_id, currency,
    payment_term, delivery_term, loading_port, discharge_port,
    details, notes, pi_id, created_by
  ) VALUES (
    new_ci_no,
    new_pl_no,
    CURRENT_DATE,
    pi_record.ref_no,
    pi_record.supplier_id,
    pi_record.buyer_id,
    pi_record.currency,
    pi_record.payment_term,
    pi_record.delivery_term,
    pi_record.loading_port,
    pi_record.discharge_port,
    pi_record.details,
    pi_record.notes,
    source_pi_id,
    auth.uid()
  ) RETURNING id INTO new_sd_id;

  -- Delivery에 shipping_doc_id 연결
  UPDATE deliveries
  SET shipping_doc_id = new_sd_id
  WHERE pi_id = source_pi_id AND deleted_at IS NULL;

  RETURN new_sd_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Soft delete helper
CREATE OR REPLACE FUNCTION soft_delete(
  table_name TEXT,
  record_id UUID
)
RETURNS VOID AS $$
BEGIN
  EXECUTE format('UPDATE %I SET deleted_at = NOW() WHERE id = $1', table_name)
  USING record_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

### 008_indexes.sql

```sql
-- ============================================
-- 008: Performance Indexes
-- ============================================

-- Core tables
CREATE INDEX idx_organizations_type ON organizations(type) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_name ON products(name) WHERE deleted_at IS NULL;
CREATE INDEX idx_user_profiles_org_id ON user_profiles(org_id) WHERE deleted_at IS NULL;

-- Purchase Orders
CREATE INDEX idx_purchase_orders_status ON purchase_orders(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_purchase_orders_po_date ON purchase_orders(po_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_purchase_orders_supplier_id ON purchase_orders(supplier_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_purchase_orders_created_at ON purchase_orders(created_at DESC) WHERE deleted_at IS NULL;

-- Proforma Invoices
CREATE INDEX idx_proforma_invoices_status ON proforma_invoices(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_proforma_invoices_po_id ON proforma_invoices(po_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_proforma_invoices_pi_date ON proforma_invoices(pi_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_proforma_invoices_created_at ON proforma_invoices(created_at DESC) WHERE deleted_at IS NULL;

-- Shipping Documents
CREATE INDEX idx_shipping_documents_status ON shipping_documents(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_shipping_documents_pi_id ON shipping_documents(pi_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_shipping_documents_eta ON shipping_documents(eta) WHERE deleted_at IS NULL;
CREATE INDEX idx_shipping_documents_created_at ON shipping_documents(created_at DESC) WHERE deleted_at IS NULL;

-- Stuffing Lists
CREATE INDEX idx_stuffing_lists_shipping_doc_id ON stuffing_lists(shipping_doc_id) WHERE deleted_at IS NULL;

-- Customs
CREATE INDEX idx_customs_shipping_doc_id ON customs(shipping_doc_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_customs_fee_received ON customs(fee_received) WHERE deleted_at IS NULL;

-- Orders
CREATE INDEX idx_orders_po_id ON orders(po_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_orders_pi_id ON orders(pi_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_orders_shipping_doc_id ON orders(shipping_doc_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_orders_customs_id ON orders(customs_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_orders_delivery_id ON orders(delivery_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_orders_delivery_date ON orders(delivery_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_orders_created_at ON orders(created_at DESC) WHERE deleted_at IS NULL;

-- Deliveries
CREATE INDEX idx_deliveries_pi_id ON deliveries(pi_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_deliveries_shipping_doc_id ON deliveries(shipping_doc_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_deliveries_delivery_date ON deliveries(delivery_date) WHERE deleted_at IS NULL;

-- Content System
CREATE INDEX idx_contents_type_parent ON contents(type, parent_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_content_attachments_content_id ON content_attachments(content_id);
CREATE INDEX idx_comments_content_id ON comments(content_id) WHERE deleted_at IS NULL;

-- Delivery Change Requests
CREATE INDEX idx_delivery_change_requests_delivery_id ON delivery_change_requests(delivery_id);
CREATE INDEX idx_delivery_change_requests_status ON delivery_change_requests(status);
CREATE INDEX idx_delivery_change_requests_requested_by ON delivery_change_requests(requested_by);

-- Activity Logs
CREATE INDEX idx_activity_logs_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_created_at ON activity_logs(created_at DESC);
```

---

### 009_storage_setup.sql

```sql
-- ============================================
-- 009: Storage Buckets & Policies
-- ============================================

-- signatures 버킷: GV 사용자만 업로드/읽기
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'signatures',
  'signatures',
  false,
  2097152,  -- 2MB
  ARRAY['image/png', 'image/jpeg']
);

CREATE POLICY "gv_signatures_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'signatures'
    AND is_gv_user()
  );

CREATE POLICY "gv_signatures_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'signatures'
    AND is_gv_user()
  );

CREATE POLICY "gv_signatures_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'signatures'
    AND is_gv_user()
  );

CREATE POLICY "gv_signatures_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'signatures'
    AND is_gv_user()
  );

-- content-images 버킷: 인증된 사용자 업로드, public 읽기
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'content-images',
  'content-images',
  true,  -- public read
  5242880,  -- 5MB
  ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp']
);

CREATE POLICY "authenticated_content_images_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'content-images'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "authenticated_content_images_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'content-images'
    AND auth.uid() IS NOT NULL
  );

-- public bucket이므로 SELECT 정책 불필요 (자동 public)

-- attachments 버킷: GV 전체 접근, Saelim은 읽기만
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES (
  'attachments',
  'attachments',
  false,
  20971520  -- 20MB
);

CREATE POLICY "gv_attachments_all" ON storage.objects
  FOR ALL USING (
    bucket_id = 'attachments'
    AND is_gv_user()
  )
  WITH CHECK (
    bucket_id = 'attachments'
    AND is_gv_user()
  );

-- Saelim은 attachments 읽기만 (delivery 관련 첨부 파일)
CREATE POLICY "saelim_attachments_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'attachments'
    AND get_user_org_type() = 'saelim'
  );
```

---

### 010_seed_data.sql

```sql
-- ============================================
-- 010: Seed Data
-- ============================================

-- 초기 조직 데이터
INSERT INTO organizations (id, type, name_en, name_ko, address_en, address_ko) VALUES
  (
    'a0000000-0000-0000-0000-000000000001',
    'supplier',
    'Chung Hwa Pulp Corporation',
    'Chung Hwa Pulp',
    'No. 2, Zhongshan Road, Hualien City, Hualien County 970, Taiwan',
    NULL
  ),
  (
    'a0000000-0000-0000-0000-000000000002',
    'seller',
    'GV International Co., Ltd.',
    'GV 인터내셔널',
    NULL,
    NULL
  ),
  (
    'a0000000-0000-0000-0000-000000000003',
    'buyer',
    'Saelim Co., Ltd.',
    '세림',
    NULL,
    NULL
  );

-- 초기 제품 데이터 (Glassine Paper)
INSERT INTO products (name, gsm, width_mm, hs_code) VALUES
  ('White Glassine Paper', 40, 1091, '4806.40'),
  ('White Glassine Paper', 50, 1091, '4806.40'),
  ('White Glassine Paper', 60, 1091, '4806.40'),
  ('Blue Glassine Paper', 60, 1091, '4806.40'),
  ('White Glassine Paper', 40, 787, '4806.40'),
  ('White Glassine Paper', 50, 787, '4806.40');
```

---

## 3. Auth 서버 구현

### 3a. `app/lib/supabase.server.ts`

```typescript
import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import type { AppLoadContext } from "react-router";
import type { Database } from "~/types/database";

/**
 * Supabase 서버 클라이언트 생성
 * - Cloudflare Workers 환경에서의 cookie 관리
 * - @supabase/ssr의 createServerClient 사용
 * - RLS가 적용된 anon key 클라이언트 반환
 */
export function createSupabaseServerClient(
  request: Request,
  context: AppLoadContext
) {
  const headers = new Headers();

  const supabase = createServerClient<Database>(
    context.cloudflare.env.SUPABASE_URL,
    context.cloudflare.env.SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(request.headers.get("Cookie") ?? "");
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            headers.append(
              "Set-Cookie",
              serializeCookieHeader(name, value, {
                ...options,
                // Cloudflare Workers 환경 설정
                path: "/",
                httpOnly: true,
                secure: true,
                sameSite: "lax",
              })
            );
          });
        },
      },
    }
  );

  return { supabase, headers };
}

/**
 * Service Role 클라이언트 (관리자 작업용)
 * - 사용자 생성, app_metadata 설정 등
 * - RLS를 우회하므로 반드시 서버 사이드에서만 사용
 * - 절대 클라이언트에 노출하지 않음
 */
export function createSupabaseAdminClient(context: AppLoadContext) {
  return createServerClient<Database>(
    context.cloudflare.env.SUPABASE_URL,
    context.cloudflare.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      cookies: {
        getAll() { return []; },
        setAll() {},
      },
    }
  );
}
```

**핵심 포인트:**
- `@supabase/ssr` 패키지의 `createServerClient` 사용 (이전의 `createClient` 아님)
- `parseCookieHeader`와 `serializeCookieHeader`로 cookie 관리
- Cloudflare Workers는 Node.js cookie 라이브러리 대신 이 방식 사용
- headers 객체를 반환하여 response에 Set-Cookie 헤더 포함 가능
- Admin 클라이언트는 cookie 불필요 (서비스 역할)

### 3b. `app/lib/auth.server.ts`

```typescript
import { redirect } from "react-router";
import { createSupabaseServerClient } from "./supabase.server";
import type { AppLoadContext } from "react-router";

/**
 * 인증된 사용자 정보와 메타데이터를 포함하는 타입
 */
export interface AuthUser {
  id: string;
  email: string;
  orgId: string;
  orgType: "gv" | "saelim";
  role: string;
}

/**
 * 현재 요청의 인증된 사용자 정보 반환
 * 인증되지 않은 경우 null 반환
 */
export async function getAuthUser(
  request: Request,
  context: AppLoadContext
): Promise<{ user: AuthUser | null; headers: Headers }> {
  const { supabase, headers } = createSupabaseServerClient(request, context);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, headers };
  }

  const authUser: AuthUser = {
    id: user.id,
    email: user.email ?? "",
    orgId: user.app_metadata?.org_id ?? "",
    orgType: user.app_metadata?.org_type ?? "gv",
    role: user.app_metadata?.role ?? "member",
  };

  return { user: authUser, headers };
}

/**
 * 인증 필수 route에서 사용
 * 미인증 시 로그인 페이지로 redirect
 */
export async function requireAuth(
  request: Request,
  context: AppLoadContext
): Promise<{ user: AuthUser; headers: Headers }> {
  const { user, headers } = await getAuthUser(request, context);

  if (!user) {
    throw redirect("/login", { headers });
  }

  return { user, headers };
}

/**
 * GV 전용 route에서 사용
 * GV 유저가 아닌 경우 Saelim 배송 페이지로 redirect
 */
export function requireGVUser(user: AuthUser): void {
  if (user.orgType !== "gv") {
    throw redirect("/saelim/delivery");
  }
}

/**
 * Saelim 전용 route에서 사용
 */
export function requireSaelimUser(user: AuthUser): void {
  if (user.orgType !== "saelim") {
    throw redirect("/");
  }
}

/**
 * 로그인 처리
 */
export async function signIn(
  email: string,
  password: string,
  request: Request,
  context: AppLoadContext
): Promise<{ success: boolean; error?: string; headers: Headers }> {
  const { supabase, headers } = createSupabaseServerClient(request, context);

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { success: false, error: error.message, headers };
  }

  return { success: true, headers };
}

/**
 * 로그아웃 처리
 */
export async function signOut(
  request: Request,
  context: AppLoadContext
): Promise<Headers> {
  const { supabase, headers } = createSupabaseServerClient(request, context);
  await supabase.auth.signOut();
  return headers;
}
```

**Loader/Action에서의 사용 패턴:**

```typescript
// app/loaders/po.server.ts
import { requireAuth, requireGVUser } from "~/lib/auth.server";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import type { Route } from "./+types/po";

export async function loader({ request, context }: Route.LoaderArgs) {
  // 1. 인증 확인
  const { user, headers } = await requireAuth(request, context);

  // 2. GV 유저 확인
  requireGVUser(user);

  // 3. 데이터 조회
  const { supabase } = createSupabaseServerClient(request, context);
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("id, po_no, po_date, status, amount, currency")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Response("Failed to load purchase orders", { status: 500 });
  }

  return Response.json({ items: data, user }, { headers });
}
```

**주의: headers 전달이 핵심.** Supabase의 cookie refresh가 response에 반영되려면 loader/action의 반환값에 headers를 포함해야 한다.

---

## 4. 환경변수 설정

### 4a. wrangler.jsonc 수정

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "saelim",
  "compatibility_date": "2025-04-04",
  "main": "./workers/app.ts",
  "vars": {
    "SUPABASE_URL": "https://xxx.supabase.co"
    // SUPABASE_ANON_KEY는 vars에 넣어도 되지만, secret 권장
  },
  "observability": {
    "enabled": true
  },
  "compatibility_flags": [
    "nodejs_compat"
  ]
}
```

### 4b. wrangler secret 설정 명령어

```bash
# Supabase 키들은 secret으로 관리 (코드에 노출되지 않음)
npx wrangler secret put SUPABASE_ANON_KEY
# 프롬프트에서 값 입력: eyJ...

npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# 프롬프트에서 값 입력: eyJ...

# 확인
npx wrangler secret list
```

### 4c. 개발용 `.dev.vars` 파일

```env
# .dev.vars (로컬 개발용, .gitignore에 포함 필수)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 4d. Env 타입 정의

`worker-configuration.d.ts` (cf-typegen이 자동 생성):
```typescript
interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}
```

**중요:** `npm run cf-typegen` 실행 시 wrangler.jsonc의 vars 기반으로 Env 타입이 자동 생성됨. 단, secrets는 wrangler.jsonc에 나타나지 않으므로 `worker-configuration.d.ts`에 수동 추가가 필요할 수 있음.

### 4e. .gitignore에 추가할 항목

```
# .gitignore에 추가
.dev.vars
```

---

## 5. Admin 사용자 초기 생성 방법

### 방법 1: Supabase Dashboard (권장, 초기 설정)

```
1. Supabase Dashboard > Authentication > Users
2. "Add User" 클릭
3. Email, Password 입력
4. 생성 후 해당 사용자의 "Edit" 클릭
5. app_metadata에 다음 추가:
   {
     "org_id": "a0000000-0000-0000-0000-000000000002",
     "org_type": "gv",
     "role": "admin"
   }
```

### 방법 2: Service Role Key로 프로그래밍 생성

```typescript
// 일회성 스크립트 또는 admin action에서 사용
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// GV Admin 사용자 생성
const { data, error } = await supabaseAdmin.auth.admin.createUser({
  email: "admin@gvinternational.com",
  password: "secure-password-here",
  email_confirm: true,  // 이메일 확인 스킵
  app_metadata: {
    org_id: "a0000000-0000-0000-0000-000000000002",  // GV org
    org_type: "gv",
    role: "admin",
  },
});

// Saelim 사용자 생성
const { data: saelimUser } = await supabaseAdmin.auth.admin.createUser({
  email: "user@saelim.co.kr",
  password: "secure-password-here",
  email_confirm: true,
  app_metadata: {
    org_id: "a0000000-0000-0000-0000-000000000003",  // Saelim org
    org_type: "saelim",
    role: "member",
  },
});

// user_profiles 테이블에도 레코드 생성
await supabaseAdmin.from("user_profiles").insert([
  {
    id: data.user!.id,
    name: "GV Admin",
    org_id: "a0000000-0000-0000-0000-000000000002",
    role: "admin",
  },
]);
```

### 방법 3: MCP를 통한 SQL 직접 실행

```sql
-- Supabase MCP execute_sql로 실행
-- (auth.users는 직접 INSERT하기보다 Admin API 사용 권장)

-- user_profiles는 auth.users 생성 후 추가
INSERT INTO user_profiles (id, name, org_id, role)
VALUES (
  'auth-user-uuid-here',
  'GV Admin',
  'a0000000-0000-0000-0000-000000000002',
  'admin'
);
```

### app_metadata 변경 방법 (기존 사용자)

```typescript
// Service Role 클라이언트 필수
const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
  userId,
  {
    app_metadata: {
      org_id: "a0000000-0000-0000-0000-000000000002",
      org_type: "gv",
      role: "admin",
    },
  }
);
```

**주의:** `app_metadata`는 user_metadata와 달리 Supabase Client SDK로 변경 불가. 반드시 service_role_key를 가진 admin 클라이언트에서만 변경 가능. 이것이 RLS에서 `app_metadata`를 사용하는 핵심 이유.

---

## 6. TypeScript 타입 자동생성

### MCP를 통한 타입 생성

```
MCP: generate_typescript_types
파라미터:
  - project_id: (프로젝트 ID)
결과: TypeScript 타입 정의 문자열
```

### 저장 위치 및 사용

```
app/types/database.ts
```

타입 파일 구조 (Supabase가 자동 생성):

```typescript
// app/types/database.ts (자동 생성됨)
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          type: string
          name_en: string
          name_ko: string | null
          // ...
        }
        Insert: {
          id?: string
          type: string
          name_en: string
          // ...
        }
        Update: {
          id?: string
          type?: string
          // ...
        }
      }
      purchase_orders: {
        Row: { /* ... */ }
        Insert: { /* ... */ }
        Update: { /* ... */ }
      }
      // ... 모든 테이블
    }
    Functions: {
      generate_doc_number: {
        Args: { doc_type: string; ref_date?: string }
        Returns: string
      }
      create_pi_from_po: {
        Args: { source_po_id: string; gv_org_id: string; saelim_org_id: string }
        Returns: string
      }
      // ...
    }
  }
}
```

### 활용 패턴

```typescript
import type { Database } from "~/types/database";

// 테이블 Row 타입 추출
type Organization = Database["public"]["Tables"]["organizations"]["Row"];
type PurchaseOrder = Database["public"]["Tables"]["purchase_orders"]["Row"];

// Insert/Update 타입 추출
type NewPO = Database["public"]["Tables"]["purchase_orders"]["Insert"];
type UpdatePO = Database["public"]["Tables"]["purchase_orders"]["Update"];

// Supabase 클라이언트에서 사용
const { data } = await supabase
  .from("purchase_orders")
  .select("id, po_no, status")
  .returns<Pick<PurchaseOrder, "id" | "po_no" | "status">[]>();
```

### 타입 재생성 시점

- DB 스키마 변경 후
- 새 마이그레이션 실행 후
- RPC 함수 추가/수정 후

```bash
# package.json에 스크립트 추가 고려
"db:types": "npx supabase gen types typescript --project-id <ref> > app/types/database.ts"
# 또는 MCP를 통해 직접 생성
```

---

## 7. 서버 유틸리티

### 7a. `app/lib/format.ts` (서버/클라이언트 공용)

```typescript
/**
 * 날짜, 통화, 숫자 포맷 유틸리티
 * 한국 로케일 기준
 */

// 날짜 포맷: "2026-03-06" -> "2026.03.06"
export function formatDate(date: string | Date | null): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).replace(/\. /g, ".").replace(/\.$/, "");
}

// 날짜 포맷 (짧은 형식): "03.06"
export function formatDateShort(date: string | Date | null): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
  }).replace(/\. /g, ".").replace(/\.$/, "");
}

// USD 금액 포맷: 1234.5 -> "$1,234.50"
export function formatCurrencyUSD(amount: number | null): string {
  if (amount == null) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

// KRW 금액 포맷: 1234567 -> "1,234,567원"
export function formatCurrencyKRW(amount: number | null): string {
  if (amount == null) return "-";
  return new Intl.NumberFormat("ko-KR").format(amount) + "원";
}

// 숫자 포맷 (천 단위 콤마): 1234 -> "1,234"
export function formatNumber(num: number | null): string {
  if (num == null) return "-";
  return new Intl.NumberFormat("ko-KR").format(num);
}

// 소수점 포함 숫자: 1234.567 -> "1,234.567"
export function formatDecimal(num: number | null, digits: number = 3): string {
  if (num == null) return "-";
  return new Intl.NumberFormat("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(num);
}

// 상태 한글 변환
export function formatStatus(status: string): string {
  const statusMap: Record<string, string> = {
    process: "진행",
    complete: "완료",
    pending: "대기",
    approved: "승인",
    rejected: "반려",
  };
  return statusMap[status] ?? status;
}

// 문서 타입 한글 변환
export function formatDocType(type: string): string {
  const typeMap: Record<string, string> = {
    po: "구매주문서",
    pi: "견적송장",
    shipping: "선적서류",
    customs: "통관",
    order: "오더",
    delivery: "배송",
  };
  return typeMap[type] ?? type;
}
```

### 7b. `app/lib/constants.ts` (서버/클라이언트 공용)

```typescript
/**
 * 애플리케이션 상수
 */

// 통화
export const CURRENCIES = ["USD", "EUR", "JPY", "KRW"] as const;
export type Currency = typeof CURRENCIES[number];

// 문서 상태
export const DOC_STATUS = {
  PROCESS: "process",
  COMPLETE: "complete",
} as const;

// 배송변경 요청 상태
export const CHANGE_REQUEST_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;

// 조직 타입
export const ORG_TYPES = {
  SUPPLIER: "supplier",
  SELLER: "seller",
  BUYER: "buyer",
} as const;

// 사용자 조직 타입 (auth용)
export const USER_ORG_TYPES = {
  GV: "gv",
  SAELIM: "saelim",
} as const;

// 기본 항구
export const DEFAULT_PORTS = {
  LOADING: "Keelung, Taiwan",
  DISCHARGE: "Busan, Korea",
} as const;

// 기본 결제 조건
export const PAYMENT_TERMS = [
  "T/T in advance",
  "T/T within 30 days after B/L date",
  "T/T within 60 days after B/L date",
  "L/C at sight",
] as const;

// 기본 인도 조건
export const DELIVERY_TERMS = [
  "FOB Keelung",
  "CIF Busan",
  "CFR Busan",
] as const;

// CY Free Time (일)
export const CY_FREE_TIME_DAYS = 14;

// 문서 번호 prefix
export const DOC_PREFIX = {
  PO: "GVPO",
  PI: "GVPI",
  CI: "GVCI",
  PL: "GVPL",
} as const;

// 파일 업로드 제한
export const FILE_LIMITS = {
  SIGNATURE_MAX_SIZE: 2 * 1024 * 1024,       // 2MB
  IMAGE_MAX_SIZE: 5 * 1024 * 1024,           // 5MB
  ATTACHMENT_MAX_SIZE: 20 * 1024 * 1024,     // 20MB
} as const;

// 이미지 허용 MIME 타입
export const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
] as const;
```

---

## 8. npm 패키지 설치 목록

Phase 0에서 설치해야 할 패키지:

```bash
# Supabase
npm install @supabase/supabase-js @supabase/ssr
```

추가 설치 고려 (Phase 1 시작 시):
```bash
# Form validation
npm install zod
```

---

## 9. 구현 순서 체크리스트

```
Phase 0 실행 순서:

[ ] 1. Supabase 프로젝트 생성 (MCP)
[ ] 2. Supabase Auth 설정 (Dashboard: DISABLE_SIGNUP, email provider)
[ ] 3. npm install @supabase/supabase-js @supabase/ssr
[ ] 4. .dev.vars 파일 생성 (SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY)
[ ] 5. .gitignore에 .dev.vars 추가
[ ] 6. DB 마이그레이션 실행 (001 ~ 010 순서대로)
[ ] 7. TypeScript 타입 생성 (MCP generate_typescript_types)
[ ] 8. app/types/database.ts 저장
[ ] 9. app/lib/supabase.server.ts 구현
[ ] 10. app/lib/auth.server.ts 구현
[ ] 11. app/lib/format.ts 구현
[ ] 12. app/lib/constants.ts 구현
[ ] 13. workers/app.ts Env 타입 확인
[ ] 14. wrangler.jsonc 수정 (SUPABASE_URL 추가)
[ ] 15. Admin 사용자 생성 (GV admin + test Saelim user)
[ ] 16. 로컬 dev 서버에서 Supabase 연결 테스트
[ ] 17. wrangler secret 설정 (배포용)
```

---

## 10. 주의사항 및 Edge Case

### Cloudflare Workers 제약

1. **No File System**: 마이그레이션 파일은 프로젝트에 보관하되, 실행은 MCP 또는 Supabase CLI를 통해 수행
2. **CPU Time Limit**: 무거운 연산은 RPC로 DB에 위임
3. **No Native Modules**: `@supabase/ssr`은 순수 JS이므로 문제없음
4. **Request Size**: Cloudflare Workers는 기본 100MB request body 지원

### Cookie 관리 주의점

- Supabase Auth는 access_token + refresh_token을 쿠키에 저장
- Cloudflare Workers에서는 `Set-Cookie` 헤더를 직접 관리해야 함
- **모든 loader/action에서 headers를 response에 포함해야 token refresh가 반영됨**
- 빠뜨리면 세션이 갑자기 만료되는 현상 발생

### RLS 디버깅

- Supabase SQL Editor는 RLS를 우회하므로 테스트에 부적합
- anon key + 사용자 JWT로 클라이언트 SDK 테스트 필수
- `EXPLAIN ANALYZE`로 RLS 정책이 인덱스를 타는지 확인
- 목표: 단일 테이블 쿼리 50ms 이하

### soft_delete와 RLS의 관계

- 모든 RLS SELECT 정책에 `deleted_at IS NULL` 조건 포함
- 이로 인해 deleted_at 컬럼에 partial index 적용 (WHERE deleted_at IS NULL)
- soft delete된 레코드는 RLS에 의해 자동으로 필터링됨
- 복구가 필요한 경우 service_role 클라이언트 사용

---

## 11. 마이그레이션 파일 저장 위치

프로젝트 내 마이그레이션 파일 보관 (참조용, 실행은 MCP를 통해):

```
supabase/
  migrations/
    001_extensions_and_helpers.sql
    002_core_tables.sql
    003_document_tables.sql
    004_content_system.sql
    005_delivery_changes.sql
    006_rls_policies.sql
    007_rpc_functions.sql
    008_indexes.sql
    009_storage_setup.sql
    010_seed_data.sql
```

Supabase CLI를 사용하지 않고 MCP로 직접 실행하는 경우:
- 각 파일의 SQL을 순서대로 `execute_sql`로 실행
- 실패 시 해당 마이그레이션만 수정 후 재실행
- 이미 실행된 마이그레이션은 중복 실행 방지 (IF NOT EXISTS 활용)
