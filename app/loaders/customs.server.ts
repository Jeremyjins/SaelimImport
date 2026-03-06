import { data, redirect } from "react-router";
import type { AppLoadContext } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireGVUser } from "~/lib/auth.server";
import { customsCreateSchema } from "~/loaders/customs.schema";
import { linkCustomsToOrder } from "~/lib/order-sync.server";
import { computeFeeTotal } from "~/lib/customs-utils";
import type { CustomsListItem, AvailableShipping, SourceShipping } from "~/types/customs";
import type { Database } from "~/types/database";
import { z } from "zod";

interface LoaderArgs {
  request: Request;
  context: AppLoadContext;
}

// ── 목록 SELECT절 ─────────────────────────────────────────────

const CUSTOMS_LIST_SELECT =
  "id, customs_no, customs_date, fee_received, transport_fee, customs_fee, vat_fee, etc_fee, created_at, " +
  "shipping:shipping_documents!shipping_doc_id(id, ci_no, vessel, eta)";

// ── List Loader (통관관리 목록) ───────────────────────────────
// 전체 데이터 반환, 탭/검색 필터링은 클라이언트에서 처리

export async function loader({ request, context }: LoaderArgs) {
  const { supabase, responseHeaders } = await requireGVUser(request, context);

  const { data: rawCustoms, error } = await supabase
    .from("customs")
    .select(CUSTOMS_LIST_SELECT)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return data(
      { customs: [], error: "데이터를 불러오는 데 실패했습니다." },
      { headers: responseHeaders }
    );
  }

  const customs = (rawCustoms ?? []) as unknown as CustomsListItem[];
  return data({ customs, error: null }, { headers: responseHeaders });
}

// ── Form Loader (통관서류 작성 폼 - 선적서류 선택용) ──────────

export async function customsFormLoader({ request, context }: LoaderArgs) {
  const { supabase, responseHeaders } = await requireGVUser(request, context);

  const url = new URL(request.url);
  const fromShippingParam = url.searchParams.get("from_shipping");

  // UUID 선검증
  const fromShippingId = fromShippingParam
    ? z.string().uuid().safeParse(fromShippingParam).success
      ? fromShippingParam
      : null
    : null;

  const [
    { data: allDocs, error: allDocsError },
    { data: usedDocs, error: usedDocsError },
  ] = await Promise.all([
    supabase
      .from("shipping_documents")
      .select("id, ci_no, ci_date, vessel, eta")
      .is("deleted_at", null)
      .order("ci_date", { ascending: false }),
    supabase
      .from("customs")
      .select("shipping_doc_id")
      .is("deleted_at", null),
  ]);

  if (allDocsError || usedDocsError) {
    return data(
      { availableShippings: [], fromShipping: null, error: "선적서류 목록을 불러오는 데 실패했습니다." },
      { headers: responseHeaders }
    );
  }

  const usedIds = new Set(
    (usedDocs ?? []).map((d) => d.shipping_doc_id).filter(Boolean) as string[]
  );

  const availableShippings = ((allDocs ?? []) as AvailableShipping[]).filter(
    (doc) => !usedIds.has(doc.id)
  );

  let fromShipping: SourceShipping | null = null;
  if (fromShippingId) {
    const found = availableShippings.find((d) => d.id === fromShippingId);
    if (found) {
      fromShipping = {
        id: found.id,
        ci_no: found.ci_no,
        vessel: found.vessel,
        eta: found.eta,
      };
    }
  }

  return data(
    { availableShippings, fromShipping, error: null },
    { headers: responseHeaders }
  );
}

// ── Create Action ─────────────────────────────────────────────

export async function action({ request, context }: LoaderArgs) {
  const { supabase, user, responseHeaders } = await requireGVUser(
    request,
    context
  );

  const formData = await request.formData();
  const intent = formData.get("_action") as string;

  if (intent !== "create") {
    return data(
      { success: false, error: "잘못된 요청입니다." },
      { status: 400, headers: responseHeaders }
    );
  }

  const raw = Object.fromEntries(formData);
  const parsed = customsCreateSchema.safeParse(raw);
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
    shipping_doc_id,
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

  // Shipping 존재 + 미삭제 확인
  const { count: shippingCount } = await supabase
    .from("shipping_documents")
    .select("id", { count: "exact", head: true })
    .eq("id", shipping_doc_id)
    .is("deleted_at", null);

  if (!shippingCount) {
    return data(
      { success: false, error: "선택한 선적서류를 찾을 수 없습니다." },
      { status: 400, headers: responseHeaders }
    );
  }

  // 중복 체크: 동일 Shipping에 대한 Customs 존재 여부
  const { count: dupCount } = await supabase
    .from("customs")
    .select("id", { count: "exact", head: true })
    .eq("shipping_doc_id", shipping_doc_id)
    .is("deleted_at", null);

  if (dupCount && dupCount > 0) {
    return data(
      {
        success: false,
        error: "이미 해당 선적서류에 대한 통관서류가 존재합니다.",
      },
      { status: 400, headers: responseHeaders }
    );
  }

  // Fee JSONB 서버 재계산 (total = supply + vat, 클라이언트 값 무시)
  const { data: created, error: insertError } = await supabase
    .from("customs")
    .insert({
      shipping_doc_id,
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
      fee_received: false,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (insertError || !created) {
    return data(
      { success: false, error: "저장 중 오류가 발생했습니다." },
      { status: 500, headers: responseHeaders }
    );
  }

  // Order 자동 연결 (linkCustomsToOrder: shipping_doc_id 기반)
  await linkCustomsToOrder(
    supabase as SupabaseClient<Database>,
    shipping_doc_id,
    created.id
  );

  throw redirect(`/customs/${created.id}`, { headers: responseHeaders });
}
