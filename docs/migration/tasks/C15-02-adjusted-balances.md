# C15-02 — Derived adjusted balances

Status: DONE (derived projection); a persisted adjusted snapshot and the differences register remain
Intent: Show the effect of posted client adjustments on the accepted balances, grouped by FSLI, without mutating the published version or introducing a second accounting truth.
Source commit and files: `nirzaf/AuditSphere@64713e808d165b4ef91ea4be4979e0f98fb2def3`; `Application/Accounting/AdjustmentJournalService.cs` adjusted-balance derivation and `MappedTrialBalanceSource`.
Destination commit and files: `packages/server/src/modules/fieldwork/adjustments.ts` (`adjustedBalances`), `packages/server/src/modules/fieldwork/adjustments-controller.ts`, `tests/adjustments.integration.ts`.
Existing T-task links: T104, T105; C15-01.
Dependencies: C15-01 adjustment journals and the published balance version.
Scope: a read-only projection over the latest publication plus every POSTED adjustment, grouped by FSLI, with published/adjustment/adjusted columns, per-FSLI rows, control totals and the list of included journal references. Draft journals and reversed originals are excluded; each reversal journal offsets its original.
Non-goals: A persisted adjusted snapshot, adjustment plans/eligibility, the differences register, and any statement rendering.
Current behavior and invariants: the projection never writes. Published amounts are unchanged; the adjustment column is debit minus credit, so the accepted version plus adjustments is the adjusted figure, and the control totals must remain zero-sum for a balanced journal set.
Proposed contract / schema change: none; the projection reuses existing tables.
Permission and transaction boundary: requires `ENGAGEMENT_READ` in scope; a single read with no transaction.
Historical data / document impact: none; the projection is recomputable from the published version and posted journals.
Implementation steps: as recorded in the service function and the controller route.
Relevant existing tests: `tests/adjustments.integration.ts` (C15-01 cases).
Minimal additional acceptance tests: drafts excluded; posted journals included by reference; a posted adjustment moves the affected FSLI lines; control totals stay zero-sum; reversing the adjustment restores the prior adjusted figures.
Commands actually executed: `pnpm build:server`; `pnpm exec tsc -p tsconfig.tests.json --noEmit`; `pnpm exec tsx --test tests/adjustments.integration.ts`; `pnpm test:integration`.
Evidence and remaining blockers: `tests/adjustments.integration.ts` passed against PostgreSQL 18.6, including the reversal-only net effect on the adjusted figures. Remaining: persist the approved adjusted snapshot that statements and materiality must bind to, the differences register, and statement rendering.
Rollback / forward-recovery impact: none; the projection is derived and can be recomputed.
Definition of done: met for the derived projection; the persisted snapshot is a separate decision.
