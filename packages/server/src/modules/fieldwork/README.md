# Fieldwork
Purpose: own the fieldwork domain described in the architecture plan.
Owned use cases: staged CSV import, mapping, immutable finalization and aggregation.
Owned tables: TbImport, TbRow.
Public services: service.ts.
Published events: tb.import via transactional outbox.
Consumed events: none.
Allowed dependencies: platform services and shared browser-safe contracts.
Forbidden dependencies: another module internals or owned-table mutations.
State transitions: all production lifecycle commands require the full CURRENT gate definitions.
Critical invariants: scoped authorization, optimistic versions, decimal-safe money, immutable audit events.
Relevant tests: tests/invariants.test.ts; full integration acceptance still pending.
