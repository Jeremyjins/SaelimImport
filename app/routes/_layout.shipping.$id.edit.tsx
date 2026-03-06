import { useLoaderData, useActionData } from "react-router";
import { Header } from "~/components/layout/header";
import { PageContainer } from "~/components/layout/page-container";
import { ShippingForm } from "~/components/shipping/shipping-form";
import { shippingEditLoader, action } from "~/loaders/shipping.$id.server";
import type { ShippingEditData } from "~/types/shipping";

export { action };
export { shippingEditLoader as loader };

interface EditLoaderResult {
  shipping: ShippingEditData;
  shippers: { id: string; name_en: string; name_ko: string | null }[];
  consignees: { id: string; name_en: string; name_ko: string | null }[];
  products: { id: string; name: string; gsm: number | null; width_mm: number | null }[];
  pis: { id: string; pi_no: string }[];
}

export default function ShippingEditPage() {
  const { shipping, shippers, consignees, products, pis } =
    useLoaderData<typeof shippingEditLoader>() as unknown as EditLoaderResult;
  const actionData = useActionData<typeof action>();

  return (
    <>
      <Header
        title={`선적서류 수정 — ${shipping.ci_no}`}
        backTo={`/shipping/${shipping.id}`}
      />
      <PageContainer>
        <ShippingForm
          shippers={shippers}
          consignees={consignees}
          products={products}
          pis={pis}
          error={(actionData as { error?: string } | undefined)?.error}
          defaultValues={{
            ci_date: shipping.ci_date,
            ship_date: shipping.ship_date ?? "",
            ref_no: shipping.ref_no ?? "",
            pi_id: shipping.pi_id ?? "",
            shipper_id: shipping.shipper_id,
            consignee_id: shipping.consignee_id,
            currency: shipping.currency,
            payment_term: shipping.payment_term ?? "",
            delivery_term: shipping.delivery_term ?? "",
            loading_port: shipping.loading_port ?? "",
            discharge_port: shipping.discharge_port ?? "",
            vessel: shipping.vessel ?? "",
            voyage: shipping.voyage ?? "",
            etd: shipping.etd ?? "",
            eta: shipping.eta ?? "",
            gross_weight: shipping.gross_weight,
            net_weight: shipping.net_weight,
            package_no: shipping.package_no,
            notes: shipping.notes ?? "",
            details: shipping.details,
          }}
          submitLabel="수정"
          actionName="update"
          cancelTo={`/shipping/${shipping.id}`}
        />
      </PageContainer>
    </>
  );
}
