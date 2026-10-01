# Commercial
Purpose: own the commercial domain described in the architecture plan.
Owned use cases: reserved; implement the matching docs/tasks phase against preserved CURRENT v2.1.
Owned tables: none implemented.
Public services: none yet.
Published events: none yet.
Consumed events: none.
Allowed dependencies: platform services and shared browser-safe contracts.
Forbidden dependencies: another module internals or owned-table mutations.
State transitions: the CURRENT gate definitions are available; production transition commands are not implemented yet.
Critical invariants: scoped authorization, optimistic versions, decimal-safe money, immutable audit events.
Relevant tests: tests/invariants.test.ts; full integration acceptance still pending.

Functional source: docs/requirements/CURRENT.md (unchanged v2.1). Decision defaults: docs/decisions/register.json. Production evidence and task completion remain separate from this module scaffold.
