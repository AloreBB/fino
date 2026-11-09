import type { DriveBackup } from './driveClient';

const KEEP_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / MS_PER_DAY;

/**
 * Backups to remove: those more than 30 days older than `today` (YYYY-MM-DD).
 * The newest file is always kept, so a long offline stretch never leaves Drive empty.
 */
export function backupsToDelete(files: DriveBackup[], today: string): DriveBackup[] {
  if (files.length === 0) return [];
  const newest = files.reduce((a, b) => (b.date > a.date ? b : a));
  const todayNumber = dayNumber(today);
  return files.filter((f) => f.id !== newest.id && todayNumber - dayNumber(f.date) > KEEP_DAYS);
}
