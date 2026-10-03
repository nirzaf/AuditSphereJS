type DateValue = Date | string;
type DecimalValue = string | number | { toFixed(scale: number): string };

const isoDate = (value: DateValue) => value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
const isoInstant = (value: DateValue) => value instanceof Date ? value.toISOString() : new Date(value).toISOString();
const decimalText = (value: DecimalValue) => typeof value === 'object' ? value.toFixed(2) : String(value);

export function toCommercialProposalView(proposal: {
  [key: string]: unknown;
  id: string; service: string; periodStart: DateValue; periodEnd: DateValue; totalAmount: DecimalValue; currency: string;
  status: string; revision: number; createdAt: DateValue;
}) {
  return {
    id: proposal.id, service: proposal.service, periodStart: isoDate(proposal.periodStart), periodEnd: isoDate(proposal.periodEnd),
    totalAmount: decimalText(proposal.totalAmount), currency: proposal.currency, status: proposal.status,
    revision: proposal.revision, createdAt: isoInstant(proposal.createdAt),
  };
}

export function toCommercialDualKeyStatus(status: {
  [key: string]: unknown;
  key1Status: string; key1ProposalId: string | null; key2Status: string; key2Reason: string | null;
  letterIssued: boolean; letterText: string | null; letterIssuedAt: DateValue | null;
  clearances: Array<{ [key: string]: unknown; id: string; reason: string; clearedAt: DateValue }>;
}) {
  return {
    key1Status: status.key1Status, key1ProposalId: status.key1ProposalId,
    key2Status: status.key2Status, key2Reason: status.key2Reason, letterIssued: status.letterIssued,
    letterText: status.letterText, letterIssuedAt: status.letterIssuedAt ? isoInstant(status.letterIssuedAt) : null,
    clearances: status.clearances.map(({ id, reason, clearedAt }) => ({ id, reason, clearedAt: isoInstant(clearedAt) })),
  };
}

export function toCommercialRiskClearanceResult(result: unknown) {
  if (!result || typeof result !== 'object') return result;
  const value = result as { id?: unknown; clearedAt?: unknown };
  const clearedAt = value.clearedAt instanceof Date ? value.clearedAt.toISOString() : value.clearedAt;
  return { id: value.id, clearedAt };
}
