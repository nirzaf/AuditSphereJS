type DateValue = Date | string;
type DecimalValue = string | number | { toFixed(scale: number): string };

const isoDate = (value: DateValue) => value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
const isoInstant = (value: DateValue) => value instanceof Date ? value.toISOString() : new Date(value).toISOString();
const decimalText = (value: DecimalValue, scale = 6) => typeof value === 'object' ? value.toFixed(scale) : String(value);

export function toPracticeAccountView(account: { [key: string]: unknown; id: string; code: string; name: string; kind: string; active: boolean; posting: boolean }) {
  return { id: account.id, code: account.code, name: account.name, kind: account.kind, active: account.active, posting: account.posting };
}

export function toPracticePeriodView(period: { [key: string]: unknown; id: string; startsOn: DateValue; endsOn: DateValue; closed: boolean; version: number; lastTransitionReason: string }) {
  return {
    id: period.id, startsOn: isoDate(period.startsOn), endsOn: isoDate(period.endsOn), closed: period.closed,
    version: period.version, lastTransitionReason: period.lastTransitionReason,
  };
}

export function toPracticeJournalView(journal: {
  [key: string]: unknown;
  id: string; periodId: string; accountingDate: DateValue; reference: string; memo: string; status: string; version: number;
  postedAt: DateValue | null; reversalOf: string | null;
  lines?: Array<{ [key: string]: unknown; id: string; accountId: string; position: number; debit: DecimalValue; credit: DecimalValue }>;
}) {
  return {
    id: journal.id, periodId: journal.periodId, accountingDate: isoDate(journal.accountingDate), reference: journal.reference,
    memo: journal.memo, status: journal.status, version: journal.version,
    postedAt: journal.postedAt ? isoInstant(journal.postedAt) : null, reversalOf: journal.reversalOf,
    ...(journal.lines ? { lines: journal.lines.map(line => ({
      id: line.id, accountId: line.accountId, position: line.position, debit: decimalText(line.debit), credit: decimalText(line.credit),
    })) } : {}),
  };
}

export function toPracticeLedgerView(ledger: {
  [key: string]: unknown;
  currency: string;
  accounts: Array<{ [key: string]: unknown; id: string; code: string; name: string; kind: string; active: boolean; posting: boolean }>;
  periods: Array<{ [key: string]: unknown; id: string; startsOn: DateValue; endsOn: DateValue; closed: boolean; version: number; lastTransitionReason: string }>;
  journals: Array<{
    [key: string]: unknown;
    id: string; periodId: string; accountingDate: DateValue; reference: string; memo: string; status: string; version: number;
    postedAt: DateValue | null; reversalOf: string | null;
    lines?: Array<{ [key: string]: unknown; id: string; accountId: string; position: number; debit: DecimalValue; credit: DecimalValue }>;
  }>;
    expenses: Array<{ id: string; journalId: string; reference: string; category: string; amount: DecimalValue; creditAccountId: string; journalStatus: string; journalVersion: number; settledAmount: DecimalValue; outstandingAmount: DecimalValue; settlementAllowed: boolean; receipts: Array<{ id: string; sequence: number; filename: string; contentType: string; sizeBytes: number; createdAt: string }>; receiptAttachable: boolean }>;
  balances: Array<{ accountId: string; code: string; name: string; kind: string; debit: string; credit: string; balance: string }>;
}) {
  return {
    currency: ledger.currency,
    accounts: ledger.accounts.map(toPracticeAccountView),
    periods: ledger.periods.map(toPracticePeriodView),
    journals: ledger.journals.map(toPracticeJournalView),
    expenses: ledger.expenses.map(expense => ({ ...expense, amount: decimalText(expense.amount), settledAmount: decimalText(expense.settledAmount), outstandingAmount: decimalText(expense.outstandingAmount), receipts: expense.receipts.map(receipt => ({ ...receipt, createdAt: isoInstant(receipt.createdAt) })) })),
    balances: ledger.balances.map(({ accountId, code, name, kind, debit, credit, balance }) => ({ accountId, code, name, kind, debit, credit, balance })),
  };
}

export function toPracticeInvoiceView(invoice: {
  [key: string]: unknown;
  id: string; number: number; revision: number; kind: string; proposalId: string; proposalRevision: number;
  contractFee: DecimalValue; amount: DecimalValue; currency: string; dueOn: DateValue | null; status: string; issuedAt: DateValue;
  paidToDate: DecimalValue; receiptIssued: boolean; voidReason: string | null;
  lines: Array<{ position: number; description: string; amount: DecimalValue }>;
}) {
  return {
    id: invoice.id, number: invoice.number, revision: invoice.revision, kind: invoice.kind, proposalId: invoice.proposalId,
    proposalRevision: invoice.proposalRevision, contractFee: decimalText(invoice.contractFee, 2), amount: decimalText(invoice.amount, 2),
    currency: invoice.currency, dueOn: invoice.dueOn ? isoDate(invoice.dueOn) : null, status: invoice.status,
    issuedAt: isoInstant(invoice.issuedAt), paidToDate: decimalText(invoice.paidToDate, 2), receiptIssued: invoice.receiptIssued,
    lines: invoice.lines.map(line => ({ position: line.position, description: line.description, amount: decimalText(line.amount, 2) })),
    voidReason: invoice.voidReason,
  };
}

type PracticeRateRecord = { id: string; grade: string; currency: string; hourlyRate: DecimalValue; effectiveFrom: DateValue; effectiveTo: DateValue | null; version: number; createdAt: DateValue };
type PracticeGradeRecord = { id: string; userId: string; email: string; accessRole: string; grade: string; effectiveFrom: DateValue; effectiveTo: DateValue | null; version: number; createdAt: DateValue };

export function toPracticeRateCardView(rate: PracticeRateRecord) {
  return { id: rate.id, grade: rate.grade, currency: rate.currency, hourlyRate: decimalText(rate.hourlyRate), effectiveFrom: isoDate(rate.effectiveFrom), effectiveTo: rate.effectiveTo ? isoDate(rate.effectiveTo) : null, version: rate.version, createdAt: isoInstant(rate.createdAt) };
}

export function toPracticeStaffGradeAssignmentView(assignment: PracticeGradeRecord) {
  return { id: assignment.id, userId: assignment.userId, email: assignment.email, accessRole: assignment.accessRole, grade: assignment.grade, effectiveFrom: isoDate(assignment.effectiveFrom), effectiveTo: assignment.effectiveTo ? isoDate(assignment.effectiveTo) : null, version: assignment.version, createdAt: isoInstant(assignment.createdAt) };
}

export function toPracticeRateAdministrationView(value: {
  currency: 'QAR'; jobGrades: readonly string[]; rateCards: PracticeRateRecord[];
  staff: Array<{ id: string; email: string; accessRole: string; active: boolean }>;
  assignments: PracticeGradeRecord[];
}) {
  return { currency: value.currency, jobGrades: value.jobGrades, rateCards: value.rateCards.map(toPracticeRateCardView), staff: value.staff, assignments: value.assignments.map(toPracticeStaffGradeAssignmentView) };
}

