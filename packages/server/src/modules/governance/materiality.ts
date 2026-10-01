import { createHash } from 'node:crypto';
import { Decimal6 } from '../../platform/decimal6.js';

/**
 * Pure materiality and risk-band rules, ported from the pinned source
 * (AuditSphereOps.Application/Audit/MaterialityCalculator.cs and
 * AuditSphereOps.Domain/Audit/MaterialityAndRiskBands.cs).
 *
 * No database, clock or randomness. A benchmark that is not positive fails closed rather than
 * producing a zero or negative threshold, and out-of-policy rates are rejected rather than clamped.
 */
export const materialityBenchmarks = ['REVENUE', 'PROFIT_BEFORE_TAX', 'TOTAL_ASSETS', 'NET_ASSETS', 'TOTAL_EXPENSES', 'MAPPED_LINE'] as const;
export type MaterialityBenchmark = (typeof materialityBenchmarks)[number];
export const materialityPolicyVersion = 'STE-MATERIALITY-2026.1';
export const riskBands = ['GREEN', 'AMBER', 'RED'] as const;
export type RiskBand = (typeof riskBands)[number];

const rateRanges: Record<string, { min: Decimal6; max: Decimal6 }> = {
  REVENUE: { min: Decimal6.from('0.5'), max: Decimal6.from('2') },
  PROFIT_BEFORE_TAX: { min: Decimal6.from('3'), max: Decimal6.from('10') },
  TOTAL_ASSETS: { min: Decimal6.from('0.5'), max: Decimal6.from('2') },
  NET_ASSETS: { min: Decimal6.from('1'), max: Decimal6.from('5') },
  TOTAL_EXPENSES: { min: Decimal6.from('0.5'), max: Decimal6.from('2') },
  MAPPED_LINE: { min: Decimal6.from('0.5'), max: Decimal6.from('10') },
};
const performanceRange = { min: Decimal6.from('50'), max: Decimal6.from('75') };
const trivialRange = { min: Decimal6.from('1'), max: Decimal6.from('5') };
const incomeSections = ['INCOME', 'REVENUE', 'P&L', 'PROFIT_LOSS', 'P_AND_L'];

/** One mapped trial-balance line: signed amount, debit positive, in its statement section. */
export type MappedBenchmarkLine = { sourceAccountCode: string; destinationCode: string; statementSection: string; amount: Decimal6 };

const inSection = (line: MappedBenchmarkLine, names: readonly string[]) => names.includes(line.statementSection.trim().toUpperCase());
const isTax = (line: MappedBenchmarkLine) => line.destinationCode.toUpperCase().includes('TAX');

/** Selects the lines that make up the benchmark. Returns null when no supported benchmark applies. */
export function deriveBenchmark(kind: string, destinationCode: string | null, lines: readonly MappedBenchmarkLine[]): { amount: Decimal6; lineCount: number } | null {
  let chosen: MappedBenchmarkLine[];
  let sign: (value: Decimal6) => Decimal6;
  switch (kind) {
    case 'REVENUE': chosen = lines.filter((line) => inSection(line, incomeSections)); sign = (value) => value.negate(); break;
    case 'PROFIT_BEFORE_TAX': chosen = lines.filter((line) => (inSection(line, incomeSections) || inSection(line, ['EXPENSE', 'EXPENSES'])) && !isTax(line)); sign = (value) => value.negate(); break;
    case 'TOTAL_ASSETS': chosen = lines.filter((line) => inSection(line, ['ASSETS', 'ASSET'])); sign = (value) => value; break;
    case 'NET_ASSETS': chosen = lines.filter((line) => inSection(line, ['ASSETS', 'ASSET', 'LIABILITIES', 'LIABILITY'])); sign = (value) => value; break;
    case 'TOTAL_EXPENSES': chosen = lines.filter((line) => inSection(line, ['EXPENSE', 'EXPENSES'])); sign = (value) => value; break;
    case 'MAPPED_LINE': {
      if (!destinationCode || !destinationCode.trim()) return null;
      const wanted = destinationCode.trim().toLowerCase();
      chosen = lines.filter((line) => line.destinationCode.toLowerCase() === wanted);
      sign = (value) => value.abs();
      break;
    }
    default: return null;
  }
  if (chosen.length === 0) return null;
  return { amount: sign(Decimal6.sum(chosen.map((line) => line.amount))), lineCount: chosen.length };
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

export type MaterialityFigures = { benchmarkAmount: Decimal6; sourceLineCount: number; planningMateriality: Decimal6; tolerableError: Decimal6; sadThreshold: Decimal6 };

/** Three-tier materiality. PM = benchmark × rate; TE = PM × performance; SAD = PM × trivial. */
export function calculateMateriality(benchmarkAmount: Decimal6, sourceLineCount: number, ratePercent: Decimal6, performancePercent: Decimal6, trivialPercent: Decimal6): MaterialityFigures {
  if (!benchmarkAmount.isPositive()) throw new Error('The benchmark must be positive.');
  const planningMateriality = Decimal6.percentOf(benchmarkAmount, ratePercent);
  return {
    benchmarkAmount,
    sourceLineCount,
    planningMateriality,
    tolerableError: Decimal6.percentOf(planningMateriality, performancePercent),
    sadThreshold: Decimal6.percentOf(planningMateriality, trivialPercent),
  };
}

export function materialityInputHash(input: {
  mappingVersionId: string; datasetDigest: string; kind: string; destinationCode: string | null;
  benchmarkAmount: Decimal6; ratePercent: Decimal6; performancePercent: Decimal6; trivialPercent: Decimal6;
}): string {
  return createHash('sha256').update([
    'materiality.v1', materialityPolicyVersion, input.mappingVersionId.toLowerCase(), input.datasetDigest, input.kind,
    (input.destinationCode ?? '').trim().toUpperCase(),
    input.benchmarkAmount.toFixed(6), input.ratePercent.toFixed(4), input.performancePercent.toFixed(4), input.trivialPercent.toFixed(4),
  ].join('|')).digest('hex');
}

export const riskBandRuleVersion = 'STE-RISK-BAND-2026.1';

/**
 * Pure green/amber/red routing rule. A significant or fraud risk is always red; otherwise
 * likelihood × magnitude of 6+ is red, 3–4 amber and 1–2 green. This routes work; it is not a
 * professional judgment.
 */
export function riskBand(likelihood: number, magnitude: number, significant: boolean, fraudRisk: boolean): RiskBand {
  if (!Number.isInteger(likelihood) || likelihood < 1 || likelihood > 3 || !Number.isInteger(magnitude) || magnitude < 1 || magnitude > 3)
    throw new Error('Likelihood and magnitude must be integers from 1 to 3');
  if (significant || fraudRisk) return 'RED';
  const score = likelihood * magnitude;
  return score >= 6 ? 'RED' : score >= 3 ? 'AMBER' : 'GREEN';
}

/** Minimum staffing rank that may own the response: green any (1), amber senior (2), red manager (3). */
export function minimumRiskOwnerRank(band: string): number { return band === 'RED' ? 3 : band === 'AMBER' ? 2 : 1; }

export function riskRoute(band: string): string {
  if (band === 'RED') return 'Audit Manager or above performs; Engagement Partner review is mandatory before planning completes.';
  if (band === 'AMBER') return 'Senior Auditor or above performs; Audit Manager reviews.';
  return 'Assignable to a Staff Associate; standard review.';
}
