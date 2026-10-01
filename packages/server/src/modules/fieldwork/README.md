# Fieldwork
Purpose: own the fieldwork domain described in the architecture plan.
Owned use cases: staged CSV import, mapping, immutable finalization and aggregation.
Owned tables: TbImport, TbRow.
Public services: service.ts.
Published events: tb.import via transactional outbox.
Consumed events: none.
Allowed dependencies: platform services and shared browser-safe contracts.
Forbidden dependencies: another module internals or owned-table mutations.
State transitions: the CURRENT gate definitions are available; production transition commands are not implemented yet.
Critical invariants: scoped authorization, optimistic versions, decimal-safe money, immutable audit events.
Relevant tests: tests/invariants.test.ts; full integration acceptance still pending.

Functional source: docs/requirements/CURRENT.md (unchanged v2.1). Decision defaults: docs/decisions/register.json. Production evidence and task completion remain separate from this module scaffold.
