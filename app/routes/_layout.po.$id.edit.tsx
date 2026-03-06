import { useLoaderData, useActionData } from "react-router";
import { Header } from "~/components/layout/header";
import { PageContainer } from "~/components/layout/page-container";
import { POForm } from "~/components/po/po-form";
import { poEditLoader, action } from "~/loaders/po.$id.server";
import type { POEditData } from "~/types/po";

export { action };
export { poEditLoader as loader };

interface EditLoaderResult {
  po: POEditData;
  suppliers: { id: string; name_en: string; name_ko: string | null }[];
  buyers: { id: string; name_en: string; name_ko: string | null }[];
  products: { id: string; name: string; gsm: number | null; width_mm: number | null }[];
}

export default function POEditPage() {
  const { po, suppliers, buyers, products } =
    useLoaderData<typeof poEditLoader>() as unknown as EditLoaderResult;
  const actionData = useActionData<typeof action>();

  return (
    <>
      <Header title={`구매주문 수정 — ${po.po_no}`} backTo={`/po/${po.id}`} />
      <PageContainer>
        <POForm
          suppliers={suppliers}
          buyers={buyers}
          products={products}
          error={(actionData as { error?: string } | undefined)?.error}
          defaultValues={{
            po_date: po.po_date,
            validity: po.validity ?? "",
            ref_no: po.ref_no ?? "",
            supplier_id: po.supplier_id,
            buyer_id: po.buyer_id,
            currency: po.currency,
            payment_term: po.payment_term ?? "",
            delivery_term: po.delivery_term ?? "",
            loading_port: po.loading_port ?? "",
            discharge_port: po.discharge_port ?? "",
            notes: po.notes ?? "",
            details: po.details,
          }}
          submitLabel="수정"
          actionName="update"
          cancelTo={`/po/${po.id}`}
        />
      </PageContainer>
    </>
  );
}
