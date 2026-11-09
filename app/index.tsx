import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { AppState } from '../src/db/repository';
import { nextMonthToCreate } from '../src/domain/newMonth';
import { monthName } from '../src/domain/quincena';
import type { Month } from '../src/domain/types';
import { currentEmail } from '../src/drive/googleAuth';
import { BackupStatus } from '../src/ui/BackupStatus';
import { CreateMonthPrompt } from '../src/ui/CreateMonthPrompt';
import { QuincenaView } from '../src/ui/QuincenaView';
import { ToastHost } from '../src/ui/Toast';
import { VoiceButton } from '../src/ui/VoiceButton';
import { useRepo, useRepoVersion } from '../src/ui/repo';

export default function Home() {
  const repo = useRepo();
  const version = useRepoVersion(repo);
  const [months, setMonths] = useState<Month[]>([]);
  const [monthId, setMonthId] = useState<string | null>(null);
  const [backupState, setBackupState] = useState<AppState>({ backupReady: false, changeSeq: 0, uploadedSeq: 0, lastUploadAt: null, lastError: null });
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (!repo) return;
    currentEmail().then(
      (e) => setSignedIn(e !== null),
      () => setSignedIn(false),
    );
    repo.getState().then(setBackupState, (e) => console.error('backup state load failed', e));
    repo.listMonths().then(
      (ms) => {
        const real = ms.filter((m) => !m.isTemplate);
        setMonths(real);
        setMonthId((prev) => {
          if (prev && real.some((m) => m.id === prev)) return prev;
          const now = new Date();
          const current = real.find((m) => m.year === now.getFullYear() && m.monthNumber === now.getMonth() + 1);
          return (current ?? real[real.length - 1])?.id ?? null;
        });
      },
      (e) => console.error('months load failed', e),
    );
  }, [repo, version]);

  if (!repo) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>Cargando…</Text>
      </View>
    );
  }

  const now = new Date();
  const next = nextMonthToCreate(months, now);
  const nextExists = months.some((m) => m.year === next.year && m.monthNumber === next.monthNumber);
  const nextDue =
    next.year < now.getFullYear() || (next.year === now.getFullYear() && next.monthNumber <= now.getMonth() + 1);
  const month = months.find((m) => m.id === monthId) ?? null;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 12, gap: 8 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {months.map((m) => (
              <Pressable
                key={m.id} onPress={() => setMonthId(m.id)}
                style={{ padding: 8, borderRadius: 8, backgroundColor: m.id === monthId ? '#0b5cad' : '#e8edf1' }}
              >
                <Text style={{ color: m.id === monthId ? '#fff' : '#000' }}>
                  {m.year && m.monthNumber ? `${monthName(m.monthNumber)} ${m.year}` : m.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <Link href="/template">Plantilla</Link>
          <Link href="/pockets">Bolsillos</Link>
          <Link href="/distribution">Distribución</Link>
          <Link href="/backup">Copia</Link>
          <Link href="/settings">Voz</Link>
        </View>
        <BackupStatus state={backupState} signedIn={signedIn} />
        <VoiceButton />
        {!nextExists && nextDue && (
          <CreateMonthPrompt
            year={next.year}
            monthNumber={next.monthNumber}
            onCreated={(m) => setMonthId(m.id)}
          />
        )}
      </View>
      <View style={{ flex: 1 }}>
        {month ? (
          <QuincenaView key={month.id} month={month} defaultToCurrent />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text>Aún no hay meses. Importa tu historial desde la pantalla de copia.</Text>
          </View>
        )}
      </View>
      <ToastHost />
    </View>
  );
}
