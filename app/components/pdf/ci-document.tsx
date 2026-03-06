import { Document, Page, View, Text } from "@react-pdf/renderer";
import { PDFHeader } from "./shared/pdf-header";
import { PDFFooter } from "./shared/pdf-footer";
import { PDFParties } from "./shared/pdf-parties";
import { PDFTerms } from "./shared/pdf-terms";
import { PDFTable, type PDFColumn } from "./shared/pdf-table";
import { styles, COLORS } from "./shared/pdf-styles";
import {
  formatPdfDate,
  formatPdfCurrency,
  formatPdfNumber,
  formatPdfWeight,
} from "./shared/pdf-utils";
import type { ShippingWithOrgs } from "~/types/shipping";

interface CIDocumentProps {
  data: ShippingWithOrgs;
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

export function CIDocument({ data: shipping }: CIDocumentProps) {
  const tableData = shipping.details.map((item, i) => ({
    no: String(i + 1),
    product: item.product_name,
    gsm: item.gsm != null ? String(item.gsm) : "-",
    width: item.width_mm != null ? formatPdfNumber(item.width_mm, 0) : "-",
    qty: formatPdfNumber(item.quantity_kg, 0),
    unit_price: formatPdfNumber(item.unit_price, 2),
    amount: formatPdfNumber(item.amount, 2),
  }));

  const total =
    shipping.amount ??
    shipping.details.reduce((sum, item) => sum + item.amount, 0);

  const totalRow: Record<string, string> = {
    no: "",
    product: "",
    gsm: "",
    width: "",
    qty: "TOTAL",
    unit_price: "",
    amount: formatPdfCurrency(total, shipping.currency),
  };

  const hasShippingInfo =
    shipping.vessel || shipping.voyage || shipping.ship_date || shipping.etd || shipping.eta;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <PDFHeader
          title="COMMERCIAL INVOICE"
          docNo={shipping.ci_no}
          date={formatPdfDate(shipping.ci_date)}
          subtitle={shipping.pi ? `Ref PI: ${shipping.pi.pi_no}` : undefined}
          extraFields={
            shipping.ref_no
              ? [{ label: "Ref", value: shipping.ref_no }]
              : undefined
          }
        />
        <PDFParties
          left={{
            label: "SHIPPER",
            name: shipping.shipper?.name_en ?? "-",
            address: shipping.shipper?.address_en,
          }}
          right={{
            label: "CONSIGNEE",
            name: shipping.consignee?.name_en ?? "-",
            address: shipping.consignee?.address_en,
          }}
        />
        <PDFTerms
          paymentTerm={shipping.payment_term}
          deliveryTerm={shipping.delivery_term}
          loadingPort={shipping.loading_port}
          dischargePort={shipping.discharge_port}
        />

        {/* Shipping Info */}
        {hasShippingInfo && (
          <View
            style={{
              borderWidth: 1,
              borderColor: COLORS.border,
              borderRadius: 2,
              marginBottom: 12,
              padding: 8,
              backgroundColor: COLORS.headerBg,
            }}
          >
            <Text
              style={{
                fontSize: 7,
                fontFamily: "Helvetica-Bold",
                color: COLORS.label,
                marginBottom: 6,
              }}
            >
              SHIPPING INFORMATION
            </Text>
            <View style={{ flexDirection: "row" }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", marginBottom: 3 }}>
                  <Text
                    style={{
                      fontSize: 7,
                      color: COLORS.label,
                      width: "35%",
                    }}
                  >
                    Vessel:
                  </Text>
                  <Text style={{ fontSize: 8, color: COLORS.text }}>
                    {shipping.vessel ?? "-"}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", marginBottom: 3 }}>
                  <Text
                    style={{
                      fontSize: 7,
                      color: COLORS.label,
                      width: "35%",
                    }}
                  >
                    Voyage:
                  </Text>
                  <Text style={{ fontSize: 8, color: COLORS.text }}>
                    {shipping.voyage ?? "-"}
                  </Text>
                </View>
                <View style={{ flexDirection: "row" }}>
                  <Text
                    style={{
                      fontSize: 7,
                      color: COLORS.label,
                      width: "35%",
                    }}
                  >
                    Ship Date:
                  </Text>
                  <Text style={{ fontSize: 8, color: COLORS.text }}>
                    {formatPdfDate(shipping.ship_date)}
                  </Text>
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", marginBottom: 3 }}>
                  <Text
                    style={{
                      fontSize: 7,
                      color: COLORS.label,
                      width: "25%",
                    }}
                  >
                    ETD:
                  </Text>
                  <Text style={{ fontSize: 8, color: COLORS.text }}>
                    {formatPdfDate(shipping.etd)}
                  </Text>
                </View>
                <View style={{ flexDirection: "row" }}>
                  <Text
                    style={{
                      fontSize: 7,
                      color: COLORS.label,
                      width: "25%",
                    }}
                  >
                    ETA:
                  </Text>
                  <Text style={{ fontSize: 8, color: COLORS.text }}>
                    {formatPdfDate(shipping.eta)}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        <PDFTable columns={COLUMNS} data={tableData} totalRow={totalRow} />

        {/* Weight Summary */}
        <View
          style={{
            flexDirection: "row",
            marginTop: 10,
            borderWidth: 1,
            borderColor: COLORS.border,
            borderRadius: 2,
          }}
          wrap={false}
        >
          {[
            {
              label: "GROSS WEIGHT",
              value: formatPdfWeight(shipping.gross_weight),
            },
            {
              label: "NET WEIGHT",
              value: formatPdfWeight(shipping.net_weight),
            },
            {
              label: "PACKAGES",
              value:
                shipping.package_no != null
                  ? `${formatPdfNumber(shipping.package_no, 0)} PKG`
                  : "-",
            },
          ].map((item, i, arr) => (
            <View
              key={item.label}
              style={{
                flex: 1,
                padding: 8,
                borderRightWidth: i < arr.length - 1 ? 1 : 0,
                borderRightColor: COLORS.border,
              }}
            >
              <Text
                style={{
                  fontSize: 7,
                  fontFamily: "Helvetica-Bold",
                  color: COLORS.label,
                  marginBottom: 3,
                }}
              >
                {item.label}
              </Text>
              <Text
                style={{
                  fontSize: 9,
                  fontFamily: "Helvetica-Bold",
                  color: COLORS.text,
                }}
              >
                {item.value}
              </Text>
            </View>
          ))}
        </View>

        {/* Signature Block */}
        <View
          style={{
            marginTop: 24,
            flexDirection: "row",
            justifyContent: "flex-end",
          }}
          wrap={false}
        >
          <View style={{ width: "40%", alignItems: "center" }}>
            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: COLORS.text,
                paddingTop: 6,
                width: "100%",
                alignItems: "center",
              }}
            >
              <Text
                style={{ fontSize: 8, color: COLORS.label }}
              >
                Authorized Signature
              </Text>
              <Text
                style={{
                  fontSize: 8,
                  fontFamily: "Helvetica-Bold",
                  color: COLORS.text,
                  marginTop: 3,
                }}
              >
                GV International Co., Ltd.
              </Text>
            </View>
          </View>
        </View>

        <PDFFooter />
      </Page>
    </Document>
  );
}
