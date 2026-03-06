export type DeliveryStatus = "pending" | "scheduled" | "delivered";
export type ChangeRequestStatus = "pending" | "approved" | "rejected";

export interface ChangeRequest {
  id: string;
  delivery_id: string | null;
  requested_date: string;
  reason: string | null;
  status: ChangeRequestStatus | null;
  requested_by: string | null;
  responded_by: string | null;
  response_text: string | null;
  responded_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

// Saelim Portal 전용 타입 (가격 정보 제외 - CRIT-1)
export interface SaelimDeliveryListItem {
  id: string;
  delivery_date: string | null;
  status: string;
  created_at: string | null;
  pi: { id: string; pi_no: string } | null;
  shipping: {
    id: string;
    ci_no: string;
    vessel: string | null;
    eta: string | null;
  } | null;
  my_pending_request: boolean;
}

export interface SaelimDeliveryDetail {
  id: string;
  delivery_date: string | null;
  status: string;
  pi: { id: string; pi_no: string } | null;
  shipping: {
    id: string;
    ci_no: string;
    vessel: string | null;
    voyage: string | null;
    eta: string | null;
    etd: string | null;
  } | null;
  my_change_requests: ChangeRequest[];
}

export interface DeliveryListItem {
  id: string;
  delivery_date: string | null;
  status: string;
  created_at: string | null;
  pi: {
    id: string;
    pi_no: string;
  } | null;
  shipping: {
    id: string;
    ci_no: string;
    vessel: string | null;
    eta: string | null;
  } | null;
  pending_requests: number; // 대기 중 변경요청 수 (앱 레벨 계산)
}

export interface DeliveryDetail {
  id: string;
  delivery_date: string | null;
  status: string;
  pi_id: string | null;
  shipping_doc_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  pi: {
    id: string;
    pi_no: string;
    pi_date: string | null;
    currency: string | null;
  } | null;
  shipping: {
    id: string;
    ci_no: string;
    vessel: string | null;
    voyage: string | null;
    eta: string | null;
    etd: string | null;
  } | null;
  change_requests: ChangeRequest[];
}
