import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const fixture = readJson('docs/decisions/T003-methodology-golden.json');
const decisions = readJson('docs/decisions/register.json');
assert.equal(fixture.policyVersion, 'STE-AUDIT-METHODS-2026.1');
for (const id of ['D05', 'D06', 'D07']) {
  const decision = decisions.find((entry) => entry.id === id);
  assert.equal(decision?.status, 'APPROVED_IMPLEMENTATION_DEFAULT', `${id} approval state`);
  assert.match(decision?.approvedBy ?? '', /user delegated/i, `${id} approval evidence`);
}
assert.ok(readFileSync('docs/requirements/CURRENT.md').equals(readFileSync('docs/sources/requirements-current.md')), 'preserved requirements must remain byte-identical');

function decimalToScaled(value, scale = 6) {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  assert.ok(match, `invalid decimal ${value}`);
  const fraction = match[3] ?? '';
  assert.ok(fraction.length <= scale, `precision exceeds ${scale}: ${value}`);
  const result = BigInt(match[2]) * 10n ** BigInt(scale) + BigInt((fraction + '0'.repeat(scale)).slice(0, scale));
  return match[1] ? -result : result;
}

const materiality = fixture.materiality;
const baseMicros = decimalToScaled(materiality.base);
const calculatedPmMicros = baseMicros * decimalToScaled(materiality.ratePercent) / 100_000_000n;
assert.equal(calculatedPmMicros, decimalToScaled(materiality.calculatedPm));
const adjustedPmMicros = decimalToScaled(materiality.adjustedPm);
const teMicros = adjustedPmMicros * decimalToScaled(materiality.performancePercent) / 100_000_000n;
const sadMicros = adjustedPmMicros * decimalToScaled(materiality.sadPercent) / 100_000_000n;
assert.equal(teMicros, decimalToScaled(materiality.te));
assert.equal(sadMicros, decimalToScaled(materiality.sad));
const pmAdjustment = adjustedPmMicros - calculatedPmMicros;
assert.ok((pmAdjustment < 0n ? -pmAdjustment : pmAdjustment) * 100n <= calculatedPmMicros * 5n, 'adjusted PM must be within inclusive five percent');
for (const boundary of materiality.riskBoundaries) {
  const amount = decimalToScaled(boundary.absoluteBalance);
  const band = boundary.significantEstimate || boundary.highInherentRisk ? 'RED' : amount < teMicros ? 'GREEN' : amount < adjustedPmMicros ? 'AMBER' : 'RED';
  assert.equal(band, boundary.expectedBand, `risk band at ${boundary.absoluteBalance}`);
}
for (const item of materiality.differenceBoundaries) {
  const label = decimalToScaled(item.absoluteDifference) <= sadMicros ? 'CLEARLY_TRIVIAL' : 'ACCUMULATE_AND_ASSESS';
  assert.equal(label, item.expected, `SAD boundary at ${item.absoluteDifference}`);
}
assert.ok(materiality.invalidBenchmarks.every((value) => decimalToScaled(value) <= 0n), 'zero and negative benchmarks fail closed');
for (const item of materiality.qarHalfEven) {
  const amount = decimalToScaled(item.input);
  const negative = amount < 0n;
  const magnitude = negative ? -amount : amount;
  let cents = magnitude / 10_000n;
  const remainder = magnitude % 10_000n;
  if (remainder > 5_000n || (remainder === 5_000n && cents % 2n === 1n)) cents += 1n;
  const display = `${negative && cents > 0n ? '-' : ''}${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
  assert.equal(display, item.display, `QAR half-even ${item.input}`);
}
assert.equal(materiality.zeroPrior.expectedStatus, 'NO_BASE');
assert.equal(materiality.zeroPrior.expectedPercentage, null);

const mus = fixture.sampling.mus;
const eligible = mus.population.filter(([, amount]) => decimalToScaled(amount) > 0n);
assert.deepEqual(eligible.map(([id]) => id), mus.eligibleIds);
let cumulative = 0n;
let nextPoint = decimalToScaled(mus.interval);
const selected = [];
for (const [id, amount] of eligible) {
  cumulative += decimalToScaled(amount);
  if (cumulative >= nextPoint) {
    selected.push(id);
    while (cumulative >= nextPoint) nextPoint += decimalToScaled(mus.interval);
  }
}
assert.deepEqual(selected, mus.expectedSelectedIds);
assert.equal(eligible.reduce((sum, [, amount]) => sum + decimalToScaled(amount), 0n), decimalToScaled(mus.expectedEligibleDebitTotal));
assert.equal(selected.reduce((sum, id) => sum + decimalToScaled(eligible.find(([candidate]) => candidate === id)[1]), 0n), decimalToScaled(mus.expectedSelectedAbsoluteTotal));

const systematic = fixture.sampling.systematicRandom;
assert.equal(systematic.populationCount, systematic.orderedIds.length);
const start = Number(systematic.start);
const interval = systematic.populationCount / systematic.sampleSize;
const systematicIds = Array.from({ length: systematic.sampleSize }, (_, k) => systematic.orderedIds[Math.floor(start + k * interval)]);
assert.deepEqual(systematicIds, systematic.expectedSelectedIds);

const MASK = (1n << 64n) - 1n;
const GOLDEN = 0x9e3779b97f4a7c15n;
const MIX_A = 0xbf58476d1ce4e5b9n;
const MIX_B = 0x94d049bb133111ebn;
function drawIndexesFrom(candidates, take, seed) {
  const pool = [...candidates];
  const drawn = [];
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
  return drawn.sort((a, b) => a - b);
}
const attribute = fixture.sampling.stratifiedAttribute;
const allStrataIds = attribute.strata.flatMap((stratum) => stratum.populationIds);
assert.equal(new Set(allStrataIds).size, allStrataIds.length, 'strata must be disjoint');
const routine = attribute.strata.find((stratum) => stratum.name === 'ROUTINE');
const routineSelection = drawIndexesFrom(routine.populationIds.map((_id, index) => index), routine.sampleSize, routine.seed).map((index) => routine.populationIds[index]);
assert.deepEqual(routineSelection, routine.expectedSelectedIds);
assert.equal(routine.expectedSelectedIds.length, routine.sampleSize);

const chargeOut = fixture.chargeOut;
const calculatedChargeOut = chargeOut.hoursAndRates.reduce((sum, [hours, rate]) => sum + decimalToScaled(hours) * decimalToScaled(rate) / 1_000_000n, 0n);
assert.equal(calculatedChargeOut, decimalToScaled(chargeOut.chargeOutValue));
assert.equal(decimalToScaled(chargeOut.contractedFee) - calculatedChargeOut, decimalToScaled(chargeOut.expectedMetric));

console.log('T003 methodology: approval states, preserved requirements, arithmetic boundaries, sampling vectors and charge-out formula passed.');
