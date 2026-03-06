import type { Route } from "./+types/_saelim.delivery";
import { PageContainer } from "~/components/layout/page-container";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "배송관리 | 세림 수입관리" }];
}

export default function SaelimDeliveryPage() {
  return (
    <PageContainer>
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <h2 className="text-xl font-semibold text-zinc-900">배송 현황</h2>
        <p className="mt-2 text-sm text-zinc-500">
          배송 목록이 여기에 표시될 예정입니다.
        </p>
      </div>
    </PageContainer>
  );
}
