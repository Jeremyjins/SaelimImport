import { StyleSheet } from "@react-pdf/renderer";

export const COLORS = {
  text: "#18181b",     // zinc-900
  label: "#71717a",    // zinc-500
  border: "#d4d4d8",   // zinc-300
  headerBg: "#f4f4f5", // zinc-100
  totalBg: "#e4e4e7",  // zinc-200
} as const;

export const styles = StyleSheet.create({
  // === PAGE ===
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    paddingTop: 36,
    paddingRight: 40,
    paddingBottom: 56,
    paddingLeft: 40,
    color: COLORS.text,
  },

  // === HEADER ===
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: 12,
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerLeft: {
    flexDirection: "column",
    justifyContent: "flex-end",
  },
  headerLogoText: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: COLORS.text,
  },
  headerLogoSub: {
    fontSize: 7,
    color: COLORS.label,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: "column",
    alignItems: "flex-end",
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: COLORS.text,
    marginBottom: 5,
  },
  headerDocNo: {
    fontSize: 9,
    color: COLORS.text,
    marginBottom: 2,
  },
  headerDate: {
    fontSize: 9,
    color: COLORS.label,
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 9,
    color: COLORS.label,
    marginBottom: 2,
  },

  // === PARTIES ===
  parties: {
    flexDirection: "row",
    marginBottom: 10,
  },
  partyBoxLeft: {
    flex: 1,
    padding: 8,
    backgroundColor: COLORS.headerBg,
    marginRight: 8,
    borderRadius: 2,
  },
  partyBoxRight: {
    flex: 1,
    padding: 8,
    backgroundColor: COLORS.headerBg,
    borderRadius: 2,
  },
  partyLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: COLORS.label,
    marginBottom: 4,
  },
  partyName: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: COLORS.text,
    marginBottom: 3,
  },
  partyAddress: {
    fontSize: 8,
    color: COLORS.label,
  },

  // === TERMS ===
  terms: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
    borderRadius: 2,
  },
  termItem: {
    flex: 1,
    padding: 6,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
  },
  termItemLast: {
    flex: 1,
    padding: 6,
  },
  termLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: COLORS.label,
    marginBottom: 2,
  },
  termValue: {
    fontSize: 9,
    color: COLORS.text,
  },

  // === TABLE ===
  tableHeader: {
    flexDirection: "row",
    backgroundColor: COLORS.headerBg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tableHeaderCell: {
    padding: 5,
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: COLORS.label,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
  },
  tableRowAlt: {
    flexDirection: "row",
    backgroundColor: "#fafafa",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
  },
  tableCell: {
    padding: 5,
    fontSize: 9,
    color: COLORS.text,
  },
  tableTotalRow: {
    flexDirection: "row",
    backgroundColor: COLORS.totalBg,
    borderTopWidth: 1,
    borderTopColor: COLORS.text,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
  },
  tableTotalCell: {
    padding: 5,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: COLORS.text,
  },

  // === FOOTER ===
  footer: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 5,
  },
  footerText: {
    fontSize: 7,
    color: COLORS.label,
  },
});
