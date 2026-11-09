import { computeScenario } from '../src/domain/distribution';
import type { ScenarioData } from '../src/domain/types';

// All figures are invented.
const data = (over: Partial<ScenarioData> = {}): ScenarioData => ({
  salaryCents: 320000000,
  realSalaryCents: 300000000,
  allocations: [
    { label: 'Basics', pctBp: 5000, quincenalLabelBp: 2500 },
    { label: 'Savings', pctBp: 3000, quincenalLabelBp: 1500 },
    { label: 'Wants', pctBp: 2000, quincenalLabelBp: 1000 },
  ],
  basics: [
    { cents: 40000000, description: 'Rent' },
    { cents: 20000000, description: 'Food' },
    { cents: null, description: 'No amount yet' },
  ],
  savings: [{ cents: 60000000, description: 'Fund' }],
  gastos: [{ cents: 10000000, description: 'Bill' }],
  ayudas: [{ cents: 4000000, description: 'Help' }],
  note: null,
  ...over,
});

test('monthly is real salary times percentage; quincenal is half', () => {
  const r = computeScenario(data());
  expect(r.monthly).toEqual([150000000, 90000000, 60000000]);
  expect(r.quincenal).toEqual([75000000, 45000000, 30000000]);
});

test('basics total skips rows with no amount; meQueda uses the quincenal budget', () => {
  const r = computeScenario(data());
  expect(r.basicsMonthlyTotal).toBe(60000000);
  expect(r.basicsQuincenalTotal).toBe(30000000);
  expect(r.meQueda).toBe(45000000);
});

test('savings total and necesito', () => {
  const r = computeScenario(data());
  expect(r.savingsTotal).toBe(60000000);
  expect(r.necesito).toBe(6000000);
});

test('empty gastos and ayudas give necesito 0', () => {
  const r = computeScenario(data({ gastos: [], ayudas: [] }));
  expect(r.necesito).toBe(0);
  expect(r.gastosTotal).toBe(0);
});
