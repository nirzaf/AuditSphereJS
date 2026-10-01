import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  Decimal6, calculateMateriality, deriveBenchmark, minimumRiskOwnerRank, riskBand, riskRoute,
  validateMateriality, type MappedBenchmarkLine,
} from '@auditsphere/server';

const fixture = JSON.parse(readFileSync('fixtures/characterization/materiality.json', 'utf8'));
const cases = fixture.cases as Array<Record<string, any>>;
const byId = (id: string) => cases.find((item) => item.id === id)!;
const lines = (raw: Array<{ sourceAccountCode?: string; destinationCode?: string; statementSection?: string; amount: string; fsli?: string }>): MappedBenchmarkLine[] =>
  raw.map((line) => ({ sourceAccountCode: line.sourceAccountCode ?? '', destinationCode: line.destinationCode ?? line.fsli ?? '', statementSection: line.statementSection ?? '', amount: Decimal6.from(line.amount) }));

describe('decimal-safe money primitive', () => {
  it('never uses binary floating point and rounds half-to-even', () => {
    expect(Decimal6.from('0.1').add(Decimal6.from('0.2')).toFixed(6)).toBe('0.300000');
    expect(Decimal6.from('0.125').toFixed(2)).toBe('0.12');
    expect(Decimal6.from('0.135').toFixed(2)).toBe('0.14');
    expect(Decimal6.from('-0.125').toFixed(2)).toBe('-0.12');
    expect(Decimal6.from('123456789.123456').toFixed(6)).toBe('123456789.123456');
    expect(Decimal6.from('1.2345675').toFixed(6)).toBe('1.234568');
    expect(Decimal6.from('1.2345685').toFixed(6)).toBe('1.234568');
    expect(Decimal6.from('3.33').multiply(Decimal6.from('333.33')).toFixed(6)).toBe('1109.988900');
  });
});

describe('materiality calculator ported from the pinned source', () => {
  it('reproduces the quoted revenue-driven figures and policy check', () => {
    const item = byId('revenue-driven-entity');
    expect(validateMateriality('REVENUE', Decimal6.from(item.input.ratePercent), Decimal6.from(item.input.performancePercent), Decimal6.from(item.input.sadPercent))).toBeNull();
    const figures = calculateMateriality(Decimal6.from(item.expected.benchmarkAmount), 1, Decimal6.from(item.input.ratePercent), Decimal6.from(item.input.performancePercent), Decimal6.from(item.input.sadPercent));
    expect(figures.planningMateriality.equals(Decimal6.from(item.expected.planningMateriality))).toBe(true);
    expect(figures.tolerableError.equals(Decimal6.from(item.expected.tolerableError))).toBe(true);
    expect(figures.sadThreshold.equals(Decimal6.from(item.expected.sadThreshold))).toBe(true);
  });

  it('derives every quoted benchmark from mapped lines, excluding tax from profit before tax', () => {
    const item = byId('benchmark-derivation-from-mapped-tb');
    const mapped = lines(item.reconstructedInput.lines);
    const expectations: Array<[string, string | null, string]> = [
      ['REVENUE', null, item.expected.revenue],
      ['PROFIT_BEFORE_TAX', null, item.expected.profitBeforeTax],
      ['TOTAL_ASSETS', null, item.expected.totalAssets],
      ['NET_ASSETS', null, item.expected.netAssets],
      ['TOTAL_EXPENSES', null, item.expected.totalExpenses],
      ['MAPPED_LINE', 'RECEIVABLES', item.expected.mappedLineReceivables],
    ];
    for (const [kind, code, expected] of expectations) {
      const derived = deriveBenchmark(kind, code, mapped);
      expect(derived, kind).not.toBeNull();
      expect(derived!.amount.equals(Decimal6.from(expected)), kind).toBe(true);
      expect(derived!.lineCount).toBeGreaterThan(0);
    }
    // The tax line is excluded from profit before tax but included in total expenses.
    expect(deriveBenchmark('PROFIT_BEFORE_TAX', null, mapped)!.amount.equals(deriveBenchmark('TOTAL_EXPENSES', null, mapped)!.amount)).toBe(false);
    expect(deriveBenchmark('MAPPED_LINE', null, mapped)).toBeNull();
  });

  it('rejects out-of-policy rates and percentages instead of clamping them', () => {
    const invalidRate = byId('out-of-policy-rate');
    const rateMessage = validateMateriality('REVENUE', Decimal6.from(invalidRate.input.ratePercent), Decimal6.from(invalidRate.input.performancePercent), Decimal6.from(invalidRate.input.sadPercent));
    expect(rateMessage).toMatch(/must be between/);
    expect(invalidRate.expected.clamped).toBe(false);
    const invalidPerformance = byId('performance-materiality-out-of-policy');
    expect(validateMateriality('REVENUE', Decimal6.from(invalidPerformance.input.ratePercent), Decimal6.from(invalidPerformance.input.performancePercent), Decimal6.from(invalidPerformance.input.sadPercent))).toMatch(/Tolerable error/);
    expect(validateMateriality('UNSUPPORTED', Decimal6.from('1'), Decimal6.from('75'), Decimal6.from('5'))).toMatch(/supported benchmark/);
  });

  it('fails closed on a loss benchmark rather than producing a negative threshold', () => {
    const item = byId('loss-fails-closed');
    const reconstructed = lines(item.input.lines.map((line: { fsli: string; amount: string }) => ({ destinationCode: line.fsli, statementSection: line.fsli, amount: line.amount })));
    const derived = deriveBenchmark('PROFIT_BEFORE_TAX', null, reconstructed)!;
    expect(derived.amount.toFixed(2)).toBe(Decimal6.from(item.expected.derivedBenchmarkAmount).toFixed(2));
    expect(() => calculateMateriality(derived.amount, derived.lineCount, Decimal6.from(item.input.ratePercent), Decimal6.from(item.input.performancePercent), Decimal6.from(item.input.sadPercent))).toThrow(/positive/);
  });

  it('routes risk bands exactly as the quoted matrix', () => {
    const item = byId('risk-band-matrix');
    const actual = item.input.cases.map((entry: { likelihood: number; impact: number; fraud: boolean; significant: boolean }) =>
      riskBand(entry.likelihood, entry.impact, entry.significant, entry.fraud).toLowerCase().replace(/^./, (c: string) => c.toUpperCase()));
    expect(actual).toEqual(item.expected.bands);
    expect(minimumRiskOwnerRank('RED')).toBe(3);
    expect(minimumRiskOwnerRank('AMBER')).toBe(2);
    expect(minimumRiskOwnerRank('GREEN')).toBe(1);
    expect(riskRoute('RED')).toMatch(/Engagement Partner review is mandatory/);
    expect(() => riskBand(0, 2, false, false)).toThrow(/1 to 3/);
  });
});
