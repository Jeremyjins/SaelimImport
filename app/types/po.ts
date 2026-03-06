import type { DocStatus } from "~/types/common";

export type { DocStatus };

export interface POLineItem {
  product_id: string;
  product_name: string;
  gsm: number | null;
  width_mm: number | null;
  quantity_kg: number;
  unit_price: number;
  amount: number;
}

export interface POWithOrgs {
  id: string;
  po_no: string;
  po_date: string;
  validity: string | null;
  ref_no: string | null;
  supplier_id: string;
  buyer_id: string;
  currency: string;
  amount: number | null;
  payment_term: string | null;
  delivery_term: string | null;
  loading_port: string | null;
  discharge_port: string | null;
  details: POLineItem[];
  notes: string | null;
  status: DocStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  supplier: { id: string; name_en: string; name_ko: string | null; address_en: string | null } | null;
  buyer: { id: string; name_en: string; name_ko: string | null; address_en: string | null } | null;
}

export interface POListItem {
  id: string;
  po_no: string;
  po_date: string;
  status: DocStatus;
  currency: string;
  amount: number | null;
  supplier: { name_en: string } | null;
  buyer: { name_en: string } | null;
}

/** edit 페이지 로더 데이터용 타입 (I4: EditLoaderData 로컬 중복 제거) */
export interface POEditData {
  id: string;
  po_no: string;
  po_date: string;
  validity: string | null;
  ref_no: string | null;
  supplier_id: string;
  buyer_id: string;
  currency: string;
  payment_term: string | null;
  delivery_term: string | null;
  loading_port: string | null;
  discharge_port: string | null;
  notes: string | null;
  status: DocStatus;
  details: POLineItem[];
}
