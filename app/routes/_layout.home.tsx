import type { Route } from "./+types/_layout.home";
import { Header } from "~/components/layout/header";
import { PageContainer } from "~/components/layout/page-container";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "대시보드 | GV International" }];
}

export default function HomePage() {
  return (
    <>
      <Header title="대시보드" />
      <PageContainer>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <h2 className="text-xl font-semibold text-zinc-900">
            GV International 수입관리 시스템
          </h2>
          <p className="mt-2 text-sm text-zinc-500">
            좌측 메뉴에서 관리할 항목을 선택해 주세요.
          </p>
        </div>
      </PageContainer>
    </>
  );
}
