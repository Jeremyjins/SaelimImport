import { data, redirect } from "react-router";
import { z } from "zod";
import type { AppLoadContext } from "react-router";
import { requireGVUser } from "~/lib/auth.server";
import type { Json } from "~/types/database";
import type { ShippingLineItem, SourcePI } from "~/types/shipping";
import { lineItemSchema, shippingSchema } from "~/loaders/shipping.schema";

// ── 공통 타입 ──────────────────────────────────────────────

interface LoaderArgs {
  request: Request;
  context: AppLoadContext;
}

// ── List Loader ────────────────────────────────────────────

export async function loader({ request, context }: LoaderArgs) {
  const { supabase, responseHeaders } = await requireGVUser(request, context);

  const { data: shippingDocs, error } = await supabase
    .from("shipping_documents")
    .select(
      "id, ci_no, pl_no, ci_date, status, amount, currency, vessel, etd, eta, " +
        "shipper:organizations!shipper_id(name_en), " +
        "consignee:organizations!consignee_id(name_en), " +
        "pi:proforma_invoices!pi_id(pi_no)"
    )
    .is("deleted_at", null)
    .order("ci_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return data(
      { shippingDocs: [], error: "데이터를 불러오는 데 실패했습니다." },
      { headers: responseHeaders }
    );
  }

  return data({ shippingDocs: shippingDocs ?? [] }, { headers: responseHeaders });
}

// ── Shipping Form Loader (새 선적서류 작성 폼용) ────────────

export async function shippingFormLoader({ request, context }: LoaderArgs) {
  const { supabase, responseHeaders } = await requireGVUser(request, context);

  const url = new URL(request.url);
  const fromPiId = url.searchParams.get("from_pi");

  // UUID 선검증
  const piIdResult = fromPiId ? z.string().uuid().safeParse(fromPiId) : null;
  const validPiId = piIdResult?.success ? piIdResult.data : null;

  const [{ data: shippers }, { data: consignees }, { data: products }, { data: pis }, { data: pi }] =
    await Promise.all([
      // Shipper = seller (GV International)
      supabase
        .from("organizations")
        .select("id, name_en, name_ko")
        .eq("type", "seller")
        .is("deleted_at", null)
        .order("name_en"),
      // Consignee = buyer (Saelim)
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
      // PI 선택 드롭다운용
      supabase
        .from("proforma_invoices")
        .select("id, pi_no")
        .is("deleted_at", null)
        .order("pi_no", { ascending: false }),
      // from_pi 프리필용
      validPiId
        ? supabase
            .from("proforma_invoices")
            .select(
              "id, pi_no, currency, payment_term, delivery_term, loading_port, discharge_port, supplier_id, buyer_id, details"
            )
            .eq("id", validPiId)
            .is("deleted_at", null)
            .single()
        : Promise.resolve({ data: null, error: null }),
    ]);

  let sourcePI: SourcePI | null = null;

  if (validPiId && pi) {
    const piData = pi as unknown as {
      id: string;
      pi_no: string;
      currency: string;
      payment_term: string | null;
      delivery_term: string | null;
      loading_port: string | null;
      discharge_port: string | null;
      supplier_id: string;
      buyer_id: string;
      details: ShippingLineItem[];
    };
    sourcePI = {
      id: piData.id,
      pi_no: piData.pi_no,
      currency: piData.currency,
      payment_term: piData.payment_term,
      delivery_term: piData.delivery_term,
      loading_port: piData.loading_port,
      discharge_port: piData.discharge_port,
      supplier_id: piData.supplier_id,
      buyer_id: piData.buyer_id,
      details: Array.isArray(piData.details) ? piData.details : [],
    };
  }

  return data(
    {
      shippers: shippers ?? [],
      consignees: consignees ?? [],
      products: products ?? [],
      pis: pis ?? [],
      sourcePI,
    },
    { headers: responseHeaders }
  );
}

// ── Create Action ──────────────────────────────────────────

export async function createShippingAction({ request, context }: LoaderArgs) {
  const { supabase, user, responseHeaders } = await requireGVUser(request, context);
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
        error: detailsResult.error.issues[0]?.message ?? "품목 입력을 확인하세요.",
      },
      { status: 400, headers: responseHeaders }
    );
  }

  // 기본 필드 검증
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

  // 활성 org + pi_id 검증 (3-way 병렬)
  const [{ count: shipperCount }, { count: consigneeCount }, { count: piCount }] =
    await Promise.all([
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

  // CI 번호 생성 (GVCI{YYMM}-{SEQ})
  const { data: ciNo, error: rpcError } = await supabase.rpc("generate_doc_number", {
    doc_type: "CI",
    ref_date: ci_date,
  });

  if (rpcError || !ciNo) {
    return data(
      { success: false, error: "CI 번호 생성에 실패했습니다." },
      { status: 500, headers: responseHeaders }
    );
  }

  // PL 번호: CI번호에서 접두어만 치환 (GVCI → GVPL)
  const plNo = (ciNo as string).replace("GVCI", "GVPL");

  // 선적서류 저장
  const { data: created, error: insertError } = await supabase
    .from("shipping_documents")
    .insert({
      ci_no: ciNo as string,
      pl_no: plNo,
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
      created_by: user.id,
    })
    .select("id")
    .single();

  if (insertError || !created) {
    const errMsg =
      insertError?.code === "23505"
        ? "이미 존재하는 CI 번호입니다."
        : "저장 중 오류가 발생했습니다.";
    return data(
      { success: false, error: errMsg },
      { status: 500, headers: responseHeaders }
    );
  }

  // Delivery link: pi_id가 있으면 해당 PI의 delivery에 shipping_doc_id 연결
  if (resolvedPiId) {
    await supabase
      .from("deliveries")
      .update({ shipping_doc_id: created.id })
      .eq("pi_id", resolvedPiId)
      .is("shipping_doc_id", null);
  }

  throw redirect(`/shipping/${created.id}`, { headers: responseHeaders });
}
