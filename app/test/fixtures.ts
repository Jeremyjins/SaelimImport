export const TEST_UUID = {
  supplier: "10000000-0000-0000-0000-000000000001",
  buyer: "10000000-0000-0000-0000-000000000002",
  product: "10000000-0000-0000-0000-000000000003",
  po: "20000000-0000-0000-0000-000000000001",
  pi: "20000000-0000-0000-0000-000000000002",
  shipping: "20000000-0000-0000-0000-000000000003",
  customs: "20000000-0000-0000-0000-000000000004",
  order: "20000000-0000-0000-0000-000000000005",
  delivery: "20000000-0000-0000-0000-000000000006",
  user: "00000000-0000-0000-0000-000000000001",
  request: "30000000-0000-0000-0000-000000000001",
};

export const mockLineItem = {
  product_id: TEST_UUID.product,
  product_name: "Glassine Paper 40gsm",
  gsm: 40,
  width_mm: 1000,
  quantity_kg: 500,
  unit_price: 2.5,
  amount: 1250,
};

export const mockPO = {
  id: TEST_UUID.po,
  po_no: "GVPO2603-001",
  po_date: "2026-03-06",
  status: "process" as const,
  amount: 1250.0,
  currency: "USD",
  supplier_id: TEST_UUID.supplier,
  buyer_id: TEST_UUID.buyer,
  deleted_at: null,
  details: [mockLineItem],
};

export const mockPI = {
  id: TEST_UUID.pi,
  pi_no: "GVPI2603-001",
  pi_date: "2026-03-06",
  status: "process" as const,
  amount: 1250.0,
  currency: "USD",
  supplier_id: TEST_UUID.supplier,
  buyer_id: TEST_UUID.buyer,
  po_id: TEST_UUID.po,
  deleted_at: null,
  details: [mockLineItem],
};

export const mockShipping = {
  id: TEST_UUID.shipping,
  ci_no: "GVCI2603-001",
  ci_date: "2026-03-06",
  status: "process" as const,
  currency: "USD",
  shipper_id: TEST_UUID.supplier,
  consignee_id: TEST_UUID.buyer,
  pi_id: TEST_UUID.pi,
  deleted_at: null,
};

export const mockOrder = {
  id: TEST_UUID.order,
  saelim_no: "SL-2026-001",
  status: "process" as const,
  po_id: TEST_UUID.po,
  pi_id: TEST_UUID.pi,
  shipping_doc_id: TEST_UUID.shipping,
  customs_id: null,
  delivery_id: TEST_UUID.delivery,
  delivery_date: null,
  customs_fee_received: false,
  deleted_at: null,
};

export const mockDelivery = {
  id: TEST_UUID.delivery,
  status: "pending" as const,
  delivery_date: null,
  pi_id: TEST_UUID.pi,
  deleted_at: null,
};
