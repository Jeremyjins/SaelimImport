import { data, redirect } from "react-router";
import { z } from "zod";
import type { AppLoadContext } from "react-router";
import { requireGVUser } from "~/lib/auth.server";
import { loadContent, handleContentAction } from "~/lib/content.server";
import {
  updateFieldsSchema,
  linkDocumentSchema,
  unlinkDocumentSchema,
} from "~/loaders/orders.schema";
import type { OrderDetail } from "~/types/order";
import { cascadeLinkPartial } from "~/lib/order-sync.server";

// ── 타입 ────────────────────────────────────────────────────

interface DetailLoaderArgs {
  request: Request;
  context: AppLoadContext;
  params: { id?: string };
}

// ── SELECT 절 ────────────────────────────────────────────────

const ORDER_DETAIL_SELECT =
  "id, saelim_no, status, advice_date, arrival_date, delivery_date, " +
  "customs_fee_received, po_id, pi_id, shipping_doc_id, customs_id, delivery_id, " +
  "created_by, created_at, updated_at, " +
  "po:purchase_orders!po_id(id, po_no, po_date, status, currency, amount), " +
  "pi:proforma_invoices!pi_id(id, pi_no, pi_date, status, currency, amount), " +
  "shipping:shipping_documents!shipping_doc_id(id, ci_no, vessel, voyage, etd, eta, status), " +
  "customs:customs!customs_id(id, customs_no, customs_date, fee_received), " +
  "delivery:deliveries!delivery_id(id, delivery_date)";

// ── FK 컬럼 매핑 ─────────────────────────────────────────────

const DOC_TYPE_TO_FK: Record<string, string> = {
  pi: "pi_id",
  shipping: "shipping_doc_id",
  customs: "customs_id",
  delivery: "delivery_id",
};

const DOC_TYPE_TO_TABLE: Record<string, string> = {
  pi: "proforma_invoices",
  shipping: "shipping_documents",
  customs: "customs",
  delivery: "deliveries",
};

// ── Detail Loader ────────────────────────────────────────────

export async function loader({ request, context, params }: DetailLoaderArgs) {
  const { supabase, user, responseHeaders } = await requireGVUser(request, context);

  const idResult = z.string().uuid().safeParse(params.id);
  if (!idResult.success) {
    throw data(null, { status: 404, headers: responseHeaders });
  }
  const id = idResult.data;

  const [{ data: rawOrder, error }, { content }] = await Promise.all([
    supabase
      .from("orders")
      .select(ORDER_DETAIL_SELECT)
      .eq("id", id)
      .is("deleted_at", null)
      .single(),
    loadContent(supabase, "order", id),
  ]);

  if (error || !rawOrder) {
    throw data(null, { status: 404, headers: responseHeaders });
  }

  const order = rawOrder as unknown as OrderDetail;

  return data(
    { order, content, userId: user.id },
    { headers: responseHeaders }
  );
}

// ── Action ───────────────────────────────────────────────────

export async function action({ request, context, params }: DetailLoaderArgs) {
  const { supabase, user, responseHeaders } = await requireGVUser(request, context);

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

  // ── Content 액션 위임 ────────────────────────────────────
  if (intent?.startsWith("content_")) {
    return handleContentAction(
      supabase,
      user.id,
      "order",
      id,
      intent,
      formData,
      responseHeaders
    );
  }

  // ── 오더 존재 확인 ───────────────────────────────────────
  const { data: orderCheck } = await supabase
    .from("orders")
    .select("id, status, customs_fee_received, pi_id, shipping_doc_id, customs_id, delivery_id, po_id")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!orderCheck) {
    return data(
      { success: false, error: "오더를 찾을 수 없습니다." },
      { status: 404, headers: responseHeaders }
    );
  }

  // ── update_fields ────────────────────────────────────────
  if (intent === "update_fields") {
    const raw = Object.fromEntries(formData);
    const parsed = updateFieldsSchema.safeParse(raw);
    if (!parsed.success) {
      return data(
        { success: false, error: parsed.error.issues[0]?.message ?? "입력 값을 확인하세요." },
        { status: 400, headers: responseHeaders }
      );
    }

    const { saelim_no, advice_date, arrival_date, delivery_date } = parsed.data;

    const { error: updateError } = await supabase
      .from("orders")
      .update({
        ...(saelim_no !== undefined && { saelim_no: saelim_no || null }),
        ...(advice_date !== undefined && { advice_date: advice_date || null }),
        ...(arrival_date !== undefined && { arrival_date: arrival_date || null }),
        ...(delivery_date !== undefined && { delivery_date: delivery_date || null }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      return data(
        { success: false, error: "저장 중 오류가 발생했습니다." },
        { status: 500, headers: responseHeaders }
      );
    }

    return data({ success: true }, { headers: responseHeaders });
  }

  // ── toggle_status ────────────────────────────────────────
  if (intent === "toggle_status") {
    const newStatus = orderCheck.status === "process" ? "complete" : "process";

    const { error: updateError } = await supabase
      .from("orders")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (updateError) {
      return data(
        { success: false, error: "상태 변경 중 오류가 발생했습니다." },
        { status: 500, headers: responseHeaders }
      );
    }

    return data({ success: true, status: newStatus }, { headers: responseHeaders });
  }

  // ── toggle_customs_fee ───────────────────────────────────
  if (intent === "toggle_customs_fee") {
    const newValue = !orderCheck.customs_fee_received;

    const { error: updateError } = await supabase
      .from("orders")
      .update({ customs_fee_received: newValue, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (updateError) {
      return data(
        { success: false, error: "통관비 수령 상태 변경 중 오류가 발생했습니다." },
        { status: 500, headers: responseHeaders }
      );
    }

    return data({ success: true, customs_fee_received: newValue }, { headers: responseHeaders });
  }

  // ── link_document ────────────────────────────────────────
  if (intent === "link_document") {
    const raw = Object.fromEntries(formData);
    const parsed = linkDocumentSchema.safeParse(raw);
    if (!parsed.success) {
      return data(
        { success: false, error: parsed.error.issues[0]?.message ?? "입력 값을 확인하세요." },
        { status: 400, headers: responseHeaders }
      );
    }

    const { doc_type, doc_id } = parsed.data;
    const fkCol = DOC_TYPE_TO_FK[doc_type];
    const tableName = DOC_TYPE_TO_TABLE[doc_type];

    // 대상 문서 존재 확인 (H2: any 캐스팅으로 타입 안전성 확보)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: docCount } = await (supabase.from(tableName as any) as any)
      .select("id", { count: "exact", head: true })
      .eq("id", doc_id)
      .is("deleted_at", null);

    if (!docCount) {
      return data(
        { success: false, error: "연결할 서류를 찾을 수 없습니다." },
        { status: 400, headers: responseHeaders }
      );
    }

    // M1: 중복 연결 방지 - 다른 활성 오더에 이미 연결되어 있는지 확인
    const { count: existingLink } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq(fkCol, doc_id)
      .is("deleted_at", null)
      .neq("id", id);

    if (existingLink && existingLink > 0) {
      return data(
        { success: false, error: "이미 다른 오더에 연결된 서류입니다." },
        { status: 400, headers: responseHeaders }
      );
    }

    const { error: updateError } = await supabase
      .from("orders")
      .update({ [fkCol]: doc_id, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (updateError) {
      return data(
        { success: false, error: "서류 연결 중 오류가 발생했습니다." },
        { status: 500, headers: responseHeaders }
      );
    }

    return data({ success: true }, { headers: responseHeaders });
  }

  // ── unlink_document ──────────────────────────────────────
  if (intent === "unlink_document") {
    const raw = Object.fromEntries(formData);
    const parsed = unlinkDocumentSchema.safeParse(raw);
    if (!parsed.success) {
      return data(
        { success: false, error: parsed.error.issues[0]?.message ?? "입력 값을 확인하세요." },
        { status: 400, headers: responseHeaders }
      );
    }

    const { doc_type } = parsed.data;
    const fkCol = DOC_TYPE_TO_FK[doc_type];

    const { error: updateError } = await supabase
      .from("orders")
      .update({ [fkCol]: null, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (updateError) {
      return data(
        { success: false, error: "서류 연결 해제 중 오류가 발생했습니다." },
        { status: 500, headers: responseHeaders }
      );
    }

    return data({ success: true }, { headers: responseHeaders });
  }

  // ── refresh_links ────────────────────────────────────────
  if (intent === "refresh_links") {
    const updates = await cascadeLinkPartial(supabase, orderCheck as unknown as OrderDetail);

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from("orders")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (updateError) {
        return data(
          { success: false, error: "링크 새로고침 중 오류가 발생했습니다." },
          { status: 500, headers: responseHeaders }
        );
      }
    }

    return data(
      { success: true, linked: Object.keys(updates).length },
      { headers: responseHeaders }
    );
  }

  // ── delete ───────────────────────────────────────────────
  if (intent === "delete") {
    const { error: deleteError } = await supabase
      .from("orders")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);

    if (deleteError) {
      return data(
        { success: false, error: "삭제 중 오류가 발생했습니다." },
        { status: 500, headers: responseHeaders }
      );
    }

    throw redirect("/orders", { headers: responseHeaders });
  }

  return data(
    { success: false, error: "알 수 없는 요청입니다." },
    { status: 400, headers: responseHeaders }
  );
}
