import { data, redirect } from "react-router";
import { z } from "zod";
import type { AppLoadContext } from "react-router";
import { requireGVUser } from "~/lib/auth.server";
import type { Json } from "~/types/database";
import type { ShippingLineItem, StuffingRollDetail } from "~/types/shipping";
import { lineItemSchema, shippingSchema, stuffingListSchema, stuffingRollSchema } from "~/loaders/shipping.schema";
import { loadContent, handleContentAction } from "~/lib/content.server";
import type { SupabaseClient } from "@supabase/supabase-js";

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

  const [{ data: shipping, error }, { content }, { data: stuffingLists }] = await Promise.all([
    supabase
      .from("shipping_documents")
      .select(
        "id, ci_no, pl_no, ci_date, ship_date, ref_no, pi_id, shipper_id, consignee_id, " +
          "currency, amount, payment_term, delivery_term, loading_port, discharge_port, " +
          "vessel, voyage, etd, eta, gross_weight, net_weight, package_no, " +
          "details, notes, status, created_by, created_at, updated_at, " +
          "shipper:organizations!shipper_id(id, name_en, name_ko, address_en), " +
          "consignee:organizations!consignee_id(id, name_en, name_ko, address_en), " +
          "pi:proforma_invoices!pi_id(pi_no)"
      )
      .eq("id", idResult.data)
      .is("deleted_at", null)
      .single(),
    loadContent(supabase, "shipping", idResult.data),
    supabase
      .from("stuffing_lists")
      .select("id, shipping_doc_id, sl_no, cntr_no, seal_no, roll_no_range, roll_details, created_at, updated_at")
      .eq("shipping_doc_id", idResult.data)
      .is("deleted_at", null)
      .order("sl_no"),
  ]);

  if (error || !shipping) {
    throw data(null, { status: 404, headers: responseHeaders });
  }

  const processedStuffing = (stuffingLists ?? []).map((sl) => ({
    ...sl,
    roll_details: (sl.roll_details as unknown as StuffingRollDetail[]) ?? [],
  }));

  return data(
    {
      shipping: { ...(shipping as object), stuffing_lists: processedStuffing },
      content,
      userId: user.id,
    },
    { headers: responseHeaders }
  );
}

// ── Edit Loader ───────────────────────────────────────────

export async function shippingEditLoader({
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
    { data: shipping, error },
    { data: shippers },
    { data: consignees },
    { data: products },
    { data: pis },
  ] = await Promise.all([
    supabase
      .from("shipping_documents")
      .select(
        "id, ci_no, pl_no, ci_date, ship_date, ref_no, pi_id, shipper_id, consignee_id, " +
          "currency, payment_term, delivery_term, loading_port, discharge_port, " +
          "vessel, voyage, etd, eta, gross_weight, net_weight, package_no, notes, status, details"
      )
      .eq("id", idResult.data)
      .is("deleted_at", null)
      .single(),
    supabase
      .from("organizations")
      .select("id, name_en, name_ko")
      .eq("type", "seller")
      .is("deleted_at", null)
      .order("name_en"),
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
    supabase
      .from("proforma_invoices")
      .select("id, pi_no")
      .is("deleted_at", null)
      .order("pi_no", { ascending: false }),
  ]);

  if (error || !shipping) {
    throw data(null, { status: 404, headers: responseHeaders });
  }

  return data(
    {
      shipping,
      shippers: shippers ?? [],
      consignees: consignees ?? [],
      products: products ?? [],
      pis: pis ?? [],
    },
    { headers: responseHeaders }
  );
}

// ── 중량 재계산 헬퍼 ──────────────────────────────────────

async function recalcWeightsFromStuffing(
  supabase: SupabaseClient,
  shippingDocId: string
) {
  const { data: stuffingLists } = await supabase
    .from("stuffing_lists")
    .select("roll_details")
    .eq("shipping_doc_id", shippingDocId)
    .is("deleted_at", null);

  let netWeight = 0;
  let grossWeight = 0;
  let packageNo = 0;

  for (const sl of stuffingLists ?? []) {
    const rolls = (sl.roll_details as unknown as StuffingRollDetail[]) ?? [];
    for (const roll of rolls) {
      netWeight += roll.net_weight_kg;
      grossWeight += roll.gross_weight_kg;
    }
    packageNo += rolls.length;
  }

  // best-effort: 실패해도 스터핑 CRUD는 롤백하지 않음
  const { error: weightError } = await supabase
    .from("shipping_documents")
    .update({
      net_weight: Math.round(netWeight * 100) / 100,
      gross_weight: Math.round(grossWeight * 100) / 100,
      package_no: packageNo,
      updated_at: new Date().toISOString(),
    })
    .eq("id", shippingDocId);

  if (weightError) {
    console.error("[recalcWeights] 중량 업데이트 실패:", weightError.message);
  }
}

// ── Action ────────────────────────────────────────────────

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

  // ── Content 액션 (메모 & 첨부파일) ─────────────────────
  if (intent?.startsWith("content_")) {
    return handleContentAction(
      supabase,
      user.id,
      "shipping",
      id,
      intent,
      formData,
      responseHeaders
    );
  }

  // ── Stuffing CRUD ────────────────────────────────────────
  if (intent?.startsWith("stuffing_")) {
    // 선적서류 소유권 확인
    const { data: docCheck } = await supabase
      .from("shipping_documents")
      .select("id, status")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (!docCheck) {
      return data(
        { success: false, error: "선적서류를 찾을 수 없습니다." },
        { status: 404, headers: responseHeaders }
      );
    }

    // C-1: 완료 상태에서 스터핑 변경 차단
    if (docCheck.status === "complete") {
      return data(
        { success: false, error: "완료 처리된 선적서류는 수정할 수 없습니다. 상태를 변경 후 수정하세요." },
        { status: 400, headers: responseHeaders }
      );
    }

    // ── stuffing_create ──────────────────────────────────
    if (intent === "stuffing_create") {
      const raw = Object.fromEntries(formData);
      const parsed = stuffingListSchema.safeParse(raw);
      if (!parsed.success) {
        return data(
          { success: false, error: parsed.error.issues[0]?.message ?? "입력 값을 확인하세요." },
          { status: 400, headers: responseHeaders }
        );
      }

      const rollDetailsRaw = formData.get("roll_details") as string;
      let parsedRolls: unknown;
      try {
        parsedRolls = JSON.parse(rollDetailsRaw || "[]");
      } catch {
        return data(
          { success: false, error: "롤 데이터 형식이 올바르지 않습니다." },
          { status: 400, headers: responseHeaders }
        );
      }

      const rollsResult = z
        .array(stuffingRollSchema)
        .max(500, "롤은 최대 500개까지 입력 가능합니다")
        .safeParse(parsedRolls);

      if (!rollsResult.success) {
        return data(
          { success: false, error: rollsResult.error.issues[0]?.message ?? "롤 데이터를 확인하세요." },
          { status: 400, headers: responseHeaders }
        );
      }

      // sl_no 자동채번
      const { count } = await supabase
        .from("stuffing_lists")
        .select("id", { count: "exact", head: true })
        .eq("shipping_doc_id", id)
        .is("deleted_at", null);

      const nextSlNo =
        parsed.data.sl_no ||
        `SL-${String((count ?? 0) + 1).padStart(3, "0")}`;

      // roll_no_range 계산
      const rolls = rollsResult.data;
      const rollNoRange =
        rolls.length > 0
          ? rolls.length === 1
            ? String(rolls[0].roll_no)
            : `${rolls[0].roll_no}-${rolls[rolls.length - 1].roll_no}`
          : null;

      const { error: insertError } = await supabase
        .from("stuffing_lists")
        .insert({
          shipping_doc_id: id,
          sl_no: nextSlNo,
          cntr_no: parsed.data.cntr_no || null,
          seal_no: parsed.data.seal_no || null,
          roll_no_range: rollNoRange,
          roll_details: rolls as unknown as Json,
          created_by: user.id,
        });

      if (insertError) {
        return data(
          { success: false, error: "컨테이너 추가 중 오류가 발생했습니다." },
          { status: 500, headers: responseHeaders }
        );
      }

      await recalcWeightsFromStuffing(supabase, id);
      return data({ success: true }, { headers: responseHeaders });
    }

    // ── stuffing_update ──────────────────────────────────
    if (intent === "stuffing_update") {
      const stuffingIdRaw = formData.get("stuffing_id") as string;
      const stuffingIdResult = z.string().uuid().safeParse(stuffingIdRaw);
      if (!stuffingIdResult.success) {
        return data(
          { success: false, error: "잘못된 컨테이너 ID입니다." },
          { status: 400, headers: responseHeaders }
        );
      }

      const raw = Object.fromEntries(formData);
      const parsed = stuffingListSchema.safeParse(raw);
      if (!parsed.success) {
        return data(
          { success: false, error: parsed.error.issues[0]?.message ?? "입력 값을 확인하세요." },
          { status: 400, headers: responseHeaders }
        );
      }

      const rollDetailsRaw = formData.get("roll_details") as string;
      let parsedRolls: unknown;
      try {
        parsedRolls = JSON.parse(rollDetailsRaw || "[]");
      } catch {
        return data(
          { success: false, error: "롤 데이터 형식이 올바르지 않습니다." },
          { status: 400, headers: responseHeaders }
        );
      }

      const rollsResult = z
        .array(stuffingRollSchema)
        .max(500, "롤은 최대 500개까지 입력 가능합니다")
        .safeParse(parsedRolls);

      if (!rollsResult.success) {
        return data(
          { success: false, error: rollsResult.error.issues[0]?.message ?? "롤 데이터를 확인하세요." },
          { status: 400, headers: responseHeaders }
        );
      }

      const rolls = rollsResult.data;
      const rollNoRange =
        rolls.length > 0
          ? rolls.length === 1
            ? String(rolls[0].roll_no)
            : `${rolls[0].roll_no}-${rolls[rolls.length - 1].roll_no}`
          : null;

      const { error: updateError } = await supabase
        .from("stuffing_lists")
        .update({
          sl_no: parsed.data.sl_no || null,
          cntr_no: parsed.data.cntr_no || null,
          seal_no: parsed.data.seal_no || null,
          roll_no_range: rollNoRange,
          roll_details: rolls as unknown as Json,
          updated_at: new Date().toISOString(),
        })
        .eq("id", stuffingIdResult.data)
        .eq("shipping_doc_id", id)
        .is("deleted_at", null);

      if (updateError) {
        return data(
          { success: false, error: "컨테이너 수정 중 오류가 발생했습니다." },
          { status: 500, headers: responseHeaders }
        );
      }

      await recalcWeightsFromStuffing(supabase, id);
      return data({ success: true }, { headers: responseHeaders });
    }

    // ── stuffing_delete ──────────────────────────────────
    if (intent === "stuffing_delete") {
      const stuffingIdRaw = formData.get("stuffing_id") as string;
      const stuffingIdResult = z.string().uuid().safeParse(stuffingIdRaw);
      if (!stuffingIdResult.success) {
        return data(
          { success: false, error: "잘못된 컨테이너 ID입니다." },
          { status: 400, headers: responseHeaders }
        );
      }

      const { error: deleteError } = await supabase
        .from("stuffing_lists")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", stuffingIdResult.data)
        .eq("shipping_doc_id", id)
        .is("deleted_at", null);

      if (deleteError) {
        return data(
          { success: false, error: "컨테이너 삭제 중 오류가 발생했습니다." },
          { status: 500, headers: responseHeaders }
        );
      }

      await recalcWeightsFromStuffing(supabase, id);
      return data({ success: true }, { headers: responseHeaders });
    }

    // ── stuffing_csv ─────────────────────────────────────
    if (intent === "stuffing_csv") {
      const stuffingIdRaw = formData.get("stuffing_id") as string;
      const stuffingIdResult = z.string().uuid().safeParse(stuffingIdRaw);
      if (!stuffingIdResult.success) {
        return data(
          { success: false, error: "잘못된 컨테이너 ID입니다." },
          { status: 400, headers: responseHeaders }
        );
      }

      const mode = formData.get("mode") as string;
      const rollDetailsRaw = formData.get("roll_details") as string;

      let parsedRolls: unknown;
      try {
        parsedRolls = JSON.parse(rollDetailsRaw || "[]");
      } catch {
        return data(
          { success: false, error: "CSV 데이터 형식이 올바르지 않습니다." },
          { status: 400, headers: responseHeaders }
        );
      }

      const rollsResult = z
        .array(stuffingRollSchema)
        .max(500, "롤은 최대 500개까지 입력 가능합니다")
        .safeParse(parsedRolls);

      if (!rollsResult.success) {
        return data(
          { success: false, error: rollsResult.error.issues[0]?.message ?? "CSV 데이터를 확인하세요." },
          { status: 400, headers: responseHeaders }
        );
      }

      let finalRolls = rollsResult.data;

      if (mode === "append") {
        const { data: existing } = await supabase
          .from("stuffing_lists")
          .select("roll_details")
          .eq("id", stuffingIdResult.data)
          .eq("shipping_doc_id", id)
          .single();

        const existingRolls =
          (existing?.roll_details as unknown as StuffingRollDetail[]) ?? [];
        finalRolls = [...existingRolls, ...finalRolls];
        if (finalRolls.length > 500) {
          return data(
            { success: false, error: `병합 후 총 롤 수(${finalRolls.length})가 최대 500개를 초과합니다.` },
            { status: 400, headers: responseHeaders }
          );
        }
      }

      const rollNoRange =
        finalRolls.length > 0
          ? finalRolls.length === 1
            ? String(finalRolls[0].roll_no)
            : `${finalRolls[0].roll_no}-${finalRolls[finalRolls.length - 1].roll_no}`
          : null;

      const { error: updateError } = await supabase
        .from("stuffing_lists")
        .update({
          roll_details: finalRolls as unknown as Json,
          roll_no_range: rollNoRange,
          updated_at: new Date().toISOString(),
        })
        .eq("id", stuffingIdResult.data)
        .eq("shipping_doc_id", id);

      if (updateError) {
        return data(
          { success: false, error: "CSV 업로드 중 오류가 발생했습니다." },
          { status: 500, headers: responseHeaders }
        );
      }

      await recalcWeightsFromStuffing(supabase, id);
      return data({ success: true, count: finalRolls.length }, { headers: responseHeaders });
    }

    return data(
      { success: false, error: "알 수 없는 스터핑 요청입니다." },
      { status: 400, headers: responseHeaders }
    );
  }

  // ── Update ──────────────────────────────────────────────
  if (intent === "update") {
    // 완료 상태 수정 차단
    const { data: existing, error: statusError } = await supabase
      .from("shipping_documents")
      .select("status, pi_id")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (statusError || !existing) {
      return data(
        { success: false, error: "선적서류를 찾을 수 없습니다." },
        { status: 404, headers: responseHeaders }
      );
    }

    if (existing.status === "complete") {
      return data(
        {
          success: false,
          error: "완료 처리된 선적서류는 수정할 수 없습니다. 상태를 변경 후 수정하세요.",
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
          error: detailsResult.error.issues[0]?.message ?? "품목 입력을 확인하세요.",
        },
        { status: 400, headers: responseHeaders }
      );
    }

    const raw = Object.fromEntries(formData);
    const parsed = shippingSchema.safeParse(raw);
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
      ci_date,
      ship_date,
      ref_no,
      pi_id,
      shipper_id,
      consignee_id,
      currency,
      payment_term,
      delivery_term,
      loading_port,
      discharge_port,
      vessel,
      voyage,
      etd,
      eta,
      gross_weight,
      net_weight,
      package_no,
      notes,
    } = parsed.data;

    const resolvedPiId = pi_id && pi_id !== "" && pi_id !== "__none__" ? pi_id : null;

    // net_weight <= gross_weight 교차 검증
    if (net_weight != null && gross_weight != null && net_weight > gross_weight) {
      return data(
        { success: false, error: "순중량은 총중량보다 클 수 없습니다." },
        { status: 400, headers: responseHeaders }
      );
    }

    // 활성 org + pi_id 검증
    const [{ count: shipperCount }, { count: consigneeCount }, { count: piCount }] = await Promise.all([
      supabase
        .from("organizations")
        .select("id", { count: "exact", head: true })
        .eq("id", shipper_id)
        .is("deleted_at", null),
      supabase
        .from("organizations")
        .select("id", { count: "exact", head: true })
        .eq("id", consignee_id)
        .is("deleted_at", null),
      resolvedPiId
        ? supabase
            .from("proforma_invoices")
            .select("id", { count: "exact", head: true })
            .eq("id", resolvedPiId)
            .is("deleted_at", null)
        : Promise.resolve({ count: 1 }),
    ]);

    if (!shipperCount) {
      return data(
        { success: false, error: "선택한 송하인이 유효하지 않습니다." },
        { status: 400, headers: responseHeaders }
      );
    }
    if (!consigneeCount) {
      return data(
        { success: false, error: "선택한 수하인이 유효하지 않습니다." },
        { status: 400, headers: responseHeaders }
      );
    }
    if (resolvedPiId && !piCount) {
      return data(
        { success: false, error: "참조한 PI를 찾을 수 없습니다." },
        { status: 400, headers: responseHeaders }
      );
    }

    // Amount 서버사이드 재계산
    const recalculated: ShippingLineItem[] = detailsResult.data.map((item) => ({
      ...item,
      amount: Math.round(item.quantity_kg * item.unit_price * 100) / 100,
    }));
    const totalAmount =
      Math.round(recalculated.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;

    const { error: updateError } = await supabase
      .from("shipping_documents")
      .update({
        ci_date,
        ship_date: ship_date || null,
        ref_no: ref_no || null,
        pi_id: resolvedPiId,
        shipper_id,
        consignee_id,
        currency,
        amount: totalAmount,
        payment_term: payment_term || null,
        delivery_term: delivery_term || null,
        loading_port: loading_port || null,
        discharge_port: discharge_port || null,
        vessel: vessel || null,
        voyage: voyage || null,
        etd: etd || null,
        eta: eta || null,
        gross_weight: gross_weight ?? null,
        net_weight: net_weight ?? null,
        package_no: package_no ?? null,
        details: recalculated as unknown as Json,
        notes: notes || null,
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

    // H-4: Delivery link 갱신 (pi_id 변경 시 old unlink + new link)
    const oldPiId = existing.pi_id as string | null;
    if (oldPiId !== resolvedPiId) {
      if (oldPiId) {
        await supabase
          .from("deliveries")
          .update({ shipping_doc_id: null })
          .eq("shipping_doc_id", id)
          .eq("pi_id", oldPiId);
      }
      if (resolvedPiId) {
        await supabase
          .from("deliveries")
          .update({ shipping_doc_id: id })
          .eq("pi_id", resolvedPiId)
          .is("shipping_doc_id", null);
      }
    }

    throw redirect(`/shipping/${id}`, { headers: responseHeaders });
  }

  // ── Delete ──────────────────────────────────────────────
  if (intent === "delete") {
    // C-3: 완료 상태 삭제 차단
    const { data: deleteStatusCheck } = await supabase
      .from("shipping_documents")
      .select("status")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (deleteStatusCheck?.status === "complete") {
      return data(
        { success: false, error: "완료 처리된 선적서류는 삭제할 수 없습니다. 상태를 변경 후 삭제하세요." },
        { status: 400, headers: responseHeaders }
      );
    }

    const { error: deleteError } = await supabase
      .from("shipping_documents")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null);

    if (deleteError) {
      return data(
        { success: false, error: "삭제 중 오류가 발생했습니다." },
        { status: 500, headers: responseHeaders }
      );
    }

    // Delivery unlink (삭제 아님, shipping_doc_id만 null로)
    await supabase
      .from("deliveries")
      .update({ shipping_doc_id: null })
      .eq("shipping_doc_id", id);

    throw redirect("/shipping", { headers: responseHeaders });
  }

  // ── Clone ───────────────────────────────────────────────
  if (intent === "clone") {
    const { data: originalRaw, error: fetchError } = await supabase
      .from("shipping_documents")
      .select(
        "ci_date, shipper_id, consignee_id, currency, amount, " +
          "payment_term, delivery_term, loading_port, discharge_port, " +
          "gross_weight, net_weight, package_no, details, notes"
      )
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    const original = originalRaw as unknown as {
      ci_date: string;
      shipper_id: string;
      consignee_id: string;
      currency: string;
      amount: number | null;
      payment_term: string | null;
      delivery_term: string | null;
      loading_port: string | null;
      discharge_port: string | null;
      gross_weight: number | null;
      net_weight: number | null;
      package_no: number | null;
      details: Json;
      notes: string | null;
    } | null;

    if (fetchError || !originalRaw || !original) {
      return data(
        { success: false, error: "복제할 선적서류를 찾을 수 없습니다." },
        { status: 404, headers: responseHeaders }
      );
    }

    const today = new Date().toISOString().split("T")[0];
    const { data: ciNo, error: rpcError } = await supabase.rpc("generate_doc_number", {
      doc_type: "CI",
      ref_date: today,
    });

    if (rpcError || !ciNo) {
      return data(
        { success: false, error: "CI 번호 생성에 실패했습니다." },
        { status: 500, headers: responseHeaders }
      );
    }

    const plNo = (ciNo as string).replace("GVCI", "GVPL");

    // H-3: Amount 서버사이드 재계산 (원본 amount 복사 금지)
    const cloneItems = (Array.isArray(original.details) ? original.details : []) as unknown as ShippingLineItem[];
    const cloneAmount =
      Math.round(cloneItems.reduce((sum, item) => sum + item.quantity_kg * item.unit_price, 0) * 100) / 100;

    const { data: cloned, error: insertError } = await supabase
      .from("shipping_documents")
      .insert({
        ci_no: ciNo as string,
        pl_no: plNo,
        ci_date: today,
        ship_date: null,
        ref_no: null,
        pi_id: null, // 복제 시 PI 참조 초기화
        shipper_id: original.shipper_id,
        consignee_id: original.consignee_id,
        currency: original.currency,
        amount: cloneAmount,
        payment_term: original.payment_term,
        delivery_term: original.delivery_term,
        loading_port: original.loading_port,
        discharge_port: original.discharge_port,
        vessel: null,
        voyage: null,
        etd: null,
        eta: null,
        gross_weight: original.gross_weight,
        net_weight: original.net_weight,
        package_no: original.package_no,
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

    throw redirect(`/shipping/${cloned.id}/edit`, { headers: responseHeaders });
  }

  // ── Toggle Status ───────────────────────────────────────
  if (intent === "toggle_status") {
    const { data: current, error: fetchStatusError } = await supabase
      .from("shipping_documents")
      .select("status")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (fetchStatusError || !current) {
      return data(
        { success: false, error: "선적서류를 찾을 수 없습니다." },
        { status: 404, headers: responseHeaders }
      );
    }

    const newStatus = current.status === "process" ? "complete" : "process";

    const { error: toggleError } = await supabase
      .from("shipping_documents")
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
