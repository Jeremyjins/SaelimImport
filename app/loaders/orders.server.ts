import { data, redirect } from "react-router";
import type { AppLoadContext } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireGVUser } from "~/lib/auth.server";
import { createOrderSchema } from "~/loaders/orders.schema";
import type { Database } from "~/types/database";
import { cascadeLinkFull } from "~/lib/order-sync.server";

interface LoaderArgs {
  request: Request;
  context: AppLoadContext;
}

// ── 목록 쿼리 SELECT 절 ──────────────────────────────────────

const ORDER_LIST_SELECT =
  "id, saelim_no, status, advice_date, arrival_date, delivery_date, customs_fee_received, created_at, " +
  "po:purchase_orders!po_id(id, po_no, po_date, status, currency, amount), " +
  "pi:proforma_invoices!pi_id(id, pi_no, pi_date, status, currency, amount), " +
  "shipping:shipping_documents!shipping_doc_id(id, ci_no, vessel, voyage, etd, eta, status), " +
  "customs:customs!customs_id(id, customs_no, customs_date, fee_received), " +
  "delivery:deliveries!delivery_id(id, delivery_date)";

// ── List Loader ──────────────────────────────────────────────

export async function loader({ request, context }: LoaderArgs) {
  const { supabase, responseHeaders } = await requireGVUser(request, context);

  const { data: rawOrders, error } = await supabase
    .from("orders")
    .select(ORDER_LIST_SELECT)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return data(
      { orders: [], pos: [], error: "데이터를 불러오는 데 실패했습니다." },
      { headers: responseHeaders }
    );
  }

  const orders = (rawOrders ?? []) as unknown as import("~/types/order").OrderListItem[];

  // 활성 오더에 이미 연결된 PO ID 목록
  const usedPoIds = orders.map((o) => o.po?.id).filter(Boolean) as string[];

  // DB 레벨에서 사용 중인 PO 제외
  let posQuery = supabase
    .from("purchase_orders")
    .select("id, po_no, po_date")
    .is("deleted_at", null)
    .order("po_date", { ascending: false });

  if (usedPoIds.length > 0) {
    posQuery = posQuery.not("id", "in", `(${usedPoIds.join(",")})`);
  }

  const { data: pos } = await posQuery;

  return data(
    { orders, pos: pos ?? [], error: null },
    { headers: responseHeaders }
  );
}

// ── Create Action ────────────────────────────────────────────

export async function action({ request, context }: LoaderArgs) {
  const { supabase, user, responseHeaders } = await requireGVUser(request, context);
  const formData = await request.formData();
  const intent = formData.get("_action") as string;

  if (intent !== "create") {
    return data({ success: false, error: "잘못된 요청입니다." }, { status: 400, headers: responseHeaders });
  }

  const raw = Object.fromEntries(formData);
  const parsed = createOrderSchema.safeParse(raw);
  if (!parsed.success) {
    return data(
      { success: false, error: parsed.error.issues[0]?.message ?? "입력 값을 확인하세요." },
      { status: 400, headers: responseHeaders }
    );
  }

  const { po_id, saelim_no } = parsed.data;

  // PO 존재 여부 확인
  const { count: poCount } = await supabase
    .from("purchase_orders")
    .select("id", { count: "exact", head: true })
    .eq("id", po_id)
    .is("deleted_at", null);

  if (!poCount) {
    return data(
      { success: false, error: "선택한 PO를 찾을 수 없습니다." },
      { status: 400, headers: responseHeaders }
    );
  }

  // 중복 오더 체크 (활성)
  const { count: dupCount } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("po_id", po_id)
    .is("deleted_at", null);

  if (dupCount && dupCount > 0) {
    return data(
      { success: false, error: "이미 해당 PO에 대한 오더가 존재합니다." },
      { status: 400, headers: responseHeaders }
    );
  }

  // Auto-Cascade Link
  const links = await cascadeLinkFull(supabase as SupabaseClient<Database>, po_id);

  // Order 생성
  const { data: created, error: insertError } = await supabase
    .from("orders")
    .insert({
      po_id,
      saelim_no: saelim_no || null,
      pi_id: links.pi_id,
      shipping_doc_id: links.shipping_doc_id,
      delivery_id: links.delivery_id,
      customs_id: links.customs_id,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (insertError || !created) {
    const errMsg =
      insertError?.code === "23505"
        ? "이미 해당 PO에 대한 오더가 존재합니다."
        : "저장 중 오류가 발생했습니다.";
    return data(
      { success: false, error: errMsg },
      { status: 500, headers: responseHeaders }
    );
  }

  throw redirect(`/orders/${created.id}`, { headers: responseHeaders });
}
