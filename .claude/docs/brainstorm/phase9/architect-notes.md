# Phase 9: PDF Generation - Architect Notes (v2)

**Updated:** 2026-03-06
**Scope:** Implementation-ready architecture for 6 PDF trade documents
**Decision:** @react-pdf/renderer v4.3.2, client-side only, All-English, Helvetica

---

## 1. Previous Analysis Summary (Retained)

See Section 1-5 of v1 for full options analysis. The decision stands:
- **Client-side @react-pdf/renderer** is the only approach that avoids CF Workers WASM restrictions while providing a React component model.
- **All-English PDF** eliminates Korean font issues entirely.
- **Helvetica** (react-pdf built-in) requires zero font configuration.
- **No new server routes** needed -- loaderData already contains all required data.

---

## 2. Component Architecture (Detailed Design)

### 2.1 File Structure

```
app/components/pdf/
  shared/
    pdf-styles.ts          # StyleSheet.create() - all shared styles
    pdf-header.tsx         # Logo + document title + doc number + date block
    pdf-footer.tsx         # Page number (render prop), company info
    pdf-table.tsx          # Generic table: header row + data rows (flex grid)
    pdf-parties.tsx        # Two-column: left party / right party
    pdf-terms.tsx          # Payment/delivery/port terms row
    pdf-utils.ts           # PDF-specific formatters (date as YYYY-MM-DD, currency, weight)
  po-document.tsx          # <Document> wrapper for PO
  pi-document.tsx          # <Document> wrapper for PI
  ci-document.tsx          # <Document> wrapper for CI
  pl-document.tsx          # <Document> wrapper for PL
  sl-document.tsx          # <Document> wrapper for SL
  invoice-document.tsx     # <Document> wrapper for Customs Invoice
  pdf-download-button.tsx  # Reusable download trigger with loading/error states
```

**Rationale for flat structure (no `templates/` subfolder):**
- Only 6 document files + 1 button + 6 shared files = 13 total.
- A `templates/` folder adds import depth without organizational benefit at this scale.
- Shared components under `shared/` is sufficient separation.
- Matches the existing `app/components/{domain}/` pattern where files sit flat.

### 2.2 Dependency Graph

```
pdf-download-button.tsx
  imports: pdf() from @react-pdf/renderer
  imports: one of [po|pi|ci|pl|sl|invoice]-document.tsx (via props callback)

po-document.tsx / pi-document.tsx
  imports: shared/pdf-header, pdf-parties, pdf-terms, pdf-table, pdf-footer, pdf-styles, pdf-utils

ci-document.tsx
  imports: shared/pdf-header, pdf-parties, pdf-terms, pdf-table, pdf-footer, pdf-styles, pdf-utils
  (adds shipping info section between parties and terms)

pl-document.tsx
  imports: shared/pdf-header, pdf-parties, pdf-terms, pdf-table, pdf-footer, pdf-styles, pdf-utils
  (same as CI but table columns exclude pricing, adds weight summary)

sl-document.tsx
  imports: shared/pdf-header, pdf-table, pdf-footer, pdf-styles, pdf-utils
  (NO pdf-parties or pdf-terms -- SL is container-focused, not trade-party focused)

invoice-document.tsx
  imports: shared/pdf-header, pdf-footer, pdf-styles, pdf-utils
  (NO pdf-parties, pdf-terms, or standard pdf-table -- uses custom fee table layout)
```

### 2.3 Shared Component Props Interfaces

```typescript
// === shared/pdf-header.tsx ===
interface PDFHeaderProps {
  title: string;          // "PURCHASE ORDER", "COMMERCIAL INVOICE", etc.
  docNo: string;          // po_no, ci_no, etc.
  date: string;           // ISO date string
  logoSrc?: string;       // optional company logo path
  subtitle?: string;      // e.g. "Ref: PI-2601-001" for CI
  extraFields?: Array<{ label: string; value: string }>;
  // e.g. [{ label: "Validity", value: "2026-02-15" }] for PO/PI
}

// === shared/pdf-parties.tsx ===
interface PartyInfo {
  label: string;          // "SELLER" / "BUYER" / "SHIPPER" / "CONSIGNEE"
  name: string;           // org.name_en
  address?: string;       // org.address_en (multiline)
}
interface PDFPartiesProps {
  left: PartyInfo;
  right: PartyInfo;
}

// === shared/pdf-terms.tsx ===
interface PDFTermsProps {
  paymentTerm?: string;   // "T/T 30 days"
  deliveryTerm?: string;  // "CIF"
  loadingPort?: string;   // "Keelung"
  dischargePort?: string; // "Busan"
}

// === shared/pdf-table.tsx ===
interface TableColumn {
  header: string;         // Column header text
  flex: number;           // Flex ratio (e.g. 3 for wide, 1 for narrow)
  align?: "left" | "center" | "right";
}
interface PDFTableProps {
  columns: TableColumn[];
  rows: Array<Record<string, string>>;
  // Each row is { [columnHeader]: renderedValue }
  // Keys must match column.header
  totalRow?: Record<string, string>;  // Optional total/summary row
}

// === shared/pdf-footer.tsx ===
interface PDFFooterProps {
  showSignature?: boolean;       // CI signature block
  signatureLabel?: string;       // "Authorized Signature"
  companyInfo?: string;          // Company contact line
}
// Page number is always rendered via react-pdf render prop:
// render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}

// === shared/pdf-utils.ts ===
// Pure functions, no react-pdf dependency:
// - formatPDFDate(date: string | null): string  -- "2026-01-15" format (ISO, not locale)
// - formatPDFCurrency(amount: number | null, currency: string): string
// - formatPDFWeight(kg: number | null): string
// - formatPDFNumber(value: number | null): string
```

**Design decision: pdf-utils.ts vs reusing lib/format.ts**

The existing `lib/format.ts` uses `Intl.NumberFormat` with locale-specific formatting (ko-KR dates, currency symbols). For PDF trade documents, we want:
- Dates as `YYYY-MM-DD` (ISO, not locale-dependent)
- Currency as `USD 1,234.56` (not `$1,234.56`)
- Consistent number formatting regardless of browser locale

Therefore, `pdf-utils.ts` provides PDF-specific formatters that produce deterministic output. This avoids coupling PDF output to browser locale settings.

### 2.4 Shared Styles Definition

```typescript
// shared/pdf-styles.ts
import { StyleSheet } from "@react-pdf/renderer";

// A4: 595.28 x 841.89 points
export const PAGE_MARGIN = { top: 40, bottom: 50, left: 40, right: 40 };

export const colors = {
  border: "#d4d4d8",    // zinc-300
  headerBg: "#f4f4f5",  // zinc-100
  text: "#18181b",      // zinc-900
  textMuted: "#71717a", // zinc-500
  accent: "#2563eb",    // blue-600 (for links/highlights)
};

export const styles = StyleSheet.create({
  page: {
    paddingTop: PAGE_MARGIN.top,
    paddingBottom: PAGE_MARGIN.bottom,
    paddingHorizontal: PAGE_MARGIN.left,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: colors.text,
    lineHeight: 1.4,
  },
  // Header
  headerTitle: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  headerDocNo: { fontSize: 10, color: colors.textMuted },
  // Parties
  partiesRow: { flexDirection: "row", marginVertical: 12 },
  partyBlock: { flex: 1 },
  partyLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: colors.textMuted, marginBottom: 4 },
  partyName: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  partyAddress: { fontSize: 8, color: colors.textMuted, lineHeight: 1.5 },
  // Terms
  termsRow: { flexDirection: "row", borderTopWidth: 0.5, borderColor: colors.border, paddingTop: 8, marginBottom: 12 },
  termItem: { flex: 1 },
  termLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: colors.textMuted, marginBottom: 2 },
  termValue: { fontSize: 9 },
  // Table
  tableHeader: { flexDirection: "row", backgroundColor: colors.headerBg, borderBottomWidth: 0.5, borderColor: colors.border, paddingVertical: 4 },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: colors.border, paddingVertical: 3, minHeight: 18 },
  tableCell: { paddingHorizontal: 4, fontSize: 8 },
  tableCellRight: { paddingHorizontal: 4, fontSize: 8, textAlign: "right" },
  tableCellBold: { paddingHorizontal: 4, fontSize: 8, fontFamily: "Helvetica-Bold" },
  // Total
  totalRow: { flexDirection: "row", borderTopWidth: 1, borderColor: colors.text, paddingTop: 6, marginTop: 4 },
  totalLabel: { fontFamily: "Helvetica-Bold", fontSize: 10 },
  totalAmount: { fontFamily: "Helvetica-Bold", fontSize: 10, textAlign: "right" },
  // Footer
  footer: { position: "absolute", bottom: 20, left: PAGE_MARGIN.left, right: PAGE_MARGIN.right },
  pageNumber: { fontSize: 8, textAlign: "center", color: colors.textMuted },
  // Signature
  signatureBlock: { marginTop: 40, width: 200 },
  signatureLine: { borderTopWidth: 0.5, borderColor: colors.text, marginTop: 40 },
  signatureLabel: { fontSize: 8, textAlign: "center", marginTop: 4, color: colors.textMuted },
});
```

---

## 3. Data Flow and Type Mapping

### 3.1 Decision: Direct Pass-Through (No DTO)

**Approach:** Pass existing loaderData types directly to PDF document components. No intermediate DTO layer.

**Rationale:**
- The existing types (`POWithOrgs`, `PIWithOrgs`, `ShippingWithOrgs`, `CustomsDetail`) already contain exactly the fields needed for PDF rendering.
- Adding a DTO layer would create a mapping function for each document type that simply copies fields -- pure boilerplate.
- The PDF components are presentation-only; they can handle null checks internally.
- If a field name change occurs in the DB type, TypeScript will flag the PDF component as a compile error, which is the desired behavior.

**Trade-off:** PDF components are coupled to DB-derived types. This is acceptable because:
1. The types are stable (Phase 2-7 are complete).
2. The coupling is read-only (PDF never writes back).
3. Type changes propagate naturally through TypeScript.

### 3.2 Per-Document Props

```typescript
// po-document.tsx
interface PODocumentProps {
  data: POWithOrgs;
}
// Fields used: po_no, po_date, validity, currency, amount, payment_term,
//   delivery_term, loading_port, discharge_port, details[], supplier, buyer

// pi-document.tsx
interface PIDocumentProps {
  data: PIWithOrgs;
}
// Same as PO plus: pi_no, pi_date, po (reference PO number)

// ci-document.tsx
interface CIDocumentProps {
  data: ShippingWithOrgs;
}
// Fields used: ci_no, ci_date, currency, amount, payment_term, delivery_term,
//   loading_port, discharge_port, vessel, voyage, ship_date, etd, eta,
//   details[], shipper, consignee, pi.pi_no, ref_no

// pl-document.tsx
interface PLDocumentProps {
  data: ShippingWithOrgs;
}
// Same source as CI. Table omits unit_price and amount columns.
// Adds: gross_weight, net_weight, package_no

// sl-document.tsx
interface SLDocumentProps {
  data: ShippingWithOrgs;
  stuffingList: StuffingList;  // Single container from shipping.stuffing_lists[]
}
// SL is per-container, so caller selects which StuffingList to render.
// Fields: sl_no, cntr_no, seal_no, roll_no_range, roll_details[]
// Parent ref: data.ci_no, data.pl_no

// invoice-document.tsx
interface InvoiceDocumentProps {
  data: CustomsDetail;
}
// Fields: customs_no, customs_date, fee_received,
//   transport_fee, customs_fee, vat_fee, etc_fee (each FeeBreakdown),
//   etc_desc, shipping.ci_no, shipping.vessel, shipping.eta
```

### 3.3 ShippingWithOrgs -> 3 Documents Pattern

The Shipping detail page has one data source (`ShippingWithOrgs`) that produces three PDF documents. The `pdf-download-button` on the Shipping page will receive a `documentType` prop to determine which template to render:

```
ShippingWithOrgs
  ├── CI: ci-document.tsx  (full data: items with pricing)
  ├── PL: pl-document.tsx  (full data: items without pricing, weight summary)
  └── SL: sl-document.tsx  (per-container: shipping.stuffing_lists[i])
           └── N containers = N separate PDF files
```

For SL, if there are multiple containers, each generates a separate PDF. The UI will show a sub-menu or list for each container's SL download.

---

## 4. Integration Strategy (PDF Button Placement)

### 4.1 Approach: Dropdown Menu Item + Separate Button

After analyzing all four detail pages, the integration strategy differs by page:

**PO Detail (`_layout.po.$id.tsx`):**
- Add `PDF 다운로드` as a new DropdownMenuItem in the existing action dropdown (MoreHorizontal menu).
- Position: After "PI 작성", before separator + delete.
- Icon: `Download` (already in icons.tsx).

**PI Detail (`_layout.pi.$id.tsx`):**
- Same pattern: DropdownMenuItem in the existing action dropdown.
- Position: After "선적서류 작성", before separator + delete.

**Shipping Detail (`_layout.shipping.$id.tsx`):**
- A single "PDF" DropdownMenuItem that opens a sub-dropdown or triggers a selection.
- **Better approach:** Three separate DropdownMenuItems: "CI 다운로드", "PL 다운로드", and for SL, either "SL 다운로드" (if 1 container) or a sub-menu listing containers.
- Position: After "통관 생성", before separator + delete.

**Customs Detail (`_layout.customs.$id.tsx`):**
- DropdownMenuItem: "인보이스 다운로드".
- Position: After "통관서류 수정", before separator + delete.

### 4.2 Why Dropdown Menu Items (Not Separate Buttons)

1. **Consistency:** All pages already have an action dropdown. PDF download is an action, not a navigation.
2. **Space:** The header already has status badge + toggle button + dropdown. Adding another visible button crowds the header, especially on mobile.
3. **Frequency:** PDF download is occasional (not every page visit), so it does not need primary button visibility.
4. **Precedent:** "PI 작성" and "통관 생성" are already dropdown items that trigger actions.

### 4.3 Lazy Loading Integration

The PDF document component and `@react-pdf/renderer` library should only load when the user clicks a PDF menu item. We do NOT lazy-load at the Suspense/component level in JSX (unlike Tiptap's ContentEditor which renders inline). Instead:

```typescript
// Inside the detail page component:
const [pdfLoading, setPdfLoading] = useState(false);

async function handleDownloadPDF() {
  setPdfLoading(true);
  try {
    // Dynamic import: loads @react-pdf/renderer + document component on first click
    const [{ pdf }, { PODocument }] = await Promise.all([
      import("@react-pdf/renderer"),
      import("~/components/pdf/po-document"),
    ]);
    const blob = await pdf(<PODocument data={po} />).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PO_${po.po_no}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("PDF generation failed:", err);
    toast.error("PDF 생성에 실패했습니다.");
  } finally {
    setPdfLoading(false);
  }
}
```

**Why this approach over React.lazy + Suspense:**
- The PDF is never rendered to the DOM (no visual component). It generates a blob and triggers download.
- `React.lazy` is for components that render in the tree. `pdf().toBlob()` is an imperative call.
- Dynamic `import()` achieves the same lazy-loading effect for imperative usage.
- Loading state is simpler: just a boolean flag shown on the menu item.

### 4.4 The `pdf-download-button.tsx` Role (Revised)

Instead of a standalone button component, this becomes a **utility function** or a **hook**:

```typescript
// pdf-download-button.tsx -> pdf-generate.ts (renamed to reflect purpose)

export type PDFDocumentType = "po" | "pi" | "ci" | "pl" | "sl" | "invoice";

export async function generateAndDownloadPDF(
  type: PDFDocumentType,
  data: unknown,
  filename: string
): Promise<void> {
  const { pdf } = await import("@react-pdf/renderer");

  // Dynamic import of the specific document component
  const documentImports: Record<PDFDocumentType, () => Promise<{ default: React.ComponentType<{ data: any }> }>> = {
    po: () => import("~/components/pdf/po-document"),
    pi: () => import("~/components/pdf/pi-document"),
    ci: () => import("~/components/pdf/ci-document"),
    pl: () => import("~/components/pdf/pl-document"),
    sl: () => import("~/components/pdf/sl-document"),
    invoice: () => import("~/components/pdf/invoice-document"),
  };

  const { default: DocumentComponent } = await documentImports[type]();
  const blob = await pdf(<DocumentComponent data={data} />).toBlob();

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

**Alternative: Keep as a hook for better state management:**

```typescript
// use-pdf-download.ts
export function usePDFDownload() {
  const [loading, setLoading] = useState(false);

  const download = useCallback(async (
    type: PDFDocumentType,
    data: unknown,
    filename: string
  ) => {
    setLoading(true);
    try {
      await generateAndDownloadPDF(type, data, filename);
    } catch (err) {
      toast.error("PDF 생성에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, download };
}
```

**Decision: Use the hook approach.** It encapsulates loading state, error handling, and toast feedback. Each detail page calls `const { loading, download } = usePDFDownload()` and passes `loading` to disable the menu item during generation.

---

## 5. Company Logo Strategy

### 5.1 Decision: `public/images/` Static Asset

Place the GV International logo at `public/images/gv-logo.png`.

**Rationale:**
- Trade documents always show the same company logo (GV International).
- Static assets in `public/` are served by Cloudflare CDN with optimal caching.
- react-pdf `<Image src="/images/gv-logo.png" />` works directly with public assets.
- No Supabase Storage complexity (signed URLs, expiration).

**Logo requirements:**
- Format: PNG with transparent background (react-pdf supports PNG and JPEG, not SVG).
- Size: ~200x60px at 150 DPI is sufficient for letterhead.
- File size: < 50KB.

**Fallback if no logo:** Render company name as text in bold (already in `pdf-header.tsx` design). The logo is optional -- `pdf-header` accepts `logoSrc?: string`.

### 5.2 Logo in react-pdf

```typescript
import { Image, View, Text } from "@react-pdf/renderer";

function PDFHeader({ title, docNo, date, logoSrc }: PDFHeaderProps) {
  return (
    <View style={styles.headerContainer}>
      <View style={styles.headerLeft}>
        {logoSrc ? (
          <Image src={logoSrc} style={{ width: 120, height: 40 }} />
        ) : (
          <Text style={styles.companyName}>GV INTERNATIONAL</Text>
        )}
      </View>
      <View style={styles.headerRight}>
        <Text style={styles.headerTitle}>{title}</Text>
        <Text style={styles.headerDocNo}>{docNo}</Text>
        <Text style={styles.headerDate}>{formatPDFDate(date)}</Text>
      </View>
    </View>
  );
}
```

**Note on react-pdf Image and public paths:**
In client-side rendering, `<Image src="/images/gv-logo.png" />` resolves relative to the page origin. react-pdf fetches images via `fetch()` internally, so this works as long as the image is accessible at that URL. For local development, Vite serves `public/` files at the root.

---

## 6. Footer, Page Numbers, Signatures

### 6.1 Page Numbers (All Documents)

```typescript
// shared/pdf-footer.tsx
import { View, Text } from "@react-pdf/renderer";

function PDFFooter({ showSignature, signatureLabel, companyInfo }: PDFFooterProps) {
  return (
    <>
      {/* Signature block (fixed position above footer) */}
      {showSignature && (
        <View style={styles.signatureBlock}>
          <View style={styles.signatureLine} />
          <Text style={styles.signatureLabel}>{signatureLabel || "Authorized Signature"}</Text>
        </View>
      )}

      {/* Fixed footer with page number */}
      <View style={styles.footer} fixed>
        {companyInfo && (
          <Text style={styles.companyInfoLine}>{companyInfo}</Text>
        )}
        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        />
      </View>
    </>
  );
}
```

The `fixed` prop on the footer View ensures it renders on every page.

### 6.2 Signature Block

- **CI only:** The Commercial Invoice is the primary legal document for customs. It typically includes a signature block at the bottom.
- **Other documents:** No signature block needed. PO/PI are internal; PL/SL are supplementary.

### 6.3 Company Address/Contact Footer

Optional, configurable per document:
- CI/PL: May include shipper's contact info in footer.
- PO/PI: May include buyer's reference.
- Default: Just page number.

---

## 7. Phase Split Strategy

### 7.1 Phase 9-A: Shared Infrastructure + PO + PI

**Scope:** Everything needed to generate the first PDF, then extend to the nearly-identical PI.

**Files created:**
1. `app/components/pdf/shared/pdf-styles.ts`
2. `app/components/pdf/shared/pdf-header.tsx`
3. `app/components/pdf/shared/pdf-footer.tsx`
4. `app/components/pdf/shared/pdf-table.tsx`
5. `app/components/pdf/shared/pdf-parties.tsx`
6. `app/components/pdf/shared/pdf-terms.tsx`
7. `app/components/pdf/shared/pdf-utils.ts`
8. `app/components/pdf/po-document.tsx`
9. `app/components/pdf/pi-document.tsx`
10. `app/hooks/use-pdf-download.ts`

**Files modified:**
11. `app/routes/_layout.po.$id.tsx` -- add PDF menu item + hook
12. `app/routes/_layout.pi.$id.tsx` -- add PDF menu item + hook
13. `app/components/ui/icons.tsx` -- verify Download icon export (already exists)

**Dependencies:** None (first phase).

**Validation criteria:**
- PO PDF downloads with correct layout, data, and filename.
- PI PDF is identical in structure with PI-specific header/fields.
- Dynamic import works: initial page load does NOT include @react-pdf/renderer in the bundle.
- Loading state shows spinner on menu item during generation.
- Error toast on failure.

### 7.2 Phase 9-B: CI + PL + SL (Shipping Documents)

**Scope:** Three documents from one data source. The main complexity is the SL per-container pattern.

**Files created:**
1. `app/components/pdf/ci-document.tsx`
2. `app/components/pdf/pl-document.tsx`
3. `app/components/pdf/sl-document.tsx`

**Files modified:**
4. `app/routes/_layout.shipping.$id.tsx` -- add CI/PL/SL PDF menu items
5. `app/components/pdf/shared/pdf-header.tsx` -- possible: add shipping info sub-section
6. `app/hooks/use-pdf-download.ts` -- add SL variant that accepts stuffingList param

**Dependencies:** Phase 9-A (shared components).

**Key implementation details:**

CI vs PL difference: Same data, different table columns.
```
CI table columns: Product | GSM | Width | Qty(KG) | Unit Price | Amount
PL table columns: Product | GSM | Width | Qty(KG) | Packages
PL adds: Weight Summary section (gross, net, package count)
```

SL per-container UI pattern:
```
Shipping detail dropdown:
  ├── CI 다운로드
  ├── PL 다운로드
  ├── (DropdownMenuSeparator)
  ├── SL: CNTR-001  ← one per stuffing list
  ├── SL: CNTR-002
  └── SL: CNTR-003
```

If no stuffing lists exist, the SL items are simply not shown.

### 7.3 Phase 9-C: Customs Invoice

**Scope:** Single document with unique layout (fee table, not line items table).

**Files created:**
1. `app/components/pdf/invoice-document.tsx`

**Files modified:**
2. `app/routes/_layout.customs.$id.tsx` -- add PDF menu item

**Dependencies:** Phase 9-A (shared components). Independent of 9-B.

**Key difference from other documents:**
- No `pdf-parties` (not a buyer/seller document).
- No `pdf-terms` (no trade terms).
- No standard `pdf-table` (fee structure is different from line items).
- Custom fee table: 4 rows x 4 columns (Category | Supply | VAT | Total).
- Reference section: linked shipping doc info (CI No, Vessel, ETA).
- Payment status badge: "PAID" / "UNPAID".

**Note:** Phase 9-C could be done in parallel with 9-B since they share only the Phase 9-A foundation.

---

## 8. File Naming Convention

```typescript
// PO/PI: {type}_{docNo}.pdf
`PO_${po.po_no}.pdf`                    // PO_GVPO2601-001.pdf
`PI_${pi.pi_no}.pdf`                    // PI_GVPI2601-001.pdf

// Shipping docs: {type}_{docNo}.pdf
`CI_${shipping.ci_no}.pdf`              // CI_GVCI2601-001.pdf
`PL_${shipping.pl_no}.pdf`              // PL_GVPL2601-001.pdf

// SL: includes container number for identification
`SL_${sl.sl_no || "SL"}_${sl.cntr_no || "UNKNOWN"}.pdf`  // SL_SL-001_CNTR12345.pdf

// Customs Invoice
`Invoice_${customs.customs_no || customs.id.slice(0,8)}.pdf`  // Invoice_C-2601-001.pdf
```

Simplified from v1 -- no date suffix. The document number already encodes the year-month. Adding dates creates unnecessarily long filenames.

---

## 9. SSR Guard

Since @react-pdf/renderer uses WASM (yoga-layout), it MUST NOT be imported on the server (CF Workers). The dynamic `import()` approach in `use-pdf-download.ts` naturally prevents this because:

1. The hook only runs in browser event handlers (onClick).
2. The `import()` is inside an async function triggered by user interaction.
3. Vite/Rollup will code-split the `@react-pdf/renderer` into a separate chunk.
4. The server bundle will never include this chunk.

**Additional safety:** If somehow imported during SSR, the `document.createElement("a")` call would fail before any WASM execution. But this scenario should not occur with the dynamic import pattern.

No `typeof window !== "undefined"` guard is needed because the import path is inherently client-only (event handler -> async import).

---

## 10. Trade-offs Summary

| Decision | Chosen | Alternative | Why |
|----------|--------|-------------|-----|
| Data mapping | Direct pass-through | DTO layer | Types are stable, DTO adds boilerplate |
| Button placement | Dropdown menu items | Separate header buttons | Consistent with existing pattern, saves space |
| Lazy loading | Dynamic import() in hook | React.lazy + Suspense | PDF is imperative (blob), not a rendered component |
| Logo source | public/ static asset | Supabase Storage | One logo, never changes, simpler |
| File structure | Flat under pdf/ | Nested templates/ | 13 files, nesting not needed |
| Font | Helvetica (built-in) | Custom Inter/Noto Sans | Zero config, professional, All-English |
| SL granularity | Per-container separate PDFs | All containers in one PDF | Trade standard: one SL per container |
| Phase order | 9-A (foundation+PO/PI) -> 9-B (CI/PL/SL) -> 9-C (Invoice) | CI first | PO/PI are simplest, validate shared components first |
| Utility file | pdf-utils.ts (separate) | Reuse lib/format.ts | PDF needs locale-independent formatting |
| Hook vs function | usePDFDownload hook | Standalone generatePDF | Hook manages loading state, integrates with React |

---

## 11. Estimated Effort

| Phase | Files | Effort | Notes |
|-------|-------|--------|-------|
| 9-A | 13 (10 new, 3 modified) | 1 session | Shared infra is the bulk; PO/PI templates are similar |
| 9-B | 6 (3 new, 3 modified) | 1 session | CI/PL share structure; SL is distinct but simple |
| 9-C | 2 (1 new, 1 modified) | 0.5 session | Custom layout but small document |
| **Total** | **~21 files** | **~2.5 sessions** | |

---

## 12. Open Questions for Implementation

1. **Logo file:** Does GV International have a PNG logo ready? If not, Phase 9-A can proceed without it (text fallback).

2. **Shipping info section for CI/PL:** Should vessel/voyage/ETD/ETA appear as a separate section between parties and terms, or as additional fields in the terms row? Recommendation: Separate "SHIPPING DETAILS" section for visual clarity.

3. **SL roll_details completeness:** The `StuffingRollDetail` type has all needed fields. But do all existing records have populated roll_details? If some are empty, the SL template should show "No roll details available" instead of an empty table.

4. **Customs Invoice title:** "CUSTOMS CLEARANCE INVOICE" vs "COST SUMMARY"? The research doc suggests both. Recommendation: "CUSTOMS CLEARANCE INVOICE" -- more formal, matches the document's purpose.

5. **Organizations phone/fax:** The `organizations` table has `phone` and `fax` fields, but the current `POWithOrgs`/`ShippingWithOrgs` types do not join these. If the PDF header or footer needs company contact info, the detail loaders would need to add these fields to the select query. Recommendation: Skip for Phase 9-A, add if needed later.
