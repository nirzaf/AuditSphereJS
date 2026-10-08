import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  Decimal6, calculateMateriality, deriveBenchmark, materialityBenchmarks, materialityInputHash, minimumRiskOwnerRank, riskBand, riskRoute,
  roundingPolicyMessage, validateMateriality, type MappedBenchmarkLine,
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

  it('derives the four CURRENT benchmarks from mapped lines, excluding tax from profit before tax', () => {
    const item = byId('benchmark-derivation-from-mapped-tb');
    const mapped = lines(item.reconstructedInput.lines);
    const expectations: Array<[string, string]> = [
      ['REVENUE', item.expected.revenue],
      ['PROFIT_BEFORE_TAX', item.expected.profitBeforeTax],
      ['TOTAL_ASSETS', item.expected.totalAssets],
      ['NET_ASSETS', item.expected.netAssets],
    ];
    for (const [kind, expected] of expectations) {
      const derived = deriveBenchmark(kind, mapped);
      expect(derived, kind).not.toBeNull();
      expect(derived!.amount.equals(Decimal6.from(expected)), kind).toBe(true);
      expect(derived!.lineCount).toBeGreaterThan(0);
      expect(derived!.normalization.isZero()).toBe(true);
    }
  });

  it('D19: the two benchmarks outside CURRENT are no longer offered', () => {
    const item = byId('benchmark-derivation-from-mapped-tb');
    const mapped = lines(item.reconstructedInput.lines);
    expect(materialityBenchmarks).toEqual(['REVENUE', 'PROFIT_BEFORE_TAX', 'TOTAL_ASSETS', 'NET_ASSETS']);
    expect(deriveBenchmark('TOTAL_EXPENSES', mapped)).toBeNull();
    expect(deriveBenchmark('MAPPED_LINE', mapped)).toBeNull();
    expect(validateMateriality('TOTAL_EXPENSES', Decimal6.from('1'), Decimal6.from('75'), Decimal6.from('5'))).toMatch(/supported benchmark/);
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
    const derived = deriveBenchmark('PROFIT_BEFORE_TAX', reconstructed)!;
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

describe('D19: CURRENT 4.2.4 ranges, recorded normalization and manager rounding', () => {
  const rate = (value: string) => Decimal6.from(value);

  it('accepts the CURRENT boundaries and rejects values just outside them', () => {
    expect(validateMateriality('PROFIT_BEFORE_TAX', rate('5'), rate('75'), rate('3'))).toBeNull();
    expect(validateMateriality('PROFIT_BEFORE_TAX', rate('10'), rate('50'), rate('5'))).toBeNull();
    expect(validateMateriality('PROFIT_BEFORE_TAX', rate('4.999999'), rate('75'), rate('5'))).toMatch(/must be between/);
    expect(validateMateriality('PROFIT_BEFORE_TAX', rate('10.000001'), rate('75'), rate('5'))).toMatch(/must be between/);
    expect(validateMateriality('TOTAL_ASSETS', rate('1'), rate('75'), rate('5'))).toBeNull();
    expect(validateMateriality('TOTAL_ASSETS', rate('1.5'), rate('75'), rate('5'))).toMatch(/must be between/);
    expect(validateMateriality('NET_ASSETS', rate('2'), rate('75'), rate('5'))).toBeNull();
    expect(validateMateriality('NET_ASSETS', rate('3'), rate('75'), rate('5'))).toMatch(/must be between/);
    expect(validateMateriality('REVENUE', rate('2'), rate('75'), rate('2.9'))).toMatch(/SAD threshold/);
    expect(validateMateriality('REVENUE', rate('2'), rate('75'), rate('3'))).toBeNull();
    expect(validateMateriality('REVENUE', rate('2.000001'), rate('75'), rate('3'))).toMatch(/must be between/);
    expect(validateMateriality('REVENUE', rate('0.5'), rate('75'), rate('5'))).toBeNull();
    expect(validateMateriality('REVENUE', rate('0.499999'), rate('75'), rate('5'))).toMatch(/must be between/);
    expect(validateMateriality('TOTAL_ASSETS', rate('0.5'), rate('75'), rate('5'))).toBeNull();
    expect(validateMateriality('TOTAL_ASSETS', rate('0.499999'), rate('75'), rate('5'))).toMatch(/must be between/);
    expect(validateMateriality('NET_ASSETS', rate('1'), rate('75'), rate('5'))).toBeNull();
    expect(validateMateriality('NET_ASSETS', rate('0.999999'), rate('75'), rate('5'))).toMatch(/must be between/);
  });

  it('refuses zero denominators instead of producing an infinite threshold or a false approval', () => {
    expect(() => calculateMateriality(Decimal6.from('0'), 1, rate('5'), rate('75'), rate('5'))).toThrow(/positive/);
    expect(roundingPolicyMessage(Decimal6.from('0'), Decimal6.from('1'))).toMatch(/must be positive/);
  });

  it('normalizes profit before tax only through recorded adjustments, and never other benchmarks', () => {
    const item = byId('benchmark-derivation-from-mapped-tb');
    const mapped = lines(item.reconstructedInput.lines);
    const base = deriveBenchmark('PROFIT_BEFORE_TAX', mapped)!;
    const adjusted = deriveBenchmark('PROFIT_BEFORE_TAX', mapped, [
      { description: 'One-off legal settlement', amount: Decimal6.from('25000') },
      { description: 'Non-recurring write-off', amount: Decimal6.from('-5000') },
    ])!;
    expect(adjusted.amount.equals(base.amount.add(Decimal6.from('20000')))).toBe(true);
    expect(adjusted.normalization.equals(Decimal6.from('20000'))).toBe(true);
    expect(() => deriveBenchmark('REVENUE', mapped, [{ description: 'Attempted revenue tweak', amount: Decimal6.from('1') }])).toThrow(/Only profit before tax/);
  });

  it('applies manager rounding only within plus or minus 5 % of the computed planning materiality', () => {
    const computed = Decimal6.from('20000');
    expect(roundingPolicyMessage(computed, Decimal6.from('21000'))).toBeNull();
    expect(roundingPolicyMessage(computed, Decimal6.from('19000'))).toBeNull();
    expect(roundingPolicyMessage(computed, Decimal6.from('21000.000001'))).toMatch(/at most 5.000000%/);
    expect(roundingPolicyMessage(computed, Decimal6.from('0'))).toMatch(/must be positive/);
    const figures = calculateMateriality(Decimal6.from('2000000'), 1, rate('1'), rate('75'), rate('5'), Decimal6.from('21000'));
    expect(figures.rawPlanningMateriality.toFixed(6)).toBe('20000.000000');
    expect(figures.planningMateriality.toFixed(6)).toBe('21000.000000');
    expect(figures.tolerableError.toFixed(6)).toBe('15750.000000');
    expect(figures.sadThreshold.toFixed(6)).toBe('1050.000000');
    expect(() => calculateMateriality(Decimal6.from('2000000'), 1, rate('1'), rate('75'), rate('5'), Decimal6.from('22000'))).toThrow(/at most 5/);
  });

  it('binds the input hash to the normalization, the applied value and the policy', () => {
    const base = {
      mappingVersionId: '00000000-0000-4000-8000-000000000001', datasetDigest: 'a'.repeat(64), kind: 'PROFIT_BEFORE_TAX',
      benchmarkAmount: Decimal6.from('550000'), rawPlanningMateriality: Decimal6.from('27500'), planningMateriality: Decimal6.from('27500'),
      ratePercent: rate('5'), performancePercent: rate('75'), trivialPercent: rate('5'),
    };
    const plain = materialityInputHash({ ...base, normalization: [] });
    expect(plain).toMatch(/^[a-f0-9]{64}$/);
    expect(materialityInputHash({ ...base, normalization: [] })).toBe(plain);
    expect(materialityInputHash({ ...base, normalization: [{ description: 'One-off legal settlement', amount: Decimal6.from('25000') }] })).not.toBe(plain);
    expect(materialityInputHash({ ...base, normalization: [], planningMateriality: Decimal6.from('28875') })).not.toBe(plain);
  });
});
