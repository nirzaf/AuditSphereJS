# AuditSphereJS — Definition of Done additions for the remaining work

**Status: Adopted for remaining-task execution on 2026-10-08 under the repository owner's existing delegation to Codex for implementation defaults (D26).** The Definition of Done in `AGENTS.md` and the testing rules in `docs/guides/07-testing-and-invariants.md` stay in force. These additions close gaps that verification exposed.

## 1. Every remaining task

1. **A recipe exists.** IN_REVIEW tasks T046, T051, T060, T080, T085, T086, T087, T088, T089, T098, T099, T100, T101, T103, T104 and IN_PROGRESS T108 have no entry in `scripts/verify-task.mjs`, so `pnpm verify:task -- T###` throws for them. Add the recipe in the same change that closes the task.
   Status on 2026-10-08: recipes added for T046, T051, T060, T080, T087, T088, T098–T101, T103, T104 and T108 (handoffs in docs/evidence); T085, T086, T089 and T140 already had one. The rule is adopted for all remaining tasks. Existing tasks without a recipe require one before they can close.
2. **The ledger and story entry move together.** Update the ledger row and the task's entry in `docs/plan/stories/<phase>.md` in the same change as the evidence handoff. A merged change that leaves the ledger behind is not done.
3. **Specification first.** If the task ports a legacy calculator, its tests assert the CURRENT / decision-register values. A differential match against the source is recorded separately and does not satisfy an acceptance criterion.
4. **Placeholder gates.** If the task supplies the evidence for a placeholder `fail(...)` in `governance/lifecycle.ts`, replace it with the real predicate in the same change, with a test for the passing and the failing case. Never delete a placeholder without its predicate.
5. **Preparation forms.** If the task delivers the server side of a workspace listed as "session-only preparation" in `docs/evidence/UI-MODULES.md`, connect the screen and delete its preparation form in the same change (removal guideline §3), then update `UI-MODULES.md`.
6. **Contracts.** Any request/response change regenerates contracts and OpenAPI (`pnpm contracts:generate`, `pnpm build:server`, `pnpm openapi:generate`) and passes `pnpm contracts:check`.
7. **Decisions.** If a task meets an unresolved policy question, stop and add it to `02-decisions-needed.md`; do not choose a default inside the task.

## 2. Closing an IN_REVIEW task

- The open items listed in its story entry are done or explicitly re-scoped by the owner.
- An independent review (a different agent session or a human) has read the diff and the handoff, and the reviewer and date are in the ledger's last column.
- `pnpm verify:task -- T###` and `pnpm verify:affected` pass on the merge commit, not only on the branch.

## 3. Gates (T051, T117, T138, T157–T171)

- Run against the release artifact or a source-fingerprinted build, never a developer checkout.
- Measured values are appended to `docs/benchmarks-local.json` or the gate's evidence folder; earlier results are never overwritten.
- External or professional acceptance (tenant, legal, audit methodology) is recorded only with the named human and date; agents record "pending" otherwise.
