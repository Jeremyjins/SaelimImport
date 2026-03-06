import { View, Text } from "@react-pdf/renderer";
import { styles } from "./pdf-styles";

export function PDFFooter() {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>GV International Co., Ltd.</Text>
      <Text
        style={styles.footerText}
        render={({
          pageNumber,
          totalPages,
        }: {
          pageNumber: number;
          totalPages: number;
        }) => `Page ${pageNumber} / ${totalPages}`}
      />
    </View>
  );
}
