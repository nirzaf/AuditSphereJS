import { Decimal6, roundHalfEvenDiv } from '../../platform/decimal6.js';

/**
 * Contracted fee less lifetime approved-time standard value, ported from the pinned source
 * (AuditSphereOps.Application/Practice/ContractContributionCalculator.cs).
 *
 * This is the D07 metric: contracted fee minus hours × charge-out-rate. It is NOT payroll-cost
 * profit and must never be labelled as one. The source returns `null` — not zero — whenever the
 * figure is unavailable, so a missing rate, a foreign currency or a negative input never silently
 * reads as "full contribution".
 *
 * Arithmetic: minutes × rate / 60 is summed as an exact rational (every row shares the denominator
 * 60) and rounded once, half-to-even, to six decimals — matching `MoneyPolicy.Normalize` after the
 * C# `decimal` sum. No database, clock or network access.
 */
const UNIT = 10n ** 6n;

export type ContractTimeValue = {
  minutes: number;
  capturedRate: Decimal6 | null;
  currency: string | null;
};
export type ContractContribution = {
  lifetimeStandardValue: Decimal6;
  feeLessStandardValue: Decimal6;
};

/** Rebuild a Decimal6 from an exact 10^-6-unit integer, without an intermediate string round-trip. */
function fromMinor(minor: bigint): Decimal6 {
  const negative = minor < 0n;
  const magnitude = negative ? -minor : minor;
  const whole = magnitude / UNIT;
  const fraction = (magnitude % UNIT).toString().padStart(6, '0');
  return Decimal6.from(`${negative ? '-' : ''}${whole}.${fraction}`);
}

/** Returns an error message, or null when the input is valid. */
export function validateContractContribution(fee: Decimal6, currency: string, approvedTime: readonly ContractTimeValue[]): string | null {
  if (fee.compare(Decimal6.zero()) < 0) return 'A contracted fee cannot be negative.';
  if (!currency || !currency.trim()) return 'A contracted fee currency is required.';
  for (const entry of approvedTime) {
    if (!Number.isSafeInteger(entry.minutes) || entry.minutes < 0) return 'Approved time must be a non-negative whole number of minutes.';
    if (entry.capturedRate === null) return 'Approved time is missing its captured rate; the contribution cannot be computed.';
    if (entry.capturedRate.compare(Decimal6.zero()) < 0) return 'A captured rate cannot be negative.';
    if (entry.currency === null || entry.currency !== currency) return 'Approved time must be recorded in the contracted fee currency.';
  }
  return null;
}

/**
 * Computes the contribution, or null when the figure is unavailable.
 * An empty time list is a valid zero standard value, so the contribution equals the fee.
 */
export function calculateContractContribution(fee: Decimal6, currency: string, approvedTime: readonly ContractTimeValue[]): ContractContribution | null {
  if (validateContractContribution(fee, currency, approvedTime) !== null) return null;
  // Σ (minutes × rate) / 60, shared denominator, rounded once half-to-even to 10^-6 units.
  let numerator = 0n;
  for (const entry of approvedTime) numerator += BigInt(entry.minutes) * (entry.capturedRate as Decimal6).minor;
  const lifetimeStandardValue = fromMinor(roundHalfEvenDiv(numerator, 60n));
  return { lifetimeStandardValue, feeLessStandardValue: fee.subtract(lifetimeStandardValue) };
}