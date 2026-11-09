import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import type { Month } from '../src/domain/types';
import { QuincenaView } from '../src/ui/QuincenaView';
import { useRepo, useRepoVersion } from '../src/ui/repo';

/** The template month uses the same quincena screen; new months copy it. */
export default function Template() {
  const repo = useRepo();
  const version = useRepoVersion(repo);
  const [template, setTemplate] = useState<Month | null>(null);

  useEffect(() => {
    if (!repo) return;
    repo.listMonths().then(
      (ms) => setTemplate(ms.find((m) => m.isTemplate) ?? null),
      (e) => console.error('template load failed', e),
    );
  }, [repo, version]);

  if (!repo) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>Cargando…</Text>
      </View>
    );
  }
  if (!template) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text>No hay plantilla. Importa el historial para crearla.</Text>
      </View>
    );
  }
  return <QuincenaView month={template} defaultToCurrent={false} />;
}
