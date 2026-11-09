import { testRepo } from './helpers/testDb';

// All figures are invented.
async function seedMonth(r: Awaited<ReturnType<typeof testRepo>>) {
  await r.saveMonth({ id: 'm1', name: 'Inventario', year: 2026, monthNumber: 5, isTemplate: false, position: 0 });
  await r.saveQuincena({ id: 'q1', monthId: 'm1', number: 1, date: '2026-05-15', note: null });
  return r;
}

test('add then list preserves insertion order', async () => {
  const r = await testRepo();
  await seedMonth(r);
  await r.addMovement({ quincenaId: 'q1', kind: 'egreso', amountCents: 30000, amountExpr: null, description: 'Pan', pocket: null, parte: null, transactionDate: null, paid: false });
  await r.addMovement({ quincenaId: 'q1', kind: 'ingreso', amountCents: 100000, amountExpr: null, description: 'Sueldo', pocket: null, parte: null, transactionDate: null, paid: false });
  const list = await r.listMovements('q1');
  expect(list.map((m) => m.description)).toEqual(['Pan', 'Sueldo']);
  expect(list[0].position).toBeLessThan(list[1].position);
});

test('setPaid toggles the flag', async () => {
  const r = await testRepo();
  await seedMonth(r);
  const m = await r.addMovement({ quincenaId: 'q1', kind: 'egreso', amountCents: 5000, amountExpr: null, description: 'Bus', pocket: null, parte: null, transactionDate: null, paid: false });
  await r.setPaid(m.id, true);
  expect((await r.listMovements('q1'))[0].paid).toBe(true);
  await r.setPaid(m.id, false);
  expect((await r.listMovements('q1'))[0].paid).toBe(false);
});

test('updateMovement patches fields', async () => {
  const r = await testRepo();
  await seedMonth(r);
  const m = await r.addMovement({ quincenaId: 'q1', kind: 'egreso', amountCents: 5000, amountExpr: null, description: 'Bus', pocket: null, parte: null, transactionDate: null, paid: false });
  await r.updateMovement(m.id, { amountCents: 7000, description: 'Taxi' });
  const [got] = await r.listMovements('q1');
  expect(got.amountCents).toBe(7000);
  expect(got.description).toBe('Taxi');
});

test('deleteMovement removes the row', async () => {
  const r = await testRepo();
  await seedMonth(r);
  const m = await r.addMovement({ quincenaId: 'q1', kind: 'egreso', amountCents: 5000, amountExpr: null, description: 'Bus', pocket: null, parte: null, transactionDate: null, paid: false });
  await r.deleteMovement(m.id);
  expect(await r.listMovements('q1')).toEqual([]);
});

test('every write bumps changeSeq and notifies subscribers', async () => {
  const r = await testRepo();
  await seedMonth(r);
  expect((await r.getState()).changeSeq).toBe(2);
  let calls = 0;
  const off = r.subscribe(() => {
    calls += 1;
  });
  const m = await r.addMovement({ quincenaId: 'q1', kind: 'egreso', amountCents: 100, amountExpr: null, description: 'Dulce', pocket: null, parte: null, transactionDate: null, paid: false });
  expect((await r.getState()).changeSeq).toBe(3);
  await r.setPaid(m.id, true);
  expect((await r.getState()).changeSeq).toBe(4);
  await r.addPocket('Fondo');
  expect((await r.getState()).changeSeq).toBe(5);
  expect(calls).toBe(3);
  off();
  await r.setPaid(m.id, false);
  expect(calls).toBe(3);
  expect((await r.getState()).changeSeq).toBe(6);
});

test('deactivating a pocket keeps movements; renaming updates them', async () => {
  const r = await testRepo();
  await seedMonth(r);
  await r.addPocket('Feria');
  await r.addMovement({ quincenaId: 'q1', kind: 'egreso', amountCents: 20000, amountExpr: null, description: 'Verdura', pocket: 'Feria', parte: null, transactionDate: null, paid: true });
  await r.deactivatePocket('Feria');
  expect(await r.listPockets()).toEqual([{ name: 'Feria', active: false, position: 0 }]);
  expect((await r.listMovements('q1'))[0].pocket).toBe('Feria');
  await r.renamePocket('Feria', 'Super');
  expect(await r.listPockets()).toEqual([{ name: 'Super', active: true, position: 0 }]);
  expect((await r.listMovements('q1'))[0].pocket).toBe('Super');
});

test('renamePocket of an unknown pocket throws and changes nothing', async () => {
  const r = await testRepo();
  const before = await r.getState();
  await expect(r.renamePocket('Fantasmas', 'Otros')).rejects.toThrow();
  expect((await r.getState()).changeSeq).toBe(before.changeSeq);
});

test('findQuincena locates by year, month and number', async () => {
  const r = await testRepo();
  await seedMonth(r);
  await r.saveQuincena({ id: 'q2', monthId: 'm1', number: 2, date: '2026-05-31', note: 'nota' });
  expect(await r.findQuincena(2026, 5, 2)).toEqual({ id: 'q2', monthId: 'm1', number: 2, date: '2026-05-31', note: 'nota' });
  expect(await r.findQuincena(2026, 6, 1)).toBeNull();
});

test('scenarios round-trip with JSON data', async () => {
  const r = await testRepo();
  await r.saveScenario({
    id: 's1', name: 'Base', position: 0,
    data: { salaryCents: 300000000, realSalaryCents: 280000000, allocations: [], basics: [], savings: [], gastos: [], ayudas: [], note: 'hola' },
  });
  const list = await r.listScenarios();
  expect(list).toHaveLength(1);
  expect(list[0].data.note).toBe('hola');
  await r.deleteScenario('s1');
  expect(await r.listScenarios()).toEqual([]);
});

test('recentDescriptions matches the prefix and suggests the pocket', async () => {
  const r = await testRepo();
  await seedMonth(r);
  await r.addMovement({ quincenaId: 'q1', kind: 'egreso', amountCents: 1000, amountExpr: null, description: 'Pan integral', pocket: 'Feria', parte: null, transactionDate: null, paid: true });
  await r.addMovement({ quincenaId: 'q1', kind: 'egreso', amountCents: 2000, amountExpr: null, description: 'Pan de queso', pocket: 'Feria', parte: null, transactionDate: null, paid: true });
  await r.addMovement({ quincenaId: 'q1', kind: 'egreso', amountCents: 3000, amountExpr: null, description: 'Avena', pocket: null, parte: null, transactionDate: null, paid: true });
  const got = await r.recentDescriptions('pan');
  expect(got.map((g) => g.description)).toEqual(['Pan de queso', 'Pan integral']);
  expect(got[0].pocket).toBe('Feria');
});

test('state starts with backupReady false and setState merges', async () => {
  const r = await testRepo();
  expect(await r.getState()).toEqual({ backupReady: false, changeSeq: 0, uploadedSeq: 0, lastUploadAt: null, lastError: null });
  await r.setState({ backupReady: true, lastError: 'network' });
  expect(await r.getState()).toMatchObject({ backupReady: true, lastError: 'network', changeSeq: 0 });
});

test('hasUserData is false on a fresh DB', async () => {
  const r = await testRepo();
  expect(await r.hasUserData()).toBe(false);
});
