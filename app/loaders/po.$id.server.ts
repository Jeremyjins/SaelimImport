import { data, redirect } from "react-router";
import { z } from "zod";
import type { AppLoadContext } from "react-router";
import { requireGVUser } from "~/lib/auth.server";
import type { Json } from "~/types/database";
import type { POLineItem } from "~/types/po";
import { lineItemSchema, poSchema } from "~/loaders/po.schema";
import { loadContent, handleContentAction } from "~/lib/content.server";
import { unlinkPOFromOrder } from "~/lib/order-sync.server";

// ── 공통 타입 ──────────────────────────────────────────────

interface DetailLoaderArgs {
  request: Request;
  context: AppLoadContext;
  params: { id?: string };
}

// ── Detail Loader ─────────────────────────────────────────

export async function loader({ request, context, params }: DetailLoaderArgs) {
  const { supabase, user, responseHeaders } = await requireGVUser(request, context);

  const idResult = z.string().uuid().safeParse(params.id);
  if (!idResult.success) {
    throw data(null, { status: 404, headers: responseHeaders });
  }

  const [{ data: po, error }, { data: pis }, { content }] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select(
        "id, po_no, po_date, validity, ref_no, supplier_id, buyer_id, currency, amount, " +
          "payment_term, delivery_term, loading_port, discharge_port, details, notes, " +
          "status, created_by, created_at, updated_at, " +
          "supplier:organizations!supplier_id(id, name_en, name_ko, address_en), " +
          "buyer:organizations!buyer_id(id, name_en, name_ko, address_en)"
      )
      .eq("id", idResult.data)
      .is("deleted_at", null)
      .single(),
    // 연결된 PI 목록
    supabase
      .from("proforma_invoices")
      .select("id, pi_no, pi_date, status, currency, amount")
      .eq("po_id", idResult.data)
      .is("deleted_at", null)
      .order("pi_date", { ascending: false }),
    // 콘텐츠 (메모 & 첨부파일)
    loadContent(supabase, "po", idResult.data),
  ]);

  if (error || !po) {
    throw data(null, { status: 404, headers: responseHeaders });
  }

  return data({ po, pis: pis ?? [], content, userId: user.id }, { headers: responseHeaders });
}

// ── Edit Loader ───────────────────────────────────────────

export async function poEditLoader({
  request,
  context,
  params,
}: DetailLoaderArgs) {
  const { supabase, responseHeaders } = await requireGVUser(request, context);

  const idResult = z.string().uuid().safeParse(params.id);
  if (!idResult.success) {
    throw data(null, { status: 404, headers: responseHeaders });
  }

  const [
    { data: po, error },
    { data: suppliers },
    { data: buyers },
    { data: products },
  ] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select(
        "id, po_no, po_date, validity, ref_no, supplier_id, buyer_id, currency, " +
          "payment_term, delivery_term, loading_port, discharge_port, details, notes, status"
      )
      .eq("id", idResult.data)
      .is("deleted_at", null)
      .single(),
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

  if (error || !po) {
    throw data(null, { status: 404, headers: responseHeaders });
  }

  return data(
    {
      po,
      suppliers: suppliers ?? [],
      buyers: buyers ?? [],
      products: products ?? [],
    },
    { headers: responseHeaders }
  );
}

// ── Action ────────────────────────────────────────────────

export async function action({ request, context, params }: DetailLoaderArgs) {
  const { supabase, user, responseHeaders } = await requireGVUser(
    request,
    context
  );

  const idResult = z.string().uuid().safeParse(params.id);
  if (!idResult.success) {
    return data(
      { success: false, error: "잘못된 요청입니다." },
      { status: 400, headers: responseHeaders }
    );
  }
  const id = idResult.data;

  const formData = await request.formData();
  const intent = formData.get("_action") as string;

  // ── Content 액션 (메모 & 첨부파일) ─────────────────────
  if (intent?.startsWith("content_")) {
    return handleContentAction(
      supabase,
      user.id,
      "po",
      id,
      intent,
      formData,
      responseHeaders
    );
  }

  // ── Update ──────────────────────────────────────────────
  if (intent === "update") {
    // 완료 PO 수정 차단 (C2: DB 오류 시 수정 진행 차단)
    const { data: existing, error: statusError } = await supabase
      .from("purchase_orders")
      .select("status")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (statusError || !existing) {
      return data(
        { success: false, error: "PO를 찾을 수 없습니다." },
        { status: 404, headers: responseHeaders }
      );
    }

    if (existing.status === "complete") {
      return data(
        {
          success: false,
          error:
            "완료 처리된 PO는 수정할 수 없습니다. 상태를 변경 후 수정하세요.",
        },
        { status: 400, headers: responseHeaders }
      );
    }

    // JSONB details 파싱
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

    // 활성 org 검증 (V1: 비활성 org 참조 차단)
    const [{ count: supplierCount }, { count: buyerCount }] = await Promise.all(
      [
        supabase
          .from("organizations")
          .select("id", { count: "exact", head: true })
          .eq("id", parsed.data.supplier_id)
          .is("deleted_at", null),
        supabase
          .from("organizations")
          .select("id", { count: "exact", head: true })
          .eq("id", parsed.data.buyer_id)
          .is("deleted_at", null),
      ]
    );
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

    const { error: updateError } = await supabase
      .from("purchase_orders")
      .update({
        po_date: parsed.data.po_date,
        validity: parsed.data.validity || null,
        ref_no: parsed.data.ref_no || null,
        supplier_id: parsed.data.supplier_id,
        buyer_id: parsed.data.buyer_id,
        currency: parsed.data.currency,
        payment_term: parsed.data.payment_term || null,
        delivery_term: parsed.data.delivery_term || null,
        loading_port: parsed.data.loading_port || null,
        discharge_port: parsed.data.discharge_port || null,
        notes: parsed.data.notes || null,
        amount: totalAmount,
        details: recalculated as unknown as Json,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .is("deleted_at", null);

    if (updateError) {
      return data(
        { success: false, error: "수정 중 오류가 발생했습니다." },
        { status: 500, headers: responseHeaders }
      );
    }

    throw redirect(`/po/${id}`, { headers: responseHeaders });
  }

  // ── Delete ──────────────────────────────────────────────
  if (intent === "delete") {
    const { error: deleteError } = await supabase
      .from("purchase_orders")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null);

    if (deleteError) {
      return data(
        { success: false, error: "삭제 중 오류가 발생했습니다." },
        { status: 500, headers: responseHeaders }
      );
    }

    // SYNC-1: 연결된 Order의 po_id 해제 (고아 FK 방지)
    await unlinkPOFromOrder(supabase, id);

    throw redirect("/po", { headers: responseHeaders });
  }

  // ── Clone ───────────────────────────────────────────────
  if (intent === "clone") {
    const { data: originalRaw, error: fetchError } = await supabase
      .from("purchase_orders")
      .select(
        "validity, ref_no, supplier_id, buyer_id, currency, amount, " +
          "payment_term, delivery_term, loading_port, discharge_port, details, notes"
      )
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    const original = originalRaw as unknown as {
      validity: string | null;
      ref_no: string | null;
      supplier_id: string;
      buyer_id: string;
      currency: string;
      amount: number;
      payment_term: string | null;
      delivery_term: string | null;
      loading_port: string | null;
      discharge_port: string | null;
      details: Json;
      notes: string | null;
    } | null;

    if (fetchError || !originalRaw || !original) {
      return data(
        { success: false, error: "복제할 PO를 찾을 수 없습니다." },
        { status: 404, headers: responseHeaders }
      );
    }

    const today = new Date().toISOString().split("T")[0];
    const { data: poNo, error: rpcError } = await supabase.rpc(
      "generate_doc_number",
      { doc_type: "PO", ref_date: today }
    );

    if (rpcError || !poNo) {
      return data(
        { success: false, error: "PO 번호 생성에 실패했습니다." },
        { status: 500, headers: responseHeaders }
      );
    }

    const { data: cloned, error: insertError } = await supabase
      .from("purchase_orders")
      .insert({
        po_no: poNo,
        po_date: today,
        validity: original.validity,
        ref_no: original.ref_no,
        supplier_id: original.supplier_id,
        buyer_id: original.buyer_id,
        currency: original.currency,
        amount: original.amount,
        payment_term: original.payment_term,
        delivery_term: original.delivery_term,
        loading_port: original.loading_port,
        discharge_port: original.discharge_port,
        details: original.details,
        notes: original.notes,
        status: "process",
        created_by: user.id,
      })
      .select("id")
      .single();

    if (insertError || !cloned) {
      return data(
        { success: false, error: "복제 중 오류가 발생했습니다." },
        { status: 500, headers: responseHeaders }
      );
    }

    throw redirect(`/po/${cloned.id}/edit`, { headers: responseHeaders });
  }

  // ── Toggle Status ───────────────────────────────────────
  if (intent === "toggle_status") {
    // V2: 클라이언트 current_status 신뢰 대신 DB에서 직접 조회
    const { data: current, error: fetchStatusError } = await supabase
      .from("purchase_orders")
      .select("status")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (fetchStatusError || !current) {
      return data(
        { success: false, error: "PO를 찾을 수 없습니다." },
        { status: 404, headers: responseHeaders }
      );
    }

    const newStatus = current.status === "process" ? "complete" : "process";

    const { error: toggleError } = await supabase
      .from("purchase_orders")
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .is("deleted_at", null);

    if (toggleError) {
      return data(
        { success: false, error: "상태 변경 중 오류가 발생했습니다." },
        { status: 500, headers: responseHeaders }
      );
    }

    return data({ success: true }, { headers: responseHeaders });
  }

  return data(
    { success: false, error: "알 수 없는 요청입니다." },
    { status: 400, headers: responseHeaders }
  );
}
