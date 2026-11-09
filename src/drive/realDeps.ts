import { repo } from '../db/repository';
import type { BackupDeps } from './backupService';
import { deleteBackup, downloadBackup, listBackups, uploadDailyBackup } from './driveClient';
import { getAccessToken, withDriveToken } from './googleAuth';

/** Production wiring: the phone database plus Drive through the signed-in account. */
export function realBackupDeps(): BackupDeps & { today: () => string } {
  return {
    exportData: () => repo().exportBackup(),
    importData: (b) => repo().restoreBackup(b),
    getState: () => repo().getState(),
    setState: (p) => repo().setState(p),
    subscribe: (l) => repo().subscribe(l),
    getToken: () => getAccessToken(),
    upload: (_token, date, json) => withDriveToken((t) => uploadDailyBackup(t, date, json)),
    list: () => withDriveToken((t) => listBackups(t)),
    download: (_token, id) => withDriveToken((t) => downloadBackup(t, id)),
    remove: (_token, id) => withDriveToken((t) => deleteBackup(t, id)),
    today: () => new Date().toISOString().slice(0, 10),
  };
}
