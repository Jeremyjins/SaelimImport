import type { DocStatus } from "~/types/common";

export type { DocStatus };

// ── Line Items (PI와 동일 구조) ─────────────────────────────

export interface ShippingLineItem {
  product_id: string;
  product_name: string;
  gsm: number | null;
  width_mm: number | null;
  quantity_kg: number;
  unit_price: number;
  amount: number;
}

// ── Stuffing List Types ──────────────────────────────────────

export interface StuffingRollDetail {
  roll_no: number;
  product_name: string;
  gsm: number;
  width_mm: number;
  length_m: number;
  net_weight_kg: number;
  gross_weight_kg: number;
}

export interface StuffingList {
  id: string;
  shipping_doc_id: string;
  sl_no: string | null;
  cntr_no: string | null;
  seal_no: string | null;
  roll_no_range: string | null;
  roll_details: StuffingRollDetail[];
  created_at: string;
  updated_at: string;
}

// ── 목록용 (compact) ────────────────────────────────────────

export interface ShippingListItem {
  id: string;
  ci_no: string;
  pl_no: string;
  ci_date: string;
  status: DocStatus;
  currency: string;
  amount: number | null;
  vessel: string | null;
  etd: string | null;
  eta: string | null;
  shipper: { name_en: string } | null;
  consignee: { name_en: string } | null;
  pi: { pi_no: string } | null;
}

// ── 상세용 (org join 포함) ───────────────────────────────────

export interface ShippingWithOrgs {
  id: string;
  ci_no: string;
  pl_no: string;
  ci_date: string;
  ref_no: string | null;
  pi_id: string | null;
  shipper_id: string;
  consignee_id: string;
  currency: string;
  amount: number | null;
  payment_term: string | null;
  delivery_term: string | null;
  loading_port: string | null;
  discharge_port: string | null;
  vessel: string | null;
  voyage: string | null;
  ship_date: string | null;
  etd: string | null;
  eta: string | null;
  gross_weight: number | null;
  net_weight: number | null;
  package_no: number | null;
  details: ShippingLineItem[];
  notes: string | null;
  status: DocStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  shipper: { id: string; name_en: string; name_ko: string | null; address_en: string | null } | null;
  consignee: { id: string; name_en: string; name_ko: string | null; address_en: string | null } | null;
  pi: { pi_no: string } | null;
  stuffing_lists: StuffingList[];
}

// ── 수정 폼 데이터 ────────────────────────────────────────────

export interface ShippingEditData {
  id: string;
  ci_no: string;
  pl_no: string;
  ci_date: string;
  ref_no: string | null;
  pi_id: string | null;
  shipper_id: string;
  consignee_id: string;
  currency: string;
  payment_term: string | null;
  delivery_term: string | null;
  loading_port: string | null;
  discharge_port: string | null;
  vessel: string | null;
  voyage: string | null;
  ship_date: string | null;
  etd: string | null;
  eta: string | null;
  gross_weight: number | null;
  net_weight: number | null;
  package_no: number | null;
  notes: string | null;
  status: DocStatus;
  details: ShippingLineItem[];
}

// ── PI에서 선적서류 생성 시 참조 데이터 (?from_pi=uuid) ────────

export interface SourcePI {
  id: string;
  pi_no: string;
  currency: string;
  payment_term: string | null;
  delivery_term: string | null;
  loading_port: string | null;
  discharge_port: string | null;
  supplier_id: string; // shipper_id 매핑
  buyer_id: string;    // consignee_id 매핑
  details: ShippingLineItem[];
}
