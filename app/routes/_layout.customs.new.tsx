import { useLoaderData, useActionData } from "react-router";
import { Header } from "~/components/layout/header";
import { PageContainer } from "~/components/layout/page-container";
import { customsFormLoader, action } from "~/loaders/customs.server";
import { CustomsForm } from "~/components/customs/customs-form";
import type { AvailableShipping, SourceShipping } from "~/types/customs";

export const loader = customsFormLoader;
export { action };

interface LoaderData {
  availableShippings: AvailableShipping[];
  fromShipping: SourceShipping | null;
  error: string | null;
}

interface ActionData {
  success: boolean;
  error?: string;
}

export default function CustomsNewPage() {
  const { availableShippings, fromShipping } =
    useLoaderData<typeof loader>() as unknown as LoaderData;
  const actionData = useActionData<typeof action>() as ActionData | undefined;

  return (
    <>
      <Header title="통관서류 작성" backTo="/customs" />
      <PageContainer>
        <CustomsForm
          availableShippings={availableShippings}
          defaultShippingId={fromShipping?.id}
          error={actionData?.error}
        />
      </PageContainer>
    </>
  );
}
