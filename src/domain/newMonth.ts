import type { Month } from './types';
import type { Repository } from '../db/repository';
import { monthName } from './quincena';

/** Creating a month that already exists (same year and month number). */
export class MonthAlreadyExistsError extends Error {
  constructor(year: number, monthNumber: number) {
    super(`month ${year}/${monthNumber} already exists`);
    this.name = 'MonthAlreadyExistsError';
  }
}

/**
 * Copies the template month into a new month: both quincenas with their
 * notes, all movements unpaid and without transaction date, keeping amounts,
 * expressions, pockets and partes. Copies are new rows, so later edits on
 * either side never affect the other.
 */
export async function createMonthFromTemplate(
  repo: Repository,
  year: number,
  monthNumber: number,
): Promise<Month> {
  const months = await repo.listMonths();
  if (months.some((m) => !m.isTemplate && m.year === year && m.monthNumber === monthNumber)) {
    throw new MonthAlreadyExistsError(year, monthNumber);
  }
  const template = months.find((m) => m.isTemplate);
  if (!template) throw new Error('no hay plantilla: importa el historial primero');
  const templateQuincenas = await repo.listQuincenas(template.id);
  if (templateQuincenas.length === 0) throw new Error('la plantilla no tiene quincenas');

  const lastDay = new Date(year, monthNumber, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  const month: Month = {
    id: repo.newId(),
    name: monthName(monthNumber),
    year,
    monthNumber,
    isTemplate: false,
    position: months.reduce((max, m) => Math.max(max, m.position), -1) + 1,
  };
  await repo.saveMonth(month);
  const ordered = [...templateQuincenas].sort((a, b) => a.number - b.number);
  for (const tq of ordered) {
    const qid = repo.newId();
    await repo.saveQuincena({
      id: qid,
      monthId: month.id,
      number: tq.number,
      date: `${year}-${pad(monthNumber)}-${pad(tq.number === 1 ? 15 : lastDay)}`,
      note: tq.note,
    });
    const moves = await repo.listMovements(tq.id);
    for (const m of moves) {
      await repo.addMovement({
        quincenaId: qid, kind: m.kind, amountCents: m.amountCents, amountExpr: m.amountExpr,
        description: m.description, pocket: m.pocket, parte: m.parte,
        transactionDate: null, paid: false,
      });
    }
  }
  return month;
}

/**
 * The month the user should create next: one after the latest real month,
 * or the current month when there are no months yet.
 */
export function nextMonthToCreate(
  months: Month[],
  today: Date,
): { year: number; monthNumber: number } {
  const real = months.filter((m) => !m.isTemplate && m.year && m.monthNumber);
  if (real.length === 0) {
    return { year: today.getFullYear(), monthNumber: today.getMonth() + 1 };
  }
  const latest = real.reduce((a, b) =>
    (a.year! * 12 + a.monthNumber!) >= (b.year! * 12 + b.monthNumber!) ? a : b,
  );
  const next = latest.year! * 12 + latest.monthNumber!;
  return { year: Math.floor(next / 12), monthNumber: (next % 12) + 1 };
}
