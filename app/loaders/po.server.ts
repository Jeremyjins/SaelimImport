import { data, redirect } from "react-router";
import { z } from "zod";
import type { AppLoadContext } from "react-router";
import { requireGVUser } from "~/lib/auth.server";
import type { Json } from "~/types/database";
import type { POLineItem } from "~/types/po";
import { lineItemSchema, poSchema } from "~/loaders/po.schema";

// ── 공통 타입 ──────────────────────────────────────────────

interface LoaderArgs {
  request: Request;
  context: AppLoadContext;
}

// ── List Loader ────────────────────────────────────────────

export async function loader({ request, context }: LoaderArgs) {
  const { supabase, responseHeaders } = await requireGVUser(request, context);

  const { data: pos, error } = await supabase
    .from("purchase_orders")
    .select(
      "id, po_no, po_date, status, amount, currency, " +
        "supplier:organizations!supplier_id(name_en), " +
        "buyer:organizations!buyer_id(name_en)"
    )
    .is("deleted_at", null)
    .order("po_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return data(
      { pos: [], error: "데이터를 불러오는 데 실패했습니다." },
      { headers: responseHeaders }
    );
  }

  return data({ pos: pos ?? [] }, { headers: responseHeaders });
}

// ── PO Form Loader (새 PO 작성 폼용) ───────────────────────

export async function poFormLoader({ request, context }: LoaderArgs) {
  const { supabase, responseHeaders } = await requireGVUser(request, context);

  const [{ data: suppliers }, { data: buyers }, { data: products }] =
    await Promise.all([
      supabase
        .from("organizations")
        .select("id, name_en, name_ko")
        .eq("type", "supplier")
        .is("deleted_at", null)
        .order("name_en"),
      supabase
        .from("organizations")
        .select("id, name_en, name_ko")
        .in("type", ["seller", "buyer"])
        .is("deleted_at", null)
        .order("name_en"),
      supabase
        .from("products")
        .select("id, name, gsm, width_mm")
        .is("deleted_at", null)
        .order("name"),
    ]);

  return data(
    {
      suppliers: suppliers ?? [],
      buyers: buyers ?? [],
      products: products ?? [],
    },
    { headers: responseHeaders }
  );
}

// ── Create Action ──────────────────────────────────────────

export async function createPOAction({ request, context }: LoaderArgs) {
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
  const parsed = poSchema.safeParse(raw);
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
    po_date,
    validity,
    ref_no,
    supplier_id,
    buyer_id,
    currency,
    payment_term,
    delivery_term,
    loading_port,
    discharge_port,
    notes,
  } = parsed.data;

  // 활성 org 검증 (V1: 비활성 org 참조 차단)
  const [{ count: supplierCount }, { count: buyerCount }] = await Promise.all([
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
  ]);
  if (!supplierCount) {
    return data(
      { success: false, error: "선택한 공급업체가 유효하지 않습니다." },
      { status: 400, headers: responseHeaders }
    );
  }
  if (!buyerCount) {
    return data(
      { success: false, error: "선택한 구매업체가 유효하지 않습니다." },
      { status: 400, headers: responseHeaders }
    );
  }

  // Amount 서버사이드 재계산
  const recalculated: POLineItem[] = detailsResult.data.map((item) => ({
    ...item,
    amount: Math.round(item.quantity_kg * item.unit_price * 100) / 100,
  }));
  const totalAmount =
    Math.round(
      recalculated.reduce((sum, item) => sum + item.amount, 0) * 100
    ) / 100;

  // PO 번호 생성
  const { data: poNo, error: rpcError } = await supabase.rpc(
    "generate_doc_number",
    { doc_type: "PO", ref_date: po_date }
  );

  if (rpcError || !poNo) {
    return data(
      { success: false, error: "PO 번호 생성에 실패했습니다." },
      { status: 500, headers: responseHeaders }
    );
  }

  // PO 저장
  const { data: created, error: insertError } = await supabase
    .from("purchase_orders")
    .insert({
      po_no: poNo,
      po_date,
      validity: validity || null,
      ref_no: ref_no || null,
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

  if (insertError) {
    const errMsg =
      insertError.code === "23505"
        ? "이미 존재하는 PO 번호입니다."
        : "저장 중 오류가 발생했습니다.";
    return data(
      { success: false, error: errMsg },
      { status: 500, headers: responseHeaders }
    );
  }

  throw redirect(`/po/${created.id}`, { headers: responseHeaders });
}
