import { Document, Page, View, Text } from "@react-pdf/renderer";
import { PDFHeader } from "./shared/pdf-header";
import { PDFFooter } from "./shared/pdf-footer";
import { styles, COLORS } from "./shared/pdf-styles";
import { formatPdfNumber } from "./shared/pdf-utils";
import type { ShippingWithOrgs, StuffingList } from "~/types/shipping";

interface SLDocumentProps {
  data: ShippingWithOrgs;
}

const COL_WIDTHS = {
  roll_no: "6%",
  product: "26%",
  gsm: "8%",
  width: "10%",
  length: "10%",
  net_wt: "18%",
  gross_wt: "18%",
  pkg: "4%",
};

const COLUMNS = [
  { key: "roll_no", label: "Roll No.", width: COL_WIDTHS.roll_no, align: "center" as const },
  { key: "product", label: "Product", width: COL_WIDTHS.product, align: "left" as const },
  { key: "gsm", label: "GSM", width: COL_WIDTHS.gsm, align: "center" as const },
  { key: "width", label: "Width(mm)", width: COL_WIDTHS.width, align: "center" as const },
  { key: "length", label: "Length(m)", width: COL_WIDTHS.length, align: "right" as const },
  { key: "net_wt", label: "Net Wt(KG)", width: COL_WIDTHS.net_wt, align: "right" as const },
  { key: "gross_wt", label: "Gross Wt(KG)", width: COL_WIDTHS.gross_wt, align: "right" as const },
  { key: "pkg", label: "PKG", width: COL_WIDTHS.pkg, align: "center" as const },
];

function ContainerSection({
  stuffing,
  isFirst,
  ciNo,
}: {
  stuffing: StuffingList;
  isFirst: boolean;
  ciNo: string;
}) {
  const rolls = stuffing.roll_details ?? [];
  const totalNetWt = rolls.reduce((s, r) => s + r.net_weight_kg, 0);
  const totalGrossWt = rolls.reduce((s, r) => s + r.gross_weight_kg, 0);

  return (
    <View break={!isFirst}>
      {/* Container Header */}
      <PDFHeader
        title="STUFFING LIST"
        docNo={stuffing.sl_no ?? ciNo}
        extraFields={[
          { label: "Container", value: stuffing.cntr_no ?? "-" },
          { label: "Seal", value: stuffing.seal_no ?? "-" },
          ...(stuffing.roll_no_range
            ? [{ label: "Roll Range", value: stuffing.roll_no_range }]
            : []),
        ]}
      />

      {/* Table Header (not fixed — per container) */}
      <View
        style={[
          styles.tableHeader,
        ]}
      >
        {COLUMNS.map((col) => (
          <Text
            key={col.key}
            style={[
              styles.tableHeaderCell,
              { width: col.width, textAlign: col.align },
            ]}
          >
            {col.label}
          </Text>
        ))}
      </View>

      {rolls.length === 0 ? (
        <View style={styles.tableRow}>
          <Text
            style={[
              styles.tableCell,
              { width: "100%", textAlign: "center", color: COLORS.label },
            ]}
          >
            No roll details available.
          </Text>
        </View>
      ) : (
        rolls.map((roll, i) => (
          <View
            key={roll.roll_no}
            style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}
            wrap={false}
          >
            <Text style={[styles.tableCell, { width: COL_WIDTHS.roll_no, textAlign: "center" }]}>
              {roll.roll_no}
            </Text>
            <Text style={[styles.tableCell, { width: COL_WIDTHS.product }]}>
              {roll.product_name}
            </Text>
            <Text style={[styles.tableCell, { width: COL_WIDTHS.gsm, textAlign: "center" }]}>
              {roll.gsm}
            </Text>
            <Text style={[styles.tableCell, { width: COL_WIDTHS.width, textAlign: "center" }]}>
              {roll.width_mm}
            </Text>
            <Text style={[styles.tableCell, { width: COL_WIDTHS.length, textAlign: "right" }]}>
              {formatPdfNumber(roll.length_m, 0)}
            </Text>
            <Text style={[styles.tableCell, { width: COL_WIDTHS.net_wt, textAlign: "right" }]}>
              {formatPdfNumber(roll.net_weight_kg, 3)}
            </Text>
            <Text style={[styles.tableCell, { width: COL_WIDTHS.gross_wt, textAlign: "right" }]}>
              {formatPdfNumber(roll.gross_weight_kg, 3)}
            </Text>
            <Text style={[styles.tableCell, { width: COL_WIDTHS.pkg, textAlign: "center" }]}>
              1
            </Text>
          </View>
        ))
      )}

      {/* Total Row */}
      {rolls.length > 0 && (
        <View style={styles.tableTotalRow} wrap={false}>
          <Text style={[styles.tableTotalCell, { width: COL_WIDTHS.roll_no, textAlign: "center" }]}>
            {""}
          </Text>
          <Text style={[styles.tableTotalCell, { width: COL_WIDTHS.product }]}>
            {""}
          </Text>
          <Text style={[styles.tableTotalCell, { width: COL_WIDTHS.gsm }]}>
            {""}
          </Text>
          <Text style={[styles.tableTotalCell, { width: COL_WIDTHS.width }]}>
            {""}
          </Text>
          <Text style={[styles.tableTotalCell, { width: COL_WIDTHS.length, textAlign: "right" }]}>
            {`${rolls.length} rolls`}
          </Text>
          <Text style={[styles.tableTotalCell, { width: COL_WIDTHS.net_wt, textAlign: "right" }]}>
            {formatPdfNumber(totalNetWt, 3)}
          </Text>
          <Text style={[styles.tableTotalCell, { width: COL_WIDTHS.gross_wt, textAlign: "right" }]}>
            {formatPdfNumber(totalGrossWt, 3)}
          </Text>
          <Text style={[styles.tableTotalCell, { width: COL_WIDTHS.pkg, textAlign: "center" }]}>
            {String(rolls.length)}
          </Text>
        </View>
      )}
    </View>
  );
}

export function SLDocument({ data: shipping }: SLDocumentProps) {
  const stuffingLists = shipping.stuffing_lists ?? [];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {stuffingLists.length === 0 ? (
          <>
            <PDFHeader
              title="STUFFING LIST"
              docNo={shipping.ci_no}
            />
            <View style={{ padding: 20 }}>
              <Text style={{ fontSize: 9, color: COLORS.label, textAlign: "center" }}>
                No stuffing list data available.
              </Text>
            </View>
          </>
        ) : (
          stuffingLists.map((stuffing, i) => (
            <ContainerSection
              key={stuffing.id}
              stuffing={stuffing}
              isFirst={i === 0}
              ciNo={shipping.ci_no}
            />
          ))
        )}
        <PDFFooter />
      </Page>
    </Document>
  );
}
