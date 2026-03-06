# Backend Dev Notes: Saelim Import Management System

**Date:** 2026-03-06

---

## 1. Supabase Project Setup

### Auth Configuration
- Email provider enabled
- `DISABLE_SIGNUP=true` (invite-only)
- Admin creates users via Supabase dashboard or admin action
- `user_metadata`: `{ org_id: uuid, org_type: 'gv' | 'saelim' }`
- Password minimum: 8 characters
- Session: JWT with refresh token

### Storage Buckets
| Bucket | Public | Max Size | Allowed Types |
|--------|--------|----------|---------------|
| `signatures` | No | 2MB | image/png, image/jpeg |
| `content-images` | Yes | 5MB | image/* |
| `attachments` | No | 20MB | * |

### Environment Variables (Cloudflare Workers)
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # For admin operations only
```

---

## 2. Complete Database Schema

### Helper Tables

```sql
-- Document number sequences
CREATE TABLE document_sequences (
  doc_prefix TEXT NOT NULL,      -- 'GVPO', 'GVPI', 'GVCI', 'GVPL'
  doc_yymm TEXT NOT NULL,        -- '2603'
  seq_no INT NOT NULL DEFAULT 0,
  PRIMARY KEY (doc_prefix, doc_yymm)
);
```

### Core Tables

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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Products
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  gsm INT,
  width_mm INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users (extends Supabase auth.users)
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  org_id UUID REFERENCES organizations(id),
  role TEXT DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Document Tables

```sql
-- Purchase Orders
CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_no TEXT UNIQUE NOT NULL,
  po_date DATE NOT NULL,
  validity DATE,
  ref_no TEXT,
  supplier_id UUID REFERENCES organizations(id),  -- CHP
  buyer_id UUID REFERENCES organizations(id),      -- GV
  currency TEXT DEFAULT 'USD',
  amount DECIMAL(15,2),
  payment_term TEXT,
  delivery_term TEXT,
  loading_port TEXT,
  discharge_port TEXT,
  details JSONB DEFAULT '[]',
  notes TEXT,
  status TEXT DEFAULT 'process' CHECK (status IN ('process', 'complete')),
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
  supplier_id UUID REFERENCES organizations(id),   -- GV
  buyer_id UUID REFERENCES organizations(id),       -- Saelim
  currency TEXT DEFAULT 'USD',
  amount DECIMAL(15,2),
  payment_term TEXT,
  delivery_term TEXT,
  loading_port TEXT,
  discharge_port TEXT,
  details JSONB DEFAULT '[]',
  notes TEXT,
  status TEXT DEFAULT 'process' CHECK (status IN ('process', 'complete')),
  po_id UUID REFERENCES purchase_orders(id),        -- nullable
  created_by UUID REFERENCES auth.users(id),
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
  shipper_id UUID REFERENCES organizations(id),     -- GV
  consignee_id UUID REFERENCES organizations(id),   -- Saelim
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
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stuffing Lists
CREATE TABLE stuffing_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sl_no TEXT,
  cntr_no TEXT,
  seal_no TEXT,
  roll_no_range TEXT,            -- e.g., "1 - 15"
  roll_details JSONB DEFAULT '[]',  -- [{seq, lot_no, length, weight}]
  shipping_doc_id UUID REFERENCES shipping_documents(id) ON DELETE CASCADE,
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
  created_by UUID REFERENCES auth.users(id),
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
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Deliveries
CREATE TABLE deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pi_id UUID REFERENCES proforma_invoices(id),
  shipping_doc_id UUID REFERENCES shipping_documents(id),
  delivery_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Delivery Change Requests
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
```

### Content System

```sql
-- Contents (Polymorphic)
CREATE TABLE contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('po', 'pi', 'shipping', 'order', 'customs')),
  parent_id UUID NOT NULL,         -- FK to respective table based on type
  title TEXT,
  body JSONB,                      -- Tiptap JSON content
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
```

---

## 3. RLS Policies

```sql
-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
-- ... (all tables)

-- Helper function: get user's org type
CREATE OR REPLACE FUNCTION get_user_org_type()
RETURNS TEXT AS $$
  SELECT (auth.jwt() -> 'user_metadata' ->> 'org_type')::TEXT;
$$ LANGUAGE sql SECURITY DEFINER;

-- GV users: full access to everything
CREATE POLICY "gv_full_access" ON purchase_orders
  FOR ALL USING (get_user_org_type() = 'gv');

-- Saelim users: delivery access only
CREATE POLICY "saelim_read_deliveries" ON deliveries
  FOR SELECT USING (get_user_org_type() = 'saelim');

CREATE POLICY "saelim_read_own_change_requests" ON delivery_change_requests
  FOR SELECT USING (
    get_user_org_type() = 'saelim'
    AND requested_by = auth.uid()
  );

CREATE POLICY "saelim_create_change_requests" ON delivery_change_requests
  FOR INSERT WITH CHECK (
    get_user_org_type() = 'saelim'
    AND requested_by = auth.uid()
  );
```

---

## 4. RPC Functions

```sql
-- Generate document number
CREATE OR REPLACE FUNCTION generate_doc_number(doc_type TEXT, ref_date DATE DEFAULT CURRENT_DATE)
RETURNS TEXT AS $$
-- (See architect-notes.md for full implementation)
$$ LANGUAGE plpgsql;

-- Create PI from PO (clone without pricing)
CREATE OR REPLACE FUNCTION create_pi_from_po(source_po_id UUID, gv_org_id UUID, saelim_org_id UUID)
RETURNS UUID AS $$
DECLARE
  new_pi_id UUID;
  po_record RECORD;
BEGIN
  SELECT * INTO po_record FROM purchase_orders WHERE id = source_po_id;

  INSERT INTO proforma_invoices (
    pi_no, pi_date, validity, ref_no,
    supplier_id, buyer_id, currency,
    payment_term, delivery_term, loading_port, discharge_port,
    details, notes, po_id, created_by
  ) VALUES (
    generate_doc_number('PI', CURRENT_DATE),
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '1 month',
    po_record.ref_no,
    gv_org_id,        -- GV as supplier
    saelim_org_id,    -- Saelim as buyer
    po_record.currency,
    po_record.payment_term,
    po_record.delivery_term,
    po_record.loading_port,
    po_record.discharge_port,
    -- Strip pricing from details, keep product info
    (SELECT jsonb_agg(jsonb_build_object(
      'product_id', d->>'product_id',
      'product_name', d->>'product_name',
      'gsm', d->>'gsm',
      'width', d->>'width',
      'qty', d->>'qty'
    )) FROM jsonb_array_elements(po_record.details) d),
    po_record.notes,
    source_po_id,
    auth.uid()
  ) RETURNING id INTO new_pi_id;

  RETURN new_pi_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 5. Sync Strategy (Application-Level)

### In Server Actions (React Router)

```
When creating customs:
1. Insert customs record
2. Update orders SET customs_id, customs_date WHERE shipping_doc_id matches

When updating shipping document:
1. Update shipping_documents
2. Update orders SET vessel, voyage, etd, eta WHERE shipping_doc_id matches

When approving delivery change request:
1. Update delivery_change_requests SET status = 'approved'
2. Update deliveries SET delivery_date = requested_date
3. Update orders SET delivery_date WHERE delivery_id matches

When toggling customs fee_received:
1. Update customs SET fee_received
2. Update orders SET customs_fee_received WHERE customs_id matches
```

---

## 6. Migration Strategy

### Migration Order
```
001_create_organizations.sql
002_create_products.sql
003_create_user_profiles.sql
004_create_document_sequences.sql
005_create_purchase_orders.sql
006_create_proforma_invoices.sql
007_create_deliveries.sql
008_create_shipping_documents.sql
009_create_stuffing_lists.sql
010_create_customs.sql
011_create_orders.sql
012_create_delivery_change_requests.sql
013_create_contents.sql
014_create_content_attachments.sql
015_create_comments.sql
016_create_rls_policies.sql
017_create_rpc_functions.sql
018_seed_organizations.sql
```

### Seed Data
```sql
-- Initial organizations
INSERT INTO organizations (type, name_en, name_ko, address_en) VALUES
  ('supplier', 'Chung Hwa Pulp Corporation', NULL, 'Taiwan...'),
  ('seller', 'GV International Co., Ltd.', 'GV 인터내셔널', '...'),
  ('buyer', 'Saelim Co., Ltd.', '세림', '...');
```

---

## 7. Supabase Storage Configuration

### Bucket Policies
```sql
-- Signatures: only GV users can upload/read
CREATE POLICY "gv_signatures" ON storage.objects
  FOR ALL USING (
    bucket_id = 'signatures'
    AND get_user_org_type() = 'gv'
  );

-- Content images: authenticated users can upload, public read
CREATE POLICY "auth_upload_images" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'content-images'
    AND auth.role() = 'authenticated'
  );

-- Attachments: GV users full access, Saelim limited
CREATE POLICY "gv_attachments" ON storage.objects
  FOR ALL USING (
    bucket_id = 'attachments'
    AND get_user_org_type() = 'gv'
  );
```
