import type { DocStatus } from "~/types/common";

export type { DocStatus };

export interface PILineItem {
  product_id: string;
  product_name: string;
  gsm: number | null;
  width_mm: number | null;
  quantity_kg: number;
  unit_price: number;
  amount: number;
}

export interface PIWithOrgs {
  id: string;
  pi_no: string;
  pi_date: string;
  validity: string | null;
  ref_no: string | null;
  supplier_id: string;
  buyer_id: string;
  po_id: string | null;
  currency: string;
  amount: number | null;
  payment_term: string | null;
  delivery_term: string | null;
  loading_port: string | null;
  discharge_port: string | null;
  details: PILineItem[];
  notes: string | null;
  status: DocStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  supplier: { id: string; name_en: string; name_ko: string | null; address_en: string | null } | null;
  buyer: { id: string; name_en: string; name_ko: string | null; address_en: string | null } | null;
  po: { po_no: string } | null;
}

export interface PIListItem {
  id: string;
  pi_no: string;
  pi_date: string;
  status: DocStatus;
  currency: string;
  amount: number | null;
  supplier: { name_en: string } | null;
  buyer: { name_en: string } | null;
  po: { po_no: string } | null;
}

/** edit 페이지 로더 데이터용 타입 */
export interface PIEditData {
  id: string;
  pi_no: string;
  pi_date: string;
  validity: string | null;
  ref_no: string | null;
  supplier_id: string;
  buyer_id: string;
  po_id: string | null;
  currency: string;
  payment_term: string | null;
  delivery_term: string | null;
  loading_port: string | null;
  discharge_port: string | null;
  notes: string | null;
  status: DocStatus;
  details: PILineItem[];
}

/** PO에서 PI 생성 시 sourcePO 데이터 타입 */
export interface SourcePO {
  id: string;
  po_no: string;
  currency: string;
  payment_term: string | null;
  delivery_term: string | null;
  loading_port: string | null;
  discharge_port: string | null;
  details: PILineItem[];
}
