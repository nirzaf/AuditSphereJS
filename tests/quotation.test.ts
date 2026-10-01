import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  Decimal6, calculateQuotation, quotationInputHash, requiredApprovals, validateQuotation,
  commercialRuleKinds, type CommercialApprovalRule, type QuotationLineInput, type QuotationPricingInput,
} from '@auditsphere/server';

const fixture = JSON.parse(readFileSync('fixtures/characterization/quotation.json', 'utf8'));
const byId = (id: string) => fixture.cases.find((item: { id: string }) => item.id === id)!;
const lines = (raw: Array<{ role: string; activity: string; hours: string; ratePerHour: string; rateCardVersionId: string }>): QuotationLineInput[] =>
  raw.map((line) => ({ role: line.role, activity: line.activity, hours: Decimal6.from(line.hours), ratePerHour: Decimal6.from(line.ratePerHour), rateCardVersionId: line.rateCardVersionId }));
const pricing = (item: { input: { currency: string; lines: unknown[]; complexityFactor: string; riskPremiumPercent: string; discountPercent: string } }): QuotationPricingInput => ({
  currency: item.input.currency,
  lines: lines(item.input.lines as never),
  complexityFactor: Decimal6.from(item.input.complexityFactor),
  riskPremiumPercent: Decimal6.from(item.input.riskPremiumPercent),
  discountPercent: Decimal6.from(item.input.discountPercent),
});

describe('quotation calculator ported from the pinned source', () => {
  it('reproduces the quoted fee breakdown', () => {
    const item = byId('fee-breakdown-order');
    const result = calculateQuotation(pricing(item));
    expect(result.baseAmount.toFixed(2)).toBe(Decimal6.from(item.expected.baseAmount).toFixed(2));
    expect(result.complexityAmount.toFixed(2)).toBe(Decimal6.from(item.expected.complexityAmount).toFixed(2));
    expect(result.riskPremiumAmount.toFixed(2)).toBe(Decimal6.from(item.expected.riskPremiumAmount).toFixed(2));
    expect(result.discountAmount.toFixed(2)).toBe(Decimal6.from(item.expected.discountAmount).toFixed(2));
    expect(result.fee.toFixed(2)).toBe(Decimal6.from(item.expected.fee).toFixed(2));
    // The breakdown always reconciles to the fee.
    expect(result.baseAmount.add(result.complexityAmount).add(result.riskPremiumAmount).subtract(result.discountAmount).equals(result.fee)).toBe(true);
    // Lines are ordered for a stable, readable quote.
    expect(result.lines.map((line) => line.role)).toEqual(['Manager', 'Partner']);
  });

  it('is order-invariant for the fee and hash, and a change to terms or discount changes the hash', () => {
    const item = byId('line-order-invariance');
    const forward = pricing(item);
    const reversed: QuotationPricingInput = { ...forward, lines: [...forward.lines].reverse() };
    expect(calculateQuotation(forward).fee.equals(calculateQuotation(reversed).fee)).toBe(true);
    const note = item.input.note as string;
    const baseHash = quotationInputHash(forward, false, null);
    expect(quotationInputHash(reversed, false, null)).toBe(baseHash);
    expect(quotationInputHash(forward, false, null)).not.toBe(quotationInputHash({ ...forward, discountPercent: Decimal6.from('1') }, false, null));
    expect(quotationInputHash(forward, true, note)).not.toBe(baseHash);
    expect(baseHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rounds every stage to currency precision', () => {
    const item = byId('per-stage-currency-rounding');
    const result = calculateQuotation(pricing(item));
    for (const amount of [result.baseAmount, result.complexityAmount, result.riskPremiumAmount, result.discountAmount, result.fee]) {
      expect(amount.equals(amount.roundTo(2))).toBe(true);
    }
    expect(item.expected.allAmountsRoundedToMinorUnit).toBe(true);
  });

  it('fails closed on out-of-range factors instead of defaulting to zero', () => {
    const item = byId('out-of-range-factors');
    const base = pricing(byId('fee-breakdown-order'));
    for (const override of item.input.cases as Array<Record<string, string>>) {
      const candidate: QuotationPricingInput = { ...base, ...Object.fromEntries(Object.entries(override).map(([key, value]) => [key, Decimal6.from(value)])) };
      expect(validateQuotation(candidate), JSON.stringify(override)).not.toBeNull();
      expect(() => calculateQuotation(candidate)).toThrow();
    }
    // Missing rate, duplicate line, bad hours and bad currency are rejected, not zero-filled.
    const missingRate = { ...base, lines: [{ ...base.lines[0], ratePerHour: Decimal6.zero() }] };
    expect(validateQuotation(missingRate)).toMatch(/No approved rate/);
    const duplicate = { ...base, lines: [base.lines[0], { ...base.lines[1], role: 'partner', activity: 'AUDIT' }] };
    expect(validateQuotation(duplicate)).toMatch(/one line only/);
    const badHours = { ...base, lines: [{ ...base.lines[0], hours: Decimal6.from('1.234') }] };
    expect(validateQuotation(badHours)).toMatch(/two decimals/);
    expect(validateQuotation({ ...base, currency: 'QA' })).toMatch(/three-letter currency/);
  });

  it('applies the quoted approval matrix and its fail-safe default', () => {
    const defaultCase = byId('approval-default-threshold');
    expect(requiredApprovals([], Decimal6.from(defaultCase.input.discountPercent), defaultCase.input.nonStandardTerms).map((approval) => approval.role)).toEqual(defaultCase.expected.requiredRoles);

    const configured = byId('approval-configured-bands');
    const rules: CommercialApprovalRule[] = configured.input.configuredRules.map((rule: { id: string; kind: string; thresholdPercent?: string; requiredRole: string; active: boolean }) => ({
      id: rule.id, kind: rule.kind, thresholdPercent: rule.thresholdPercent ? Decimal6.from(rule.thresholdPercent) : null, requiredRole: rule.requiredRole, active: rule.active,
    }));
    const required = requiredApprovals(rules, Decimal6.from(configured.input.discountPercent), configured.input.nonStandardTerms);
    expect(required.map((approval) => approval.role)).toEqual(configured.expected.requiredRoles);

    // Above the default with no configuration still demands the default role; non-standard terms add theirs.
    const defaultDiscount = requiredApprovals([], Decimal6.from('10.5'), true);
    expect(defaultDiscount.map((approval) => approval.role)).toEqual(['Partner', 'Partner']);
    expect(defaultDiscount[0].ruleKey).toBe('DEFAULT:DISCOUNT');
    expect(defaultDiscount[1].ruleKey).toBe('DEFAULT:TERMS');
    // Exactly the threshold is not 'over'.
    expect(requiredApprovals([], Decimal6.from('10'), false)).toHaveLength(0);
    expect(rules[0].kind).toBe(commercialRuleKinds.discountOver);
  });
});
