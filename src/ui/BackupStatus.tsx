import { Text, View } from 'react-native';
import type { AppState } from '../db/repository';
import { backupStatus } from '../drive/backupService';

function relative(iso: string, now: Date): string {
  const ms = now.getTime() - Date.parse(iso);
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} días`;
}

const FIX: Record<string, string> = {
  auth: 'Vuelve a iniciar sesión.',
  network: 'Se reintentará al abrir la app con internet.',
  other: 'Revisa e intenta de nuevo.',
};

/** Small Drive indicator for the main screen; a visible notice when warn is set. */
export function BackupStatus({ state, signedIn, now }: { state: AppState; signedIn: boolean; now?: Date }) {
  const status = backupStatus(state, now ?? new Date(), signedIn);
  if (status.kind === 'none') {
    return (
      <View style={{ padding: 8 }}>
        <Text style={{ color: '#666' }}>Sin copia en Drive</Text>
      </View>
    );
  }
  const text =
    status.kind === 'ok' && state.lastUploadAt
      ? `Copia en Drive: ${relative(state.lastUploadAt, now ?? new Date())}`
      : status.kind === 'ok'
        ? 'Copia en Drive: al día'
        : status.kind === 'pending'
          ? 'Copia en Drive: pendiente'
          : 'Copia en Drive: falló';
  if (!status.warn) {
    return (
      <View style={{ padding: 8 }}>
        <Text style={{ color: '#666' }}>{text}</Text>
      </View>
    );
  }
  return (
    <View style={{ padding: 12, backgroundColor: '#fff3e0', borderRadius: 8, gap: 4 }}>
      <Text style={{ fontWeight: '700' }}>{text}</Text>
      <Text>{state.lastError ? FIX[state.lastError] : 'Sube la copia en cuanto haya conexión.'}</Text>
    </View>
  );
}
