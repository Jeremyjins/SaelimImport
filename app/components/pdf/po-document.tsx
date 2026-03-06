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
import type { POWithOrgs } from "~/types/po";

interface PODocumentProps {
  data: POWithOrgs;
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

export function PODocument({ data: po }: PODocumentProps) {
  const tableData = po.details.map((item, i) => ({
    no: String(i + 1),
    product: item.product_name,
    gsm: item.gsm != null ? String(item.gsm) : "-",
    width: item.width_mm != null ? formatPdfNumber(item.width_mm, 0) : "-",
    qty: formatPdfNumber(item.quantity_kg, 0),
    unit_price: formatPdfNumber(item.unit_price, 2),
    amount: formatPdfNumber(item.amount, 2),
  }));

  const total =
    po.amount ?? po.details.reduce((sum, item) => sum + item.amount, 0);

  const totalRow: Record<string, string> = {
    no: "",
    product: "",
    gsm: "",
    width: "",
    qty: "TOTAL",
    unit_price: "",
    amount: formatPdfCurrency(total, po.currency),
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <PDFHeader
          title="PURCHASE ORDER"
          docNo={po.po_no}
          date={formatPdfDate(po.po_date)}
          subtitle={
            po.validity
              ? `Validity: ${formatPdfDate(po.validity)}`
              : undefined
          }
        />
        <PDFParties
          left={{
            label: "SUPPLIER",
            name: po.supplier?.name_en ?? "-",
            address: po.supplier?.address_en,
          }}
          right={{
            label: "BUYER",
            name: po.buyer?.name_en ?? "-",
            address: po.buyer?.address_en,
          }}
        />
        <PDFTerms
          paymentTerm={po.payment_term}
          deliveryTerm={po.delivery_term}
          loadingPort={po.loading_port}
          dischargePort={po.discharge_port}
        />
        <PDFTable columns={COLUMNS} data={tableData} totalRow={totalRow} />
        <PDFFooter />
      </Page>
    </Document>
  );
}
