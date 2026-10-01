# C15-01 — Client audit adjustment journals

Status: DONE (drafts, posting, reversal); plans, adjusted balances and the differences register remain
Intent: Record client audit adjustments as balanced double-entry journals that stay separate from the firm's own ledger, cannot be edited once posted, and are corrected only by a reversal.
Source commit and files: `nirzaf/AuditSphere@64713e808d165b4ef91ea4be4979e0f98fb2def3`; `Application/Accounting/AdjustmentJournalService.cs`, `AdjustmentPlanService.cs`, `AdjustmentEligibilityQuery.cs` and the adjustment persistence in `Infrastructure/Persistence/AuditSphereDbContext.AdjustmentBridge.cs`.
Destination commit and files: `packages/server/src/modules/fieldwork/adjustments.ts`, `packages/server/src/modules/fieldwork/adjustments-controller.ts`, `prisma/migrations/202610010019_adjustment_journals/migration.sql`, `tests/adjustments.integration.ts`.
Existing T-task links: T103, T104, T105; MIG-008.
Dependencies: WP4 scope, WP6 capabilities, the six-decimal money primitive.
Scope: `AdjustmentJournal` + `AdjustmentJournalLine`; balanced drafts; posting under `ADJUSTMENT_POST` with the preparer excluded; a database rule that posting needs at least two lines totalling a balanced non-zero amount; posted journals and their lines frozen; reversal journals that swap debit and credit and mark the original REVERSED; a uniqueness rule per engagement reference.
Non-goals: Adjustment plans, eligibility queries, adjusted-balance snapshots, the differences register, and the adjustment UI. This is the client's book and never the firm's ledger.
Current behavior and invariants: each line carries exactly one non-negative side, and the database enforces that shape; a posted journal is immutable except for the single transition to REVERSED; journals are never deleted; the reversal is itself drafted, balanced and posted inside one transaction so the same rules apply to it.
Proposed contract / schema change: `createAdjustmentJournalSchema`, `postAdjustmentJournalSchema`, `reverseAdjustmentJournalSchema`; two tables with check constraints and three triggers; two capabilities added to the grant check constraint.
Permission and transaction boundary: `ADJUSTMENT_MANAGE` to draft and `ADJUSTMENT_POST` to post or reverse; posting is conditioned on the expected version and, for reversal, the draft→posted→reversed sequence shares one transaction.
Historical data / document impact: append-only; a correction is a reversal journal, never an edit.
Implementation steps: as recorded in migration 202610010019, the service and the controller.
Relevant existing tests: `tests/taxonomy.integration.ts` (immutability patterns).
Minimal additional acceptance tests: capability denial; unbalanced and malformed lines rejected; a draft cannot be self-posted; stale version rejected; posted immutability, append-only and line freeze; the database balance and minimum-line rules on a raw bypass attempt; reversal swaps sides, preserves the original memo, marks the original REVERSED and refuses a second reversal; status filtering.
Commands actually executed: `pnpm exec prisma validate`; `pnpm exec prisma migrate deploy`; `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`; `pnpm build:server`; `pnpm contracts:generate`; `pnpm exec tsc -p tsconfig.tests.json --noEmit`; `pnpm exec tsx --test tests/adjustments.integration.ts`; `pnpm test:integration`.
Evidence and remaining blockers: `tests/adjustments.integration.ts` passed against PostgreSQL 18.6 for every case above, including the raw-SQL bypass attempts. Remaining: adjustment plans and eligibility, adjusted-balance snapshots that downstream statements must consume, the differences register, and the UI.
Rollback / forward-recovery impact: append-only; a posted adjustment is corrected by a reversal rather than reversed by rollback.
Definition of done: met for adjustment drafts, posting and reversal; adjusted balances and plans remain open.
