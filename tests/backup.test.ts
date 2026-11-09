import { BackupInvalidError, parseBackup } from '../src/domain/backup';
import type { BackupV1 } from '../src/domain/types';
import { testRepo } from './helpers/testDb';

const empty: BackupV1 = {
  version: 1, exportedAt: '2026-11-05T00:00:00.000Z',
  months: [], quincenas: [], movements: [], pockets: [], scenarios: [],
};

// All figures are invented.
function sample(): BackupV1 {
  return {
    version: 1, exportedAt: '2026-11-05T00:00:00.000Z',
    months: [{ id: 'm1', name: 'Inventario', year: 2026, monthNumber: 5, isTemplate: false, position: 0 }],
    quincenas: [{ id: 'q1', monthId: 'm1', number: 1, date: '2026-05-15', note: 'nota' }],
    movements: [
      { id: 'a', quincenaId: 'q1', kind: 'ingreso', amountCents: 100000, amountExpr: null, description: 'Sueldo', pocket: null, parte: null, transactionDate: null, paid: false, position: 0 },
      { id: 'b', quincenaId: 'q1', kind: 'egreso', amountCents: 0, amountExpr: null, description: 'Sin monto', pocket: null, parte: null, transactionDate: null, paid: false, position: 1 },
    ],
    pockets: [{ name: 'Feria', active: false, position: 0 }],
    scenarios: [{ id: 's1', name: 'Base', position: 0, data: { salaryCents: 1, realSalaryCents: 1, allocations: [], basics: [], savings: [], gastos: [], ayudas: [], note: null } }],
  };
}

test('export then restore on an empty DB round-trips', async () => {
  const r = await testRepo();
  const exported = await r.exportBackup();
  expect({ ...exported, exportedAt: '' }).toEqual({ ...empty, exportedAt: '' });
  await r.restoreBackup(sample());
  const again = await r.exportBackup();
  expect({ ...again, exportedAt: '' }).toEqual({ ...sample(), exportedAt: '' });
});

test('parseBackup rejects bad JSON', () => {
  expect(() => parseBackup('{nope')).toThrow(BackupInvalidError);
});

test('parseBackup rejects the wrong version', () => {
  expect(() => parseBackup(JSON.stringify({ ...sample(), version: 2 }))).toThrow(BackupInvalidError);
});

test('parseBackup rejects movements pointing at unknown quincenas', () => {
  const bad = sample();
  bad.movements[0].quincenaId = 'fantasma';
  expect(() => parseBackup(JSON.stringify(bad))).toThrow(BackupInvalidError);
});

test('parseBackup rejects quincenas pointing at unknown months', () => {
  const bad = sample();
  bad.quincenas[0].monthId = 'fantasma';
  expect(() => parseBackup(JSON.stringify(bad))).toThrow(BackupInvalidError);
});

test('a rejected file leaves current data untouched', async () => {
  const r = await testRepo();
  await r.restoreBackup(sample());
  const before = await r.exportBackup();
  expect(() => parseBackup('{"version":1}')).toThrow(BackupInvalidError);
  const after = await r.exportBackup();
  expect({ ...after, exportedAt: '' }).toEqual({ ...before, exportedAt: '' });
});

test('a failure midway through restoreBackup rolls back everything', async () => {
  const r = await testRepo();
  await r.restoreBackup(sample());
  const before = await r.exportBackup();
  // Two months with the same id: the second INSERT fails inside the transaction.
  const bad: BackupV1 = {
    ...sample(),
    months: [sample().months[0], { ...sample().months[0], name: 'Duplicado' }],
  };
  await expect(r.restoreBackup(bad)).rejects.toThrow();
  const after = await r.exportBackup();
  expect({ ...after, exportedAt: '' }).toEqual({ ...before, exportedAt: '' });
});

test('a restored movement with amount 0 survives', async () => {
  const r = await testRepo();
  await r.restoreBackup(sample());
  const list = await r.listMovements('q1');
  expect(list.find((m) => m.id === 'b')?.amountCents).toBe(0);
});
