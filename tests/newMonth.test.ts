import { MonthAlreadyExistsError, createMonthFromTemplate, nextMonthToCreate } from '../src/domain/newMonth';
import type { Repository } from '../src/db/repository';
import { testRepo } from './helpers/testDb';

async function seedTemplate(r: Repository) {
  await r.saveMonth({ id: 't', name: 'Plantilla', year: null, monthNumber: null, isTemplate: true, position: 0 });
  await r.saveQuincena({ id: 't1', monthId: 't', number: 1, date: '2026-08-30', note: 'nota q1' });
  await r.saveQuincena({ id: 't2', monthId: 't', number: 2, date: '2026-08-30', note: null });
  await r.addMovement({
    quincenaId: 't1', kind: 'ingreso', amountCents: 100000, amountExpr: null,
    description: 'Sueldo', pocket: null, parte: null, transactionDate: null, paid: false,
  });
  await r.addMovement({
    quincenaId: 't1', kind: 'egreso', amountCents: 50000, amountExpr: '100000/2',
    description: 'Renta', pocket: 'Casa', parte: '1ra', transactionDate: '2026-01-05', paid: true,
  });
  await r.addMovement({
    quincenaId: 't2', kind: 'egreso', amountCents: 20000, amountExpr: null,
    description: 'Bus', pocket: null, parte: '2da', transactionDate: null, paid: false,
  });
}

test('copies both quincenas unpaid, keeping expressions and clearing dates', async () => {
  const r = await testRepo();
  await seedTemplate(r);
  const month = await createMonthFromTemplate(r, 2026, 2);
  expect(month.year).toBe(2026);
  expect(month.monthNumber).toBe(2);

  const qs = await r.listQuincenas(month.id);
  expect(qs.map((q) => [q.number, q.date])).toEqual([[1, '2026-02-15'], [2, '2026-02-28']]);
  expect(qs[0].note).toBe('nota q1');

  const q1 = (await r.listMovements(qs[0].id)).sort((a, b) => a.position - b.position);
  expect(q1).toHaveLength(2);
  expect(q1[0]).toMatchObject({ description: 'Sueldo', paid: false, transactionDate: null });
  expect(q1[1]).toMatchObject({
    description: 'Renta', paid: false, amountExpr: '100000/2',
    transactionDate: null, pocket: 'Casa', parte: '1ra',
  });
});

test('a duplicate month raises MonthAlreadyExistsError', async () => {
  const r = await testRepo();
  await seedTemplate(r);
  await createMonthFromTemplate(r, 2026, 2);
  await expect(createMonthFromTemplate(r, 2026, 2)).rejects.toBeInstanceOf(MonthAlreadyExistsError);
});

test('later template edits do not change the created month, nor vice versa', async () => {
  const r = await testRepo();
  await seedTemplate(r);
  const month = await createMonthFromTemplate(r, 2026, 2);
  const [q1] = await r.listQuincenas(month.id);

  await r.addMovement({
    quincenaId: 't1', kind: 'egreso', amountCents: 999, amountExpr: null,
    description: 'Nuevo en plantilla', pocket: null, parte: null, transactionDate: null, paid: false,
  });
  expect(await r.listMovements(q1.id)).toHaveLength(2);

  const created = (await r.listMovements(q1.id))[0];
  await r.updateMovement(created.id, { description: 'Editado' });
  expect((await r.listMovements('t1'))[0].description).toBe('Sueldo');
});

test('nextMonthToCreate: November with October as latest gives 2026/11', () => {
  expect(
    nextMonthToCreate(
      [{ id: 'm', name: 'Octubre', year: 2026, monthNumber: 10, isTemplate: false, position: 0 }],
      new Date(2026, 10, 9),
    ),
  ).toEqual({ year: 2026, monthNumber: 11 });
});

test('nextMonthToCreate rolls over December and ignores the template', () => {
  const months = [
    { id: 't', name: 'Plantilla', year: null as number | null, monthNumber: null as number | null, isTemplate: true, position: 0 },
    { id: 'm', name: 'Diciembre', year: 2026, monthNumber: 12, isTemplate: false, position: 1 },
  ];
  expect(nextMonthToCreate(months, new Date(2027, 0, 5))).toEqual({ year: 2027, monthNumber: 1 });
});
