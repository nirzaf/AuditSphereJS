import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const PINNED_SOURCE = '64713e808d165b4ef91ea4be4979e0f98fb2def3';
const SCALE = 1_000_000n;
/** Fixture self-check only: scaled integer comparison, never business money arithmetic. */
const minor = (value: string | number): bigint => {
  const text = String(value);
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = (negative ? text.slice(1) : text).split('.');
  const scaled = BigInt(whole) * SCALE + BigInt((fraction + '000000').slice(0, 6));
  return negative ? -scaled : scaled;
};
const ratio = (value: bigint, numerator: number, denominator: number) => (value * BigInt(numerator)) / BigInt(denominator);

const load = (name: string) => JSON.parse(readFileSync(`fixtures/characterization/${name}.json`, 'utf8'));
const fixtures = ['quotation', 'materiality', 'sampling', 'practice-analytics'] as const;

describe('characterization fixtures', () => {
  it('carry pinned provenance and a complete case shape', () => {
    for (const name of fixtures) {
      const fixture = load(name);
      expect(fixture.schemaVersion).toBe(1);
      expect(fixture.provenance.commit).toBe(PINNED_SOURCE);
      expect(fixture.provenance.sourceFile).toMatch(/\.cs$/);
      expect(fixture.provenance.extraction).toMatch(/NOT executed/);
      expect(fixture.cases.length).toBeGreaterThan(0);
      for (const item of fixture.cases) {
        expect(typeof item.id).toBe('string');
        expect(Number.isInteger(item.sourceLine)).toBe(true);
        expect(item.intent.length).toBeGreaterThan(10);
        // A case either carries an input directly or a reconstructed input that reproduces the
        // quoted expectations (documented in the fixture provenance).
        expect(item.input ?? item.reconstructedInput).toBeTypeOf('object');
        expect(item.expected).toBeTypeOf('object');
      }
    }
  });

  it('keeps the quoted quotation breakdown internally consistent', () => {
    const cases = load('quotation').cases;
    const feeCase = cases.find((item: { id: string }) => item.id === 'fee-breakdown-order');
    const { baseAmount, complexityAmount, riskPremiumAmount, discountAmount, fee } = feeCase.expected;
    expect(minor(baseAmount) + minor(complexityAmount) + minor(riskPremiumAmount) - minor(discountAmount)).toBe(minor(fee));
    const lines = feeCase.input.lines as Array<{ hours: string; ratePerHour: string }>;
    const linesTotal = lines.reduce((sum, line) => sum + minor(line.hours) * minor(line.ratePerHour) / SCALE, 0n);
    expect(linesTotal).toBe(minor(baseAmount));
    // order invariance: reversing the same lines must not change the fee identity.
    const reversed = cases.find((item: { id: string }) => item.id === 'line-order-invariance');
    expect(reversed.expected.feeEqualsForwardOrder).toBe(true);
    // an out-of-policy case must never expect a silent zero.
    const invalid = cases.find((item: { id: string }) => item.id === 'out-of-range-factors');
    expect(invalid.expected.defaultToZero).toBe(false);
  });

  it('keeps the quoted materiality and sampling numbers self-consistent', () => {
    const materiality = load('materiality').cases.find((item: { id: string }) => item.id === 'revenue-driven-entity');
    const { planningMateriality, tolerableError, sadThreshold } = materiality.expected;
    expect(ratio(minor(planningMateriality), 75, 100)).toBe(minor(tolerableError));
    expect(ratio(minor(planningMateriality), 5, 100)).toBe(minor(sadThreshold));
    expect(ratio(minor(materiality.expected.benchmarkAmount), 1, 100)).toBe(minor(planningMateriality));

    const sampling = load('sampling');
    const population: Array<[string, string]> = sampling.population;
    const absoluteTotal = population.reduce((sum, [, amount]) => sum + minor(amount), 0n);
    const stats = sampling.cases.find((item: { id: string }) => item.id === 'population-stats');
    expect(absoluteTotal).toBe(minor(stats.expected.populationAbsoluteTotal));
    const keyItem = sampling.cases.find((item: { id: string }) => item.id === 'key-item-threshold');
    const threshold = minor(keyItem.input.keyItemThreshold);
    const expectedIds = keyItem.expected.selectedRowIds as string[];
    const aboveThreshold = population.filter(([, amount]) => minor(amount) >= threshold).map(([id]) => id);
    expect(aboveThreshold).toEqual(expectedIds);
    const expectedTotal = expectedIds.reduce((sum, id) => sum + minor(population.find(([rowId]) => rowId === id)![1]), 0n);
    expect(expectedTotal).toBe(minor(keyItem.expected.selectedAbsoluteTotal));
  });

  it('keeps the quoted contract contribution internally consistent', () => {
    const cases = load('practice-analytics').cases;
    const priced = cases.find((item: { id: string }) => item.id === 'contract-fee-less-lifetime-standard');
    const rows = priced.input.approvedTime as Array<{ minutes: number; capturedRate: string }>;
    // minutes × rate / 60 summed exactly, then compared with the quoted expectation.
    const standard = rows.reduce((sum, row) => sum + ratio(minor(row.capturedRate) * BigInt(row.minutes), 1, 60), 0n);
    expect(standard).toBe(minor(priced.expected.lifetimeStandardValue));
    expect(minor(priced.input.fee) - standard).toBe(minor(priced.expected.feeLessStandardValue));
    // Every unavailable source Theory row must stay unavailable, never a silent zero contribution.
    const unavailable = cases.filter((item: { expected: { available: boolean } }) => item.expected.available === false);
    expect(unavailable.map((item: { id: string }) => item.id)).toEqual([
      'unavailable-when-rate-missing',
      'unavailable-when-currency-missing',
      'unavailable-when-currency-differs',
      'unavailable-when-rate-negative',
    ]);
  });
});
