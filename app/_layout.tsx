import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { runBackup, startBackupLoop } from '../src/drive/backupService';
import { realBackupDeps } from '../src/drive/realDeps';
import { RepoProvider, useRepo } from '../src/ui/repo';

let welcomeDismissed = false;
/** The welcome screen sets this when the user continues without a copy. */
export function markWelcomeDismissed() {
  welcomeDismissed = true;
}

/** First launch with no data and no backup choice yet goes through welcome. */
function WelcomeGate({ children }: { children: React.ReactNode }) {
  const repo = useRepo();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!repo) return;
    if (welcomeDismissed) {
      setChecked(true);
      return;
    }
    Promise.all([repo.getState(), repo.hasUserData()]).then(
      ([state, hasData]) => {
        if (!state.backupReady && !hasData) router.replace('/welcome');
        setChecked(true);
      },
      (e) => {
        console.error('welcome gate failed', e);
        setChecked(true);
      },
    );
  }, [repo, router]);

  if (!checked) return null;
  return <>{children}</>;
}

/** Automatic Drive uploads: on open, after changes, on background, and retries. */
function BackupLoopHost() {
  const repo = useRepo();

  useEffect(() => {
    if (!repo) return;
    const stop = startBackupLoop(realBackupDeps());
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') {
        runBackup(realBackupDeps(), new Date().toISOString().slice(0, 10)).catch((e) =>
          console.error('background backup failed', e),
        );
      }
    });
    return () => {
      stop();
      sub.remove();
    };
  }, [repo]);

  return null;
}

export default function RootLayout() {
  return (
    <RepoProvider>
      <BackupLoopHost />
      <WelcomeGate>
        <Stack>
          <Stack.Screen name="index" options={{ title: 'Fino' }} />
          <Stack.Screen name="template" options={{ title: 'Plantilla' }} />
          <Stack.Screen name="pockets" options={{ title: 'Bolsillos' }} />
          <Stack.Screen name="distribution/index" options={{ title: 'Distribución' }} />
          <Stack.Screen name="distribution/[id]" options={{ title: 'Escenario' }} />
          <Stack.Screen name="backup" options={{ title: 'Copia en Drive' }} />
          <Stack.Screen name="settings" options={{ title: 'Voz' }} />
          <Stack.Screen name="welcome" options={{ title: 'Bienvenido' }} />
        </Stack>
      </WelcomeGate>
    </RepoProvider>
  );
}
