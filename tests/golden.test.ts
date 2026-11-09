import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parseBackup } from '../src/domain/backup';
import { computeQuincenaTotals } from '../src/domain/totals';
import { computeScenario } from '../src/domain/distribution';

const dir = join(__dirname, '..', '.private');
const historialPath = join(dir, 'fino-historial.json');
const expectedPath = join(dir, 'expected.json');

const missing = ['fino-historial.json', 'expected.json'].find((f) => !existsSync(join(dir, f)));
if (missing) {
  test.skip(`golden: ${missing} is absent; run scripts/import_excel.py first`, () => undefined);
} else {
  const backup = parseBackup(readFileSync(historialPath, 'utf-8'));
  const expected = JSON.parse(readFileSync(expectedPath, 'utf-8')) as {
    quincenas: Record<string, Record<string, number>>;
    scenarios: Record<string, Record<string, number[] | number>>;
  };

  describe('golden: every quincena matches the spreadsheet', () => {
    expect(Object.keys(expected.quincenas)).toHaveLength(19);
    for (const q of backup.quincenas.filter((x) => !backup.months.find((m) => m.id === x.monthId)?.isTemplate)) {
      test(`${q.id}`, () => {
        const got = computeQuincenaTotals(backup.movements.filter((m) => m.quincenaId === q.id));
        expect(got).toEqual(expected.quincenas[q.id]);
      });
    }
  });

  describe('golden: every scenario matches the spreadsheet', () => {
    expect(Object.keys(expected.scenarios)).toHaveLength(3);
    for (const s of backup.scenarios) {
      test(`${s.name}`, () => {
        const got = computeScenario(s.data);
        const exp = expected.scenarios[s.name];
        expect({
          monthly: got.monthly, quincenal: got.quincenal,
          basicsMonthlyTotal: got.basicsMonthlyTotal,
          basicsQuincenalTotal: got.basicsQuincenalTotal,
          savingsTotal: got.savingsTotal, meQueda: got.meQueda,
          necesito: got.necesito,
        }).toEqual({
          monthly: exp['monthly'], quincenal: exp['quincenal'],
          basicsMonthlyTotal: exp['basicsMonthlyTotal'],
          basicsQuincenalTotal: exp['basicsQuincenalTotal'],
          savingsTotal: exp['savingsTotal'], meQueda: exp['meQueda'],
          necesito: exp['necesito'],
        });
      });
    }
  });
}
