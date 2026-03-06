/**
 * Order Sync Helpers
 * Phase 7/8 모듈에서 호출할 동기화 함수들.
 * Phase 6에서 파일 생성, Phase 7(Customs)/8(Delivery)에서 실제 사용.
 *
 * 설계 원칙: sync 함수는 non-blocking (fire-and-forget) 패턴.
 * linkCustomsToOrder, syncCustomsFeeToOrder, syncDeliveryDateToOrder, linkDeliveryToOrder 등
 * 모두 실패 시 console.error만 출력하고 caller에게 전파하지 않음.
 * unlinkCustomsFromOrder는 delete 흐름의 선행 조건이므로 blocking (실패 시 false 반환).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "~/types/database";
import type { CascadeLinkResult, OrderDetail } from "~/types/order";

type Supabase = SupabaseClient<Database>;

/** Customs fee_received 토글 시 연결된 Order의 customs_fee_received 동기화 */
export async function syncCustomsFeeToOrder(
  supabase: Supabase,
  customsId: string,
  value: boolean
) {
  try {
    await supabase
      .from("orders")
      .update({ customs_fee_received: value, updated_at: new Date().toISOString() })
      .eq("customs_id", customsId)
      .is("deleted_at", null);
  } catch (err) {
    console.error("syncCustomsFeeToOrder failed:", err);
  }
}

/** Delivery date 변경 시 연결된 Order의 delivery_date 동기화 */
export async function syncDeliveryDateToOrder(
  supabase: Supabase,
  deliveryId: string,
  date: string | null
) {
  try {
    await supabase
      .from("orders")
      .update({ delivery_date: date, updated_at: new Date().toISOString() })
      .eq("delivery_id", deliveryId)
      .is("deleted_at", null);
  } catch (err) {
    console.error("syncDeliveryDateToOrder failed:", err);
  }
}

/** Customs 생성 시 연결된 Order에 customs_id 연결 */
export async function linkCustomsToOrder(
  supabase: Supabase,
  shippingDocId: string,
  customsId: string
) {
  try {
    await supabase
      .from("orders")
      .update({ customs_id: customsId, updated_at: new Date().toISOString() })
      .eq("shipping_doc_id", shippingDocId)
      .is("customs_id", null)
      .is("deleted_at", null);
  } catch (err) {
    console.error("linkCustomsToOrder failed:", err);
  }
}

/** Delivery 생성 시 연결된 Order에 delivery_id 연결 */
export async function linkDeliveryToOrder(
  supabase: Supabase,
  shippingDocId: string,
  deliveryId: string
) {
  try {
    await supabase
      .from("orders")
      .update({ delivery_id: deliveryId, updated_at: new Date().toISOString() })
      .eq("shipping_doc_id", shippingDocId)
      .is("delivery_id", null)
      .is("deleted_at", null);
  } catch (err) {
    console.error("linkDeliveryToOrder failed:", err);
  }
}

/**
 * Customs 삭제 시 연결된 Order의 customs_id, customs_fee_received 초기화.
 * delete 흐름의 선행 조건이므로 blocking: 실패 시 false 반환.
 */
export async function unlinkCustomsFromOrder(
  supabase: Supabase,
  customsId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("orders")
    .update({
      customs_id: null,
      customs_fee_received: null,
      updated_at: new Date().toISOString(),
    })
    .eq("customs_id", customsId)
    .is("deleted_at", null);

  if (error) {
    console.error("unlinkCustomsFromOrder failed:", error);
    return false;
  }
  return true;
}

/**
 * Delivery 삭제 시 연결된 Order의 delivery_id, delivery_date 초기화.
 * delete 흐름의 선행 조건이므로 blocking: 실패 시 false 반환.
 */
export async function unlinkDeliveryFromOrder(
  supabase: Supabase,
  deliveryId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("orders")
    .update({
      delivery_id: null,
      delivery_date: null,
      updated_at: new Date().toISOString(),
    })
    .eq("delivery_id", deliveryId)
    .is("deleted_at", null);

  if (error) {
    console.error("unlinkDeliveryFromOrder failed:", error);
    return false;
  }
  return true;
}

/**
 * Order.delivery_date 인라인 수정 시 연결된 Delivery.delivery_date 동기화.
 * fire-and-forget: 실패 시 console.error만 출력.
 */
export async function syncDeliveryDateFromOrder(
  supabase: Supabase,
  deliveryId: string,
  date: string | null
) {
  try {
    const status = date ? "scheduled" : "pending";
    await supabase
      .from("deliveries")
      .update({
        delivery_date: date,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", deliveryId)
      .neq("status", "delivered") // delivered 상태는 덮어쓰지 않음 (HIGH-3)
      .is("deleted_at", null);
  } catch (err) {
    console.error("syncDeliveryDateFromOrder failed:", err);
  }
}

/**
 * PO 삭제 시 연결된 Order의 po_id 초기화.
 * fire-and-forget: 실패 시 console.error만 출력.
 */
export async function unlinkPOFromOrder(
  supabase: Supabase,
  poId: string
) {
  const { error } = await supabase
    .from("orders")
    .update({ po_id: null, updated_at: new Date().toISOString() })
    .eq("po_id", poId)
    .is("deleted_at", null);
  if (error) console.error("unlinkPOFromOrder failed:", error);
}

/**
 * PI 삭제 시 연결된 Order의 pi_id 초기화.
 * fire-and-forget: 실패 시 console.error만 출력.
 */
export async function unlinkPIFromOrder(
  supabase: Supabase,
  piId: string
) {
  const { error } = await supabase
    .from("orders")
    .update({ pi_id: null, updated_at: new Date().toISOString() })
    .eq("pi_id", piId)
    .is("deleted_at", null);
  if (error) console.error("unlinkPIFromOrder failed:", error);
}

/**
 * Shipping Document 삭제 시 연결된 Order의 shipping_doc_id 초기화.
 * fire-and-forget: 실패 시 console.error만 출력.
 */
export async function unlinkShippingFromOrder(
  supabase: Supabase,
  shippingId: string
) {
  const { error } = await supabase
    .from("orders")
    .update({ shipping_doc_id: null, updated_at: new Date().toISOString() })
    .eq("shipping_doc_id", shippingId)
    .is("deleted_at", null);
  if (error) console.error("unlinkShippingFromOrder failed:", error);
}

// ── Cascade Link (공유 헬퍼 - orders.server.ts, orders.$id.server.ts에서 사용) ──

/** 신규 오더 생성 시 PO 기준으로 전체 FK 체인 연결 (Exactly-1 Rule) */
export async function cascadeLinkFull(
  supabase: Supabase,
  poId: string
): Promise<CascadeLinkResult> {
  // Step 1: PO → PI (최신 1개)
  const { data: piRows } = await supabase
    .from("proforma_invoices")
    .select("id")
    .eq("po_id", poId)
    .is("deleted_at", null)
    .order("pi_date", { ascending: false })
    .limit(2);

  const piId = piRows?.length === 1 ? piRows[0].id : null;
  if (!piId) {
    return { pi_id: null, shipping_doc_id: null, delivery_id: null, customs_id: null };
  }

  // Step 2: PI → Shipping + Delivery (병렬)
  const [{ data: shippingRows }, { data: deliveryRows }] = await Promise.all([
    supabase
      .from("shipping_documents")
      .select("id")
      .eq("pi_id", piId)
      .is("deleted_at", null)
      .order("ci_date", { ascending: false })
      .limit(2),
    supabase
      .from("deliveries")
      .select("id")
      .eq("pi_id", piId)
      .is("deleted_at", null)
      .limit(2),
  ]);

  const shippingDocId = shippingRows?.length === 1 ? shippingRows[0].id : null;
  const deliveryId = deliveryRows?.length === 1 ? deliveryRows[0].id : null;

  // Step 3: Shipping → Customs (정확히 1개)
  let customsId: string | null = null;
  if (shippingDocId) {
    const { data: customsRows } = await supabase
      .from("customs")
      .select("id")
      .eq("shipping_doc_id", shippingDocId)
      .is("deleted_at", null)
      .limit(2);
    customsId = customsRows?.length === 1 ? customsRows[0].id : null;
  }

  return { pi_id: piId, shipping_doc_id: shippingDocId, delivery_id: deliveryId, customs_id: customsId };
}

/** 기존 오더의 null FK만 채우는 부분 cascade link */
export async function cascadeLinkPartial(
  supabase: Supabase,
  order: OrderDetail
): Promise<Partial<Record<string, string | null>>> {
  const updates: Record<string, string | null> = {};

  // Step 1: pi_id 없을 때만
  if (!order.pi_id && order.po_id) {
    const { data: piRows } = await supabase
      .from("proforma_invoices")
      .select("id")
      .eq("po_id", order.po_id)
      .is("deleted_at", null)
      .order("pi_date", { ascending: false })
      .limit(2);
    if (piRows?.length === 1) updates.pi_id = piRows[0].id;
  }

  const resolvedPiId = updates.pi_id ?? order.pi_id;

  if (resolvedPiId) {
    // Step 2: shipping_doc_id, delivery_id 없을 때만 (병렬)
    const fetchShipping = !order.shipping_doc_id
      ? supabase
          .from("shipping_documents")
          .select("id")
          .eq("pi_id", resolvedPiId)
          .is("deleted_at", null)
          .order("ci_date", { ascending: false })
          .limit(2)
      : null;

    const fetchDelivery = !order.delivery_id
      ? supabase
          .from("deliveries")
          .select("id")
          .eq("pi_id", resolvedPiId)
          .is("deleted_at", null)
          .limit(2)
      : null;

    const [shippingResult, deliveryResult] = await Promise.all([
      fetchShipping ?? Promise.resolve({ data: null }),
      fetchDelivery ?? Promise.resolve({ data: null }),
    ]);

    if (!order.shipping_doc_id && shippingResult.data?.length === 1) {
      updates.shipping_doc_id = shippingResult.data[0].id;
    }
    if (!order.delivery_id && deliveryResult.data?.length === 1) {
      updates.delivery_id = deliveryResult.data[0].id;
    }
  }

  const resolvedShippingDocId = updates.shipping_doc_id ?? order.shipping_doc_id;

  // Step 3: customs_id 없을 때만
  if (!order.customs_id && resolvedShippingDocId) {
    const { data: customsRows } = await supabase
      .from("customs")
      .select("id")
      .eq("shipping_doc_id", resolvedShippingDocId)
      .is("deleted_at", null)
      .limit(2);
    if (customsRows?.length === 1) updates.customs_id = customsRows[0].id;
  }

  return updates;
}
