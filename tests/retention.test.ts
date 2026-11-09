import { backupsToDelete } from '../src/drive/retention';
import type { DriveBackup } from '../src/drive/driveClient';

const file = (date: string): DriveBackup => ({
  id: `id-${date}`, name: `fino-${date}.json`, date, modifiedTime: `${date}T12:00:00Z`,
});

const today = '2026-11-05';

test('a file 31 days old is deleted', () => {
  // 2026-10-05 is 31 days before 2026-11-05
  const old = file('2026-10-05');
  const fresh = file('2026-11-05');
  expect(backupsToDelete([fresh, old], today)).toEqual([old]);
});

test('a file exactly 30 days old is kept', () => {
  const edge = file('2026-10-06');
  expect(backupsToDelete([file('2026-11-05'), edge], today)).toEqual([]);
});

test('the newest file is never deleted even when older than 30 days', () => {
  const stale = file('2026-08-01');
  const staler = file('2026-07-01');
  expect(backupsToDelete([staler, stale], today)).toEqual([staler]);
});

test('a single stale file is kept', () => {
  expect(backupsToDelete([file('2026-01-01')], today)).toEqual([]);
});

test('empty list returns empty', () => {
  expect(backupsToDelete([], today)).toEqual([]);
});

test('month and year boundaries count calendar days', () => {
  // 2026-01-05 -> 2025-12-05 is 31 days before, 2025-12-06 is 30 days before
  const del = file('2025-12-05');
  const keep = file('2025-12-06');
  expect(backupsToDelete([file('2026-01-05'), keep, del], '2026-01-05')).toEqual([del]);
});
