import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Button, ScrollView, Text, View } from 'react-native';
import { parseBackup } from '../src/domain/backup';
import { currentEmail, signIn, signOut } from '../src/drive/googleAuth';
import { restoreFromDrive, startFresh } from '../src/drive/backupService';
import type { DriveBackup } from '../src/drive/driveClient';
import { downloadBackup, listBackups } from '../src/drive/driveClient';
import { realBackupDeps } from '../src/drive/realDeps';
import { withDriveToken } from '../src/drive/googleAuth';
import { ToastHost, showToast } from '../src/ui/Toast';
import { useRepo } from '../src/ui/repo';
import { markWelcomeDismissed } from './_layout';

/** First launch: sign in, restore the newest copy (or pick an older one), or start fresh. */
export default function Welcome() {
  const repo = useRepo();
  const [email, setEmail] = useState<string | null>(null);
  const [files, setFiles] = useState<DriveBackup[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    currentEmail().then(
      (e) => {
        setEmail(e);
        if (e) loadFiles();
      },
      () => setEmail(null),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadFiles() {
    try {
      const list = await withDriveToken((t) => listBackups(t));
      setFiles(list);
      if (list[0]) {
        // Newest copy first: download it to report how many movements it holds.
        const text = await withDriveToken((t) => downloadBackup(t, list[0].id));
        setCounts({ [list[0].id]: parseBackup(text).movements.length });
      }
    } catch (e) {
      console.error('welcome list failed', e);
      setError('No se pudo leer Drive. Revisa tu conexión o continúa sin copia.');
    }
  }

  async function login() {
    setBusy(true);
    setError(null);
    try {
      const next = await signIn();
      setEmail(next);
      if (next) await loadFiles();
    } catch (e) {
      console.error('sign in failed', e);
      setError('No se pudo iniciar sesión. Revisa tu conexión o continúa sin copia.');
    } finally {
      setBusy(false);
    }
  }

  async function restore(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      await restoreFromDrive(realBackupDeps(), id);
      // Restored: uploads of future changes are allowed, today's file uploads next.
      await realBackupDeps().setState({ backupReady: true });
      showToast('Copia restaurada');
      router.replace('/');
    } catch (e) {
      console.error('welcome restore failed', e);
      showToast('No se pudo restaurar esa copia');
    } finally {
      setBusy(false);
    }
  }

  async function fresh() {
    try {
      await startFresh(realBackupDeps());
      router.replace('/');
    } catch (e) {
      console.error('welcome fresh failed', e);
      showToast('No se pudo guardar la elección');
    }
  }

  function later() {
    // No copy and no sign-in: the app works, backupReady stays false.
    markWelcomeDismissed();
    router.replace('/');
  }

  async function logout() {
    try {
      await signOut();
      setEmail(null);
      setFiles([]);
    } catch (e) {
      console.error('sign out failed', e);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 22, fontWeight: '700' }}>Bienvenido a Fino</Text>
        <Text>Tus datos viven en este teléfono. La copia en Google Drive es tu respaldo.</Text>
        {error ? <Text style={{ color: '#c00' }}>{error}</Text> : null}
        {!email ? (
          <Button title="Iniciar sesión con Google" onPress={login} disabled={busy} />
        ) : (
          <>
            <Text>Sesión: {email}</Text>
            {files.length === 0 ? (
              <Text style={{ color: '#666' }}>No hay copias en Drive.</Text>
            ) : (
              files.map((f, i) => (
                <View key={f.id} style={{ padding: 12, backgroundColor: '#fff', borderRadius: 8, gap: 4 }}>
                  <Text style={{ fontWeight: '600' }}>
                    {f.date}{i === 0 ? ' (más reciente)' : ''}
                    {counts[f.id] !== undefined ? ` · ${counts[f.id]} movimientos` : ''}
                  </Text>
                  <Button title="Restaurar esta copia" onPress={() => restore(f.id)} disabled={busy} />
                </View>
              ))
            )}
            <Button title="Cerrar sesión" onPress={logout} />
          </>
        )}
        <Button title="Empezar de cero" onPress={fresh} />
        <Button title="Continuar sin copia por ahora" onPress={later} />
      </ScrollView>
      <ToastHost />
    </View>
  );
}
