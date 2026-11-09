import { Text, View } from 'react-native';
import { formatCop } from '../domain/money';

/** Simple per-pocket sum of egresos within the quincena. */
export function PocketTotals({ totals }: { totals: { pocket: string; cents: number }[] }) {
  if (totals.length === 0) return null;
  return (
    <View style={{ padding: 12, gap: 4 }}>
      <Text style={{ fontWeight: '600' }}>Por bolsillo</Text>
      {totals.map((t) => (
        <View key={t.pocket} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text>{t.pocket}</Text>
          <Text>{formatCop(t.cents)}</Text>
        </View>
      ))}
    </View>
  );
}
