/** Day 1-15 is quincena 1, day 16 on is quincena 2. */
export function currentQuincenaNumber(date: Date): 1 | 2 {
  return date.getDate() <= 15 ? 1 : 2;
}

/**
 * Splits cents across quincenas preserving the total. An odd cent goes to
 * the first half, so splitAcrossQuincenas(101) is [51, 50].
 */
export function splitAcrossQuincenas(cents: number): [number, number] {
  const first = Math.ceil(cents / 2);
  return [first, cents - first];
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** Spanish label for a month number, e.g. monthName(11) is 'Noviembre'. */
export function monthName(monthNumber: number): string {
  return MONTH_NAMES[monthNumber - 1] ?? '';
}
