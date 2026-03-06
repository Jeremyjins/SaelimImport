import { View, Text } from "@react-pdf/renderer";
import { styles } from "./pdf-styles";

export interface PDFColumn {
  key: string;
  label: string;
  width: string;
  align?: "left" | "center" | "right";
}

interface PDFTableProps {
  columns: PDFColumn[];
  data: Record<string, string | number>[];
  totalRow?: Record<string, string>;
}

export function PDFTable({ columns, data, totalRow }: PDFTableProps) {
  return (
    <View>
      {/* Fixed header — repeats on every page */}
      <View style={styles.tableHeader} fixed>
        {columns.map((col) => (
          <Text
            key={col.key}
            style={[
              styles.tableHeaderCell,
              { width: col.width, textAlign: col.align ?? "left" },
            ]}
          >
            {col.label}
          </Text>
        ))}
      </View>

      {/* Data rows */}
      {data.map((row, i) => (
        <View
          key={i}
          style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}
          wrap={false}
        >
          {columns.map((col) => (
            <Text
              key={col.key}
              style={[
                styles.tableCell,
                { width: col.width, textAlign: col.align ?? "left" },
              ]}
            >
              {String(row[col.key] ?? "")}
            </Text>
          ))}
        </View>
      ))}

      {/* Total row */}
      {totalRow ? (
        <View style={styles.tableTotalRow} wrap={false}>
          {columns.map((col) => (
            <Text
              key={col.key}
              style={[
                styles.tableTotalCell,
                { width: col.width, textAlign: col.align ?? "left" },
              ]}
            >
              {totalRow[col.key] ?? ""}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
