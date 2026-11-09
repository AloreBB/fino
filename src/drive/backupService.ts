import type { AppState } from '../db/repository';
import type { BackupV1 } from '../domain/types';
import { parseBackup } from '../domain/backup';
import { backupsToDelete } from './retention';
import { DriveAuthError, DriveNetworkError, type DriveBackup } from './driveClient';

/** Everything runBackup/restore touch, so tests can use fakes and the app the real wiring. */
export interface BackupDeps {
  exportData: () => Promise<BackupV1>;
  importData: (b: BackupV1) => Promise<void>;
  getState: () => Promise<AppState>;
  setState: (patch: Partial<AppState>) => Promise<void>;
  subscribe: (listener: () => void) => () => void;
  getToken: () => Promise<string>;
  upload: (token: string, date: string, json: string) => Promise<void>;
  list: (token: string) => Promise<DriveBackup[]>;
  download: (token: string, id: string) => Promise<string>;
  remove: (token: string, id: string) => Promise<void>;
}

export type RunResult = 'uploaded' | 'blocked' | 'upToDate' | 'failed';

function errorKind(e: unknown): AppState['lastError'] {
  if (e instanceof DriveAuthError) return 'auth';
  if (e instanceof DriveNetworkError) return 'network';
  return 'other';
}

/**
 * Uploads one daily file when there are pending changes. The uploadedSeq
 * stored is the changeSeq captured before the export, so a change made
 * mid-upload still uploads on the next run. Never throws: failures are
 * recorded in state and reported as 'failed'.
 */
export async function runBackup(deps: BackupDeps, today: string): Promise<RunResult> {
  const state = await deps.getState();
  if (!state.backupReady) return 'blocked';
  if (state.changeSeq === state.uploadedSeq) return 'upToDate';
  const seq = state.changeSeq;
  const json = JSON.stringify(await deps.exportData());
  try {
    const token = await deps.getToken();
    await deps.upload(token, today, json);
    try {
      const files = await deps.list(token);
      const stale = backupsToDelete(files, today);
      await Promise.all(
        stale.map((f) =>
          deps.remove(token, f.id).catch((e) => {
            console.error('retention delete failed', f.name, e);
          }),
        ),
      );
    } catch (e) {
      console.error('retention list failed', e);
    }
    await deps.setState({ uploadedSeq: seq, lastUploadAt: new Date().toISOString(), lastError: null });
    return 'uploaded';
  } catch (e) {
    console.error('backup upload failed', e);
    await deps.setState({ lastError: errorKind(e) });
    return 'failed';
  }
}

export interface StatusView {
  kind: 'ok' | 'pending' | 'failed' | 'none';
  warn: boolean;
}

/**
 * What the indicator shows. Pending warns only after 3 days without a
 * successful upload; any failure warns. Without sign-in there is no copy.
 */
export function backupStatus(state: AppState, now: Date, signedIn: boolean): StatusView {
  if (!signedIn || !state.backupReady) return { kind: 'none', warn: false };
  if (state.lastError) return { kind: 'failed', warn: true };
  if (state.changeSeq !== state.uploadedSeq) {
    const last = state.lastUploadAt ? Date.parse(state.lastUploadAt) : NaN;
    const warn = Number.isFinite(last) && now.getTime() - last > 3 * 24 * 60 * 60 * 1000;
    return { kind: 'pending', warn };
  }
  return { kind: 'ok', warn: false };
}

/**
 * Downloads a Drive copy and replaces local data. An invalid file throws
 * BackupInvalidError before anything is written, so current data is intact.
 */
export async function restoreFromDrive(deps: BackupDeps, fileId: string): Promise<void> {
  const token = await deps.getToken();
  const text = await deps.download(token, fileId);
  const backup = parseBackup(text);
  await deps.importData(backup);
  await deps.setState({ lastError: null });
}

/** The user chose to keep this phone's (possibly empty) data: uploads may start. */
export async function startFresh(deps: BackupDeps): Promise<void> {
  await deps.setState({ backupReady: true, lastError: null });
}

const DEBOUNCE_MS = 5000;
const RETRY_MS = 60000;

/**
 * Uploads on opening, 5 s after each change, and every 60 s while changes
 * are pending. There is no connectivity library: the retry is the detection.
 */
export function startBackupLoop(deps: BackupDeps & { today: () => string }): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const run = () => {
    runBackup(deps, deps.today()).catch((e) => console.error('backup loop run failed', e));
  };
  const schedule = () => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, DEBOUNCE_MS);
  };
  const unsubscribe = deps.subscribe(schedule);
  const interval = setInterval(() => {
    if (stopped) return;
    deps.getState().then(
      (s) => {
        if (s.backupReady && s.changeSeq !== s.uploadedSeq) run();
      },
      (e) => console.error('backup status check failed', e),
    );
  }, RETRY_MS);
  run();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    clearInterval(interval);
    unsubscribe();
  };
}
