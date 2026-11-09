import { useEffect, useMemo, useState } from 'react';
import { Button, Pressable, ScrollView, Text, View } from 'react-native';
import { computePocketTotals, computeQuincenaTotals } from '../domain/totals';
import { currentQuincenaNumber } from '../domain/quincena';
import type { Month, Movement, Quincena } from '../domain/types';
import { MovementRow } from './MovementRow';
import { MovementSheet } from './MovementSheet';
import { PocketTotals } from './PocketTotals';
import { ToastHost, showToast } from './Toast';
import { TotalsHeader } from './TotalsHeader';
import { useRepo, useRepoVersion } from './repo';

const emptyTotals = { ingresos: 0, egresos: 0, pagado: 0, saldoActual: 0, meQuedo: 0 };

/** The full quincena screen, reused by the main view and the template editor. */
export function QuincenaView({ month, defaultToCurrent }: { month: Month; defaultToCurrent: boolean }) {
  const repo = useRepo();
  const version = useRepoVersion(repo);
  const [quincenas, setQuincenas] = useState<Quincena[]>([]);
  const [quincenaId, setQuincenaId] = useState<string | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Movement | null>(null);

  useEffect(() => {
    if (!repo) return;
    repo.listQuincenas(month.id).then(
      (qs) => {
        setQuincenas(qs);
        setQuincenaId((prev) => {
          if (prev && qs.some((q) => q.id === prev)) return prev;
          if (!defaultToCurrent) return qs[0]?.id ?? null;
          const want = currentQuincenaNumber(new Date());
          return (qs.find((q) => q.number === want) ?? qs[0])?.id ?? null;
        });
      },
      (e) => console.error('quincenas load failed', e),
    );
  }, [repo, month.id, defaultToCurrent, version]);

  useEffect(() => {
    if (!repo || !quincenaId) {
      setMovements([]);
      return;
    }
    repo.listMovements(quincenaId).then(setMovements, (e) => console.error('movements load failed', e));
  }, [repo, quincenaId, version]);

  const quincena = quincenas.find((q) => q.id === quincenaId) ?? null;
  const totals = useMemo(() => (movements.length > 0 ? computeQuincenaTotals(movements) : emptyTotals), [movements]);
  const pockets = useMemo(() => computePocketTotals(movements), [movements]);
  const ingresos = movements.filter((m) => m.kind === 'ingreso');
  const egresos = movements.filter((m) => m.kind === 'egreso');
  const sibling = quincenas.find((q) => quincena && q.number !== quincena.number) ?? null;

  async function togglePaid(m: Movement) {
    if (!repo) return;
    try {
      await repo.setPaid(m.id, !m.paid);
    } catch (e) {
      console.error('toggle paid failed', e);
      showToast('No se pudo actualizar');
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView stickyHeaderIndices={[1]} contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={{ padding: 12 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {quincenas.map((q) => (
              <Pressable
                key={q.id} onPress={() => setQuincenaId(q.id)}
                style={{ padding: 8, borderRadius: 8, backgroundColor: q.id === quincenaId ? '#0b5cad' : '#e8edf1' }}
              >
                <Text style={{ color: q.id === quincenaId ? '#fff' : '#000' }}>
                  {q.number === 1 ? '1ra quincena' : '2da quincena'}
                </Text>
              </Pressable>
            ))}
          </View>
          {quincena?.date ? <Text>Fecha: {quincena.date}</Text> : null}
        </View>

        <TotalsHeader totals={totals} />

        {quincena?.note ? (
          <View style={{ padding: 12 }}>
            <Text style={{ color: '#666' }}>{quincena.note}</Text>
          </View>
        ) : null}

        <View style={{ padding: 12 }}>
          <Text style={{ fontWeight: '700', fontSize: 16 }}>Ingresos</Text>
          {ingresos.length === 0 && <Text style={{ color: '#666' }}>Sin ingresos.</Text>}
          {ingresos.map((m) => (
            <MovementRow key={m.id} movement={m} onTogglePaid={() => togglePaid(m)} onEdit={() => { setEditing(m); setSheetOpen(true); }} />
          ))}
        </View>

        <View style={{ padding: 12 }}>
          <Text style={{ fontWeight: '700', fontSize: 16 }}>Egresos</Text>
          {egresos.length === 0 && <Text style={{ color: '#666' }}>Sin egresos.</Text>}
          {egresos.map((m) => (
            <MovementRow key={m.id} movement={m} onTogglePaid={() => togglePaid(m)} onEdit={() => { setEditing(m); setSheetOpen(true); }} />
          ))}
        </View>

        <PocketTotals totals={pockets} />
      </ScrollView>

      <View style={{ position: 'absolute', right: 16, bottom: 32 }}>
        <Button title="+ Agregar" onPress={() => { setEditing(null); setSheetOpen(true); }} />
      </View>

      {quincena && (
        <MovementSheet
          visible={sheetOpen}
          quincenaId={quincena.id}
          quincenaNumber={quincena.number}
          siblingQuincenaId={sibling?.id ?? null}
          movement={editing}
          onClose={() => { setSheetOpen(false); setEditing(null); }}
        />
      )}
      <ToastHost />
    </View>
  );
}
