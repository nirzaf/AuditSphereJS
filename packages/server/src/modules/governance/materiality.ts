import { createHash } from 'node:crypto';
import { Decimal6 } from '../../platform/decimal6.js';

/**
 * Pure materiality and risk-band rules, ported from the pinned source
 * (AuditSphereOps.Application/Audit/MaterialityCalculator.cs and
 * AuditSphereOps.Domain/Audit/MaterialityAndRiskBands.cs), then aligned to
 * docs/requirements/CURRENT.md section 4.2.4 by decision D19.
 *
 * No database, clock or randomness. A benchmark that is not positive fails closed rather than
 * producing a zero or negative threshold, and out-of-policy rates are rejected rather than clamped.
 * Only the four CURRENT benchmarks are offered. Profit before tax is normalized only through
 * recorded, approved adjustments that the caller supplies.
 */
export const materialityBenchmarks = ['REVENUE', 'PROFIT_BEFORE_TAX', 'TOTAL_ASSETS', 'NET_ASSETS'] as const;
export type MaterialityBenchmark = (typeof materialityBenchmarks)[number];
export const materialityPolicyVersion = 'STE-MATERIALITY-2026.2';
export const riskBands = ['GREEN', 'AMBER', 'RED'] as const;
export type RiskBand = (typeof riskBands)[number];

/** CURRENT 4.2.4 benchmark percentages. The source calculator's wider ranges are not used (D19). */
const rateRanges: Record<string, { min: Decimal6; max: Decimal6 }> = {
  REVENUE: { min: Decimal6.from('0.5'), max: Decimal6.from('2') },
  PROFIT_BEFORE_TAX: { min: Decimal6.from('5'), max: Decimal6.from('10') },
  TOTAL_ASSETS: { min: Decimal6.from('0.5'), max: Decimal6.from('1') },
  NET_ASSETS: { min: Decimal6.from('1'), max: Decimal6.from('2') },
};
/** CURRENT 4.2.4: tolerable error is 50%–75% of planning materiality. */
const performanceRange = { min: Decimal6.from('50'), max: Decimal6.from('75') };
/** CURRENT 4.2.4: the SAD threshold is 3%–5% of planning materiality. */
const trivialRange = { min: Decimal6.from('3'), max: Decimal6.from('5') };
/** CURRENT 4.2.4: manager practical rounding may move planning materiality by at most this share of the computed value. */
export const practicalRoundingLimitPercent = Decimal6.from('5');
const incomeSections = ['INCOME', 'REVENUE', 'P&L', 'PROFIT_LOSS', 'P_AND_L'];

/** One mapped trial-balance line: signed amount, debit positive, in its statement section. */
export type MappedBenchmarkLine = { sourceAccountCode: string; destinationCode: string; statementSection: string; amount: Decimal6 };

/** A recorded, approved one-off adjustment to profit before tax (D19). A positive amount increases profit. */
export type NormalizationAdjustment = { description: string; amount: Decimal6 };

const inSection = (line: MappedBenchmarkLine, names: readonly string[]) => names.includes(line.statementSection.trim().toUpperCase());
const isTax = (line: MappedBenchmarkLine) => line.destinationCode.toUpperCase().includes('TAX');

/**
 * Selects the lines that make up the benchmark and applies any normalization. Returns null when no
 * supported benchmark applies. Normalization is accepted only for profit before tax.
 */
export function deriveBenchmark(kind: string, lines: readonly MappedBenchmarkLine[], adjustments: readonly NormalizationAdjustment[] = []): { amount: Decimal6; lineCount: number; normalization: Decimal6 } | null {
  if (kind !== 'PROFIT_BEFORE_TAX' && adjustments.length > 0) throw new Error('Only profit before tax can be normalized.');
  let chosen: MappedBenchmarkLine[];
  let sign: (value: Decimal6) => Decimal6;
  switch (kind) {
    case 'REVENUE': chosen = lines.filter((line) => inSection(line, incomeSections)); sign = (value) => value.negate(); break;
    case 'PROFIT_BEFORE_TAX': chosen = lines.filter((line) => (inSection(line, incomeSections) || inSection(line, ['EXPENSE', 'EXPENSES'])) && !isTax(line)); sign = (value) => value.negate(); break;
    case 'TOTAL_ASSETS': chosen = lines.filter((line) => inSection(line, ['ASSETS', 'ASSET'])); sign = (value) => value; break;
    case 'NET_ASSETS': chosen = lines.filter((line) => inSection(line, ['ASSETS', 'ASSET', 'LIABILITIES', 'LIABILITY'])); sign = (value) => value; break;
    default: return null;
  }
  if (chosen.length === 0) return null;
  const base = sign(Decimal6.sum(chosen.map((line) => line.amount)));
  const normalization = adjustments.length > 0 ? Decimal6.sum(adjustments.map((adjustment) => adjustment.amount)) : Decimal6.zero();
  return { amount: base.add(normalization), lineCount: chosen.length, normalization };
}

/** Returns a policy message when the rate, tolerable-error percentage or SAD percentage is out of policy. */
export function validateMateriality(kind: string, ratePercent: Decimal6, performancePercent: Decimal6, trivialPercent: Decimal6): string | null {
  const range = rateRanges[kind];
  if (!range) return 'Choose a supported benchmark.';
  if (ratePercent.compare(range.min) < 0 || ratePercent.compare(range.max) > 0)
    return `The rate for ${kind} must be between ${range.min.toFixed(6)}% and ${range.max.toFixed(6)}% under ${materialityPolicyVersion}.`;
  if (performancePercent.compare(performanceRange.min) < 0 || performancePercent.compare(performanceRange.max) > 0)
    return `Tolerable error must be ${performanceRange.min.toFixed(6)}%–${performanceRange.max.toFixed(6)}% of planning materiality.`;
  if (trivialPercent.compare(trivialRange.min) < 0 || trivialPercent.compare(trivialRange.max) > 0)
    return `The SAD threshold must be ${trivialRange.min.toFixed(6)}%–${trivialRange.max.toFixed(6)}% of planning materiality.`;
  return null;
}

/**
 * Manager practical rounding (CURRENT 4.2.4). The rounded planning materiality must stay within
 * plus or minus 5% of the computed value. The comparison is exact: |rounded − computed| × 100 must
 * not exceed computed × 5.
 */
export function roundingPolicyMessage(computed: Decimal6, rounded: Decimal6): string | null {
  if (!computed.isPositive()) return 'The computed planning materiality must be positive.';
  if (!rounded.isPositive()) return 'The rounded planning materiality must be positive.';
  const deviation = rounded.subtract(computed).abs();
  if (deviation.multiply(Decimal6.from('100')).compare(computed.multiply(practicalRoundingLimitPercent)) > 0)
    return `Manager rounding may move planning materiality by at most ${practicalRoundingLimitPercent.toFixed(6)}% of the computed value under ${materialityPolicyVersion}.`;
  return null;
}

export type MaterialityFigures = { benchmarkAmount: Decimal6; sourceLineCount: number; rawPlanningMateriality: Decimal6; planningMateriality: Decimal6; tolerableError: Decimal6; sadThreshold: Decimal6 };

/**
 * Three-tier materiality. PM = benchmark × rate, optionally rounded within policy; TE = PM × performance;
 * SAD = PM × trivial. The computed value is kept beside the applied value so the rounding is visible.
 */
export function calculateMateriality(benchmarkAmount: Decimal6, sourceLineCount: number, ratePercent: Decimal6, performancePercent: Decimal6, trivialPercent: Decimal6, roundedPlanningMateriality?: Decimal6): MaterialityFigures {
  if (!benchmarkAmount.isPositive()) throw new Error('The benchmark must be positive.');
  const rawPlanningMateriality = Decimal6.percentOf(benchmarkAmount, ratePercent);
  if (roundedPlanningMateriality) {
    const problem = roundingPolicyMessage(rawPlanningMateriality, roundedPlanningMateriality);
    if (problem) throw new Error(problem);
  }
  const planningMateriality = roundedPlanningMateriality ?? rawPlanningMateriality;
  return {
    benchmarkAmount,
    sourceLineCount,
    rawPlanningMateriality,
    planningMateriality,
    tolerableError: Decimal6.percentOf(planningMateriality, performancePercent),
    sadThreshold: Decimal6.percentOf(planningMateriality, trivialPercent),
  };
}

/** Input hash for an assessment. The 'v2' prefix separates these hashes from the earlier calculator's. */
export function materialityInputHash(input: {
  mappingVersionId: string; datasetDigest: string; kind: string;
  benchmarkAmount: Decimal6; normalization: readonly NormalizationAdjustment[];
  rawPlanningMateriality: Decimal6; planningMateriality: Decimal6;
  ratePercent: Decimal6; performancePercent: Decimal6; trivialPercent: Decimal6;
}): string {
  const adjustments = input.normalization.map((adjustment) => `${adjustment.description.trim()}=${adjustment.amount.toFixed(6)}`).sort().join(';');
  return createHash('sha256').update([
    'materiality.v2', materialityPolicyVersion, input.mappingVersionId.toLowerCase(), input.datasetDigest, input.kind,
    input.benchmarkAmount.toFixed(6), adjustments, input.rawPlanningMateriality.toFixed(6), input.planningMateriality.toFixed(6),
    input.ratePercent.toFixed(4), input.performancePercent.toFixed(4), input.trivialPercent.toFixed(4),
  ].join('|')).digest('hex');
}

export const riskBandRuleVersion = 'STE-RISK-BAND-2026.2';
/** The likelihood-by-impact rule that CURRENT does not define. Rows written under it stay valid under it. */
export const supersededRiskBandRuleVersion = 'STE-RISK-BAND-2026.1';

export interface RiskColourInputs {
  /** The account balance. Its sign is ignored, so a credit balance is stratified like a debit of equal size. */
  balance: Decimal6;
  tolerableError: Decimal6;
  planningMateriality: Decimal6;
}

/**
 * CURRENT section 4 stratification on the absolute balance, with the boundaries of D05: GREEN iff
 * |balance| < TE, AMBER iff TE <= |balance| < PM, RED iff |balance| >= PM. A significant estimate or
 * high inherent risk (the fraud flag) forces RED regardless of amount. This routes review; it is not
 * a professional judgment.
 */
export function riskBand(inputs: RiskColourInputs, significant: boolean, fraudRisk: boolean): RiskBand {
  const { balance, tolerableError, planningMateriality } = inputs;
  if (!tolerableError.isPositive() || planningMateriality.compare(tolerableError) < 0)
    throw new Error('Tolerable error must be positive and must not exceed planning materiality');
  if (significant || fraudRisk) return 'RED';
  const size = balance.abs();
  if (size.compare(planningMateriality) >= 0) return 'RED';
  return size.compare(tolerableError) >= 0 ? 'AMBER' : 'GREEN';
}

/** Minimum staffing rank that may own the response: green any (1), amber senior (2), red manager (3). */
export function minimumRiskOwnerRank(band: string): number { return band === 'RED' ? 3 : band === 'AMBER' ? 2 : 1; }

export function riskRoute(band: string): string {
  if (band === 'RED') return 'Audit Manager or above performs; Engagement Partner review is mandatory before planning completes.';
  if (band === 'AMBER') return 'Senior Auditor or above performs; Audit Manager reviews.';
  return 'Assignable to a Staff Associate; standard review.';
}
