import { createHash } from 'node:crypto';
import { Decimal6 } from '../../platform/decimal6.js';

/**
 * Pure quotation fee model, ported from the pinned source
 * (AuditSphereOps.Application/Practice/QuotationCalculator.cs and CommercialApprovalMatrix.cs).
 *
 * sum(hours × rate) → complexity factor → risk premium → discount. Every stage is rounded to
 * currency precision (two decimals, half-to-even) so the breakdown always sums to the fee.
 * Rates are inputs, never looked up here. Out-of-range or missing inputs fail closed instead of
 * defaulting to zero. No database, clock, network or generated identifiers.
 */
export const quotationCurrencyScale = 2;
export const minimumComplexity = Decimal6.from('0.5');
export const maximumComplexity = Decimal6.from('3');
export const maximumPercent = Decimal6.from('100');
export const maximumQuotationLines = 100;
export const maximumHoursPerLine = Decimal6.from('100000');

export type QuotationLineInput = { role: string; activity: string; hours: Decimal6; ratePerHour: Decimal6; rateCardVersionId: string };
export type QuotationPricingInput = { currency: string; lines: readonly QuotationLineInput[]; complexityFactor: Decimal6; riskPremiumPercent: Decimal6; discountPercent: Decimal6 };
export type QuotationLineResult = { role: string; activity: string; hours: Decimal6; ratePerHour: Decimal6; amount: Decimal6; rateCardVersionId: string };
export type QuotationPricingResult = { lines: QuotationLineResult[]; baseAmount: Decimal6; complexityAmount: Decimal6; riskPremiumAmount: Decimal6; discountAmount: Decimal6; fee: Decimal6 };

const compareOrdinalIgnoreCase = (left: string, right: string): number => {
  const a = left.toUpperCase();
  const b = right.toUpperCase();
  return a < b ? -1 : a > b ? 1 : 0;
};

/** Returns an error message, or null when the input is valid. */
export function validateQuotation(input: QuotationPricingInput): string | null {
  if (!input.currency || input.currency.trim().length !== 3) return 'A three-letter currency is required.';
  if (!input.lines || input.lines.length < 1 || input.lines.length > maximumQuotationLines) return `A quotation needs 1 to ${maximumQuotationLines} hour lines.`;
  for (const line of input.lines) {
    if (!line.role?.trim() || !line.activity?.trim()) return 'Every line needs a role and an activity.';
    if (!line.hours.isPositive() || line.hours.compare(maximumHoursPerLine) > 0 || !line.hours.equals(line.hours.roundTo(2)))
      return 'Hours must be positive, at most two decimals and within bounds.';
    if (!line.ratePerHour.isPositive())
      return `No approved rate is available for ${line.role} / ${line.activity}; approve a rate card before quoting.`;
  }
  const seen = new Set<string>();
  for (const line of input.lines) {
    const key = line.role.trim().toUpperCase() + '\u0000' + line.activity.trim().toUpperCase();
    if (seen.has(key)) return 'Each role and activity may appear on one line only.';
    seen.add(key);
  }
  if (input.complexityFactor.compare(minimumComplexity) < 0 || input.complexityFactor.compare(maximumComplexity) > 0)
    return `The complexity factor must be between ${minimumComplexity.toTrimmed()} and ${maximumComplexity.toTrimmed()}.`;
  if (input.riskPremiumPercent.compare(Decimal6.zero()) < 0 || input.riskPremiumPercent.compare(maximumPercent) > 0) return 'The risk premium must be between 0 and 100 percent.';
  if (input.discountPercent.compare(Decimal6.zero()) < 0 || input.discountPercent.compare(maximumPercent) > 0) return 'The discount must be between 0 and 100 percent.';
  return null;
}

export function calculateQuotation(input: QuotationPricingInput): QuotationPricingResult {
  const error = validateQuotation(input);
  if (error !== null) throw new Error(error);
  const lines = [...input.lines]
    .sort((left, right) => compareOrdinalIgnoreCase(left.role, right.role) || compareOrdinalIgnoreCase(left.activity, right.activity))
    .map((line) => ({ role: line.role.trim(), activity: line.activity.trim(), hours: line.hours, ratePerHour: line.ratePerHour, amount: line.hours.multiplyRound2(line.ratePerHour), rateCardVersionId: line.rateCardVersionId }));
  const baseAmount = Decimal6.sum(lines.map((line) => line.amount));
  const adjusted = baseAmount.multiplyRound2(input.complexityFactor);
  const complexityAmount = adjusted.subtract(baseAmount);
  const riskPremiumAmount = Decimal6.percentOf(adjusted, input.riskPremiumPercent);
  const preDiscount = adjusted.add(riskPremiumAmount);
  const discountAmount = Decimal6.percentOf(preDiscount, input.discountPercent);
  return { lines, baseAmount, complexityAmount, riskPremiumAmount, discountAmount, fee: preDiscount.subtract(discountAmount) };
}

/** Canonical hash of the priced inputs so an identical recalculation is recognized and a change is visible. */
export function quotationInputHash(input: QuotationPricingInput, nonStandardTerms: boolean, note: string | null): string {
  const lines = [...input.lines]
    .sort((left, right) => compareOrdinalIgnoreCase(left.role, right.role) || compareOrdinalIgnoreCase(left.activity, right.activity))
    .map((line) => [line.role.trim().toUpperCase(), line.activity.trim().toUpperCase(), line.hours.toFixed(2), line.ratePerHour.toFixed(6), line.rateCardVersionId.toLowerCase()].join(','));
  const canonical = [
    input.currency.trim().toUpperCase(), lines.join(';'), input.complexityFactor.toFixed(4), input.riskPremiumPercent.toFixed(4), input.discountPercent.toFixed(4),
    nonStandardTerms ? 'NST' : 'STD', (note ?? '').trim(),
  ].join('|');
  return createHash('sha256').update(canonical).digest('hex');
}

// --- Configurable approval matrix -------------------------------------------------------------
export const commercialRuleKinds = { discountOver: 'DISCOUNT_OVER_PERCENT', nonStandardTerms: 'NON_STANDARD_TERMS' } as const;
export const defaultDiscountThresholdPercent = Decimal6.from('10');
export const defaultApprovalRole = 'Partner';

export type CommercialApprovalRule = { id: string; kind: string; thresholdPercent?: Decimal6 | null; requiredRole: string; active: boolean };
export type RequiredApproval = { ruleKey: string; role: string; reason: string };

const formatPercent = (value: Decimal6) => value.roundTo(2).toTrimmed();

/**
 * Pure evaluation of the approval matrix. Discount bands select the single highest band the
 * discount strictly exceeds; non-standard-terms rules all apply. With no active configured rule of
 * a kind a documented fail-safe default applies, so an unconfigured firm is never unguarded.
 */
export function requiredApprovals(rules: readonly CommercialApprovalRule[], discountPercent: Decimal6, nonStandardTerms: boolean): RequiredApproval[] {
  const active = rules.filter((rule) => rule.active);
  const required: RequiredApproval[] = [];
  const bands = active.filter((rule) => rule.kind === commercialRuleKinds.discountOver && rule.thresholdPercent != null);
  if (bands.length === 0) {
    if (discountPercent.compare(defaultDiscountThresholdPercent) > 0)
      required.push({ ruleKey: 'DEFAULT:DISCOUNT', role: defaultApprovalRole, reason: `Discount ${formatPercent(discountPercent)}% exceeds the default ${formatPercent(defaultDiscountThresholdPercent)}% (no rule configured).` });
  } else {
    const band = bands
      .filter((rule) => discountPercent.compare(rule.thresholdPercent as Decimal6) > 0)
      .sort((left, right) => (right.thresholdPercent as Decimal6).compare(left.thresholdPercent as Decimal6))[0];
    if (band) required.push({ ruleKey: band.id.toLowerCase(), role: band.requiredRole, reason: `Discount ${formatPercent(discountPercent)}% exceeds the ${formatPercent(band.thresholdPercent as Decimal6)}% band.` });
  }
  if (nonStandardTerms) {
    const terms = active.filter((rule) => rule.kind === commercialRuleKinds.nonStandardTerms);
    if (terms.length === 0) required.push({ ruleKey: 'DEFAULT:TERMS', role: defaultApprovalRole, reason: 'Non-standard contractual terms (no rule configured).' });
    else for (const rule of terms) required.push({ ruleKey: rule.id.toLowerCase(), role: rule.requiredRole, reason: 'Non-standard contractual terms.' });
  }
  return required;
}
