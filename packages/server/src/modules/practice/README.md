# Practice
Purpose: own the practice domain described in the architecture plan.
Owned use cases: reserved; pending CURRENT requirements.
Owned tables: none implemented.
Public services: none yet.
Published events: none yet.
Consumed events: none.
Allowed dependencies: platform services and shared browser-safe contracts.
Forbidden dependencies: another module internals or owned-table mutations.
State transitions: all production lifecycle commands require the full CURRENT gate definitions.
Critical invariants: scoped authorization, optimistic versions, decimal-safe money, immutable audit events.
Relevant tests: tests/invariants.test.ts; full integration acceptance still pending.
