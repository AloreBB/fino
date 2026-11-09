// Amounts are integer cents. The expression evaluator uses exact BigInt
// fractions so rounding to cents never suffers float error (e.g. 0.145 * 100).

interface Frac { n: bigint; d: bigint } // d > 0

const GROUPED = /^\d{1,3}(\.\d{3})+$/;
const PLAIN_DECIMAL = /^\d+(\.\d+)?$/;
const NUMBER_TOKEN = /\d[\d.]*(?:,\d+)?|,\d+/y;

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) [x, y] = [y, x % y];
  return x;
}

function frac(n: bigint, d: bigint): Frac {
  const g = gcd(n, d) || 1n;
  return d < 0n ? { n: -n / g, d: -d / g } : { n: n / g, d: d / g };
}

/** Converts a written number ("38.000", "12345,5", "1.5") to a fraction, or null if malformed. */
function parseNumberToken(tok: string): Frac | null {
  let intPart = tok;
  let decPart = '';
  const comma = tok.indexOf(',');
  if (comma >= 0) {
    intPart = tok.slice(0, comma);
    decPart = tok.slice(comma + 1);
  }
  if (intPart.includes('.')) {
    // With a comma present, or with several dots, dots can only be thousands separators.
    if (!GROUPED.test(intPart)) {
      // A single dot with no comma is a decimal point ("12345.5", "1.5").
      if (comma < 0 && PLAIN_DECIMAL.test(intPart)) {
        const [i, f] = intPart.split('.');
        intPart = i;
        decPart = f;
      } else return null;
    } else {
      intPart = intPart.replace(/\./g, '');
    }
  }
  if (intPart === '') intPart = '0';
  if (!/^\d+$/.test(intPart) || (decPart !== '' && !/^\d+$/.test(decPart))) return null;
  return frac(BigInt(intPart + decPart), 10n ** BigInt(decPart.length));
}

class Parser {
  private pos = 0;
  constructor(private readonly s: string) {}

  parse(): Frac | null {
    const v = this.expr();
    return v !== null && this.pos === this.s.length ? v : null;
  }

  private skipWs() {
    while (this.s[this.pos] === ' ') this.pos++;
  }

  private expr(): Frac | null {
    let left = this.term();
    while (left !== null) {
      this.skipWs();
      const op = this.s[this.pos];
      if (op !== '+' && op !== '-') break;
      this.pos++;
      const right = this.term();
      if (right === null) return null;
      left = op === '+'
        ? frac(left.n * right.d + right.n * left.d, left.d * right.d)
        : frac(left.n * right.d - right.n * left.d, left.d * right.d);
    }
    return left;
  }

  private term(): Frac | null {
    let left = this.atom();
    while (left !== null) {
      this.skipWs();
      const op = this.s[this.pos];
      if (op !== '*' && op !== '/') break;
      this.pos++;
      const right = this.atom();
      if (right === null) return null;
      if (op === '*') left = frac(left.n * right.n, left.d * right.d);
      else {
        if (right.n === 0n) return null;
        left = frac(left.n * right.d, left.d * right.n);
      }
    }
    return left;
  }

  private atom(): Frac | null {
    this.skipWs();
    if (this.s[this.pos] === '(') {
      this.pos++;
      const inner = this.expr();
      this.skipWs();
      if (inner === null || this.s[this.pos] !== ')') return null;
      this.pos++;
      return inner;
    }
    NUMBER_TOKEN.lastIndex = this.pos;
    const m = NUMBER_TOKEN.exec(this.s);
    if (!m) return null;
    this.pos += m[0].length;
    return parseNumberToken(m[0]);
  }
}

/**
 * Parses a hand-typed Colombian amount or arithmetic expression into integer cents.
 * "." groups thousands when followed by exactly 3 digits per group, "," is the decimal
 * separator, and a lone "." is a decimal point. Returns null for anything invalid,
 * negative or too large. `expr` keeps the typed text only when it contains an operator.
 */
export function parseAmount(input: string): { cents: number; expr: string | null } | null {
  const text = input.trim();
  if (text === '') return null;
  const value = new Parser(text).parse();
  if (value === null || value.n < 0n) return null;
  // Round half up to whole cents: floor((2 * n * 100 + d) / (2 * d)).
  const cents = (2n * value.n * 100n + value.d) / (2n * value.d);
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return { cents: Number(cents), expr: /[+\-*/]/.test(text) ? text : null };
}

/** Formats cents as "$ 1.250.000"; decimals appear only when non-zero ("$ 12.345,50"). */
export function formatCop(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const pesos = Math.floor(abs / 100);
  const rest = abs % 100;
  const grouped = String(pesos).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decimals = rest === 0 ? '' : `,${String(rest).padStart(2, '0')}`;
  return `${sign}$ ${grouped}${decimals}`;
}
