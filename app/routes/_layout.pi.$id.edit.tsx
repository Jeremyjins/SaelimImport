import { useLoaderData, useActionData } from "react-router";
import { Header } from "~/components/layout/header";
import { PageContainer } from "~/components/layout/page-container";
import { PIForm } from "~/components/pi/pi-form";
import { piEditLoader, action } from "~/loaders/pi.$id.server";
import type { PIEditData } from "~/types/pi";

export { action };
export { piEditLoader as loader };

interface EditLoaderResult {
  pi: PIEditData;
  suppliers: { id: string; name_en: string; name_ko: string | null }[];
  buyers: { id: string; name_en: string; name_ko: string | null }[];
  products: { id: string; name: string; gsm: number | null; width_mm: number | null }[];
}

export default function PIEditPage() {
  const { pi, suppliers, buyers, products } =
    useLoaderData<typeof piEditLoader>() as unknown as EditLoaderResult;
  const actionData = useActionData<typeof action>();

  return (
    <>
      <Header title={`견적서 수정 — ${pi.pi_no}`} backTo={`/pi/${pi.id}`} />
      <PageContainer>
        <PIForm
          suppliers={suppliers}
          buyers={buyers}
          products={products}
          error={(actionData as { error?: string } | undefined)?.error}
          defaultValues={{
            pi_date: pi.pi_date,
            validity: pi.validity ?? "",
            ref_no: pi.ref_no ?? "",
            po_id: pi.po_id ?? "",
            supplier_id: pi.supplier_id,
            buyer_id: pi.buyer_id,
            currency: pi.currency,
            payment_term: pi.payment_term ?? "",
            delivery_term: pi.delivery_term ?? "",
            loading_port: pi.loading_port ?? "",
            discharge_port: pi.discharge_port ?? "",
            notes: pi.notes ?? "",
            details: pi.details,
          }}
          submitLabel="수정"
          actionName="update"
          cancelTo={`/pi/${pi.id}`}
        />
      </PageContainer>
    </>
  );
}
