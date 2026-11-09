import { currentQuincenaNumber, monthName, splitAcrossQuincenas } from '../src/domain/quincena';

test('day 15 is quincena 1 and day 16 is quincena 2', () => {
  expect(currentQuincenaNumber(new Date(2026, 10, 15))).toBe(1);
  expect(currentQuincenaNumber(new Date(2026, 10, 16))).toBe(2);
  expect(currentQuincenaNumber(new Date(2026, 10, 1))).toBe(1);
  expect(currentQuincenaNumber(new Date(2026, 10, 30))).toBe(2);
});

test('splitAcrossQuincenas gives the odd cent to the first half', () => {
  expect(splitAcrossQuincenas(101)).toEqual([51, 50]);
  expect(splitAcrossQuincenas(100)).toEqual([50, 50]);
});

test('split preserves the sum', () => {
  for (const cents of [0, 1, 2, 99, 100000, 123456789]) {
    const [a, b] = splitAcrossQuincenas(cents);
    expect(a + b).toBe(cents);
  }
});

test('monthName is Spanish', () => {
  expect(monthName(11)).toBe('Noviembre');
  expect(monthName(1)).toBe('Enero');
});
