import { useLoaderData, useActionData } from "react-router";
import { Header } from "~/components/layout/header";
import { PageContainer } from "~/components/layout/page-container";
import { POForm } from "~/components/po/po-form";
import { poFormLoader, createPOAction } from "~/loaders/po.server";

export { poFormLoader as loader, createPOAction as action };

export default function PONewPage() {
  const { suppliers, buyers, products } = useLoaderData<typeof poFormLoader>();
  const actionData = useActionData<typeof createPOAction>();

  return (
    <>
      <Header title="구매주문 작성" backTo="/po" />
      <PageContainer>
        <POForm
          suppliers={suppliers}
          buyers={buyers}
          products={products}
          error={(actionData as { error?: string } | undefined)?.error}
          submitLabel="작성"
        />
      </PageContainer>
    </>
  );
}
