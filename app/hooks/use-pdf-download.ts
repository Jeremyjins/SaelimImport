import { useState, useCallback } from "react";
import { toast } from "sonner";
import { triggerDownload } from "~/components/pdf/shared/pdf-utils";

export function usePDFDownload() {
  const [loading, setLoading] = useState(false);

  const download = useCallback(
    async (generatePDF: () => Promise<Blob>, filename: string) => {
      setLoading(true);
      try {
        const blob = await generatePDF();
        triggerDownload(blob, filename);
        toast.success("PDF가 다운로드되었습니다.");
      } catch {
        toast.error("PDF 생성에 실패했습니다.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { loading, download };
}
