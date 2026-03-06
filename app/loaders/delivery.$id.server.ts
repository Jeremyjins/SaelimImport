import { data, redirect } from "react-router";
import { z } from "zod";
import type { AppLoadContext } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireGVUser } from "~/lib/auth.server";
import { loadContent, handleContentAction } from "~/lib/content.server";
import {
  syncDeliveryDateToOrder,
  unlinkDeliveryFromOrder,
} from "~/lib/order-sync.server";
import {
  approveRequestSchema,
  rejectRequestSchema,
  updateDeliveryDateSchema,
} from "~/loaders/delivery.schema";
import type { DeliveryDetail } from "~/types/delivery";
import type { Database } from "~/types/database";

interface DetailLoaderArgs {
  request: Request;
  context: AppLoadContext;
  params: { id?: string };
}

const DELIVERY_DETAIL_SELECT =
  "id, delivery_date, status, pi_id, shipping_doc_id, created_at, updated_at, " +
  "pi:proforma_invoices!pi_id(id, pi_no, pi_date, currency), " +
  "shipping:shipping_documents!shipping_doc_id(id, ci_no, vessel, voyage, eta, etd)";

// ── Detail Loader ─────────────────────────────────────────────

export async function loader({ request, context, params }: DetailLoaderArgs) {
  const { supabase, user, responseHeaders } = await requireGVUser(
    request,
    context
  );

  const idResult = z.string().uuid().safeParse(params.id);
  if (!idResult.success) {
    throw data(null, { status: 404, headers: responseHeaders });
  }
  const id = idResult.data;

  const [{ data: rawDelivery, error }, { content }, { data: rawRequests, error: requestsError }] =
    await Promise.all([
      supabase
        .from("deliveries")
        .select(DELIVERY_DETAIL_SELECT)
        .eq("id", id)
        .is("deleted_at", null)
        .single(),
      loadContent(supabase, "delivery", id),
      supabase
        .from("delivery_change_requests")
        .select(
          "id, delivery_id, requested_date, reason, status, requested_by, responded_by, response_text, responded_at, created_at, updated_at"
        )
        .eq("delivery_id", id)
        .order("created_at", { ascending: false }),
    ]);

  if (requestsError) {
    console.error("delivery_change_requests query failed:", requestsError);
  }

  if (error || !rawDelivery) {
    throw data(null, { status: 404, headers: responseHeaders });
  }

  const delivery = {
    ...(rawDelivery as unknown as Omit<DeliveryDetail, "change_requests">),
    change_requests: rawRequests ?? [],
  } as DeliveryDetail;

  return data(
    { delivery, content, userId: user.id },
    { headers: responseHeaders }
  );
}

// ── Action ────────────────────────────────────────────────────

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

  // ── Content 액션 위임 ─────────────────────────────────────
  if (intent?.startsWith("content_")) {
    return handleContentAction(
      supabase,
      user.id,
      "delivery",
      id,
      intent,
      formData,
      responseHeaders
    );
  }

  // ── 배송 존재 확인 ────────────────────────────────────────
  const { data: deliveryCheck } = await supabase
    .from("deliveries")
    .select("id, delivery_date, status")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!deliveryCheck) {
    return data(
      { success: false, error: "배송을 찾을 수 없습니다." },
      { status: 404, headers: responseHeaders }
    );
  }

  // ── update_delivery_date ──────────────────────────────────
  if (intent === "update_delivery_date") {
    // HIGH-2: delivered 상태 보호
    if (deliveryCheck.status === "delivered") {
      return data(
        { success: false, error: "배송완료된 건의 날짜는 변경할 수 없습니다." },
        { status: 400, headers: responseHeaders }
      );
    }
    const raw = Object.fromEntries(formData);
    const parsed = updateDeliveryDateSchema.safeParse(raw);
    if (!parsed.success) {
      return data(
        {
          success: false,
          error: parsed.error.issues[0]?.message ?? "입력 값을 확인하세요.",
        },
        { status: 400, headers: responseHeaders }
      );
    }

    const newDate = parsed.data.delivery_date || null;
    const newStatus = newDate ? "scheduled" : "pending";

    const { error: updateError } = await supabase
      .from("deliveries")
      .update({
        delivery_date: newDate,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      return data(
        { success: false, error: "저장 중 오류가 발생했습니다." },
        { status: 500, headers: responseHeaders }
      );
    }

    // Order 동기화
    await syncDeliveryDateToOrder(
      supabase as SupabaseClient<Database>,
      id,
      newDate
    );

    return data({ success: true }, { headers: responseHeaders });
  }

  // ── approve_request ───────────────────────────────────────
  if (intent === "approve_request") {
    const raw = Object.fromEntries(formData);
    const parsed = approveRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return data(
        {
          success: false,
          error: parsed.error.issues[0]?.message ?? "입력 값을 확인하세요.",
        },
        { status: 400, headers: responseHeaders }
      );
    }

    const { request_id } = parsed.data;

    // 변경요청 조회 (pending 상태 확인)
    const { data: reqRow } = await supabase
      .from("delivery_change_requests")
      .select("id, requested_date, status, delivery_id")
      .eq("id", request_id)
      .eq("delivery_id", id)
      .single();

    if (!reqRow || reqRow.status !== "pending") {
      return data(
        { success: false, error: "처리할 수 없는 요청입니다." },
        { status: 400, headers: responseHeaders }
      );
    }

    const now = new Date().toISOString();

    // HIGH-4: 원자성 보장을 위해 순차 실행
    // 1단계: 변경요청 승인
    const { error: reqError } = await supabase
      .from("delivery_change_requests")
      .update({
        status: "approved",
        responded_by: user.id,
        responded_at: now,
        updated_at: now,
      })
      .eq("id", request_id);

    if (reqError) {
      return data(
        { success: false, error: "승인 처리 중 오류가 발생했습니다." },
        { status: 500, headers: responseHeaders }
      );
    }

    // 2단계: 배송일 업데이트
    const { error: deliveryError } = await supabase
      .from("deliveries")
      .update({
        delivery_date: reqRow.requested_date,
        status: "scheduled",
        updated_at: now,
      })
      .eq("id", id);

    if (deliveryError) {
      return data(
        { success: false, error: "배송일 업데이트 중 오류가 발생했습니다." },
        { status: 500, headers: responseHeaders }
      );
    }

    // 3단계: Order 동기화
    await syncDeliveryDateToOrder(
      supabase as SupabaseClient<Database>,
      id,
      reqRow.requested_date
    );

    return data({ success: true }, { headers: responseHeaders });
  }

  // ── reject_request ────────────────────────────────────────
  if (intent === "reject_request") {
    const raw = Object.fromEntries(formData);
    const parsed = rejectRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return data(
        {
          success: false,
          error: parsed.error.issues[0]?.message ?? "입력 값을 확인하세요.",
        },
        { status: 400, headers: responseHeaders }
      );
    }

    const { request_id, response_text } = parsed.data;

    // 변경요청 조회 (pending 상태 확인)
    const { data: reqRow } = await supabase
      .from("delivery_change_requests")
      .select("id, status, delivery_id")
      .eq("id", request_id)
      .eq("delivery_id", id)
      .single();

    if (!reqRow || reqRow.status !== "pending") {
      return data(
        { success: false, error: "처리할 수 없는 요청입니다." },
        { status: 400, headers: responseHeaders }
      );
    }

    const now = new Date().toISOString();

    const { error: reqError } = await supabase
      .from("delivery_change_requests")
      .update({
        status: "rejected",
        responded_by: user.id,
        responded_at: now,
        response_text,
        updated_at: now,
      })
      .eq("id", request_id);

    if (reqError) {
      return data(
        { success: false, error: "반려 처리 중 오류가 발생했습니다." },
        { status: 500, headers: responseHeaders }
      );
    }

    return data({ success: true }, { headers: responseHeaders });
  }

  // ── mark_delivered ────────────────────────────────────────
  if (intent === "mark_delivered") {
    // HIGH-2: 중복 적용 방지
    if (deliveryCheck.status === "delivered") {
      return data(
        { success: false, error: "이미 배송완료된 건입니다." },
        { status: 400, headers: responseHeaders }
      );
    }

    const { error: updateError } = await supabase
      .from("deliveries")
      .update({ status: "delivered", updated_at: new Date().toISOString() })
      .eq("id", id);

    if (updateError) {
      return data(
        { success: false, error: "배송 완료 처리 중 오류가 발생했습니다." },
        { status: 500, headers: responseHeaders }
      );
    }

    return data({ success: true }, { headers: responseHeaders });
  }

  // ── delete ────────────────────────────────────────────────
  if (intent === "delete") {
    // Order FK 먼저 정리
    const unlinkOk = await unlinkDeliveryFromOrder(
      supabase as SupabaseClient<Database>,
      id
    );
    if (!unlinkOk) {
      return data(
        { success: false, error: "연결된 오더 정리 중 오류가 발생했습니다." },
        { status: 500, headers: responseHeaders }
      );
    }

    const { error: deleteError } = await supabase
      .from("deliveries")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);

    if (deleteError) {
      return data(
        { success: false, error: "삭제 중 오류가 발생했습니다." },
        { status: 500, headers: responseHeaders }
      );
    }

    throw redirect("/delivery", { headers: responseHeaders });
  }

  return data(
    { success: false, error: "알 수 없는 요청입니다." },
    { status: 400, headers: responseHeaders }
  );
}
