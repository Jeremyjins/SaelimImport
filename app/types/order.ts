import type { DocStatus } from "~/types/common";

export type { DocStatus };

export type CYStatus = "pending" | "ok" | "warning" | "overdue";

// ── Document Reference Types ──────────────────────────────────

export interface OrderPORef {
  id: string;
  po_no: string;
  po_date: string;
  status: DocStatus;
  currency: string | null;
  amount: number | null;
}

export interface OrderPIRef {
  id: string;
  pi_no: string;
  pi_date: string;
  status: DocStatus;
  currency: string | null;
  amount: number | null;
}

export interface OrderShippingRef {
  id: string;
  ci_no: string;
  vessel: string | null;
  voyage: string | null;
  etd: string | null;
  eta: string | null;
  status: DocStatus;
}

export interface OrderCustomsRef {
  id: string;
  customs_no: string | null;
  customs_date: string | null;
  fee_received: boolean | null;
}

export interface OrderDeliveryRef {
  id: string;
  delivery_date: string | null;
}

// ── List Item (compact) ───────────────────────────────────────

export interface OrderListItem {
  id: string;
  saelim_no: string | null;
  status: DocStatus;
  advice_date: string | null;
  arrival_date: string | null;
  delivery_date: string | null;
  customs_fee_received: boolean | null;
  created_at: string;
  po: OrderPORef | null;
  pi: OrderPIRef | null;
  shipping: OrderShippingRef | null;
  customs: OrderCustomsRef | null;
  delivery: OrderDeliveryRef | null;
}

// ── Detail (full) ─────────────────────────────────────────────

export interface OrderDetail extends OrderListItem {
  po_id: string | null;
  pi_id: string | null;
  shipping_doc_id: string | null;
  customs_id: string | null;
  delivery_id: string | null;
  created_by: string | null;
  updated_at: string | null;
}

// ── Cascade Link Result ───────────────────────────────────────

export interface CascadeLinkResult {
  pi_id: string | null;
  shipping_doc_id: string | null;
  delivery_id: string | null;
  customs_id: string | null;
}
