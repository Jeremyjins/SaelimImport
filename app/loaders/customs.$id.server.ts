import { data, redirect } from "react-router";
import { z } from "zod";
import type { AppLoadContext } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireGVUser } from "~/lib/auth.server";
import { loadContent, handleContentAction } from "~/lib/content.server";
import { customsUpdateSchema } from "~/loaders/customs.schema";
import { computeFeeTotal } from "~/lib/customs-utils";
import {
  syncCustomsFeeToOrder,
  unlinkCustomsFromOrder,
} from "~/lib/order-sync.server";
import type { CustomsDetail } from "~/types/customs";
import type { Database } from "~/types/database";

interface DetailLoaderArgs {
  request: Request;
  context: AppLoadContext;
  params: { id?: string };
}

// ── SELECT 절 ─────────────────────────────────────────────────

const CUSTOMS_DETAIL_SELECT =
  "id, customs_no, customs_date, shipping_doc_id, " +
  "transport_fee, customs_fee, vat_fee, etc_fee, etc_desc, " +
  "fee_received, created_by, created_at, updated_at, " +
  "shipping:shipping_documents!shipping_doc_id(" +
  "id, ci_no, pl_no, vessel, voyage, eta, etd, status, " +
  "pi:proforma_invoices!pi_id(pi_no)" +
  ")";

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

  const [{ data: rawCustoms, error }, { content }] = await Promise.all([
    supabase
      .from("customs")
      .select(CUSTOMS_DETAIL_SELECT)
      .eq("id", id)
      .is("deleted_at", null)
      .single(),
    loadContent(supabase, "customs", id),
  ]);

  if (error || !rawCustoms) {
    throw data(null, { status: 404, headers: responseHeaders });
  }

  const customs = rawCustoms as unknown as CustomsDetail;
  return data({ customs, content, userId: user.id }, { headers: responseHeaders });
}

// ── Edit Loader (수정 폼 프리필용) ────────────────────────────

export async function customsEditLoader({
  request,
  context,
  params,
}: DetailLoaderArgs) {
  const { supabase, responseHeaders } = await requireGVUser(request, context);

  const idResult = z.string().uuid().safeParse(params.id);
  if (!idResult.success) {
    throw data(null, { status: 404, headers: responseHeaders });
  }
  const id = idResult.data;

  const { data: rawCustoms, error } = await supabase
    .from("customs")
    .select(CUSTOMS_DETAIL_SELECT)
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (error || !rawCustoms) {
    throw data(null, { status: 404, headers: responseHeaders });
  }

  const customs = rawCustoms as unknown as CustomsDetail;
  return data({ customs }, { headers: responseHeaders });
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
      "customs",
      id,
      intent,
      formData,
      responseHeaders
    );
  }

  // ── 존재 확인 ─────────────────────────────────────────────
  const { data: customsCheck } = await supabase
    .from("customs")
    .select("id, fee_received")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!customsCheck) {
    return data(
      { success: false, error: "통관서류를 찾을 수 없습니다." },
      { status: 404, headers: responseHeaders }
    );
  }

  // ── update (기본정보 + 비용 통합) ─────────────────────────
  if (intent === "update") {
    const raw = Object.fromEntries(formData);
    const parsed = customsUpdateSchema.safeParse(raw);
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
      customs_no,
      customs_date,
      etc_desc,
      transport_supply,
      transport_vat,
      customs_supply,
      customs_vat,
      vat_supply,
      vat_vat,
      etc_supply,
      etc_vat,
    } = parsed.data;

    const { error: updateError } = await supabase
      .from("customs")
      .update({
        customs_no: customs_no || null,
        customs_date: customs_date || null,
        etc_desc: etc_desc || null,
        transport_fee: {
          supply: transport_supply,
          vat: transport_vat,
          total: computeFeeTotal(transport_supply, transport_vat),
        },
        customs_fee: {
          supply: customs_supply,
          vat: customs_vat,
          total: computeFeeTotal(customs_supply, customs_vat),
        },
        vat_fee: {
          supply: vat_supply,
          vat: vat_vat,
          total: computeFeeTotal(vat_supply, vat_vat),
        },
        etc_fee: {
          supply: etc_supply,
          vat: etc_vat,
          total: computeFeeTotal(etc_supply, etc_vat),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      return data(
        { success: false, error: "저장 중 오류가 발생했습니다." },
        { status: 500, headers: responseHeaders }
      );
    }

    throw redirect(`/customs/${id}`, { headers: responseHeaders });
  }

  // ── toggle_fee_received ───────────────────────────────────
  if (intent === "toggle_fee_received") {
    const newValue = !customsCheck.fee_received;

    const { error: updateError } = await supabase
      .from("customs")
      .update({ fee_received: newValue, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (updateError) {
      return data(
        {
          success: false,
          error: "비용수령 상태 변경 중 오류가 발생했습니다.",
        },
        { status: 500, headers: responseHeaders }
      );
    }

    await syncCustomsFeeToOrder(
      supabase as SupabaseClient<Database>,
      id,
      newValue
    );

    return data(
      { success: true, fee_received: newValue },
      { headers: responseHeaders }
    );
  }

  // ── delete ────────────────────────────────────────────────
  if (intent === "delete") {
    // Order FK 먼저 정리 (unlinkCustomsFromOrder) — 실패 시 중단
    const unlinkOk = await unlinkCustomsFromOrder(supabase as SupabaseClient<Database>, id);
    if (!unlinkOk) {
      return data(
        { success: false, error: "연결된 오더 정리 중 오류가 발생했습니다." },
        { status: 500, headers: responseHeaders }
      );
    }

    const { error: deleteError } = await supabase
      .from("customs")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);

    if (deleteError) {
      return data(
        { success: false, error: "삭제 중 오류가 발생했습니다." },
        { status: 500, headers: responseHeaders }
      );
    }

    throw redirect("/customs", { headers: responseHeaders });
  }

  return data(
    { success: false, error: "알 수 없는 요청입니다." },
    { status: 400, headers: responseHeaders }
  );
}
