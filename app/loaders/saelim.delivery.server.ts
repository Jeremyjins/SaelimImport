import { data, redirect } from "react-router";
import type { AppLoadContext } from "react-router";
import { requireAuth } from "~/lib/auth.server";
import { ORG_TYPES } from "~/lib/constants";
import type { SaelimDeliveryListItem } from "~/types/delivery";

interface LoaderArgs {
  request: Request;
  context: AppLoadContext;
}

// 가격 정보 완전 제외 (CRIT-1)
const SAELIM_DELIVERY_LIST_SELECT =
  "id, delivery_date, status, created_at, " +
  "pi:proforma_invoices!pi_id(id, pi_no), " +
  "shipping:shipping_documents!shipping_doc_id(id, ci_no, vessel, eta)";

export async function loader({ request, context }: LoaderArgs) {
  const { supabase, user, responseHeaders } = await requireAuth(
    request,
    context
  );

  // CRIT-2: Saelim 전용 접근 검증
  if (user.app_metadata?.org_type !== ORG_TYPES.SAELIM) {
    throw redirect("/", { headers: responseHeaders });
  }

  const [{ data: rawDeliveries, error }, { data: myRequests }] =
    await Promise.all([
      supabase
        .from("deliveries")
        .select(SAELIM_DELIVERY_LIST_SELECT)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      // CRIT-3: 본인 요청만 조회 (requested_by = user.id - RLS도 적용됨)
      supabase
        .from("delivery_change_requests")
        .select("delivery_id, status")
        .eq("requested_by", user.id)
        .eq("status", "pending"),
    ]);

  if (error) {
    return data(
      { deliveries: [], error: "데이터를 불러오는 데 실패했습니다." },
      { headers: responseHeaders }
    );
  }

  // 배송별 내 대기 중 요청 존재 여부
  const myPendingSet = new Set<string>(
    (myRequests ?? [])
      .map((r) => r.delivery_id)
      .filter((id): id is string => id !== null)
  );

  const deliveries = (
    (rawDeliveries ?? []) as unknown as Omit<
      SaelimDeliveryListItem,
      "my_pending_request"
    >[]
  ).map((d) => ({
    ...d,
    my_pending_request: myPendingSet.has(d.id),
  })) as SaelimDeliveryListItem[];

  return data({ deliveries, error: null }, { headers: responseHeaders });
}
