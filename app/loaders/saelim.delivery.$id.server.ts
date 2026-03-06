import { data, redirect } from "react-router";
import { z } from "zod";
import type { AppLoadContext } from "react-router";
import { requireAuth } from "~/lib/auth.server";
import { ORG_TYPES } from "~/lib/constants";
import { submitChangeRequestSchema } from "~/loaders/delivery.schema";
import type { ChangeRequest, SaelimDeliveryDetail } from "~/types/delivery";

interface DetailLoaderArgs {
  request: Request;
  context: AppLoadContext;
  params: { id?: string };
}

// 가격 정보 완전 제외 (CRIT-1)
const SAELIM_DELIVERY_DETAIL_SELECT =
  "id, delivery_date, status, " +
  "pi:proforma_invoices!pi_id(id, pi_no), " +
  "shipping:shipping_documents!shipping_doc_id(id, ci_no, vessel, voyage, eta, etd)";

// ── Loader ────────────────────────────────────────────────────

export async function loader({ request, context, params }: DetailLoaderArgs) {
  const { supabase, user, responseHeaders } = await requireAuth(
    request,
    context
  );

  // CRIT-2: Saelim 전용 접근 검증
  if (user.app_metadata?.org_type !== ORG_TYPES.SAELIM) {
    throw redirect("/", { headers: responseHeaders });
  }

  const idResult = z.string().uuid().safeParse(params.id);
  if (!idResult.success) {
    throw data(null, { status: 404, headers: responseHeaders });
  }
  const id = idResult.data;

  const [{ data: rawDelivery, error }, { data: rawRequests }] =
    await Promise.all([
      supabase
        .from("deliveries")
        .select(SAELIM_DELIVERY_DETAIL_SELECT)
        .eq("id", id)
        .is("deleted_at", null)
        .single(),
      // CRIT-3: 본인 요청만 조회
      supabase
        .from("delivery_change_requests")
        .select(
          "id, delivery_id, requested_date, reason, status, requested_by, responded_by, response_text, responded_at, created_at, updated_at"
        )
        .eq("delivery_id", id)
        .eq("requested_by", user.id)
        .order("created_at", { ascending: false }),
    ]);

  if (error || !rawDelivery) {
    throw data(null, { status: 404, headers: responseHeaders });
  }

  const delivery = {
    ...(rawDelivery as unknown as Omit<SaelimDeliveryDetail, "my_change_requests">),
    my_change_requests: (rawRequests ?? []) as ChangeRequest[],
  } as SaelimDeliveryDetail;

  return data(
    { delivery },
    { headers: responseHeaders }
  );
}

// ── Action ────────────────────────────────────────────────────

export async function action({ request, context, params }: DetailLoaderArgs) {
  const { supabase, user, responseHeaders } = await requireAuth(
    request,
    context
  );

  // CRIT-2: Saelim 전용 검증
  if (user.app_metadata?.org_type !== ORG_TYPES.SAELIM) {
    return data(
      { success: false, error: "접근 권한이 없습니다." },
      { status: 403, headers: responseHeaders }
    );
  }

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

  if (intent === "submit_change_request") {
    const raw = Object.fromEntries(formData);
    const parsed = submitChangeRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return data(
        {
          success: false,
          error: parsed.error.issues[0]?.message ?? "입력 값을 확인하세요.",
        },
        { status: 400, headers: responseHeaders }
      );
    }

    const { requested_date, reason } = parsed.data;

    // 배송 존재 확인 (삭제 여부 포함)
    const { data: deliveryCheck } = await supabase
      .from("deliveries")
      .select("id")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (!deliveryCheck) {
      return data(
        { success: false, error: "배송을 찾을 수 없습니다." },
        { status: 404, headers: responseHeaders }
      );
    }

    // 스팸 방지: 대기 중인 요청이 이미 있으면 거부
    const { data: existingPending } = await supabase
      .from("delivery_change_requests")
      .select("id")
      .eq("delivery_id", id)
      .eq("requested_by", user.id)
      .eq("status", "pending")
      .limit(1)
      .maybeSingle();

    if (existingPending) {
      return data(
        {
          success: false,
          error: "이미 처리 대기 중인 변경요청이 있습니다. 처리 후 다시 요청해주세요.",
        },
        { status: 400, headers: responseHeaders }
      );
    }

    // CRIT-3: requested_by 서버사이드 강제 설정 (FormData 값 무시)
    const { error: insertError } = await supabase
      .from("delivery_change_requests")
      .insert({
        delivery_id: id,
        requested_date,
        reason: reason ?? null,
        status: "pending",
        requested_by: user.id, // 서버사이드 설정
      });

    if (insertError) {
      return data(
        { success: false, error: "변경요청 제출 중 오류가 발생했습니다." },
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
