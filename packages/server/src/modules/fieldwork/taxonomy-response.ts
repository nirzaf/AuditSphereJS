/** Transport mapping shared by taxonomy controllers and contract tests. */
type TaxonomyRecord = {
  id: string; name: string; version: number; status: string; createdAt: Date; approvedAt: Date | null;
  lines?: Array<{ id: string; code: string; label: string; statementSection: string; sortOrder: number }>;
};

export function toTaxonomyView(taxonomy: TaxonomyRecord) {
  return {
    id: taxonomy.id, name: taxonomy.name, version: taxonomy.version, status: taxonomy.status,
    createdAt: taxonomy.createdAt.toISOString(), approvedAt: taxonomy.approvedAt?.toISOString() ?? null,
    lines: (taxonomy.lines ?? []).map((line) => ({
      id: line.id, code: line.code, label: line.label, statementSection: line.statementSection, sortOrder: line.sortOrder,
    })),
  };
}

type SuggestionRecord = {
  rowId: string; code: string; name: string; currentFsli: string | null; suggestedFsli: string | null;
  reason: string; provenance: null | { memoryEntryId: string; sourceApprovalId: string; timesApplied: number; lastApprovedAt: Date };
};
type SuggestionsRecord = {
  importId: string; taxonomyVersionId: string; taxonomyVersion: number;
  suggested: number; alreadyMapped: number; unresolved: number; items: SuggestionRecord[];
};

export function toMappingSuggestionsView(result: SuggestionsRecord) {
  return {
    importId: result.importId, taxonomyVersionId: result.taxonomyVersionId, taxonomyVersion: result.taxonomyVersion,
    suggested: result.suggested, alreadyMapped: result.alreadyMapped, unresolved: result.unresolved,
    items: result.items.map((item) => ({
      rowId: item.rowId, code: item.code, name: item.name, currentFsli: item.currentFsli, suggestedFsli: item.suggestedFsli,
      reason: item.reason,
      provenance: item.provenance ? { sourceApprovalId: item.provenance.sourceApprovalId, timesApplied: item.provenance.timesApplied, lastApprovedAt: item.provenance.lastApprovedAt.toISOString() } : null,
    })),
  };
}
