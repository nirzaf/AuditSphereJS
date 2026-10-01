/**
 * Decimal-safe money primitive for pure calculators.
 *
 * Money is never a JavaScript float. Values are held as an integer count of 10^-6 units, matching
 * PostgreSQL numeric(28,6) storage and the source's documented decimal(19,6) policy. Rounding is
 * half-to-even, matching .NET decimal.Round(..., MidpointRounding.ToEven).
 */
const SCALE = 6;
const UNIT = 10n ** 6n;
const PATTERN = /^-?\d+(\.\d+)?$/;

/** Storage scale of the authoritative decimal policy: PostgreSQL numeric(28,6) and string transport. */
export const MONEY_SCALE = SCALE;
/** Integer-digit headroom of numeric(28,6): 28 total digits minus the 6 fractional digits. */
export const MAX_INTEGER_DIGITS = 22;

/** Half-to-even integer division. Returns round(numerator / denominator). */
export function roundHalfEvenDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error('Denominator must be positive');
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  const quotient = magnitude / denominator;
  const remainder = magnitude % denominator;
  const twice = remainder * 2n;
  let rounded = quotient;
  if (twice > denominator) rounded = quotient + 1n;
  else if (twice === denominator && quotient % 2n === 1n) rounded = quotient + 1n;
  return negative ? -rounded : rounded;
}

export class Decimal6 {
  private constructor(readonly minor: bigint) {}
  static zero(): Decimal6 { return new Decimal6(0n); }
  static from(value: string | number | bigint | Decimal6): Decimal6 {
    if (value instanceof Decimal6) return value;
    if (typeof value === 'bigint') return new Decimal6(value * UNIT);
    const text = typeof value === 'number' ? numberToPlainString(value) : value.trim();
    if (!PATTERN.test(text)) throw new Error('Invalid decimal value: ' + text);
    const negative = text.startsWith('-');
    const body = negative ? text.slice(1) : text;
    const [whole, fraction = ''] = body.split('.');
    const kept = fraction.slice(0, SCALE).padEnd(SCALE, '0');
    let minor = BigInt(whole) * UNIT + BigInt(kept);
    const rest = fraction.slice(SCALE);
    if (rest) {
      const next = BigInt(rest[0]);
      const laterNonZero = /[1-9]/.test(rest.slice(1));
      if (next > 5n || (next === 5n && laterNonZero) || (next === 5n && !laterNonZero && minor % 2n === 1n)) minor += 1n;
    }
    return new Decimal6(negative ? -minor : minor);
  }
  add(other: Decimal6): Decimal6 { return new Decimal6(this.minor + other.minor); }
  subtract(other: Decimal6): Decimal6 { return new Decimal6(this.minor - other.minor); }
  multiply(other: Decimal6): Decimal6 { return new Decimal6(roundHalfEvenDiv(this.minor * other.minor, UNIT)); }
  negate(): Decimal6 { return new Decimal6(-this.minor); }
  abs(): Decimal6 { return this.minor < 0n ? this.negate() : this; }
  isZero(): boolean { return this.minor === 0n; }
  isPositive(): boolean { return this.minor > 0n; }
  compare(other: Decimal6): number { return this.minor === other.minor ? 0 : this.minor < other.minor ? -1 : 1; }
  equals(other: Decimal6): boolean { return this.minor === other.minor; }
  /** value × percent / 100, rounded to two decimals half-to-even, as the source calculator does. */
  static percentOf(value: Decimal6, percent: Decimal6): Decimal6 {
    const scaled = roundHalfEvenDiv(value.minor * percent.minor, 10n ** 12n);
    return new Decimal6(scaled * 10n ** 4n);
  }
  toFixed(scale = SCALE): string {
    if (!Number.isInteger(scale) || scale < 0 || scale > SCALE) throw new Error('Scale must be 0..6');
    const negative = this.minor < 0n;
    const magnitude = negative ? -this.minor : this.minor;
    const factor = 10n ** BigInt(SCALE - scale);
    const rounded = roundHalfEvenDiv(magnitude, factor);
    const text = rounded.toString().padStart(scale + 1, '0');
    const whole = text.slice(0, text.length - scale) || '0';
    const fraction = scale ? text.slice(text.length - scale) : '';
    return (negative ? '-' : '') + whole + (fraction ? '.' + fraction : '');
  }
  toString(): string { return this.toFixed(SCALE); }
  /** Round to a given number of decimals half-to-even (0..6). */
  roundTo(scale: number): Decimal6 {
    if (!Number.isInteger(scale) || scale < 0 || scale > SCALE) throw new Error('Scale must be 0..6');
    const factor = 10n ** BigInt(SCALE - scale);
    return new Decimal6(roundHalfEvenDiv(this.minor, factor) * factor);
  }
  /** value × other rounded directly to two decimals half-to-even, with no intermediate rounding.
   *  The minor-unit product has scale 12; dividing by 10^10 yields the two-decimal count. */
  multiplyRound2(other: Decimal6): Decimal6 {
    return new Decimal6(roundHalfEvenDiv(this.minor * other.minor, 10n ** 10n) * 10n ** 4n);
  }
  /** Percent ratio part/whole × 100 rounded to six decimals half-to-even; zero when whole is zero. */
  static ratioPercent(part: Decimal6, whole: Decimal6): Decimal6 {
    if (whole.isZero()) return Decimal6.zero();
    return new Decimal6(roundHalfEvenDiv(part.minor * 100n * UNIT, whole.minor));
  }
  /** Trailing-zero-trimmed text, matching how .NET decimal renders typical amounts. */
  toTrimmed(): string {
    const text = this.toFixed(SCALE);
    return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text;
  }
  static sum(values: Decimal6[]): Decimal6 {
    return values.reduce((total, value) => total.add(value), Decimal6.zero());
  }

  /**
   * Parse an authoritative input value, failing closed on out-of-band digits or scale.
   * Unlike `from`, this never silently truncates or rounds a supplied figure: money entering the
   * system must already fit the numeric(28,6) policy (D05 input bounds).
   */
  static fromInput(value: string): Decimal6 {
    const text = value.trim();
    if (!PATTERN.test(text)) throw new Error('Invalid decimal input: ' + text);
    const body = text.startsWith('-') ? text.slice(1) : text;
    const [whole, fraction = ''] = body.split('.');
    const significantWhole = whole.replace(/^0+(?=\d)/, '');
    if (significantWhole.length > MAX_INTEGER_DIGITS) {
      throw new Error(`Decimal input exceeds ${MAX_INTEGER_DIGITS} integer digits: ${text}`);
    }
    if (fraction.length > SCALE) throw new Error(`Decimal input exceeds scale ${SCALE}: ${text}`);
    return Decimal6.from(text);
  }

  /** Final QAR presentation rounding (two decimals, half-to-even). */
  roundQar(): Decimal6 { return this.roundTo(2); }
  /** Authoritative QAR total as a two-decimal string. */
  toQarString(): string { return this.toFixed(2); }

  /**
   * Signed-balance display policy. Positive amounts carry an explicit leading '+', negative
   * amounts keep '-', and zero renders unsigned. The source leaves the sign convention open
   * (D05); this is the single reviewed default so no component invents its own.
   */
  toSignedQarString(): string {
    const text = this.toFixed(2);
    if (this.isZero() || !this.isPositive()) return text;
    return '+' + text;
  }

  /**
   * Current-year versus prior-year variance (R044). A zero prior base is reported explicitly as
   * `NO_BASE` with a null percentage rather than a misleading 0% (D05 / AC2). The percentage is
   * measured against the absolute prior base so direction reflects movement, not a negative
   * balance's sign convention.
   */
  static variance(current: Decimal6, prior: Decimal6): BalanceVariance {
    const change = current.subtract(prior);
    if (prior.isZero()) return { change, percent: null, direction: 'NO_BASE' };
    if (change.isZero()) return { change, percent: Decimal6.zero(), direction: 'NO_CHANGE' };
    const percent = new Decimal6(roundHalfEvenDiv(change.minor * 100n * UNIT, prior.abs().minor));
    return { change, percent, direction: change.isPositive() ? 'INCREASE' : 'DECREASE' };
  }
}

export type VarianceDirection = 'NO_BASE' | 'NO_CHANGE' | 'INCREASE' | 'DECREASE';
export interface BalanceVariance {
  readonly change: Decimal6;
  /** Percentage change with six-decimal scale, or null when the prior base is zero. */
  readonly percent: Decimal6 | null;
  readonly direction: VarianceDirection;
}

function numberToPlainString(value: number): string {
  if (!Number.isFinite(value)) throw new Error('Invalid decimal value');
  const text = String(value);
  if (!text.includes('e') && !text.includes('E')) return text;
  return value.toFixed(20).replace(/0+$/, '').replace(/\.$/, '');
}
