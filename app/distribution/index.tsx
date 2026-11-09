import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Button, ScrollView, Text, View } from 'react-native';
import type { Scenario } from '../../src/domain/types';
import { ToastHost, showToast } from '../../src/ui/Toast';
import { useRepo, useRepoVersion } from '../../src/ui/repo';

export default function DistributionList() {
  const repo = useRepo();
  const version = useRepoVersion(repo);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);

  useEffect(() => {
    if (!repo) return;
    repo.listScenarios().then(setScenarios, (e) => console.error('scenarios load failed', e));
  }, [repo, version]);

  async function create() {
    if (!repo) return;
    try {
      await repo.saveScenario({
        id: repo.newId(),
        name: `Escenario ${scenarios.length + 1}`,
        position: scenarios.length,
        data: {
          salaryCents: 0, realSalaryCents: 0,
          allocations: [
            { label: 'Gastos básicos', pctBp: 5000, quincenalLabelBp: 2500 },
            { label: 'Ahorros, deudas', pctBp: 3000, quincenalLabelBp: 1500 },
            { label: 'Gustos', pctBp: 2000, quincenalLabelBp: 1000 },
          ],
          basics: [], savings: [], gastos: [], ayudas: [], note: null,
        },
      });
    } catch (e) {
      console.error('scenario create failed', e);
      showToast('No se pudo crear');
    }
  }

  async function duplicate(s: Scenario) {
    if (!repo) return;
    try {
      await repo.saveScenario({
        ...s,
        id: repo.newId(),
        name: `${s.name} (copia)`,
        position: scenarios.length,
        data: JSON.parse(JSON.stringify(s.data)),
      });
      showToast('Escenario duplicado');
    } catch (e) {
      console.error('scenario duplicate failed', e);
      showToast('No se pudo duplicar');
    }
  }

  function remove(s: Scenario) {
    if (!repo) return;
    Alert.alert('Eliminar escenario', `¿Eliminar ${s.name}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: () => {
          repo.deleteScenario(s.id).then(
            () => showToast('Escenario eliminado'),
            (e) => {
              console.error('scenario delete failed', e);
              showToast('No se pudo eliminar');
            },
          );
        },
      },
    ]);
  }

  if (!repo) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>Cargando…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
        {scenarios.length === 0 && <Text style={{ color: '#666' }}>No hay escenarios.</Text>}
        {scenarios.map((s) => (
          <View key={s.id} style={{ padding: 12, backgroundColor: '#fff', borderRadius: 8, gap: 8 }}>
            <Link
              href={{ pathname: '/distribution/[id]', params: { id: s.id } }}
              style={{ fontSize: 16, fontWeight: '600' }}
            >
              {s.name}
            </Link>
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <Link href={{ pathname: '/distribution/[id]', params: { id: s.id } }} style={{ color: '#0b5cad' }}>
                Editar
              </Link>
              <Text onPress={() => duplicate(s)} style={{ color: '#0b5cad' }}>Duplicar</Text>
              <Text onPress={() => remove(s)} style={{ color: '#c00' }}>Eliminar</Text>
            </View>
          </View>
        ))}
        <Button title="Nuevo escenario" onPress={create} />
      </ScrollView>
      <ToastHost />
    </View>
  );
}
