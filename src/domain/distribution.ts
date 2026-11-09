import type { ScenarioData, ScenarioRow } from './types';

export interface ScenarioResult {
  monthly: [number, number, number];
  quincenal: [number, number, number];
  basicsMonthlyTotal: number;
  basicsQuincenalTotal: number;
  savingsTotal: number;
  meQueda: number;
  gastosTotal: number;
  ayudasTotal: number;
  necesito: number;
}

const sumCents = (rows: ScenarioRow[]): number =>
  rows.reduce((acc, r) => acc + (r.cents ?? 0), 0);

/** Half of a cent amount, rounding half up (i.e. to the nearest whole peso-half). */
const half = (cents: number): number => Math.round(cents / 2);

/**
 * Replicates the distribution sheet: monthly = real salary × percentage,
 * quincenal = half of monthly, Me queda = quincenal basics budget − basics
 * spending, Necesito = gastos − ayudas. All values are integer cents.
 */
export function computeScenario(d: ScenarioData): ScenarioResult {
  const monthly = d.allocations.map((a) => Math.round((d.realSalaryCents * a.pctBp) / 10000));
  const quincenal = monthly.map(half);
  const basicsMonthlyTotal = sumCents(d.basics);
  const basicsQuincenalTotal = half(basicsMonthlyTotal);
  const savingsTotal = sumCents(d.savings);
  const gastosTotal = sumCents(d.gastos);
  const ayudasTotal = sumCents(d.ayudas);
  return {
    monthly: [monthly[0] ?? 0, monthly[1] ?? 0, monthly[2] ?? 0],
    quincenal: [quincenal[0] ?? 0, quincenal[1] ?? 0, quincenal[2] ?? 0],
    basicsMonthlyTotal,
    basicsQuincenalTotal,
    savingsTotal,
    meQueda: (quincenal[0] ?? 0) - basicsQuincenalTotal,
    gastosTotal,
    ayudasTotal,
    necesito: gastosTotal - ayudasTotal,
  };
}
