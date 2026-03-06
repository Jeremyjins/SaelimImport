# Architect Notes: Saelim Import Management System

**Date:** 2026-03-06

---

## 1. System Architecture

### Monolithic SPA with SSR
- React Router 7 + Cloudflare Workers: 단일 앱으로 모든 기능 제공
- SSR을 통한 초기 로딩 최적화, 이후 client-side navigation
- Supabase를 BaaS로 사용하여 별도 API 서버 불필요

### Pros
- 개발 속도 빠름 (단일 코드베이스)
- 배포 간단 (Cloudflare Workers 단일 배포)
- 소규모 팀 (5-10명)에 적합
- Supabase가 DB + Auth + Storage + RLS 모두 제공

### Cons
- Cloudflare Workers의 제한 (CPU time, memory, no file system)
- PDF 서버사이드 생성 어려움 (Edge runtime 제약)
- 규모 확장 시 모놀리스 한계

---

## 2. Data Flow Architecture

```
┌─────────────┐     참조      ┌─────────────┐     참조      ┌─────────────┐
│   Purchase  │ ──────────▶  │  Proforma   │ ──────────▶  │  Shipping   │
│   Order     │              │  Invoice    │              │  Document   │
│  (GV→CHP)  │              │  (GV→Saelim)│              │  (CI/PL)    │
└──────┬──────┘              └──────┬──────┘              └──────┬──────┘
       │                            │                            │
       │                            │ auto-create                │
       │                            ▼                            │
       │                     ┌─────────────┐                     │
       │                     │  Delivery   │                     │
       │                     │  Management │                     │
       │                     └──────┬──────┘                     │
       │                            │                            │
       │                            │           ┌────────────────┘
       │                            │           │
       ▼                            ▼           ▼
┌─────────────────────────────────────────────────────┐
│              Order Management (집계)                  │
│  PO + PI + Shipping + Customs + Delivery 통합 관리   │
└─────────────────────────────────────────────────────┘
                                    ▲
                                    │
                             ┌──────┴──────┐
                             │   Customs   │
                             │  Management │
                             └─────────────┘
```

### CRUD Operations per Module

| Module | Creates | Reads From | Updates |
|--------|---------|------------|---------|
| PO | PO | Organizations, Products | - |
| PI | PI, Delivery | PO (참조), Organizations, Products | - |
| Shipping | Shipping Doc, Stuffing | PI (참조) | Order (vessel, etd, eta) |
| Order | Order | PO, PI, Shipping, Customs, Delivery | Delivery (배송일) |
| Customs | Customs | Shipping Doc | Order (통관일, 통관비수령) |
| Delivery | Change Request | PI, Shipping | Order (배송일) |

---

## 3. Database Schema Design Principles

### JSONB Usage Strategy
- **details (line items):** JSONB - 품목 1-5개, 독립 쿼리 불필요
  ```json
  [{"product_id": 1, "product_name": "Blue Glassine", "gsm": 60, "width": 1091, "qty": 15, "unit_price": 1200, "amount": 18000}]
  ```
- **fee breakdowns:** JSONB - 고정 구조 `{supply: number, vat: number, total: number}`
- **roll_details:** JSONB array - 롤별 상세 정보

### Document Number Strategy
```sql
CREATE OR REPLACE FUNCTION generate_doc_number(
  doc_type TEXT,  -- 'PO', 'PI', 'CI', 'PL'
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

  -- Get next sequence number for this type+month
  -- Uses advisory lock for concurrency safety
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
$$ LANGUAGE plpgsql;
```

### Cascade & Foreign Key Strategy
- **Soft delete preferred** - status를 'deleted'로 변경
- **ON DELETE RESTRICT** - 연결된 문서가 있으면 삭제 방지
- **ON DELETE CASCADE** - contents, comments, attachments는 부모 삭제 시 함께 삭제

---

## 4. Module Interconnection Map

```
organizations ◄──── purchase_orders.supplier_id, buyer_id
              ◄──── proforma_invoices.supplier_id, buyer_id
              ◄──── shipping_documents.shipper_id, consignee_id
              ◄──── users.org_id

products ◄──── purchase_orders.details (JSONB, product_id reference)
         ◄──── proforma_invoices.details
         ◄──── shipping_documents.details

purchase_orders ◄──── proforma_invoices.po_id
                ◄──── orders.po_id

proforma_invoices ◄──── shipping_documents.pi_id
                  ◄──── deliveries.pi_id
                  ◄──── orders.pi_id

shipping_documents ◄──── stuffing_lists.shipping_doc_id
                   ◄──── customs.shipping_doc_id
                   ◄──── orders.shipping_doc_id
                   ◄──── deliveries.shipping_doc_id

deliveries ◄──── delivery_change_requests.delivery_id
           ◄──── orders.delivery_id

customs ◄──── orders.customs_id

contents ◄──── content_attachments.content_id
         ◄──── comments.content_id
```

---

## 5. Development Phase Dependencies

```
Phase 1 (Foundation)
    │
    ├──▶ Phase 2 (PO) ──▶ Phase 3 (PI) ──▶ Phase 5 (Shipping)
    │                          │                    │
    │                          │                    ├──▶ Phase 7 (Customs)
    │                          │                    │
    ├──▶ Phase 4 (Contents) ◄──┼────────────────────┤
    │                          │                    │
    │                          ▼                    │
    │                     Phase 8 (Delivery) ◄──────┤
    │                                               │
    └──────────────────▶ Phase 6 (Orders) ◄─────────┘
                              │
                              ▼
                        Phase 9 (PDF)
                              │
                              ▼
                        Phase 10 (Polish)
```

Phase 4 (Contents)는 독립적으로 개발 가능하며 Phase 2-3과 병렬 진행 가능.
