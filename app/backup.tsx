import { useEffect, useState } from 'react';
import { Alert, Button, ScrollView, Text, View } from 'react-native';
import { exportToFile, importFromFile } from '../src/backup/fileBackup';
import type { AppState } from '../src/db/repository';
import { parseBackup } from '../src/domain/backup';
import { currentEmail } from '../src/drive/googleAuth';
import { restoreFromDrive, runBackup, startFresh } from '../src/drive/backupService';
import type { DriveBackup } from '../src/drive/driveClient';
import { realBackupDeps } from '../src/drive/realDeps';
import { withDriveToken } from '../src/drive/googleAuth';
import { listBackups } from '../src/drive/driveClient';
import { BackupStatus } from '../src/ui/BackupStatus';
import { ToastHost, showToast } from '../src/ui/Toast';
import { useRepo, useRepoVersion } from '../src/ui/repo';

const DEFAULT_STATE: AppState = { backupReady: false, changeSeq: 0, uploadedSeq: 0, lastUploadAt: null, lastError: null };

export default function Backup() {
  const repo = useRepo();
  const version = useRepoVersion(repo);
  const [state, setState] = useState<AppState>(DEFAULT_STATE);
  const [email, setEmail] = useState<string | null>(null);
  const [files, setFiles] = useState<DriveBackup[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!repo) return;
    repo.getState().then(setState, (e) => console.error('state load failed', e));
    currentEmail().then(setEmail, (e) => console.error('email load failed', e));
  }, [repo, version]);

  async function refreshFiles() {
    try {
      setFiles(await withDriveToken((t) => listBackups(t)));
    } catch (e) {
      console.error('backup list failed', e);
      showToast('No se pudo listar las copias');
    }
  }

  useEffect(() => {
    if (email) refreshFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  async function uploadNow() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await runBackup(realBackupDeps(), new Date().toISOString().slice(0, 10));
      showToast(
        result === 'uploaded' ? 'Copia subida'
        : result === 'upToDate' ? 'Ya está al día'
        : result === 'blocked' ? 'Restaura o empieza de cero primero'
        : 'Falló la subida',
      );
    } catch (e) {
      console.error('manual upload failed', e);
      showToast('Falló la subida');
    } finally {
      setBusy(false);
    }
  }

  function restore(id: string, label: string) {
    Alert.alert(
      'Restaurar copia',
      `Esto reemplaza tus datos actuales con la copia ${label}. ¿Continuar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Restaurar', style: 'destructive',
          onPress: () => {
            restoreFromDrive(realBackupDeps(), id).then(
              () => showToast('Copia restaurada'),
              (e) => {
                console.error('restore failed', e);
                showToast(
                  e instanceof Error && e.name === 'BackupInvalidError'
                    ? 'Ese archivo no es una copia válida'
                    : 'No se pudo restaurar',
                );
              },
            );
          },
        },
      ],
    );
  }

  async function keepPhone() {
    if (!repo) return;
    try {
      await startFresh(realBackupDeps());
      showToast('Seguimos con los datos de este teléfono');
    } catch (e) {
      console.error('start fresh failed', e);
      showToast('No se pudo guardar la elección');
    }
  }

  async function exportFile() {
    if (!repo) return;
    try {
      await exportToFile(JSON.stringify(await repo.exportBackup()));
    } catch (e) {
      console.error('manual export failed', e);
      showToast('No se pudo exportar');
    }
  }

  function importFile() {
    Alert.alert('Importar archivo', 'Esto reemplaza tus datos actuales con el archivo. ¿Continuar?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Importar', style: 'destructive',
        onPress: () => {
          (async () => {
            if (!repo) return;
            const text = await importFromFile();
            if (text === null) return;
            try {
              await repo.restoreBackup(parseBackup(text));
              showToast('Archivo importado');
            } catch (e) {
              console.error('manual import failed', e);
              showToast('Ese archivo no es una copia válida');
            }
          })().catch((e) => {
            console.error('manual import failed', e);
            showToast('No se pudo importar');
          });
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
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <BackupStatus state={state} signedIn={email !== null} />
        {email ? <Text>Sesión: {email}</Text> : <Text>Sin sesión de Google.</Text>}
        <Button title="Subir ahora" onPress={uploadNow} disabled={busy} />
        {!state.backupReady && (
          <Button title="Seguir con los datos de este teléfono" onPress={keepPhone} />
        )}
        <Text style={{ fontWeight: '700', fontSize: 16 }}>Copias en Drive</Text>
        {files.length === 0 && <Text style={{ color: '#666' }}>No hay copias. Sube la primera con “Subir ahora”.</Text>}
        {files.map((f) => (
          <View key={f.id} style={{ padding: 12, backgroundColor: '#fff', borderRadius: 8, gap: 4 }}>
            <Text style={{ fontWeight: '600' }}>{f.date}</Text>
            <Button title="Restaurar esta copia" onPress={() => restore(f.id, f.date)} />
          </View>
        ))}
        <Text style={{ fontWeight: '700', fontSize: 16 }}>Archivo manual</Text>
        <Button title="Exportar a archivo" onPress={exportFile} />
        <Button title="Importar desde archivo" onPress={importFile} />
      </ScrollView>
      <ToastHost />
    </View>
  );
}
