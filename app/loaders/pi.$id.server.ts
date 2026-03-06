import { data, redirect } from "react-router";
import { z } from "zod";
import type { AppLoadContext } from "react-router";
import { requireGVUser } from "~/lib/auth.server";
import type { Json } from "~/types/database";
import type { PILineItem } from "~/types/pi";
import { lineItemSchema, piSchema } from "~/loaders/pi.schema";
import { loadContent, handleContentAction } from "~/lib/content.server";

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

  const [{ data: pi, error }, { content }, { data: linkedShippingDocs }] =
    await Promise.all([
      supabase
        .from("proforma_invoices")
        .select(
          "id, pi_no, pi_date, validity, ref_no, supplier_id, buyer_id, po_id, currency, amount, " +
            "payment_term, delivery_term, loading_port, discharge_port, details, notes, " +
            "status, created_by, created_at, updated_at, " +
            "supplier:organizations!supplier_id(id, name_en, name_ko, address_en), " +
            "buyer:organizations!buyer_id(id, name_en, name_ko, address_en), " +
            "po:purchase_orders!po_id(po_no)"
        )
        .eq("id", idResult.data)
        .is("deleted_at", null)
        .single(),
      // 콘텐츠 (메모 & 첨부파일)
      loadContent(supabase, "pi", idResult.data),
      // 연결 선적서류
      supabase
        .from("shipping_documents")
        .select("id, ci_no, pl_no, ci_date, status, vessel")
        .eq("pi_id", idResult.data)
        .is("deleted_at", null)
        .order("ci_date", { ascending: false }),
    ]);

  if (error || !pi) {
    throw data(null, { status: 404, headers: responseHeaders });
  }

  return data(
    { pi, content, userId: user.id, linkedShippingDocs: linkedShippingDocs ?? [] },
    { headers: responseHeaders }
  );
}

// ── Edit Loader ───────────────────────────────────────────

export async function piEditLoader({
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
    { data: pi, error },
    { data: suppliers },
    { data: buyers },
    { data: products },
  ] = await Promise.all([
    supabase
      .from("proforma_invoices")
      .select(
        "id, pi_no, pi_date, validity, ref_no, supplier_id, buyer_id, po_id, currency, " +
          "payment_term, delivery_term, loading_port, discharge_port, details, notes, status"
      )
      .eq("id", idResult.data)
      .is("deleted_at", null)
      .single(),
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
  ]);

  if (error || !pi) {
    throw data(null, { status: 404, headers: responseHeaders });
  }

  return data(
    {
      pi,
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
      "pi",
      id,
      intent,
      formData,
      responseHeaders
    );
  }

  // ── Update ──────────────────────────────────────────────
  if (intent === "update") {
    // 완료 PI 수정 차단
    const { data: existing, error: statusError } = await supabase
      .from("proforma_invoices")
      .select("status")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (statusError || !existing) {
      return data(
        { success: false, error: "PI를 찾을 수 없습니다." },
        { status: 404, headers: responseHeaders }
      );
    }

    if (existing.status === "complete") {
      return data(
        {
          success: false,
          error:
            "완료 처리된 PI는 수정할 수 없습니다. 상태를 변경 후 수정하세요.",
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

    // 활성 org 검증
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

    // Amount 서버사이드 재계산
    const recalculated: PILineItem[] = detailsResult.data.map((item) => ({
      ...item,
      amount: Math.round(item.quantity_kg * item.unit_price * 100) / 100,
    }));
    const totalAmount =
      Math.round(
        recalculated.reduce((sum, item) => sum + item.amount, 0) * 100
      ) / 100;

    const poIdRaw = parsed.data.po_id;
    const resolvedPoId = poIdRaw && poIdRaw !== "" ? poIdRaw : null;

    // po_id 유효성 검증 (있을 경우) — soft-deleted PO 참조 차단
    if (resolvedPoId) {
      const { count: poCount } = await supabase
        .from("purchase_orders")
        .select("id", { count: "exact", head: true })
        .eq("id", resolvedPoId)
        .is("deleted_at", null);

      if (!poCount) {
        return data(
          { success: false, error: "참조한 PO를 찾을 수 없습니다." },
          { status: 400, headers: responseHeaders }
        );
      }
    }

    const { error: updateError } = await supabase
      .from("proforma_invoices")
      .update({
        pi_date: parsed.data.pi_date,
        validity: parsed.data.validity || null,
        ref_no: parsed.data.ref_no || null,
        po_id: resolvedPoId,
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

    throw redirect(`/pi/${id}`, { headers: responseHeaders });
  }

  // ── Delete ──────────────────────────────────────────────
  if (intent === "delete") {
    const { error: deleteError } = await supabase
      .from("proforma_invoices")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null);

    if (deleteError) {
      return data(
        { success: false, error: "삭제 중 오류가 발생했습니다." },
        { status: 500, headers: responseHeaders }
      );
    }

    // 연결 Delivery soft delete
    const { error: deliveryDeleteError } = await supabase
      .from("deliveries")
      .update({ deleted_at: new Date().toISOString() })
      .eq("pi_id", id)
      .is("deleted_at", null);

    if (deliveryDeleteError) {
      return data(
        { success: false, error: "연결된 배송 정보 삭제 중 오류가 발생했습니다." },
        { status: 500, headers: responseHeaders }
      );
    }

    throw redirect("/pi", { headers: responseHeaders });
  }

  // ── Clone ───────────────────────────────────────────────
  if (intent === "clone") {
    const { data: originalRaw, error: fetchError } = await supabase
      .from("proforma_invoices")
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
        { success: false, error: "복제할 PI를 찾을 수 없습니다." },
        { status: 404, headers: responseHeaders }
      );
    }

    const today = new Date().toISOString().split("T")[0];
    const { data: piNo, error: rpcError } = await supabase.rpc(
      "generate_doc_number",
      { doc_type: "PI", ref_date: today }
    );

    if (rpcError || !piNo) {
      return data(
        { success: false, error: "PI 번호 생성에 실패했습니다." },
        { status: 500, headers: responseHeaders }
      );
    }

    const { data: cloned, error: insertError } = await supabase
      .from("proforma_invoices")
      .insert({
        pi_no: piNo,
        pi_date: today,
        validity: original.validity,
        ref_no: original.ref_no,
        po_id: null, // 클론은 PO 참조 초기화
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

    // Delivery 자동 생성
    const { error: deliveryError } = await supabase
      .from("deliveries")
      .insert({ pi_id: cloned.id });

    if (deliveryError) {
      await supabase
        .from("proforma_invoices")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", cloned.id);

      return data(
        { success: false, error: "Delivery 생성 중 오류가 발생했습니다." },
        { status: 500, headers: responseHeaders }
      );
    }

    throw redirect(`/pi/${cloned.id}/edit`, { headers: responseHeaders });
  }

  // ── Toggle Status ───────────────────────────────────────
  if (intent === "toggle_status") {
    const { data: current, error: fetchStatusError } = await supabase
      .from("proforma_invoices")
      .select("status")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (fetchStatusError || !current) {
      return data(
        { success: false, error: "PI를 찾을 수 없습니다." },
        { status: 404, headers: responseHeaders }
      );
    }

    const newStatus = current.status === "process" ? "complete" : "process";

    const { error: toggleError } = await supabase
      .from("proforma_invoices")
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
