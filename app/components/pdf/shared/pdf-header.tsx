import { View, Text } from "@react-pdf/renderer";
import { styles } from "./pdf-styles";

interface PDFHeaderProps {
  title: string;
  docNo: string;
  date?: string;
  subtitle?: string;
  extraFields?: Array<{ label: string; value: string }>;
}

export function PDFHeader({
  title,
  docNo,
  date,
  subtitle,
  extraFields,
}: PDFHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <Text style={styles.headerLogoText}>GV INTERNATIONAL</Text>
        <Text style={styles.headerLogoSub}>Co., Ltd.</Text>
      </View>
      <View style={styles.headerRight}>
        <Text style={styles.headerTitle}>{title}</Text>
        <Text style={styles.headerDocNo}>No: {docNo}</Text>
        {date ? <Text style={styles.headerDate}>Date: {date}</Text> : null}
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
        {extraFields
          ? extraFields.map((field) => (
              <Text key={field.label} style={styles.headerSubtitle}>
                {field.label}: {field.value}
              </Text>
            ))
          : null}
      </View>
    </View>
  );
}
