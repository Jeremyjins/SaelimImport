import { useLoaderData, useActionData } from "react-router";
import { Header } from "~/components/layout/header";
import { PageContainer } from "~/components/layout/page-container";
import { PIForm } from "~/components/pi/pi-form";
import { piFormLoader, createPIAction } from "~/loaders/pi.server";
import type { SourcePO } from "~/types/pi";

export { piFormLoader as loader, createPIAction as action };

export default function PINewPage() {
  const { suppliers, buyers, products, sourcePO } = useLoaderData<typeof piFormLoader>() as unknown as {
    suppliers: { id: string; name_en: string; name_ko: string | null }[];
    buyers: { id: string; name_en: string; name_ko: string | null }[];
    products: { id: string; name: string; gsm: number | null; width_mm: number | null }[];
    sourcePO: SourcePO | null;
  };
  const actionData = useActionData<typeof createPIAction>();

  return (
    <>
      <Header title="견적서 작성" backTo="/pi" />
      <PageContainer>
        <PIForm
          suppliers={suppliers}
          buyers={buyers}
          products={products}
          sourcePO={sourcePO}
          error={(actionData as { error?: string } | undefined)?.error}
          submitLabel="작성"
        />
      </PageContainer>
    </>
  );
}
