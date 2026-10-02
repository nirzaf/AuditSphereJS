# Fieldwork
Purpose: own the fieldwork domain described in the architecture plan.
Owned use cases: staged CSV import, mapping against a versioned taxonomy with approved-mapping memory, immutable finalization/aggregation, deterministic sampling, and publication of accepted balance versions.
Owned tables: TbImport, TbRow, BalancePublication, PublishedBalanceRow, ClientRepository, DocumentVersion, TaxonomyVersion, TaxonomyLine, MappingApproval, MappingMemoryEntry, StoredObject, AdjustmentJournal, AdjustmentJournalLine. Taxonomy versions reference a real firm; publications and taxonomies expose composite keys for scope-safe module references.
Public services: service.ts (import/mapping/finalize/aggregate), uploads.ts (unreferenced-object sweep), publication.ts, sampling.ts, taxonomy.ts (taxonomy, approval, suggestions), adjustments.ts (client audit adjustment journals).
Published events: tb.import via transactional outbox.
Consumed events: none.
Allowed dependencies: platform services (db, authorization, storage, repository) and shared browser-safe contracts.
Forbidden dependencies: another module internals or owned-table mutations.
State transitions: lifecycle commands are owned by governance. Mapping approval, finalization and publication are guarded commands with scope, capability, expected version and idempotency.
Critical invariants: scoped authorization re-checked inside write transactions, optimistic versions, decimal-safe six-decimal money, append-only audit and approvals, immutable finalized rows, immutable published versions, and immutable approved taxonomies. Publication requires a current mapping approval bound to an exact taxonomy version. Every stored object is tracked before its bytes exist; concurrent identical uploads coalesce to one authoritative import; referenced evidence is never swept. Mapping suggestions are read-only and always cite the approval they came from.
Relevant tests: tests/invariants.test.ts, tests/database.integration.ts, tests/publication.integration.ts, tests/repository.integration.ts, tests/taxonomy.integration.ts, tests/sampling.test.ts, tests/upload-race.integration.ts.

Functional source: docs/requirements/CURRENT.md (unchanged v2.1). Decision defaults: docs/decisions/register.json. Production evidence and task completion remain separate from this module scaffold.
