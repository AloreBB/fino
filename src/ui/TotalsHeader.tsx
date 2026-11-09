import { Text, View } from 'react-native';
import { formatCop } from '../domain/money';
import type { QuincenaTotals } from '../domain/types';

const LABELS: [keyof QuincenaTotals, string][] = [
  ['ingresos', 'Ingresos'],
  ['egresos', 'Egresos'],
  ['pagado', 'Total pagado'],
  ['saldoActual', 'Saldo actual'],
  ['meQuedo', 'Me quedó'],
];

/** The 5 spreadsheet totals, always visible at the top of the quincena screen. */
export function TotalsHeader({ totals }: { totals: QuincenaTotals }) {
  return (
    <View style={{ padding: 12, backgroundColor: '#f4f6f8', gap: 4 }}>
      {LABELS.map(([key, label]) => (
        <View key={key} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text>{label}</Text>
          <Text style={{ fontWeight: '600' }}>{formatCop(totals[key])}</Text>
        </View>
      ))}
    </View>
  );
}
