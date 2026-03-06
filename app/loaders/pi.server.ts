import { data, redirect } from "react-router";
import { z } from "zod";
import type { AppLoadContext } from "react-router";
import { requireGVUser } from "~/lib/auth.server";
import type { Json } from "~/types/database";
import type { PILineItem, SourcePO } from "~/types/pi";
import { lineItemSchema, piSchema } from "~/loaders/pi.schema";

// ── 공통 타입 ──────────────────────────────────────────────

interface LoaderArgs {
  request: Request;
  context: AppLoadContext;
}

// ── List Loader ────────────────────────────────────────────

export async function loader({ request, context }: LoaderArgs) {
  const { supabase, responseHeaders } = await requireGVUser(request, context);

  const { data: pis, error } = await supabase
    .from("proforma_invoices")
    .select(
      "id, pi_no, pi_date, status, amount, currency, " +
        "supplier:organizations!supplier_id(name_en), " +
        "buyer:organizations!buyer_id(name_en), " +
        "po:purchase_orders!po_id(po_no)"
    )
    .is("deleted_at", null)
    .order("pi_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return data(
      { pis: [], error: "데이터를 불러오는 데 실패했습니다." },
      { headers: responseHeaders }
    );
  }

  return data({ pis: pis ?? [] }, { headers: responseHeaders });
}

// ── PI Form Loader (새 PI 작성 폼용) ───────────────────────

export async function piFormLoader({ request, context }: LoaderArgs) {
  const { supabase, responseHeaders } = await requireGVUser(request, context);

  const url = new URL(request.url);
  const fromPoId = url.searchParams.get("from_po");

  // UUID 선검증 후 4-way 병렬 조회
  const poIdResult = fromPoId ? z.string().uuid().safeParse(fromPoId) : null;
  const validPoId = poIdResult?.success ? poIdResult.data : null;

  const [{ data: suppliers }, { data: buyers }, { data: products }, { data: po }] =
    await Promise.all([
      // PI supplier: GV (type='seller')
      supabase
        .from("organizations")
        .select("id, name_en, name_ko")
        .eq("type", "seller")
        .is("deleted_at", null)
        .order("name_en"),
      // PI buyer: Saelim (type='buyer')
      supabase
        .from("organizations")
        .select("id, name_en, name_ko")
        .eq("type", "buyer")
        .is("deleted_at", null)
        .order("name_en"),
      supabase
        .from("products")
        .select("id, name, gsm, width_mm")
        .is("deleted_at", null)
        .order("name"),
      validPoId
        ? supabase
            .from("purchase_orders")
            .select(
              "id, po_no, currency, payment_term, delivery_term, loading_port, discharge_port, details"
            )
            .eq("id", validPoId)
            .is("deleted_at", null)
            .single()
        : Promise.resolve({ data: null, error: null }),
    ]);

  let sourcePO: SourcePO | null = null;

  if (validPoId && po) {
    const poData = po as unknown as {
      id: string;
      po_no: string;
      currency: string;
      payment_term: string | null;
      delivery_term: string | null;
      loading_port: string | null;
      discharge_port: string | null;
      details: PILineItem[];
    };
    sourcePO = {
      id: poData.id,
      po_no: poData.po_no,
      currency: poData.currency,
      payment_term: poData.payment_term,
      delivery_term: poData.delivery_term,
      loading_port: poData.loading_port,
      discharge_port: poData.discharge_port,
      details: Array.isArray(poData.details) ? poData.details : [],
    };
  }

  return data(
    {
      suppliers: suppliers ?? [],
      buyers: buyers ?? [],
      products: products ?? [],
      sourcePO,
    },
    { headers: responseHeaders }
  );
}

// ── Create Action ──────────────────────────────────────────

export async function createPIAction({ request, context }: LoaderArgs) {
  const { supabase, user, responseHeaders } = await requireGVUser(
    request,
    context
  );
  const formData = await request.formData();

  // JSONB details 파싱 및 검증
  const detailsRaw = formData.get("details") as string;
  let parsedDetails: unknown;
  try {
    parsedDetails = JSON.parse(detailsRaw || "[]");
  } catch {
    return data(
      { success: false, error: "품목 데이터 형식이 올바르지 않습니다." },
      { status: 400, headers: responseHeaders }
    );
  }

  const detailsResult = z
    .array(lineItemSchema)
    .min(1, "품목을 1개 이상 추가하세요")
    .max(20, "품목은 최대 20개까지 입력 가능합니다")
    .safeParse(parsedDetails);

  if (!detailsResult.success) {
    return data(
      {
        success: false,
        error:
          detailsResult.error.issues[0]?.message ?? "품목 입력을 확인하세요.",
      },
      { status: 400, headers: responseHeaders }
    );
  }

  // 기본 필드 검증
  const raw = Object.fromEntries(formData);
  const parsed = piSchema.safeParse(raw);
  if (!parsed.success) {
    return data(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "입력 값을 확인하세요.",
      },
      { status: 400, headers: responseHeaders }
    );
  }

  const {
    pi_date,
    validity,
    ref_no,
    po_id,
    supplier_id,
    buyer_id,
    currency,
    payment_term,
    delivery_term,
    loading_port,
    discharge_port,
    notes,
  } = parsed.data;

  const resolvedPoId = po_id && po_id !== "" ? po_id : null;

  // 활성 org + po_id 검증 (3-way 병렬)
  const [{ count: supplierCount }, { count: buyerCount }, { count: poCount }] =
    await Promise.all([
      supabase
        .from("organizations")
        .select("id", { count: "exact", head: true })
        .eq("id", supplier_id)
        .is("deleted_at", null),
      supabase
        .from("organizations")
        .select("id", { count: "exact", head: true })
        .eq("id", buyer_id)
        .is("deleted_at", null),
      resolvedPoId
        ? supabase
            .from("purchase_orders")
            .select("id", { count: "exact", head: true })
            .eq("id", resolvedPoId)
            .is("deleted_at", null)
        : Promise.resolve({ count: 1 }),
    ]);

  if (!supplierCount) {
    return data(
      { success: false, error: "선택한 판매업체가 유효하지 않습니다." },
      { status: 400, headers: responseHeaders }
    );
  }
  if (!buyerCount) {
    return data(
      { success: false, error: "선택한 구매업체가 유효하지 않습니다." },
      { status: 400, headers: responseHeaders }
    );
  }
  if (resolvedPoId && !poCount) {
    return data(
      { success: false, error: "참조한 PO를 찾을 수 없습니다." },
      { status: 400, headers: responseHeaders }
    );
  }

  // Amount 서버사이드 재계산
  const recalculated: PILineItem[] = detailsResult.data.map((item) => ({
    ...item,
    amount: Math.round(item.quantity_kg * item.unit_price * 100) / 100,
  }));
  const totalAmount =
    Math.round(
      recalculated.reduce((sum, item) => sum + item.amount, 0) * 100
    ) / 100;

  // PI 번호 생성
  const { data: piNo, error: rpcError } = await supabase.rpc(
    "generate_doc_number",
    { doc_type: "PI", ref_date: pi_date }
  );

  if (rpcError || !piNo) {
    return data(
      { success: false, error: "PI 번호 생성에 실패했습니다." },
      { status: 500, headers: responseHeaders }
    );
  }

  // PI 저장
  const { data: created, error: insertError } = await supabase
    .from("proforma_invoices")
    .insert({
      pi_no: piNo,
      pi_date,
      validity: validity || null,
      ref_no: ref_no || null,
      po_id: resolvedPoId,
      supplier_id,
      buyer_id,
      currency,
      amount: totalAmount,
      payment_term: payment_term || null,
      delivery_term: delivery_term || null,
      loading_port: loading_port || null,
      discharge_port: discharge_port || null,
      details: recalculated as unknown as Json,
      notes: notes || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (insertError || !created) {
    const errMsg =
      insertError?.code === "23505"
        ? "이미 존재하는 PI 번호입니다."
        : "저장 중 오류가 발생했습니다.";
    return data(
      { success: false, error: errMsg },
      { status: 500, headers: responseHeaders }
    );
  }

  // Delivery 자동 생성
  const { error: deliveryError } = await supabase
    .from("deliveries")
    .insert({ pi_id: created.id });

  if (deliveryError) {
    // Delivery 실패 시 PI soft delete 롤백
    await supabase
      .from("proforma_invoices")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", created.id);

    return data(
      { success: false, error: "Delivery 생성 중 오류가 발생했습니다. 다시 시도해 주세요." },
      { status: 500, headers: responseHeaders }
    );
  }

  throw redirect(`/pi/${created.id}`, { headers: responseHeaders });
}
