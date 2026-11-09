import { formatCop, parseAmount } from '../src/domain/money';

test.each([
  ['38000', 3800000, null], ['38.000', 3800000, null], ['1.250.000', 125000000, null],
  ['12345,5', 1234550, null], ['12345.5', 1234550, null], ['1.5', 150, null],
  ['100000/2', 5000000, '100000/2'], ['(10000+5000)*2', 3000000, '(10000+5000)*2'],
])('parseAmount(%s)', (i, cents, expr) => expect(parseAmount(i)).toEqual({ cents, expr }));

test.each(['', 'abc', '10/0', '10+', '2**3'])('rejects %s', (i) => expect(parseAmount(i)).toBeNull());

test('rounds half up to cents', () => expect(parseAmount('10/3')?.cents).toBe(333));

test('thousands-grouped tokens work inside expressions', () => {
  expect(parseAmount('1.250.000/2')).toEqual({ cents: 62500000, expr: '1.250.000/2' });
});

test('surrounding whitespace is ignored', () => expect(parseAmount('  38.000 ')).toEqual({ cents: 3800000, expr: null }));

test('unary minus is rejected: amounts are positive', () => expect(parseAmount('-5')).toBeNull());

test('formatCop', () => {
  expect(formatCop(125000000)).toBe('$ 1.250.000');
  expect(formatCop(0)).toBe('$ 0');
  expect(formatCop(1234550)).toBe('$ 12.345,50');
  expect(formatCop(333)).toBe('$ 3,33');
});
