# Phase 9: PDF Generation - Frontend Developer Notes (Updated)

**Date:** 2026-03-06
**Status:** Brainstorming - Implementation-Ready Analysis
**Based on:** PDF_RESEARCH_RESULT.md conclusions (All-English, Helvetica, Client-side only)

---

## 1. @react-pdf/renderer API Reference

### 1.1 Core Imports

```tsx
import {
  Document, Page, View, Text, Image,
  StyleSheet, Font, pdf
} from "@react-pdf/renderer";
```

| Component | Role | Notes |
|-----------|------|-------|
| `Document` | Root wrapper | Must contain only `<Page>` children |
| `Page` | Physical page | `size="A4"`, `orientation="portrait"`, `style` |
| `View` | Div equivalent | Yoga flexbox layout, supports `wrap`, `break`, `fixed` |
| `Text` | Text rendering | No nested `<View>` allowed, supports `render` callback |
| `Image` | Image embed | `src`: URL string, Buffer, or base64 data URI |
| `StyleSheet` | Style factory | `StyleSheet.create({...})`, camelCase CSS, flexbox-based |
| `Font` | Font registry | `Font.register()`, `Font.registerHyphenationCallback()` |
| `pdf()` | Generation API | `pdf(<Doc/>).toBlob()` (browser), `.toBuffer()` (Node) |

### 1.2 pdf() Function Signature

```tsx
// Browser usage (our case)
const blob: Blob = await pdf(<PODocument data={po} />).toBlob();

// Node usage (not available in CF Workers due to WASM)
const buffer: Buffer = await pdf(<PODocument data={po} />).toBuffer();
const str: string = await pdf(<PODocument data={po} />).toString();
```

### 1.3 StyleSheet.create Pattern

```tsx
const styles = StyleSheet.create({
  page: {
    padding: 40,            // points (1pt = 1/72 inch)
    fontFamily: "Helvetica", // Built-in, no registration needed
    fontSize: 9,
    color: "#333333",
  },
  bold: {
    fontFamily: "Helvetica-Bold", // Built-in bold variant
  },
});
```

**Built-in Helvetica family variants:**
- `Helvetica` (Regular)
- `Helvetica-Bold`
- `Helvetica-Oblique`
- `Helvetica-BoldOblique`

No `Font.register()` needed for Helvetica. Zero configuration.

### 1.4 Font.register (Not needed for All-English, kept for reference)

```tsx
// Single weight
Font.register({ family: "Inter", src: "/fonts/Inter-Regular.ttf" });

// Multiple weights
Font.register({
  family: "NotoSansKR",
  fonts: [
    { src: "/fonts/NotoSansKR-Regular.ttf", fontWeight: 400 },
    { src: "/fonts/NotoSansKR-Bold.ttf", fontWeight: 700 },
  ],
});

// Disable hyphenation for CJK
Font.registerHyphenationCallback((word: string) => [word]);
```

**Critical:** Variable fonts (.woff2 variable) do NOT work with react-pdf. Must use static TTF.

### 1.5 Image Source Types

```tsx
// URL (public static asset - recommended)
<Image src="/images/company-logo.png" style={{ width: 120, height: 40 }} />

// Base64 data URI
<Image src="data:image/png;base64,iVBOR..." />

// Note: Supabase Storage signed URLs may have CORS issues.
// Use public/images/ for logos.
```

### 1.6 Page Control Props

```tsx
// Wrap: controls automatic page breaking (default: true)
<View wrap={false}>  {/* Keep this View on one page */}

// Break: force page break before this element
<View break>  {/* Start on a new page */}

// Fixed: repeat on every page (headers/footers)
<View fixed style={styles.footer}>

// minPresenceAhead: minimum space needed below before breaking
<View minPresenceAhead={50}>  {/* Need at least 50pt below */}

// Page number via render callback
<Text render={({ pageNumber, totalPages }) =>
  `Page ${pageNumber} of ${totalPages}`
} fixed />
```

### 1.7 Conditional Rendering

```tsx
// Null/undefined fields
{data.ref_no && (
  <View style={styles.infoRow}>
    <Text style={styles.label}>Ref No:</Text>
    <Text style={styles.value}>{data.ref_no}</Text>
  </View>
)}

// Optional sections
{data.notes ? (
  <View style={styles.notes}>
    <Text>{data.notes}</Text>
  </View>
) : null}
```

---

## 2. PDFDownloadButton Component Design

### 2.1 Architecture: Dynamic Import Strategy

Following ContentEditor's React.lazy() pattern from `content-section.tsx`:

```tsx
// content-section.tsx pattern (existing):
const ContentEditor = React.lazy(() =>
  import("./content-editor").then((m) => ({ default: m.ContentEditor }))
);
```

For PDF, the dynamic import happens at function call time (not component level):

```tsx
// pdf-download-button.tsx
async function handleDownload() {
  setIsGenerating(true);
  try {
    // Dynamic import - only loads ~900KB chunk on first click
    const { pdf } = await import("@react-pdf/renderer");
    const { PODocument } = await import("~/components/pdf/po-document");

    const blob = await pdf(<PODocument data={data} />).toBlob();
    triggerDownload(blob, filename);
    toast.success("PDF가 다운로드되었습니다.");
  } catch (err) {
    console.error("PDF generation failed:", err);
    toast.error("PDF 생성에 실패했습니다.");
  } finally {
    setIsGenerating(false);
  }
}
```

### 2.2 SSR Compatibility

React.lazy() itself is sufficient for SSR compatibility:
- `pdf()` is only called inside a click handler (browser only)
- No `typeof window` check needed if using dynamic `import()` inside the handler
- The PDF component files are never imported at module scope in routes
- CF Workers SSR will never attempt to load react-pdf code

### 2.3 Download Trigger Utility

```tsx
function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Schedule cleanup to allow download to start
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

### 2.4 Component Interface

```tsx
interface PDFDownloadButtonProps {
  // Async factory: returns { default: ReactElement } or JSX.Element for pdf()
  generatePDF: () => Promise<Blob>;
  filename: string;
  label?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "icon";
  className?: string;
}
```

### 2.5 Loading & Error States

| State | UI | Duration |
|-------|-----|----------|
| Idle | `<Download /> PDF 다운로드` | - |
| Loading (first click) | `<Loader2 animate-spin /> 생성 중...` | 700-2000ms (chunk + generate) |
| Loading (cached) | `<Loader2 animate-spin /> 생성 중...` | 200-800ms (generate only) |
| Success | toast.success("PDF가 다운로드되었습니다.") | - |
| Error | toast.error("PDF 생성에 실패했습니다.") | - |

### 2.6 Single vs Multi-Document Button

**Single document (PO, PI, Customs):**
```tsx
<PDFDownloadButton
  generatePDF={async () => {
    const { pdf } = await import("@react-pdf/renderer");
    const { PODocument } = await import("~/components/pdf/po-document");
    return pdf(<PODocument data={po} />).toBlob();
  }}
  filename={`PO_${po.po_no}_${pdfDateFile(po.po_date)}.pdf`}
/>
```

**Multi-document (Shipping: CI/PL/SL):**
```tsx
<PDFDownloadDropdown
  items={[
    {
      label: "Commercial Invoice (CI)",
      generatePDF: async () => { ... },
      filename: `CI_${shipping.ci_no}_${pdfDateFile(shipping.ci_date)}.pdf`,
    },
    {
      label: "Packing List (PL)",
      generatePDF: async () => { ... },
      filename: `PL_${shipping.pl_no}_${pdfDateFile(shipping.ci_date)}.pdf`,
    },
    {
      label: "Stuffing List (SL)",
      generatePDF: async () => { ... },
      filename: `SL_${stuffing.sl_no}_${stuffing.cntr_no}.pdf`,
      // One per container - may need sub-menu or generate all
    },
  ]}
/>
```

For Shipping page, SL is per-container. Options:
- **Option A (recommended):** "SL 전체 다운로드" generates one combined SL PDF with all containers (each container starts on a new page with `break`)
- **Option B:** Sub-dropdown per container (complex UI for potentially 1-3 containers)

---

## 3. Six Document Template Layouts (A4 Portrait)

All documents use A4 Portrait (595.28 x 841.89 pt), padding 40pt.

### 3.1 PO Document - Purchase Order

```
+----------------------------------------------------------+
|  [Logo]                           PURCHASE ORDER          |
|                                   No: PO-2601-001         |
|                                   Date: Mar 15, 2026      |
+----------------------------------------------------------+
|  SUPPLIER                    |  BUYER                     |
|  CHP Co., Ltd.               |  Saelim Co., Ltd.         |
|  123 Industrial Road         |  456 Business Ave          |
|  Taipei, Taiwan              |  Seoul, Korea              |
+----------------------------------------------------------+
|  Payment: T/T 30 days   |  Delivery: CIF               |
|  Loading: Keelung       |  Discharge: Busan             |
+----------------------------------------------------------+
| No | Product      | GSM | Width | Qty(KG) | Price | Amt  |
|----|--------------|-----|-------|---------|-------|------|
|  1 | Glassine Ppr |  40 |   780 |  12,000 | 1.20  | 14,400|
|  2 | Glassine Ppr |  60 |   620 |   8,000 | 1.35  | 10,800|
|                                    TOTAL    USD 25,200.00 |
+----------------------------------------------------------+
|  Validity: Apr 15, 2026                                   |
|  Ref: REF-001                                             |
+----------------------------------------------------------+
|  GV International Co., Ltd.            Page 1 / 1         |
+----------------------------------------------------------+
```

**Data source:** `POWithOrgs` from loaderData
**Columns:** No(6%) | Product(24%) | GSM(10%) | Width(12%) | Qty(14%) | Price(14%) | Amount(20%)

### 3.2 PI Document - Proforma Invoice

Nearly identical to PO with these differences:
- Title: "PROFORMA INVOICE"
- Document fields: PI No, PI Date (instead of PO No, PO Date)
- Additional field: PO Reference (`po.po_no` if linked)
- Info block shows `Ref: PO-2601-001` when `po_id` exists

**Data source:** `PIWithOrgs` from loaderData

### 3.3 CI Document - Commercial Invoice

```
+----------------------------------------------------------+
|  [Logo]                       COMMERCIAL INVOICE          |
|                               No: CI-2601-001             |
|                               Date: Mar 20, 2026          |
+----------------------------------------------------------+
|  SHIPPER                     |  CONSIGNEE                 |
|  CHP Co., Ltd.               |  GV International Co.      |
|  123 Industrial Road         |  789 Trade Blvd             |
|  Taipei, Taiwan              |  Seoul, Korea               |
+----------------------------------------------------------+
|  Vessel: Ever Given          |  Voyage: V.025E             |
|  Ship Date: Mar 18, 2026    |  ETD: Mar 19, 2026         |
|  ETA: Mar 25, 2026          |                             |
+----------------------------------------------------------+
|  Payment: T/T 30 days       |  Delivery: CIF              |
|  Loading: Keelung           |  Discharge: Busan           |
+----------------------------------------------------------+
| No | Product      | GSM | Width | Qty(KG) | Price | Amt  |
|----|--------------|-----|-------|---------|-------|------|
|  1 | Glassine Ppr |  40 |   780 |  12,000 | 1.20  |14,400|
|                                    TOTAL    USD 25,200.00 |
+----------------------------------------------------------+
|  Gross Weight: 12,500.000 KG                              |
|  Net Weight:   12,000.000 KG                              |
|  Package: 24 Rolls                                        |
+----------------------------------------------------------+
|  Authorized Signature: ___________________                |
|                                                           |
|  GV International Co., Ltd.            Page 1 / 1         |
+----------------------------------------------------------+
```

**Data source:** `ShippingWithOrgs` from loaderData
**Additional sections vs PO:** Shipping info, Weight summary, Signature block

### 3.4 PL Document - Packing List

Identical to CI **except**:
- Title: "PACKING LIST"
- Document No: PL No
- Table columns: **No price columns** (Unit Price, Amount removed)
- Columns: No(8%) | Product(28%) | GSM(12%) | Width(14%) | Qty(18%) | Remarks(20%)
- Weight summary remains

### 3.5 SL Document - Stuffing List

```
+----------------------------------------------------------+
|  [Logo]                         STUFFING LIST             |
|                                 No: SL-001                |
+----------------------------------------------------------+
|  Container No: CNTR12345      Seal No: SEAL789            |
|  Roll Range: 1-24                                         |
+----------------------------------------------------------+
| Roll | Product      | GSM | Width | Length | Net Wt | GrossWt|
|------|--------------|-----|-------|--------|--------|--------|
|    1 | Glassine Ppr |  40 |   780 |  3,200 |  500.0 |  510.5 |
|    2 | Glassine Ppr |  40 |   780 |  3,150 |  495.0 |  505.3 |
|  ... | ...          | ... |   ... |    ... |    ... |    ... |
|   24 | Glassine Ppr |  40 |   780 |  3,180 |  498.0 |  508.2 |
|                TOTAL: 24 rolls  | 12,000  | 12,250 |
+----------------------------------------------------------+
|  GV International Co., Ltd.            Page 1 / 3         |
+----------------------------------------------------------+
```

**Data source:** `StuffingList` + `StuffingRollDetail[]` from `ShippingWithOrgs.stuffing_lists`
**Columns:** Roll(7%) | Product(20%) | GSM(9%) | Width(10%) | Length(14%) | Net(16%) | Gross(16%) | (padding 8%)
**Pagination:** 50-200+ rows possible. `wrap` prop on table container handles automatic page breaks. Each container starts with `break` prop for new page.

### 3.6 Invoice Document - Cost Summary

```
+----------------------------------------------------------+
|                    CUSTOMS CLEARANCE INVOICE               |
|                    No: C-2601-001                          |
|                    Date: Mar 30, 2026                      |
+----------------------------------------------------------+
|  Reference:                                                |
|  CI No: CI-2601-001  |  Vessel: Ever Given                |
|  ETA: Mar 25, 2026   |  Voyage: V.025E                   |
+----------------------------------------------------------+
|  Category        |  Supply Amount  |  VAT    |  Total     |
|------------------|----------------|---------|------------|
|  Transport Fee   |      500,000   |  50,000 |    550,000 |
|  Customs Duty    |    1,200,000   |       0 |  1,200,000 |
|  VAT (Import)    |            0   | 120,000 |    120,000 |
|  Others          |      100,000   |  10,000 |    110,000 |
|  (Handling fee)  |                |         |            |
|------------------|----------------|---------|------------|
|  GRAND TOTAL     |    1,800,000   | 180,000 |  1,980,000 |
+----------------------------------------------------------+
|  Payment Status: Paid / Unpaid                            |
+----------------------------------------------------------+
|  GV International Co., Ltd.            Page 1 / 1         |
+----------------------------------------------------------+
```

**Data source:** `CustomsDetail` from loaderData
**Currency:** KRW (no decimal, comma-separated)
**Note:** etc_desc shown in parentheses below "Others" row if present

---

## 4. Shared PDF Components

### 4.1 File Structure

```
app/components/pdf/
  shared/
    pdf-styles.ts           # Common StyleSheet (Helvetica, A4 margins, typography)
    pdf-header.tsx          # Document header (logo + title + doc no + date)
    pdf-footer.tsx          # Page number footer (fixed, repeats every page)
    pdf-parties.tsx         # Two-column party info (Supplier/Buyer or Shipper/Consignee)
    pdf-terms.tsx           # Payment/Delivery terms row
    pdf-table.tsx           # Generic table (Column[] + data[] + totalRow?)
    pdf-utils.ts            # formatPdfCurrency, formatPdfDate, formatPdfWeight, formatPdfDateFile
  po-document.tsx           # PO template
  pi-document.tsx           # PI template (extends PO pattern)
  ci-document.tsx           # CI template
  pl-document.tsx           # PL template (CI without prices)
  sl-document.tsx           # SL template (roll details, multi-container)
  invoice-document.tsx      # Cost invoice template
  pdf-download-button.tsx   # Single-doc download button
  pdf-download-dropdown.tsx # Multi-doc download dropdown (Shipping)
```

### 4.2 pdf-styles.ts

```tsx
import { StyleSheet } from "@react-pdf/renderer";

// A4: 595.28 x 841.89 pt
// Padding 40pt each side = usable width ~515pt

export const colors = {
  black: "#333333",
  gray: "#666666",
  lightGray: "#999999",
  border: "#333333",
  borderLight: "#cccccc",
  headerBg: "#e8e8e8",
  totalBg: "#f5f5f5",
} as const;

export const commonStyles = StyleSheet.create({
  page: {
    padding: 40,
    paddingBottom: 60, // Space for footer
    fontFamily: "Helvetica",
    fontSize: 9,
    color: colors.black,
  },

  // Document title
  docTitle: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
    marginBottom: 2,
  },
  docNo: {
    fontSize: 10,
    color: colors.gray,
    textAlign: "right",
    marginBottom: 2,
  },
  docDate: {
    fontSize: 9,
    color: colors.gray,
    textAlign: "right",
  },

  // Section title
  sectionTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginTop: 12,
    marginBottom: 4,
    color: colors.black,
  },

  // Two-column layout
  row: {
    flexDirection: "row" as const,
    marginBottom: 2,
  },
  col2: {
    flex: 1,
  },

  // Info key-value pair
  infoLabel: {
    width: 100,
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: colors.gray,
  },
  infoValue: {
    flex: 1,
    fontSize: 9,
  },

  // Divider
  divider: {
    borderBottomWidth: 1,
    borderColor: colors.border,
    marginVertical: 8,
  },
  dividerLight: {
    borderBottomWidth: 0.5,
    borderColor: colors.borderLight,
    marginVertical: 6,
  },
});
```

### 4.3 pdf-header.tsx

```tsx
import { View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { colors } from "./pdf-styles";

const s = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderColor: colors.border,
  },
  logoContainer: {
    width: 140,
  },
  logo: {
    width: 120,
    height: 40,
  },
  titleBlock: {
    textAlign: "right",
    alignItems: "flex-end",
  },
  title: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  docNo: {
    fontSize: 10,
    color: colors.gray,
    marginBottom: 1,
  },
  docDate: {
    fontSize: 9,
    color: colors.gray,
  },
});

interface PDFHeaderProps {
  title: string;       // "PURCHASE ORDER", "COMMERCIAL INVOICE"
  docNo: string;       // "PO-2601-001"
  date?: string;       // Formatted date string "Mar 15, 2026"
  logoSrc?: string;    // "/images/gv-logo.png"
}

export function PDFHeader({ title, docNo, date, logoSrc }: PDFHeaderProps) {
  return (
    <View style={s.container}>
      <View style={s.logoContainer}>
        {logoSrc && <Image src={logoSrc} style={s.logo} />}
      </View>
      <View style={s.titleBlock}>
        <Text style={s.title}>{title}</Text>
        <Text style={s.docNo}>No: {docNo}</Text>
        {date && <Text style={s.docDate}>Date: {date}</Text>}
      </View>
    </View>
  );
}
```

### 4.4 pdf-footer.tsx

```tsx
import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { colors } from "./pdf-styles";

const s = StyleSheet.create({
  footer: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: colors.lightGray,
    borderTopWidth: 0.5,
    borderColor: colors.borderLight,
    paddingTop: 4,
  },
});

interface PDFFooterProps {
  companyName?: string;
}

export function PDFFooter({ companyName = "GV International Co., Ltd." }: PDFFooterProps) {
  return (
    <View style={s.footer} fixed>
      <Text>{companyName}</Text>
      <Text
        render={({ pageNumber, totalPages }) =>
          `Page ${pageNumber} / ${totalPages}`
        }
      />
    </View>
  );
}
```

### 4.5 pdf-parties.tsx

```tsx
import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { colors } from "./pdf-styles";

const s = StyleSheet.create({
  container: {
    flexDirection: "row",
    marginBottom: 12,
    gap: 20,
  },
  partyBlock: {
    flex: 1,
  },
  partyTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: colors.gray,
    marginBottom: 3,
    textTransform: "uppercase",
  },
  partyName: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  partyAddress: {
    fontSize: 8,
    color: colors.gray,
    lineHeight: 1.4,
  },
});

interface Party {
  label: string;       // "Supplier", "Buyer", "Shipper", "Consignee"
  name: string;
  address?: string | null;
}

interface PDFPartiesProps {
  left: Party;
  right: Party;
}

export function PDFParties({ left, right }: PDFPartiesProps) {
  return (
    <View style={s.container}>
      <View style={s.partyBlock}>
        <Text style={s.partyTitle}>{left.label}</Text>
        <Text style={s.partyName}>{left.name}</Text>
        {left.address && <Text style={s.partyAddress}>{left.address}</Text>}
      </View>
      <View style={s.partyBlock}>
        <Text style={s.partyTitle}>{right.label}</Text>
        <Text style={s.partyName}>{right.name}</Text>
        {right.address && <Text style={s.partyAddress}>{right.address}</Text>}
      </View>
    </View>
  );
}
```

### 4.6 pdf-terms.tsx

```tsx
import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { colors } from "./pdf-styles";

const s = StyleSheet.create({
  container: {
    flexDirection: "row",
    marginBottom: 12,
    borderWidth: 0.5,
    borderColor: colors.borderLight,
  },
  term: {
    flex: 1,
    padding: 6,
    borderRightWidth: 0.5,
    borderColor: colors.borderLight,
  },
  termLast: {
    flex: 1,
    padding: 6,
  },
  label: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: colors.gray,
    marginBottom: 2,
  },
  value: {
    fontSize: 9,
  },
});

interface PDFTermsProps {
  paymentTerm?: string | null;
  deliveryTerm?: string | null;
  loadingPort?: string | null;
  dischargePort?: string | null;
}

export function PDFTerms({ paymentTerm, deliveryTerm, loadingPort, dischargePort }: PDFTermsProps) {
  const terms = [
    { label: "Payment", value: paymentTerm },
    { label: "Delivery", value: deliveryTerm },
    { label: "Loading Port", value: loadingPort },
    { label: "Discharge Port", value: dischargePort },
  ].filter((t) => t.value);

  if (terms.length === 0) return null;

  return (
    <View style={s.container}>
      {terms.map((term, i) => (
        <View key={term.label} style={i === terms.length - 1 ? s.termLast : s.term}>
          <Text style={s.label}>{term.label}</Text>
          <Text style={s.value}>{term.value}</Text>
        </View>
      ))}
    </View>
  );
}
```

### 4.7 pdf-table.tsx

```tsx
import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { colors } from "./pdf-styles";

const s = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    backgroundColor: colors.headerBg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    minHeight: 22,
    alignItems: "center",
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderColor: colors.borderLight,
    minHeight: 18,
    alignItems: "center",
  },
  totalRow: {
    flexDirection: "row",
    borderTopWidth: 1.5,
    borderBottomWidth: 1,
    borderColor: colors.border,
    minHeight: 24,
    alignItems: "center",
    backgroundColor: colors.totalBg,
  },
  cell: {
    paddingHorizontal: 4,
    paddingVertical: 3,
    fontSize: 8,
  },
  headerCell: {
    paddingHorizontal: 4,
    paddingVertical: 3,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
  },
});

export interface PDFColumn {
  key: string;
  label: string;
  width: string;       // percentage: "20%"
  align?: "left" | "center" | "right";
}

interface PDFTableProps {
  columns: PDFColumn[];
  data: Record<string, string | number>[];
  totalRow?: Record<string, string>;
}

export function PDFTable({ columns, data, totalRow }: PDFTableProps) {
  return (
    <View wrap>
      {/* Header */}
      <View style={s.headerRow} fixed>
        {columns.map((col) => (
          <Text
            key={col.key}
            style={[
              s.headerCell,
              { width: col.width, textAlign: col.align ?? "left" },
            ]}
          >
            {col.label}
          </Text>
        ))}
      </View>

      {/* Data rows */}
      {data.map((row, i) => (
        <View style={s.row} key={i} wrap={false}>
          {columns.map((col) => (
            <Text
              key={col.key}
              style={[
                s.cell,
                { width: col.width, textAlign: col.align ?? "left" },
              ]}
            >
              {String(row[col.key] ?? "")}
            </Text>
          ))}
        </View>
      ))}

      {/* Total row */}
      {totalRow && (
        <View style={s.totalRow} wrap={false}>
          {columns.map((col) => (
            <Text
              key={col.key}
              style={[
                s.headerCell,
                { width: col.width, textAlign: col.align ?? "left" },
              ]}
            >
              {totalRow[col.key] ?? ""}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}
```

**Key detail:** Header row uses `fixed` prop to repeat on every page when table spans multiple pages (important for SL with 200+ rows).

### 4.8 pdf-utils.ts

```tsx
/**
 * Format currency amount for PDF display.
 * USD: "USD 25,200.00"
 * KRW: "KRW 1,200,000"
 */
export function formatPdfCurrency(amount: number | null | undefined, currency = "USD"): string {
  if (amount == null) return "-";
  const isKRW = currency === "KRW";
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: isKRW ? 0 : 2,
    maximumFractionDigits: isKRW ? 0 : 2,
  }).format(amount);
  return `${currency} ${formatted}`;
}

/**
 * Format number without currency prefix.
 * Used for quantity, unit price columns.
 */
export function formatPdfNumber(
  value: number | null | undefined,
  decimals = 2
): string {
  if (value == null) return "-";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format date for PDF display.
 * "2026-03-15" -> "Mar 15, 2026"
 */
export function formatPdfDate(date: string | null | undefined): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

/**
 * Format date for filename.
 * "2026-03-15" -> "20260315"
 */
export function formatPdfDateFile(date: string | null | undefined): string {
  if (!date) return "undated";
  return date.replace(/-/g, "");
}

/**
 * Format weight for PDF display.
 * 12500.5 -> "12,500.500 KG"
 */
export function formatPdfWeight(kg: number | null | undefined): string {
  if (kg == null) return "-";
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(kg)} KG`;
}
```

---

## 5. Detail Page Integration UX

### 5.1 Current Header Structure (from actual code)

**PO detail page header:**
```tsx
<Header title={po.po_no} backTo="/po">
  <div className="flex items-center gap-2">
    <DocStatusBadge status={optimisticStatus} />
    <Button variant="outline" size="sm" onClick={handleToggle}>완료 처리</Button>
    <DropdownMenu>
      {/* 수정 / 복제 / PI 작성 / 삭제 */}
    </DropdownMenu>
  </div>
</Header>
```

### 5.2 PDF Button Placement Decision

**Recommendation: Option A - DropdownMenu item**

Rationale:
- PDF download is a secondary action (not used every visit)
- Adding a standalone button crowds the header (already has: badge + toggle + dropdown)
- Consistent placement across PO/PI/Customs detail pages
- Mobile-friendly (dropdown already handles responsive layout)

```tsx
<DropdownMenuContent align="end">
  <DropdownMenuItem asChild>
    <Link to={`/po/${po.id}/edit`}>
      <Pencil className="mr-2 h-4 w-4" />
      수정
    </Link>
  </DropdownMenuItem>
  {/* NEW: PDF Download */}
  <DropdownMenuItem onClick={handlePDFDownload} disabled={isPDFGenerating}>
    {isPDFGenerating ? (
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
    ) : (
      <Download className="mr-2 h-4 w-4" />
    )}
    PDF 다운로드
  </DropdownMenuItem>
  <DropdownMenuItem onClick={handleClone}>
    <Copy className="mr-2 h-4 w-4" />
    복제
  </DropdownMenuItem>
  {/* ... rest */}
</DropdownMenuContent>
```

**Shipping page (3 documents):**

```tsx
<DropdownMenuContent align="end">
  <DropdownMenuItem asChild>
    <Link to={`/shipping/${shipping.id}/edit`}>
      <Pencil className="mr-2 h-4 w-4" />
      수정
    </Link>
  </DropdownMenuItem>
  <DropdownMenuSeparator />
  <DropdownMenuItem onClick={() => handlePDF("ci")} disabled={isPDFGenerating}>
    <Download className="mr-2 h-4 w-4" />
    CI 다운로드
  </DropdownMenuItem>
  <DropdownMenuItem onClick={() => handlePDF("pl")} disabled={isPDFGenerating}>
    <Download className="mr-2 h-4 w-4" />
    PL 다운로드
  </DropdownMenuItem>
  {(shipping.stuffing_lists?.length ?? 0) > 0 && (
    <DropdownMenuItem onClick={() => handlePDF("sl")} disabled={isPDFGenerating}>
      <Download className="mr-2 h-4 w-4" />
      SL 다운로드
    </DropdownMenuItem>
  )}
  <DropdownMenuSeparator />
  <DropdownMenuItem onClick={handleClone}>
    <Copy className="mr-2 h-4 w-4" />
    복제
  </DropdownMenuItem>
  {/* ... rest */}
</DropdownMenuContent>
```

### 5.3 Integration Pattern per Page

| Page | Route File | Data Variable | PDF Action |
|------|-----------|---------------|------------|
| PO Detail | `_layout.po.$id.tsx` | `po: POWithOrgs` | Single "PDF 다운로드" in dropdown |
| PI Detail | `_layout.pi.$id.tsx` | `pi: PIWithOrgs` | Single "PDF 다운로드" in dropdown |
| Shipping Detail | `_layout.shipping.$id.tsx` | `shipping: ShippingWithOrgs` | "CI 다운로드" / "PL 다운로드" / "SL 다운로드" in dropdown |
| Customs Detail | `_layout.customs.$id.tsx` | `customs: CustomsDetail` | Single "인보이스 다운로드" in dropdown |

### 5.4 handlePDFDownload Implementation in Detail Page

```tsx
// In PO detail page
const [isPDFGenerating, setIsPDFGenerating] = useState(false);

async function handlePDFDownload() {
  if (isPDFGenerating) return;
  setIsPDFGenerating(true);
  try {
    const [{ pdf }, { PODocument }] = await Promise.all([
      import("@react-pdf/renderer"),
      import("~/components/pdf/po-document"),
    ]);
    const blob = await pdf(<PODocument data={po} />).toBlob();
    triggerDownload(blob, `PO_${po.po_no}_${po.po_date.replace(/-/g, "")}.pdf`);
    toast.success("PDF가 다운로드되었습니다.");
  } catch (err) {
    console.error("PDF generation failed:", err);
    toast.error("PDF 생성에 실패했습니다.");
  } finally {
    setIsPDFGenerating(false);
  }
}
```

`triggerDownload` can be a shared utility in `pdf-utils.ts` (exported alongside format functions).

---

## 6. Mobile Considerations

### 6.1 PDF Download on Mobile

| Aspect | iOS Safari | Android Chrome | Notes |
|--------|-----------|---------------|-------|
| Blob download | Works | Works | `<a download>` triggers native save dialog |
| PDF viewer | Built-in | Built-in or Google Drive | OS handles opening |
| File naming | Respected | Respected | `a.download` attribute works |
| Memory | 1-2 page docs fine | Fine | SL with 200+ rows may need testing |
| Generation speed | 1-3s (first) | 1-3s (first) | Slower CPU than desktop |

### 6.2 Mobile UX

- PDF download button is inside DropdownMenu, which already works on mobile
- No separate mobile/desktop layout needed for the PDF feature
- Loading state (spinner in dropdown item) provides feedback on mobile
- Downloaded PDF opens in OS PDF viewer automatically
- Consider showing toast with slightly longer duration on mobile

### 6.3 Performance Concerns

- **react-pdf chunk size (~900KB gzip):** On 3G mobile, first download may take 3-5s
- **SL document with 200+ rows:** May cause brief UI freeze (main thread blocking)
- **Mitigation:** Loading indicator + toast feedback is sufficient. Web Worker for PDF generation is over-engineering for this use case
- **Memory:** Single A4 document = trivial. Even SL with 10 pages is fine on modern mobile devices (2GB+ RAM)

---

## 7. Implementation Checklist

### Phase 9-A: Foundation + PO/PI

1. [ ] `npm install @react-pdf/renderer`
2. [ ] Create `app/components/pdf/shared/pdf-styles.ts`
3. [ ] Create `app/components/pdf/shared/pdf-utils.ts` (format functions + triggerDownload)
4. [ ] Create `app/components/pdf/shared/pdf-header.tsx`
5. [ ] Create `app/components/pdf/shared/pdf-footer.tsx`
6. [ ] Create `app/components/pdf/shared/pdf-parties.tsx`
7. [ ] Create `app/components/pdf/shared/pdf-terms.tsx`
8. [ ] Create `app/components/pdf/shared/pdf-table.tsx`
9. [ ] Create `app/components/pdf/po-document.tsx`
10. [ ] Create `app/components/pdf/pi-document.tsx`
11. [ ] Add PDF download to `_layout.po.$id.tsx` dropdown
12. [ ] Add PDF download to `_layout.pi.$id.tsx` dropdown
13. [ ] Add `Download` icon import to affected routes (already in icons.tsx)
14. [ ] Prepare company logo in `public/images/gv-logo.png`
15. [ ] Test: PDF generation, file naming, Korean UI toast messages

### Phase 9-B: Shipping Documents (CI + PL + SL)

16. [ ] Create `app/components/pdf/ci-document.tsx`
17. [ ] Create `app/components/pdf/pl-document.tsx`
18. [ ] Create `app/components/pdf/sl-document.tsx`
19. [ ] Add CI/PL/SL downloads to `_layout.shipping.$id.tsx` dropdown
20. [ ] Test: SL pagination with 50+ rows, multi-container SL
21. [ ] Test: Page break behavior, fixed header row in tables

### Phase 9-C: Cost Invoice

22. [ ] Create `app/components/pdf/invoice-document.tsx`
23. [ ] Add download to `_layout.customs.$id.tsx` dropdown
24. [ ] Test: KRW formatting (no decimals), fee breakdown table
25. [ ] Full QA: all 6 document types, mobile + desktop

---

## 8. Key Architecture Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Library | @react-pdf/renderer v4.3.2 | React JSX model, active maintenance |
| Rendering | Client-side only (browser) | CF Workers WASM blocked |
| Font | Helvetica (built-in) | All-English PDF, zero config, 0KB |
| PDF Language | English only | Trade document standard, no CJK issues |
| Notes field | Excluded from PDF | Internal memo, may contain Korean |
| Table | Manual View/Text grid | Full control, no extra deps |
| Bundle | Dynamic import() in click handler | ~900KB loaded only on demand |
| Generation | `pdf().toBlob()` | Async, full loading/error control |
| Button placement | Inside existing DropdownMenu | Non-intrusive, consistent, mobile-friendly |
| Shipping multi-doc | Separate menu items (CI/PL/SL) | Clear intent, no sub-menus |
| SL multi-container | Combined PDF (page break per container) | Single download, simpler UX |
| File naming | `{TYPE}_{docNo}_{YYYYMMDD}.pdf` | Predictable, sortable |

---

## Sources
- [@react-pdf/renderer npm](https://www.npmjs.com/package/@react-pdf/renderer)
- [react-pdf Advanced (pdf function, BlobProvider)](https://react-pdf.org/advanced)
- [react-pdf GitHub](https://github.com/diegomura/react-pdf)
- [react-pdf Discussion: Generate without rendering #2352](https://github.com/diegomura/react-pdf/discussions/2352)
- [CF Workers WASM issue #2757](https://github.com/diegomura/react-pdf/issues/2757)
- [Korean font issues #806, #862, #2681, #3172](https://github.com/diegomura/react-pdf/issues/806)
