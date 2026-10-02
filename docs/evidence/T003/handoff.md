# T003 handoff — numerical, sampling and professional-judgment defaults

## Identity

Task ID: T003  
Requirement IDs: R032–R040, R049–R051, R054, R058, R075  
Implementing commit/branch: recorded after push  
Status: DONE (implementation-default policy only)

## Outcome

Recorded D05–D07 implementation defaults and golden examples under the user's delegation to Codex. The preserved v2.1 requirements were not edited. The decision record explicitly distinguishes engineering choices from independent professional assurance and identifies current runtime mismatches owned by T085/T086 and T099–T102.

## Files and contracts

- `docs/decisions/T003-methodology-defaults.md` — decimal/materiality, sampling and charge-out policy, boundaries and known runtime gaps.
- `docs/decisions/T003-methodology-golden.json` — hand-calculated expected vectors for materiality, rounding, sampling and charge-out.
- `docs/guides/05-decisions-and-source-conflicts.md` — D05–D07 current decision status reconciled with the approved register.
- `docs/tasks/00-readiness/T003-methodology-decisions.md` and `docs/guides/13-execution-ledger.md` — acceptance and evidence status.
- `scripts/verify-task.mjs` and `scripts/verify-methodology.mjs` — task verification recipe and checks over the approved fixture; no application behavior, migration, API or generated code changed.

No dependency changes.

## Decisions

D05, D06 and D07 are `APPROVED_IMPLEMENTATION_DEFAULT` in `docs/decisions/register.json`, approved by Codex under user delegation on 2026-10-01. This is not an external qualified-methodology or finance review. No universal ISA/IFRS compliance claim is made.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T003` | decision register, immutable requirements, golden fixture, BigInt arithmetic/selection checks | PASS, exit 0 | output: methodology vectors passed; task recipe passed |
| `git diff --check` | Changed documentation and verifier | PASS, exit 0 (Git reports expected CRLF normalization warning on two Markdown files) | local checkout |
| `pnpm verify:affected` | boundaries, server/API builds, Angular production build, tests | PASS, exit 0; 17 test files / 78 tests | local checkout |

## Acceptance criteria

- AC1: Expected examples cover materiality limits, TE/PM/SAD equality, significant-risk override, negative/zero benchmark rejection, QAR half-even rounding, and zero-prior `NO_BASE`.
- AC2: MUS, Systematic Random and Stratified Attribute vectors specify inputs, population, selection and evaluation limits. The verifier recalculates their expected IDs/totals without importing the application implementation.
- AC3: User-delegated approval is evidenced in the decision register. Professional acceptance remains a separate UAT/release gate; this task does not report that review as complete.

## Limitations and next task

Runtime implementation is not made complete by this policy record. Materiality ranges and `STRATIFIED`/MUS behavior currently diverge; Systematic Random and attribute sampling are absent. Implement and prove these in T085/T086 and T099–T102. Independent professional-methodology acceptance is required before a release or a claim of professional audit-methodology acceptance.

Reviewer: Codex (implementation evidence review)  
Review result: implementation defaults recorded and verifier passed  
Open blockers: runtime tasks and independent professional UAT/release review  
Next eligible task by dependency order: T004, after confirming the readiness dependency order.
