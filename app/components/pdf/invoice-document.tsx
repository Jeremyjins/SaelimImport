import { Document, Page, View, Text } from "@react-pdf/renderer";
import { PDFHeader } from "./shared/pdf-header";
import { PDFFooter } from "./shared/pdf-footer";
import { styles, COLORS } from "./shared/pdf-styles";
import { formatPdfDate, formatPdfNumber } from "./shared/pdf-utils";
import { calcTotalFees } from "~/lib/customs-utils";
import type { CustomsDetail } from "~/types/customs";

interface InvoiceDocumentProps {
  data: CustomsDetail;
}

const FEE_COLUMNS = [
  { label: "Category", width: "40%", align: "left" as const },
  { label: "Supply Amount (KRW)", width: "20%", align: "right" as const },
  { label: "VAT (KRW)", width: "20%", align: "right" as const },
  { label: "Total (KRW)", width: "20%", align: "right" as const },
];

function fmtKrw(val: number | null | undefined): string {
  return formatPdfNumber(val ?? 0, 0);
}

export function InvoiceDocument({ data: customs }: InvoiceDocumentProps) {
  const { transport_fee, customs_fee, vat_fee, etc_fee } = customs;
  const totals = calcTotalFees(transport_fee, customs_fee, vat_fee, etc_fee);

  const othersLabel = customs.etc_desc
    ? `Others (${customs.etc_desc})`
    : "Others";

  const feeRows = [
    {
      category: "Transport Fee",
      supply: fmtKrw(transport_fee?.supply),
      vat: fmtKrw(transport_fee?.vat),
      total: fmtKrw(transport_fee?.total),
    },
    {
      category: "Customs Duty",
      supply: fmtKrw(customs_fee?.supply),
      vat: fmtKrw(customs_fee?.vat),
      total: fmtKrw(customs_fee?.total),
    },
    {
      category: "VAT / Import Tax",
      supply: fmtKrw(vat_fee?.supply),
      vat: fmtKrw(vat_fee?.vat),
      total: fmtKrw(vat_fee?.total),
    },
    {
      category: othersLabel,
      supply: fmtKrw(etc_fee?.supply),
      vat: fmtKrw(etc_fee?.vat),
      total: fmtKrw(etc_fee?.total),
    },
  ];

  const extraFields: Array<{ label: string; value: string }> = [];
  if (customs.shipping?.vessel) {
    extraFields.push({ label: "Vessel", value: customs.shipping.vessel });
  }

  const isPaid = customs.fee_received === true;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <PDFHeader
          title="CUSTOMS CLEARANCE INVOICE"
          docNo={customs.customs_no ?? "N/A"}
          date={formatPdfDate(customs.customs_date)}
          subtitle={
            customs.shipping?.ci_no
              ? `Ref CI: ${customs.shipping.ci_no}`
              : undefined
          }
          extraFields={extraFields.length > 0 ? extraFields : undefined}
        />

        {/* Fee Table */}
        <View>
          {/* Table Header */}
          <View style={styles.tableHeader}>
            {FEE_COLUMNS.map((col) => (
              <Text
                key={col.label}
                style={[
                  styles.tableHeaderCell,
                  {
                    width: col.width,
                    textAlign: col.align,
                  },
                ]}
              >
                {col.label}
              </Text>
            ))}
          </View>

          {/* Data Rows */}
          {feeRows.map((row, i) => (
            <View
              key={row.category}
              style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}
              wrap={false}
            >
              <Text
                style={[
                  styles.tableCell,
                  { width: FEE_COLUMNS[0].width, textAlign: "left" },
                ]}
              >
                {row.category}
              </Text>
              <Text
                style={[
                  styles.tableCell,
                  { width: FEE_COLUMNS[1].width, textAlign: "right" },
                ]}
              >
                {row.supply}
              </Text>
              <Text
                style={[
                  styles.tableCell,
                  { width: FEE_COLUMNS[2].width, textAlign: "right" },
                ]}
              >
                {row.vat}
              </Text>
              <Text
                style={[
                  styles.tableCell,
                  { width: FEE_COLUMNS[3].width, textAlign: "right" },
                ]}
              >
                {row.total}
              </Text>
            </View>
          ))}

          {/* Grand Total Row */}
          <View style={styles.tableTotalRow} wrap={false}>
            <Text
              style={[
                styles.tableTotalCell,
                { width: FEE_COLUMNS[0].width, textAlign: "left" },
              ]}
            >
              GRAND TOTAL
            </Text>
            <Text
              style={[
                styles.tableTotalCell,
                { width: FEE_COLUMNS[1].width, textAlign: "right" },
              ]}
            >
              {fmtKrw(totals.totalSupply)}
            </Text>
            <Text
              style={[
                styles.tableTotalCell,
                { width: FEE_COLUMNS[2].width, textAlign: "right" },
              ]}
            >
              {fmtKrw(totals.totalVat)}
            </Text>
            <Text
              style={[
                styles.tableTotalCell,
                { width: FEE_COLUMNS[3].width, textAlign: "right" },
              ]}
            >
              {fmtKrw(totals.grandTotal)}
            </Text>
          </View>
        </View>

        {/* Payment Status */}
        <View
          style={{
            marginTop: 16,
            borderWidth: 1,
            borderColor: COLORS.border,
            borderRadius: 2,
            padding: 10,
            flexDirection: "row",
            alignItems: "center",
          }}
          wrap={false}
        >
          <Text
            style={{
              fontSize: 7,
              fontFamily: "Helvetica-Bold",
              color: COLORS.label,
              marginRight: 8,
            }}
          >
            PAYMENT STATUS:
          </Text>
          <Text
            style={{
              fontSize: 10,
              fontFamily: "Helvetica-Bold",
              color: isPaid ? "#16a34a" : COLORS.text,
            }}
          >
            {isPaid ? "PAID" : "UNPAID"}
          </Text>
        </View>

        <PDFFooter />
      </Page>
    </Document>
  );
}
