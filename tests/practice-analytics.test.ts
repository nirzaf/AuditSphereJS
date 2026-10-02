import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Decimal6, calculateContractContribution, type ContractTimeValue } from '@auditsphere/server';

const fixture = JSON.parse(readFileSync('fixtures/characterization/practice-analytics.json', 'utf8'));
const byId = (id: string) => fixture.cases.find((item: { id: string }) => item.id === id)!;
const time = (rows: Array<{ minutes: number; capturedRate: string | null; currency: string | null }>): ContractTimeValue[] =>
  rows.map((row) => ({ minutes: row.minutes, capturedRate: row.capturedRate === null ? null : Decimal6.from(row.capturedRate), currency: row.currency }));
const compute = (item: { input: { fee: string; currency: string; approvedTime: Array<{ minutes: number; capturedRate: string | null; currency: string | null }> } }) =>
  calculateContractContribution(Decimal6.from(item.input.fee), item.input.currency, time(item.input.approvedTime));

describe('contract contribution calculator ported from the pinned source', () => {
  it('values lifetime approved time at its captured rate and nets it against the fee', () => {
    const item = byId('contract-fee-less-lifetime-standard');
    const result = compute(item);
    expect(result).not.toBeNull();
    expect(result!.lifetimeStandardValue.toFixed(6)).toBe(Decimal6.from(item.expected.lifetimeStandardValue).toFixed(6));
    expect(result!.feeLessStandardValue.toFixed(6)).toBe(Decimal6.from(item.expected.feeLessStandardValue).toFixed(6));
    // The two figures always reconcile to the contracted fee.
    expect(result!.lifetimeStandardValue.add(result!.feeLessStandardValue).equals(Decimal6.from(item.input.fee))).toBe(true);
  });

  it('reports unavailable, never zero, when the source says the figure cannot be computed', () => {
    for (const id of ['unavailable-when-rate-missing', 'unavailable-when-currency-missing', 'unavailable-when-currency-differs', 'unavailable-when-rate-negative']) {
      expect(compute(byId(id)), id).toBeNull();
    }
  });

  it('fails closed on inputs the C# signature cannot even express', () => {
    expect(calculateContractContribution(Decimal6.from('-1'), 'QAR', [])).toBeNull();
    expect(calculateContractContribution(Decimal6.from('10000'), '   ', [])).toBeNull();
    // minutes is an `int` in the source; a fractional duration must not be silently coerced.
    expect(calculateContractContribution(Decimal6.from('10000'), 'QAR', [{ minutes: 1.5, capturedRate: Decimal6.from('500'), currency: 'QAR' }])).toBeNull();
    expect(calculateContractContribution(Decimal6.from('10000'), 'QAR', [{ minutes: -1, capturedRate: Decimal6.from('500'), currency: 'QAR' }])).toBeNull();
    // Currency comparison is ordinal in the source, so case is significant.
    expect(calculateContractContribution(Decimal6.from('10000'), 'QAR', [{ minutes: 60, capturedRate: Decimal6.from('500'), currency: 'qar' }])).toBeNull();
  });

  it('treats no approved time as a zero standard value rather than an error', () => {
    const result = calculateContractContribution(Decimal6.from('10000'), 'QAR', []);
    expect(result!.lifetimeStandardValue.toFixed(6)).toBe('0.000000');
    expect(result!.feeLessStandardValue.toFixed(6)).toBe('10000.000000');
  });

  it('rounds once, half-to-even, after summing exact per-row values', () => {
    // Each row is exactly 0.5 × 10^-6: rounded per row they would both vanish, but the exact sum
    // is 1 × 10^-6, matching MoneyPolicy.Normalize applied once after the C# decimal sum.
    const perRow = calculateContractContribution(Decimal6.from('100'), 'QAR', [{ minutes: 1, capturedRate: Decimal6.from('0.00003'), currency: 'QAR' }]);
    expect(perRow!.lifetimeStandardValue.toFixed(6)).toBe('0.000000');
    const summed = calculateContractContribution(Decimal6.from('100'), 'QAR', [
      { minutes: 1, capturedRate: Decimal6.from('0.00003'), currency: 'QAR' },
      { minutes: 1, capturedRate: Decimal6.from('0.00003'), currency: 'QAR' },
    ]);
    expect(summed!.lifetimeStandardValue.toFixed(6)).toBe('0.000001');
    expect(summed!.feeLessStandardValue.toFixed(6)).toBe('99.999999');
    // Half-to-even at a genuine midpoint: 3 × 0.00003 / 60 = 1.5 × 10^-6 rounds up to 2.
    const midpoint = calculateContractContribution(Decimal6.from('100'), 'QAR', [{ minutes: 3, capturedRate: Decimal6.from('0.00003'), currency: 'QAR' }]);
    expect(midpoint!.lifetimeStandardValue.toFixed(6)).toBe('0.000002');
  });

  it('treats a zero captured rate as a zero standard value rather than an unavailable figure', () => {
    // Rate 0 is valid (only null or negative are refused): the fee simply stands unnetted.
    const result = calculateContractContribution(Decimal6.from('10000'), 'QAR', [{ minutes: 60, capturedRate: Decimal6.from('0'), currency: 'QAR' }]);
    expect(result).not.toBeNull();
    expect(result!.lifetimeStandardValue.toFixed(6)).toBe('0.000000');
    expect(result!.feeLessStandardValue.toFixed(6)).toBe('10000.000000');
  });
});