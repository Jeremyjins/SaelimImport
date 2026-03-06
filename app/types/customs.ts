// ── Fee Breakdown (JSONB: 한국 세금계산서 표준) ───────────────
// supply = 공급가액, vat = 세액, total = 합계금액

export interface FeeBreakdown {
  supply: number;
  vat: number;
  total: number;
}

// ── Shipping Reference (목록용 join) ─────────────────────────

export interface CustomsShippingRef {
  id: string;
  ci_no: string;
  vessel: string | null;
  eta: string | null;
}

// ── List Item (compact) ──────────────────────────────────────

export interface CustomsListItem {
  id: string;
  customs_no: string | null;
  customs_date: string | null;
  fee_received: boolean | null;
  transport_fee: FeeBreakdown | null;
  customs_fee: FeeBreakdown | null;
  vat_fee: FeeBreakdown | null;
  etc_fee: FeeBreakdown | null;
  created_at: string;
  shipping: CustomsShippingRef | null;
}

// ── Detail (full, Phase 7-B) ─────────────────────────────────

export interface CustomsDetail extends Omit<CustomsListItem, "shipping"> {
  shipping_doc_id: string | null;
  etc_desc: string | null;
  created_by: string | null;
  updated_at: string | null;
  shipping: {
    id: string;
    ci_no: string;
    pl_no: string;
    vessel: string | null;
    voyage: string | null;
    eta: string | null;
    etd: string | null;
    status: string;
    pi: { pi_no: string } | null;
  } | null;
}

// ── Source Shipping (?from_shipping=uuid 프리필용) ───────────

export interface SourceShipping {
  id: string;
  ci_no: string;
  vessel: string | null;
  eta: string | null;
}

// ── Available Shipping (폼 드롭다운용) ───────────────────────

export interface AvailableShipping {
  id: string;
  ci_no: string;
  ci_date: string;
  vessel: string | null;
  eta: string | null;
}
