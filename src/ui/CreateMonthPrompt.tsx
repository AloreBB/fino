import { useState } from 'react';
import { Button, Text, View } from 'react-native';
import { createMonthFromTemplate } from '../domain/newMonth';
import { monthName } from '../domain/quincena';
import type { Month } from '../domain/types';
import { showToast } from './Toast';
import { useRepo } from './repo';

/** One-tap creation of the missing month from the template. */
export function CreateMonthPrompt({
  year,
  monthNumber,
  onCreated,
}: {
  year: number;
  monthNumber: number;
  onCreated: (m: Month) => void;
}) {
  const repo = useRepo();
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!repo || busy) return;
    setBusy(true);
    try {
      const month = await createMonthFromTemplate(repo, year, monthNumber);
      showToast(`${monthName(monthNumber)} creado desde la plantilla`);
      onCreated(month);
    } catch (e) {
      console.error('month creation failed', e);
      showToast('No se pudo crear el mes');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ padding: 16, gap: 8, backgroundColor: '#e7f3ff', borderRadius: 8 }}>
      <Text style={{ fontSize: 16 }}>
        {monthName(monthNumber)} {year} aún no existe.
      </Text>
      <Button title={`Crear ${monthName(monthNumber)} desde plantilla`} onPress={create} disabled={busy} />
    </View>
  );
}
