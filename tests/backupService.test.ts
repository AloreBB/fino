import type { AppState } from '../src/db/repository';
import type { BackupV1 } from '../src/domain/types';
import type { DriveBackup } from '../src/drive/driveClient';
import { DriveAuthError, DriveNetworkError } from '../src/drive/driveClient';
import {
  backupStatus, restoreFromDrive, runBackup, startFresh,
  type BackupDeps,
} from '../src/drive/backupService';

function state(over: Partial<AppState> = {}): AppState {
  return { backupReady: true, changeSeq: 5, uploadedSeq: 3, lastUploadAt: null, lastError: null, ...over };
}

const emptyBackup = (changeSeq = 0): BackupV1 => ({
  version: 1, exportedAt: '', months: [], quincenas: [], movements: [], pockets: [], scenarios: [],
});

function deps(over: Partial<BackupDeps> = {}): BackupDeps & { calls: Record<string, unknown[]> } {
  const calls: Record<string, unknown[]> = { upload: [], remove: [], setState: [] };
  const current = { state: state() };
  const base: BackupDeps = {
    exportData: async () => emptyBackup(),
    importData: async () => undefined,
    getState: async () => current.state,
    setState: async (p) => {
      calls.setState.push(p);
      current.state = { ...current.state, ...p };
    },
    subscribe: () => () => undefined,
    getToken: async () => 'tok',
    upload: async (...a) => {
      calls.upload.push(a);
    },
    list: async () => [],
    download: async () => '',
    remove: async (_t, id) => {
      calls.remove.push(id);
    },
    ...over,
  };
  return { ...base, calls };
}

const file = (date: string): DriveBackup => ({
  id: `id-${date}`, name: `fino-${date}.json`, date, modifiedTime: `${date}T12:00:00Z`,
});

test('backupReady=false blocks the upload, even with data', async () => {
  const d = deps();
  d.getState = async () => state({ backupReady: false, changeSeq: 5, uploadedSeq: 3 });
  expect(await runBackup(d, '2026-11-05')).toBe('blocked');
  expect(d.calls.upload).toHaveLength(0);
});

test('changeSeq === uploadedSeq uploads nothing', async () => {
  const d = deps();
  d.getState = async () => state({ changeSeq: 4, uploadedSeq: 4 });
  expect(await runBackup(d, '2026-11-05')).toBe('upToDate');
  expect(d.calls.upload).toHaveLength(0);
});

test('a change during the upload keeps the next run pending', async () => {
  const d = deps();
  const current = { seq: 5 };
  d.getState = async () => state({ changeSeq: current.seq, uploadedSeq: 3 });
  d.upload = async () => {
    current.seq = 6; // a write lands mid-upload
  };
  expect(await runBackup(d, '2026-11-05')).toBe('uploaded');
  const last = d.calls.setState[d.calls.setState.length - 1] as Partial<AppState>;
  expect(last.uploadedSeq).toBe(5);
});

test('upload deletes only backupsToDelete results', async () => {
  const d = deps();
  d.list = async () => [file('2026-11-05'), file('2026-10-26'), file('2026-10-01')];
  expect(await runBackup(d, '2026-11-05')).toBe('uploaded');
  expect(d.calls.remove).toEqual(['id-2026-10-01']);
});

test('a failed retention delete still reports uploaded', async () => {
  const d = deps();
  d.list = async () => [file('2026-11-05'), file('2026-10-01')];
  d.remove = async () => {
    throw new Error('gone');
  };
  expect(await runBackup(d, '2026-11-05')).toBe('uploaded');
});

test('DriveAuthError records auth and does not throw', async () => {
  const d = deps({ upload: async () => { throw new DriveAuthError(); } });
  await expect(runBackup(d, '2026-11-05')).resolves.toBe('failed');
  const last = d.calls.setState[d.calls.setState.length - 1] as Partial<AppState>;
  expect(last.lastError).toBe('auth');
});

test('DriveNetworkError records network', async () => {
  const d = deps({ upload: async () => { throw new DriveNetworkError('offline'); } });
  await expect(runBackup(d, '2026-11-05')).resolves.toBe('failed');
  const last = d.calls.setState[d.calls.setState.length - 1] as Partial<AppState>;
  expect(last.lastError).toBe('network');
});

test('backupStatus: not signed in gives none', () => {
  expect(backupStatus(state(), new Date('2026-11-05T12:00:00Z'), false)).toEqual({ kind: 'none', warn: false });
});

test('backupStatus: fresh pending has no warning', () => {
  expect(backupStatus(state(), new Date('2026-11-05T12:00:00Z'), true)).toEqual({ kind: 'pending', warn: false });
});

test('backupStatus: pending over 3 days warns', () => {
  const s = state({ lastUploadAt: '2026-11-01T12:00:00Z' });
  expect(backupStatus(s, new Date('2026-11-05T12:00:01Z'), true)).toEqual({ kind: 'pending', warn: true });
});

test('backupStatus: auth failure warns', () => {
  const s = state({ lastError: 'auth' });
  expect(backupStatus(s, new Date('2026-11-05T12:00:00Z'), true)).toEqual({ kind: 'failed', warn: true });
});

test('backupStatus: in sync is ok', () => {
  const s = state({ changeSeq: 4, uploadedSeq: 4, lastUploadAt: '2026-11-05T11:58:00Z' });
  expect(backupStatus(s, new Date('2026-11-05T12:00:00Z'), true)).toEqual({ kind: 'ok', warn: false });
});

test('restoreFromDrive with an invalid file leaves data intact and throws', async () => {
  let imported = 0;
  const d = deps({
    download: async () => '{"version":2}',
    importData: async () => {
      imported += 1;
    },
  });
  await expect(restoreFromDrive(d, 'x')).rejects.toThrow();
  expect(imported).toBe(0);
  expect(d.calls.setState).toHaveLength(0);
});

test('startFresh enables uploads', async () => {
  const d = deps();
  d.getState = async () => state({ backupReady: false, changeSeq: 0, uploadedSeq: 0 });
  await startFresh(d);
  const last = d.calls.setState[d.calls.setState.length - 1] as Partial<AppState>;
  expect(last.backupReady).toBe(true);
});
