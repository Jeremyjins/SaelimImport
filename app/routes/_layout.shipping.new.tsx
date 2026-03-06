import { useLoaderData, useActionData } from "react-router";
import { Header } from "~/components/layout/header";
import { PageContainer } from "~/components/layout/page-container";
import { ShippingForm } from "~/components/shipping/shipping-form";
import { shippingFormLoader, createShippingAction } from "~/loaders/shipping.server";
import type { SourcePI } from "~/types/shipping";

export { shippingFormLoader as loader, createShippingAction as action };

export default function ShippingNewPage() {
  const { shippers, consignees, products, pis, sourcePI } =
    useLoaderData<typeof shippingFormLoader>() as unknown as {
      shippers: { id: string; name_en: string; name_ko: string | null }[];
      consignees: { id: string; name_en: string; name_ko: string | null }[];
      products: { id: string; name: string; gsm: number | null; width_mm: number | null }[];
      pis: { id: string; pi_no: string }[];
      sourcePI: SourcePI | null;
    };
  const actionData = useActionData<typeof createShippingAction>();

  return (
    <>
      <Header title="선적서류 작성" backTo="/shipping" />
      <PageContainer>
        <ShippingForm
          shippers={shippers}
          consignees={consignees}
          products={products}
          pis={pis}
          sourcePI={sourcePI}
          error={(actionData as { error?: string } | undefined)?.error}
          submitLabel="작성"
        />
      </PageContainer>
    </>
  );
}
