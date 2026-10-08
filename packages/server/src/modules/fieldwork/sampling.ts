import { Decimal6 } from '../../platform/decimal6.js';

/**
 * Pure, deterministic audit sampling engine, ported from the pinned source
 * (AuditSphereOps.Domain/Audit/AuditSamplingEngine.cs).
 *
 * No database, clock or non-deterministic randomness: the same population, method, parameters
 * and seed reproduce the same selection on any runtime, including the fixed splitmix64-style
 * generator the source uses. Zero-exposure rows are never selected but their signed amount is
 * preserved for the auditor's test sheet.
 */
export const samplingMethods = ['MUS', 'KEY_ITEM', 'RANDOM', 'STRATIFIED', 'SYSTEMATIC'] as const;
export type SamplingMethod = (typeof samplingMethods)[number];

export type SamplingPopulationItem = { stableRowId: string; signedAmount: Decimal6 };
export type SamplingPlan = { method: string; interval?: Decimal6; keyItemThreshold?: Decimal6; sampleSize?: number; seed?: number };
export type SampledItem = { stableRowId: string; signedAmount: Decimal6; absoluteAmount: Decimal6; inclusionReason: string; cumulativeAbsoluteAmount: Decimal6 };
export type SamplingOutcome = {
  method: string; populationCount: number; populationSignedTotal: Decimal6; populationAbsoluteTotal: Decimal6;
  selectedCount: number; selectedAbsoluteTotal: Decimal6; coveragePercent: Decimal6;
  seed: number | null; interval: Decimal6 | null; keyItemThreshold: Decimal6 | null;
  /** D23 (DN-10): the recorded random start and the exact interval N/n, for systematic samples only. */
  randomStart: number | null; systematicStep: string | null; items: SampledItem[];
};

const MASK = (1n << 64n) - 1n;
const GOLDEN = 0x9e3779b97f4a7c15n;
const MIX_A = 0xbf58476d1ce4e5b9n;
const MIX_B = 0x94d049bb133111ebn;

/**
 * Deterministic without-replacement draw, exactly as the source computes it. Returns the
 * selected pool indexes in population order.
 */
export function drawIndexesFrom(candidates: number[], take: number, seed: number): number[] {
  const pool = [...candidates];
  const drawn: number[] = [];
  let state = (BigInt.asUintN(64, BigInt(seed)) * GOLDEN + MIX_A) & MASK;
  while (drawn.length < take && pool.length > 0) {
    state = (state + GOLDEN) & MASK;
    let mixed = state;
    mixed = ((mixed ^ (mixed >> 30n)) * MIX_A) & MASK;
    mixed = ((mixed ^ (mixed >> 27n)) * MIX_B) & MASK;
    mixed ^= mixed >> 31n;
    const index = Number(mixed % BigInt(pool.length));
    drawn.push(pool[index]);
    pool.splice(index, 1);
  }
  drawn.sort((left, right) => left - right);
  return drawn;
}

const requirePositiveDecimal = (value: Decimal6 | undefined, name: string, method: string): Decimal6 => {
  if (!value || !value.isPositive()) throw new Error(`The ${name} must be greater than zero for ${method} sampling.`);
  return value;
};
const requireSize = (value: number | undefined, method: string): number => {
  if (!Number.isInteger(value) || (value as number) <= 0) throw new Error(`A positive sample size is required for ${method} sampling.`);
  return value as number;
};
const requireSeed = (value: number | undefined, method: string): number => {
  if (!Number.isInteger(value)) throw new Error(`A seed is required for ${method} sampling.`);
  return value as number;
};

function cumulativeIndex(ordered: SamplingPopulationItem[]): Decimal6[] {
  let running = Decimal6.zero();
  return ordered.map((item) => (running = running.add(item.signedAmount.abs())));
}

function selectMonetaryUnit(ordered: SamplingPopulationItem[], interval: Decimal6): SampledItem[] {
  const selected: SampledItem[] = [];
  let cumulative = Decimal6.zero();
  let nextSelectionPoint = interval;
  for (const item of ordered) {
    const exposure = item.signedAmount.abs();
    cumulative = cumulative.add(exposure);
    if (cumulative.compare(nextSelectionPoint) >= 0) {
      selected.push({ stableRowId: item.stableRowId, signedAmount: item.signedAmount, absoluteAmount: exposure, inclusionReason: `Monetary unit: cumulative exposure ${cumulative.toTrimmed()} crossed the interval at ${nextSelectionPoint.toTrimmed()}.`, cumulativeAbsoluteAmount: cumulative });
      // Advance beyond the crossed point; a single large item can cover several intervals,
      // and each crossing selects that row only once.
      while (cumulative.compare(nextSelectionPoint) >= 0) nextSelectionPoint = nextSelectionPoint.add(interval);
    }
  }
  return selected;
}

function selectKeyItems(ordered: SamplingPopulationItem[], threshold: Decimal6): SampledItem[] {
  const selected: SampledItem[] = [];
  let cumulative = Decimal6.zero();
  for (const item of ordered) {
    const exposure = item.signedAmount.abs();
    cumulative = cumulative.add(exposure);
    if (exposure.compare(threshold) >= 0) {
      selected.push({ stableRowId: item.stableRowId, signedAmount: item.signedAmount, absoluteAmount: exposure, inclusionReason: `Key item: exposure ${exposure.toTrimmed()} is at or above the threshold ${threshold.toTrimmed()}.`, cumulativeAbsoluteAmount: cumulative });
    }
  }
  return selected;
}

/**
 * T100 / D23 (DN-10): systematic random sampling over the ordered population. The interval is N / n. The random start r is
 * an integer drawn from the recorded seed in [0, N), and the selected positions are floor((r + i·N) / n) for i = 0..n-1.
 * Every start is equally likely, the positions stay evenly spaced when N / n is fractional, and they are always distinct.
 * n = N selects every item. An empty population is refused, because there is nothing to sample.
 */
function selectSystematic(ordered: SamplingPopulationItem[], sampleSize: number, seed: number): { items: SampledItem[]; randomStart: number } {
  const count = ordered.length;
  if (count === 0) throw new Error('A systematic sample needs a population with at least one non-zero exposure.');
  if (sampleSize > count) throw new Error('The systematic sample size cannot exceed the population.');
  const cumulative = cumulativeIndex(ordered);
  const [randomStart] = drawIndexesFrom(ordered.map((_item, index) => index), 1, seed);
  const items = Array.from({ length: sampleSize }, (_unused, step) => Math.floor((randomStart + step * count) / sampleSize)).map((index) => ({
    stableRowId: ordered[index].stableRowId, signedAmount: ordered[index].signedAmount, absoluteAmount: ordered[index].signedAmount.abs(),
    inclusionReason: `Systematic: interval ${count}/${sampleSize} from random start ${randomStart} (seed ${seed}).`, cumulativeAbsoluteAmount: cumulative[index],
  }));
  return { items, randomStart };
}

function selectRandom(ordered: SamplingPopulationItem[], sampleSize: number, seed: number): SampledItem[] {
  const cumulative = cumulativeIndex(ordered);
  return drawIndexesFrom(ordered.map((_item, index) => index), sampleSize, seed).map((index) => ({
    stableRowId: ordered[index].stableRowId, signedAmount: ordered[index].signedAmount, absoluteAmount: ordered[index].signedAmount.abs(),
    inclusionReason: `Random: deterministic draw with seed ${seed}.`, cumulativeAbsoluteAmount: cumulative[index],
  }));
}

function selectStratified(ordered: SamplingPopulationItem[], threshold: Decimal6, sampleSize: number, seed: number): SampledItem[] {
  const cumulative = cumulativeIndex(ordered);
  const keyIndexes = ordered.map((_item, index) => index).filter((index) => ordered[index].signedAmount.abs().compare(threshold) >= 0);
  const selected = keyIndexes.map((index) => ({
    stableRowId: ordered[index].stableRowId, signedAmount: ordered[index].signedAmount, absoluteAmount: ordered[index].signedAmount.abs(),
    inclusionReason: `Key item: exposure ${ordered[index].signedAmount.abs().toTrimmed()} is at or above the threshold ${threshold.toTrimmed()}.`, cumulativeAbsoluteAmount: cumulative[index],
  }));
  const remaining = sampleSize - selected.length;
  if (remaining > 0) {
    const keySet = new Set(keyIndexes);
    const candidates = ordered.map((_item, index) => index).filter((index) => !keySet.has(index));
    for (const index of drawIndexesFrom(candidates, remaining, seed)) {
      selected.push({
        stableRowId: ordered[index].stableRowId, signedAmount: ordered[index].signedAmount, absoluteAmount: ordered[index].signedAmount.abs(),
        inclusionReason: `Stratified random: deterministic draw with seed ${seed} from the non-key stratum.`, cumulativeAbsoluteAmount: cumulative[index],
      });
    }
  }
  return selected;
}

export function selectSample(population: readonly SamplingPopulationItem[], plan: SamplingPlan): SamplingOutcome {
  if (!(samplingMethods as readonly string[]).includes(plan.method)) throw new Error(`Unsupported sampling method '${plan.method}'.`);
  if (new Set(population.map((item) => item.stableRowId)).size !== population.length) throw new Error('Population row identities must be unique.');
  const ordered = population
    .map((item) => ({ stableRowId: item.stableRowId.trim(), signedAmount: item.signedAmount }))
    .filter((item) => !item.signedAmount.isZero());
  const signedTotal = Decimal6.sum(population.map((item) => item.signedAmount));
  const absoluteTotal = Decimal6.sum(ordered.map((item) => item.signedAmount.abs()));

  const systematic = plan.method === 'SYSTEMATIC' ? selectSystematic(ordered, requireSize(plan.sampleSize, plan.method), requireSeed(plan.seed, plan.method)) : null;
  const selected = systematic ? systematic.items : plan.method === 'MUS' ? selectMonetaryUnit(ordered, requirePositiveDecimal(plan.interval, 'interval', plan.method))
    : plan.method === 'KEY_ITEM' ? selectKeyItems(ordered, requirePositiveDecimal(plan.keyItemThreshold, 'key-item threshold', plan.method))
    : plan.method === 'RANDOM' ? selectRandom(ordered, requireSize(plan.sampleSize, plan.method), requireSeed(plan.seed, plan.method))
    : selectStratified(ordered, requirePositiveDecimal(plan.keyItemThreshold, 'key-item threshold', plan.method), requireSize(plan.sampleSize, plan.method), requireSeed(plan.seed, plan.method));

  const selectedAbsolute = Decimal6.sum(selected.map((item) => item.absoluteAmount));
  return {
    method: plan.method,
    populationCount: ordered.length,
    populationSignedTotal: signedTotal,
    populationAbsoluteTotal: absoluteTotal,
    selectedCount: selected.length,
    selectedAbsoluteTotal: selectedAbsolute,
    coveragePercent: Decimal6.ratioPercent(selectedAbsolute, absoluteTotal),
    seed: plan.seed ?? null,
    interval: plan.interval ?? null,
    keyItemThreshold: plan.keyItemThreshold ?? null,
    randomStart: systematic ? systematic.randomStart : null,
    systematicStep: systematic ? `${ordered.length}/${plan.sampleSize}` : null,
    items: selected,
  };
}
