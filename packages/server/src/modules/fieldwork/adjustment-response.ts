/** Transport mapping shared by the controller and its contract tests. */
type DecimalValue = string | { toFixed(scale: number): string };
export type AdjustmentJournalRecord = {
  id: string; reference: string; memo: string; status: string; version: number; createdAt: Date;
  postedAt: Date | null; reversesJournalId: string | null;
  lines?: Array<{ position: number; accountCode: string; fsli: string | null; debit: DecimalValue; credit: DecimalValue }>;
};

export function toAdjustmentJournalView(journal: AdjustmentJournalRecord) {
  return {
    id: journal.id, reference: journal.reference, memo: journal.memo, status: journal.status, version: journal.version,
    createdAt: journal.createdAt.toISOString(), postedAt: journal.postedAt?.toISOString() ?? null,
    reversesJournalId: journal.reversesJournalId,
  };
}

export function toAdjustmentJournalDetailView(journal: AdjustmentJournalRecord) {
  return {
    ...toAdjustmentJournalView(journal),
    lines: (journal.lines ?? []).map((line) => ({
      position: line.position, accountCode: line.accountCode, fsli: line.fsli,
      debit: typeof line.debit === 'string' ? line.debit : line.debit.toFixed(6),
      credit: typeof line.credit === 'string' ? line.credit : line.credit.toFixed(6),
    })),
  };
}
