import type { Movement, QuincenaTotals } from './types';

const sum = (list: Movement[]) => list.reduce((acc, m) => acc + m.amountCents, 0);

/** Spreadsheet rules: Saldo actual = Ingresos − Total pagado; Me quedó = Ingresos − Egresos. */
export function computeQuincenaTotals(movements: Movement[]): QuincenaTotals {
  const egresosList = movements.filter((m) => m.kind === 'egreso');
  const ingresos = sum(movements.filter((m) => m.kind === 'ingreso'));
  const egresos = sum(egresosList);
  const pagado = sum(egresosList.filter((m) => m.paid));
  return { ingresos, egresos, pagado, saldoActual: ingresos - pagado, meQuedo: ingresos - egresos };
}

/** Sum of egresos per pocket, in order of first appearance; movements without a pocket are skipped. */
export function computePocketTotals(movements: Movement[]): { pocket: string; cents: number }[] {
  const totals = new Map<string, number>();
  for (const m of movements) {
    if (m.kind !== 'egreso' || m.pocket === null) continue;
    totals.set(m.pocket, (totals.get(m.pocket) ?? 0) + m.amountCents);
  }
  return [...totals].map(([pocket, cents]) => ({ pocket, cents }));
}
