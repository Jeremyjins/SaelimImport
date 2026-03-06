import { data } from "react-router";
import type { AppLoadContext } from "react-router";
import { requireGVUser } from "~/lib/auth.server";
import type { DeliveryListItem } from "~/types/delivery";

interface LoaderArgs {
  request: Request;
  context: AppLoadContext;
}

const DELIVERY_LIST_SELECT =
  "id, delivery_date, status, created_at, " +
  "pi:proforma_invoices!pi_id(id, pi_no), " +
  "shipping:shipping_documents!shipping_doc_id(id, ci_no, vessel, eta)";

export async function loader({ request, context }: LoaderArgs) {
  const { supabase, responseHeaders } = await requireGVUser(request, context);

  const [{ data: rawDeliveries, error }, { data: rawRequests, error: requestsError }] =
    await Promise.all([
      supabase
        .from("deliveries")
        .select(DELIVERY_LIST_SELECT)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("delivery_change_requests")
        .select("delivery_id, status")
        .eq("status", "pending"),
    ]);

  if (error) {
    return data(
      { deliveries: [], error: "데이터를 불러오는 데 실패했습니다." },
      { headers: responseHeaders }
    );
  }

  if (requestsError) {
    console.error("delivery_change_requests query failed:", requestsError);
  }

  // 배송별 대기 중 변경요청 수 계산
  const pendingCountMap = new Map<string, number>();
  for (const req of rawRequests ?? []) {
    if (req.delivery_id) {
      pendingCountMap.set(
        req.delivery_id,
        (pendingCountMap.get(req.delivery_id) ?? 0) + 1
      );
    }
  }

  const deliveries = ((rawDeliveries ?? []) as unknown as Omit<DeliveryListItem, "pending_requests">[]).map(
    (d) => ({
      ...d,
      pending_requests: pendingCountMap.get(d.id) ?? 0,
    })
  ) as DeliveryListItem[];

  return data({ deliveries, error: null }, { headers: responseHeaders });
}
