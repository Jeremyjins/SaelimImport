import { Document, Page } from "@react-pdf/renderer";
import { PDFHeader } from "./shared/pdf-header";
import { PDFFooter } from "./shared/pdf-footer";
import { PDFParties } from "./shared/pdf-parties";
import { PDFTerms } from "./shared/pdf-terms";
import { PDFTable, type PDFColumn } from "./shared/pdf-table";
import { styles } from "./shared/pdf-styles";
import {
  formatPdfDate,
  formatPdfCurrency,
  formatPdfNumber,
} from "./shared/pdf-utils";
import type { PIWithOrgs } from "~/types/pi";

interface PIDocumentProps {
  data: PIWithOrgs;
}

const COLUMNS: PDFColumn[] = [
  { key: "no", label: "No.", width: "5%", align: "center" },
  { key: "product", label: "Product", width: "27%", align: "left" },
  { key: "gsm", label: "GSM", width: "8%", align: "center" },
  { key: "width", label: "Width (mm)", width: "10%", align: "center" },
  { key: "qty", label: "Qty (KG)", width: "15%", align: "right" },
  { key: "unit_price", label: "Unit Price", width: "15%", align: "right" },
  { key: "amount", label: "Amount", width: "20%", align: "right" },
];

export function PIDocument({ data: pi }: PIDocumentProps) {
  const tableData = pi.details.map((item, i) => ({
    no: String(i + 1),
    product: item.product_name,
    gsm: item.gsm != null ? String(item.gsm) : "-",
    width: item.width_mm != null ? formatPdfNumber(item.width_mm, 0) : "-",
    qty: formatPdfNumber(item.quantity_kg, 0),
    unit_price: formatPdfNumber(item.unit_price, 2),
    amount: formatPdfNumber(item.amount, 2),
  }));

  const total =
    pi.amount ?? pi.details.reduce((sum, item) => sum + item.amount, 0);

  const totalRow: Record<string, string> = {
    no: "",
    product: "",
    gsm: "",
    width: "",
    qty: "TOTAL",
    unit_price: "",
    amount: formatPdfCurrency(total, pi.currency),
  };

  const extraFields: Array<{ label: string; value: string }> = [];
  if (pi.validity) {
    extraFields.push({ label: "Validity", value: formatPdfDate(pi.validity) });
  }

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <PDFHeader
          title="PROFORMA INVOICE"
          docNo={pi.pi_no}
          date={formatPdfDate(pi.pi_date)}
          subtitle={pi.po ? `Ref PO: ${pi.po.po_no}` : undefined}
          extraFields={extraFields.length > 0 ? extraFields : undefined}
        />
        <PDFParties
          left={{
            label: "SELLER",
            name: pi.supplier?.name_en ?? "-",
            address: pi.supplier?.address_en,
          }}
          right={{
            label: "BUYER",
            name: pi.buyer?.name_en ?? "-",
            address: pi.buyer?.address_en,
          }}
        />
        <PDFTerms
          paymentTerm={pi.payment_term}
          deliveryTerm={pi.delivery_term}
          loadingPort={pi.loading_port}
          dischargePort={pi.discharge_port}
        />
        <PDFTable columns={COLUMNS} data={tableData} totalRow={totalRow} />
        <PDFFooter />
      </Page>
    </Document>
  );
}
