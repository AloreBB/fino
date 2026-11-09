import { computePocketTotals, computeQuincenaTotals } from '../src/domain/totals';
import type { Movement } from '../src/domain/types';

let n = 0;
const mv = (p: Partial<Movement>): Movement => ({
  id: `m${n++}`, quincenaId: 'q1', kind: 'egreso', amountCents: 0, amountExpr: null,
  description: 'x', pocket: null, parte: null, transactionDate: null, paid: false, position: n, ...p,
});

const sample: Movement[] = [
  mv({ kind: 'ingreso', amountCents: 100000 }),
  mv({ kind: 'egreso', amountCents: 30000, paid: true }),
  mv({ kind: 'egreso', amountCents: 50000, paid: false }),
];

test('totals follow the spreadsheet rules', () => {
  expect(computeQuincenaTotals(sample)).toEqual({ ingresos: 100000, egresos: 80000, pagado: 30000, saldoActual: 70000, meQuedo: 20000 });
});

test('empty list gives all zeros', () => {
  expect(computeQuincenaTotals([])).toEqual({ ingresos: 0, egresos: 0, pagado: 0, saldoActual: 0, meQuedo: 0 });
});

test('a paid flag on an ingreso does not count as pagado', () => {
  const t = computeQuincenaTotals([mv({ kind: 'ingreso', amountCents: 500, paid: true })]);
  expect(t.pagado).toBe(0);
  expect(t.saldoActual).toBe(500);
});

test('pocket totals sum egresos only and skip null pockets', () => {
  const list = [
    mv({ pocket: 'Alpha', amountCents: 100 }),
    mv({ pocket: 'Alpha', amountCents: 250, paid: true }),
    mv({ pocket: 'Beta', amountCents: 40 }),
    mv({ pocket: null, amountCents: 999 }),
    mv({ kind: 'ingreso', pocket: 'Alpha', amountCents: 5000 }),
  ];
  expect(computePocketTotals(list)).toEqual([
    { pocket: 'Alpha', cents: 350 },
    { pocket: 'Beta', cents: 40 },
  ]);
});
