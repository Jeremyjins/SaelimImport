import { data } from "react-router";
import type { AppLoadContext } from "react-router";
import { requireGVUser } from "~/lib/auth.server";

interface HomeLoaderArgs {
  request: Request;
  context: AppLoadContext;
}

export async function loader({ request, context }: HomeLoaderArgs) {
  const { supabase, responseHeaders } = await requireGVUser(request, context);

  const [
    { count: poProcess },
    { count: piProcess },
    { count: shippingProcess },
    { count: orderProcess },
    { count: customsNotReceived },
    { count: deliveryActive },
    { data: recentOrders },
    { data: pendingRequests },
    { data: cyRiskOrders },
  ] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "process")
      .is("deleted_at", null),
    supabase
      .from("proforma_invoices")
      .select("id", { count: "exact", head: true })
      .eq("status", "process")
      .is("deleted_at", null),
    supabase
      .from("shipping_documents")
      .select("id", { count: "exact", head: true })
      .eq("status", "process")
      .is("deleted_at", null),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "process")
      .is("deleted_at", null),
    supabase
      .from("customs")
      .select("id", { count: "exact", head: true })
      .eq("fee_received", false)
      .is("deleted_at", null),
    supabase
      .from("deliveries")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "scheduled"])
      .is("deleted_at", null),
    supabase
      .from("orders")
      .select("id, saelim_no, status, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("delivery_change_requests")
      .select("id, delivery_id, requested_date, reason, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(5),
    // CY 위험: advice_date 있고 arrival_date 없는 진행중 오더
    supabase
      .from("orders")
      .select("id, saelim_no")
      .eq("status", "process")
      .is("deleted_at", null)
      .not("advice_date", "is", null)
      .is("arrival_date", null),
  ]);

  return data(
    {
      stats: {
        poProcess: poProcess ?? 0,
        piProcess: piProcess ?? 0,
        shippingProcess: shippingProcess ?? 0,
        orderProcess: orderProcess ?? 0,
        customsNotReceived: customsNotReceived ?? 0,
        deliveryActive: deliveryActive ?? 0,
      },
      recentOrders: recentOrders ?? [],
      pendingRequests: pendingRequests ?? [],
      cyRiskCount: cyRiskOrders?.length ?? 0,
    },
    { headers: responseHeaders }
  );
}
