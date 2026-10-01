import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Decimal6, selectSample, drawIndexesFrom, type SamplingPopulationItem } from '@auditsphere/server';

const fixture = JSON.parse(readFileSync('fixtures/characterization/sampling.json', 'utf8'));
const byId = (id: string) => fixture.cases.find((item: { id: string }) => item.id === id)!;
const basePopulation = (): SamplingPopulationItem[] =>
  (fixture.population as Array<[string, string]>).map(([stableRowId, amount]) => ({ stableRowId, signedAmount: Decimal6.from(amount) }));
const ids = (outcome: { items: Array<{ stableRowId: string }> }) => outcome.items.map((item) => item.stableRowId);

describe('audit sampling engine ported from the pinned source', () => {
  it('reports population statistics from the absolute exposure', () => {
    const item = byId('population-stats');
    const outcome = selectSample(basePopulation(), { method: item.input.method, interval: Decimal6.from(item.input.interval) });
    expect(outcome.populationCount).toBe(item.expected.populationCount);
    expect(outcome.populationAbsoluteTotal.equals(Decimal6.from(item.expected.populationAbsoluteTotal))).toBe(true);
    expect(new Set(ids(outcome)).size).toBe(outcome.selectedCount);
    expect(outcome.coveragePercent.compare(Decimal6.from('0'))).toBeGreaterThanOrEqual(0);
    expect(outcome.coveragePercent.compare(Decimal6.from('100'))).toBeLessThanOrEqual(0);
    expect(outcome.items.every((entry) => entry.inclusionReason.includes('Monetary unit'))).toBe(true);
  });

  it('selects every exposure at or above the key-item threshold', () => {
    const item = byId('key-item-threshold');
    const outcome = selectSample(basePopulation(), { method: 'KEY_ITEM', keyItemThreshold: Decimal6.from(item.input.keyItemThreshold) });
    expect(ids(outcome)).toEqual(item.expected.selectedRowIds);
    expect(outcome.selectedAbsoluteTotal.equals(Decimal6.from(item.expected.selectedAbsoluteTotal))).toBe(true);
  });

  it('is reproducible from the seed and bounded by the sample size', () => {
    const item = byId('random-seed-reproducible');
    const plan = { method: item.input.method, sampleSize: item.input.sampleSize, seed: item.input.seed };
    const first = selectSample(basePopulation(), plan);
    const second = selectSample(basePopulation(), plan);
    expect(first.items.length).toBe(item.expected.itemCount);
    expect(ids(first)).toEqual(ids(second));
    expect(first.selectedAbsoluteTotal.equals(second.selectedAbsoluteTotal)).toBe(true);
    const other = selectSample(basePopulation(), { ...plan, seed: 7 });
    expect(other.items.length).toBe(item.expected.itemCount);
    expect(ids(first)).not.toEqual(ids(other));

    const clamped = byId('random-clamped-to-population');
    const clampedOutcome = selectSample(basePopulation(), { method: 'RANDOM', sampleSize: clamped.input.sampleSize, seed: clamped.input.seed });
    expect(clampedOutcome.items.length).toBe(clamped.expected.itemCount);
    expect(clampedOutcome.coveragePercent.equals(Decimal6.from(clamped.expected.coveragePercent))).toBe(true);

    // The generator is a stable without-replacement draw over the candidate pool.
    const draw = drawIndexesFrom([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 4, 20260925);
    expect(draw).toEqual(drawIndexesFrom([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 4, 20260925));
    expect(new Set(draw).size).toBe(4);
    expect([...draw].sort((a, b) => a - b)).toEqual(draw);
  });

  it('always includes key items then fills from the seeded non-key stratum', () => {
    const item = byId('stratified-key-plus-draw');
    const plan = { method: item.input.method, keyItemThreshold: Decimal6.from(item.input.keyItemThreshold), sampleSize: item.input.sampleSize, seed: item.input.seed };
    const outcome = selectSample(basePopulation(), plan);
    expect(outcome.items.length).toBe(item.expected.itemCount);
    for (const key of item.expected.keyItemIdsPresent) {
      expect(outcome.items.some((entry) => entry.stableRowId === key && entry.inclusionReason.startsWith('Key item'))).toBe(true);
    }
    expect(outcome.items.filter((entry) => entry.inclusionReason.startsWith('Stratified random')).length).toBe(item.expected.stratifiedDrawCount);
    expect(ids(outcome)).toEqual(ids(selectSample(basePopulation(), plan)));
  });

  it('never selects zero-exposure rows and rejects invalid plans', () => {
    const item = byId('zero-rows-excluded');
    const population = [...basePopulation(), { stableRowId: 'row-00', signedAmount: Decimal6.from('0') }];
    const outcome = selectSample(population, { method: 'KEY_ITEM', keyItemThreshold: Decimal6.from(item.input.keyItemThreshold) });
    expect(ids(outcome)).toEqual(item.expected.selectedRowIds);
    expect(outcome.coveragePercent.equals(Decimal6.from(item.expected.coveragePercent))).toBe(true);
    expect(outcome.populationCount).toBe(item.expected.populationCount);

    expect(() => selectSample(basePopulation(), { method: 'NOT_A_METHOD' })).toThrow(/Unsupported sampling method/);
    expect(() => selectSample(basePopulation(), { method: 'MUS' })).toThrow(/interval/);
    expect(() => selectSample(basePopulation(), { method: 'RANDOM', sampleSize: 3 })).toThrow(/seed/);
    expect(() => selectSample(basePopulation(), { method: 'KEY_ITEM' })).toThrow(/key-item threshold/);
    expect(() => selectSample([{ stableRowId: 'dup', signedAmount: Decimal6.from('10') }, { stableRowId: 'dup', signedAmount: Decimal6.from('20') }], { method: 'KEY_ITEM', keyItemThreshold: Decimal6.from('5') })).toThrow(/unique/);
  });

  it('selects negative adjustments on absolute exposure while totals stay signed', () => {
    const item = byId('negative-exposure-selection');
    const population = item.input.population.map(([stableRowId, amount]: [string, string]) => ({ stableRowId, signedAmount: Decimal6.from(amount) }));
    const outcome = selectSample(population, { method: 'KEY_ITEM', keyItemThreshold: Decimal6.from(item.input.keyItemThreshold) });
    expect(ids(outcome)).toEqual(item.expected.selectedRowIds);
    expect(outcome.items[0].signedAmount.equals(Decimal6.from(item.expected.signedAmount))).toBe(true);
    expect(outcome.items[0].absoluteAmount.equals(Decimal6.from(item.expected.absoluteAmount))).toBe(true);
    expect(outcome.populationSignedTotal.equals(Decimal6.from(item.expected.populationSignedTotal))).toBe(true);
    expect(outcome.populationAbsoluteTotal.equals(Decimal6.from(item.expected.populationAbsoluteTotal))).toBe(true);
  });
});
