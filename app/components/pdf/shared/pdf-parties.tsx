import { View, Text } from "@react-pdf/renderer";
import { styles } from "./pdf-styles";

export interface Party {
  label: string;
  name: string;
  address?: string | null;
}

interface PDFPartiesProps {
  left: Party;
  right: Party;
}

export function PDFParties({ left, right }: PDFPartiesProps) {
  return (
    <View style={styles.parties}>
      <View style={styles.partyBoxLeft}>
        <Text style={styles.partyLabel}>{left.label}</Text>
        <Text style={styles.partyName}>{left.name}</Text>
        {left.address ? (
          <Text style={styles.partyAddress}>{left.address}</Text>
        ) : null}
      </View>
      <View style={styles.partyBoxRight}>
        <Text style={styles.partyLabel}>{right.label}</Text>
        <Text style={styles.partyName}>{right.name}</Text>
        {right.address ? (
          <Text style={styles.partyAddress}>{right.address}</Text>
        ) : null}
      </View>
    </View>
  );
}
