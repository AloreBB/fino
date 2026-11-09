import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Button, ScrollView, Text, TextInput, View } from 'react-native';
import { computeScenario } from '../../src/domain/distribution';
import { formatCop, parseAmount } from '../../src/domain/money';
import type { Scenario, ScenarioData, ScenarioRow } from '../../src/domain/types';
import { ToastHost, showToast } from '../../src/ui/Toast';
import { useRepo, useRepoVersion } from '../../src/ui/repo';

function pesos(cents: number): string {
  return String(cents / 100);
}

/** Amount field that keeps invalid input visible until it parses. */
function AmountInput({ value, onChange }: { value: number | null; onChange: (c: number | null) => void }) {
  const [text, setText] = useState(value == null ? '' : pesos(value));
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setText(value == null ? '' : pesos(value));
  }
  const trimmed = text.trim();
  const valid = trimmed === '' || parseAmount(trimmed) !== null;
  return (
    <TextInput
      value={text}
      onChangeText={(t) => {
        setText(t);
        const p = t.trim() === '' ? { cents: null as number | null } : parseAmount(t.trim());
        if (p) onChange(p.cents);
      }}
      keyboardType="numbers-and-punctuation" placeholder="Monto"
      style={{ flex: 1, borderWidth: 1, borderColor: valid ? '#999' : '#c00', borderRadius: 8, padding: 8 }}
    />
  );
}

function RowEditor({
  title, rows, onChange,
}: {
  title: string; rows: ScenarioRow[]; onChange: (rows: ScenarioRow[]) => void;
}) {
  function setRow(i: number, patch: Partial<ScenarioRow>) {
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontWeight: '700' }}>{title}</Text>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <AmountInput value={r.cents} onChange={(cents) => setRow(i, { cents })} />
          <TextInput
            value={r.description} onChangeText={(t) => setRow(i, { description: t })}
            placeholder="Descripción"
            style={{ flex: 2, borderWidth: 1, borderColor: '#999', borderRadius: 8, padding: 8 }}
          />
          <Text onPress={() => onChange(rows.filter((_, j) => j !== i))} style={{ color: '#c00' }}>
            Quitar
          </Text>
        </View>
      ))}
      <Button title={`Agregar a ${title}`} onPress={() => onChange([...rows, { cents: null, description: '' }])} />
    </View>
  );
}

export default function DistributionEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const repo = useRepo();
  const version = useRepoVersion(repo);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [name, setName] = useState('');
  const [data, setData] = useState<ScenarioData | null>(null);
  const [salaryText, setSalaryText] = useState('');
  const [realText, setRealText] = useState('');

  useEffect(() => {
    if (!repo || !id) return;
    repo.listScenarios().then(
      (ss) => {
        const s = ss.find((x) => x.id === id) ?? null;
        setScenario(s);
        setName(s?.name ?? '');
        setData(s ? JSON.parse(JSON.stringify(s.data)) : null);
        setSalaryText(s ? pesos(s.data.salaryCents) : '');
        setRealText(s ? pesos(s.data.realSalaryCents) : '');
      },
      (e) => console.error('scenario load failed', e),
    );
  }, [repo, id, version]);

  if (!repo || !data || !scenario) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>{!repo ? 'Cargando…' : 'Escenario no encontrado.'}</Text>
      </View>
    );
  }

  const set = (patch: Partial<ScenarioData>) => setData({ ...data, ...patch });
  const result = computeScenario(data);
  const showExtras = data.gastos.length > 0 || data.ayudas.length > 0;
  const money = formatCop;

  async function save() {
    if (!repo || !data || !scenario) return;
    const salary = parseAmount(salaryText.trim());
    const real = parseAmount(realText.trim());
    if (!salary || !real) {
      showToast('Revisa el salario y el salario real');
      return;
    }
    try {
      await repo.saveScenario({
        ...scenario, name: name.trim() || scenario.name,
        data: { ...data, salaryCents: salary.cents, realSalaryCents: real.cents },
      });
      showToast('Escenario guardado');
    } catch (e) {
      console.error('scenario save failed', e);
      showToast('No se pudo guardar');
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
        <Text>Nombre</Text>
        <TextInput value={name} onChangeText={setName} style={{ borderWidth: 1, borderColor: '#999', borderRadius: 8, padding: 10 }} />
        <Text>Salario</Text>
        <TextInput value={salaryText} onChangeText={setSalaryText} keyboardType="numbers-and-punctuation" style={{ borderWidth: 1, borderColor: '#999', borderRadius: 8, padding: 10 }} />
        <Text>Salario real</Text>
        <TextInput value={realText} onChangeText={setRealText} keyboardType="numbers-and-punctuation" style={{ borderWidth: 1, borderColor: '#999', borderRadius: 8, padding: 10 }} />

        {data.allocations.map((a, i) => (
          <View key={i} style={{ gap: 4 }}>
            <Text style={{ fontWeight: '700' }}>{a.label}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text>Porcentaje mensual</Text>
                <TextInput
                  value={String(a.pctBp / 100)} keyboardType="numbers-and-punctuation"
                  onChangeText={(t) => {
                    const n = Number(t.replace(',', '.'));
                    if (Number.isFinite(n) && n >= 0 && n <= 100) {
                      set({ allocations: data.allocations.map((x, j) => (j === i ? { ...x, pctBp: Math.round(n * 100) } : x)) });
                    }
                  }}
                  style={{ borderWidth: 1, borderColor: '#999', borderRadius: 8, padding: 8 }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text>Etiqueta quincenal</Text>
                <TextInput
                  value={String(a.quincenalLabelBp / 100)} keyboardType="numbers-and-punctuation"
                  onChangeText={(t) => {
                    const n = Number(t.replace(',', '.'));
                    if (Number.isFinite(n) && n >= 0 && n <= 100) {
                      set({ allocations: data.allocations.map((x, j) => (j === i ? { ...x, quincenalLabelBp: Math.round(n * 100) } : x)) });
                    }
                  }}
                  style={{ borderWidth: 1, borderColor: '#999', borderRadius: 8, padding: 8 }}
                />
              </View>
            </View>
            <Text>Mensual: {money(result.monthly[i] ?? 0)} · Quincenal: {money(result.quincenal[i] ?? 0)}</Text>
          </View>
        ))}

        <RowEditor title="Gastos básicos" rows={data.basics} onChange={(basics) => set({ basics })} />
        <Text>Total mensual: {money(result.basicsMonthlyTotal)} · Quincenal: {money(result.basicsQuincenalTotal)}</Text>
        <RowEditor title="Ahorro y deudas" rows={data.savings} onChange={(savings) => set({ savings })} />
        <Text>Total ahorro: {money(result.savingsTotal)}</Text>
        <Text style={{ fontWeight: '700' }}>Me queda: {money(result.meQueda)}</Text>

        {showExtras ? (
          <>
            <RowEditor title="Gastos" rows={data.gastos} onChange={(gastos) => set({ gastos })} />
            <RowEditor title="Ayudas" rows={data.ayudas} onChange={(ayudas) => set({ ayudas })} />
            <Text style={{ fontWeight: '700' }}>Necesito: {money(result.necesito)}</Text>
          </>
        ) : (
          <Button title="Agregar gastos y ayudas" onPress={() => set({ gastos: [{ cents: null, description: '' }], ayudas: [{ cents: null, description: '' }] })} />
        )}

        <Text>Nota</Text>
        <TextInput
          value={data.note ?? ''} onChangeText={(t) => set({ note: t.trim() === '' ? null : t })}
          multiline style={{ borderWidth: 1, borderColor: '#999', borderRadius: 8, padding: 10 }}
        />
        <Button title="Guardar" onPress={save} />
      </ScrollView>
      <ToastHost />
    </View>
  );
}
