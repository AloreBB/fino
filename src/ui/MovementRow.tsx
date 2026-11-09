import { Pressable, Text, View } from 'react-native';
import { formatCop } from '../domain/money';
import type { Movement } from '../domain/types';

interface Props {
  movement: Movement;
  onTogglePaid: () => void;
  onEdit: () => void;
}

function meta(m: Movement): string {
  const parts: string[] = [];
  if (m.pocket) parts.push(m.pocket);
  if (m.parte && m.parte !== 'Completo') parts.push(m.parte);
  if (m.transactionDate) parts.push(m.transactionDate);
  if (m.amountExpr) parts.push(`=${m.amountExpr}`);
  return parts.join(' · ');
}

/** One row: one-tap paid toggle for egresos, tap the text to edit. */
export function MovementRow({ movement: m, onTogglePaid, onEdit }: Props) {
  const sub = meta(m);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8 }}>
      {m.kind === 'egreso' ? (
        <Pressable
          onPress={onTogglePaid}
          accessibilityLabel={m.paid ? 'Marcar sin pagar' : 'Marcar pagado'}
          style={{ width: 36, alignItems: 'center' }}
        >
          <Text style={{ fontSize: 20 }}>{m.paid ? '✓' : '○'}</Text>
        </Pressable>
      ) : (
        <View style={{ width: 36, alignItems: 'center' }}>
          <Text style={{ fontSize: 16, color: '#2e7d32' }}>+</Text>
        </View>
      )}
      <Pressable onPress={onEdit} style={{ flex: 1 }}>
        <Text style={{ fontSize: 16 }}>{m.description || '(sin descripción)'}</Text>
        {sub ? <Text style={{ color: '#666' }}>{sub}</Text> : null}
      </Pressable>
      <Text style={{ fontWeight: '600' }}>{formatCop(m.amountCents)}</Text>
    </View>
  );
}
