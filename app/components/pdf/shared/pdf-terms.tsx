import { View, Text } from "@react-pdf/renderer";
import { styles } from "./pdf-styles";

interface PDFTermsProps {
  paymentTerm?: string | null;
  deliveryTerm?: string | null;
  loadingPort?: string | null;
  dischargePort?: string | null;
}

export function PDFTerms({
  paymentTerm,
  deliveryTerm,
  loadingPort,
  dischargePort,
}: PDFTermsProps) {
  return (
    <View style={styles.terms}>
      <View style={styles.termItem}>
        <Text style={styles.termLabel}>PAYMENT TERM</Text>
        <Text style={styles.termValue}>{paymentTerm ?? "-"}</Text>
      </View>
      <View style={styles.termItem}>
        <Text style={styles.termLabel}>DELIVERY TERM</Text>
        <Text style={styles.termValue}>{deliveryTerm ?? "-"}</Text>
      </View>
      <View style={styles.termItem}>
        <Text style={styles.termLabel}>LOADING PORT</Text>
        <Text style={styles.termValue}>{loadingPort ?? "-"}</Text>
      </View>
      <View style={styles.termItemLast}>
        <Text style={styles.termLabel}>DISCHARGE PORT</Text>
        <Text style={styles.termValue}>{dischargePort ?? "-"}</Text>
      </View>
    </View>
  );
}
