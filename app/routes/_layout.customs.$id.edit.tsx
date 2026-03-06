import { useLoaderData, useActionData } from "react-router";
import { Header } from "~/components/layout/header";
import { PageContainer } from "~/components/layout/page-container";
import { CustomsForm } from "~/components/customs/customs-form";
import { customsEditLoader, action } from "~/loaders/customs.$id.server";
import type { CustomsDetail } from "~/types/customs";

export { action };
export { customsEditLoader as loader };

interface EditLoaderData {
  customs: CustomsDetail;
}

interface ActionData {
  success: boolean;
  error?: string;
}

export default function CustomsEditPage() {
  const { customs } =
    useLoaderData<typeof customsEditLoader>() as unknown as EditLoaderData;
  const actionData = useActionData<typeof action>() as ActionData | undefined;

  return (
    <>
      <Header
        title={`통관서류 수정${customs.customs_no ? ` — ${customs.customs_no}` : ""}`}
        backTo={`/customs/${customs.id}`}
      />
      <PageContainer>
        <CustomsForm
          availableShippings={[]}
          defaultShippingId={customs.shipping_doc_id ?? undefined}
          defaultValues={{
            customs_no: customs.customs_no,
            customs_date: customs.customs_date,
            etc_desc: customs.etc_desc,
            transport_fee: customs.transport_fee,
            customs_fee: customs.customs_fee,
            vat_fee: customs.vat_fee,
            etc_fee: customs.etc_fee,
          }}
          error={actionData?.error}
          isEditing
        />
      </PageContainer>
    </>
  );
}
