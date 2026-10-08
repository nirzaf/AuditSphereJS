# Task handoff

## Identity

Task ID: T051 — Measure the TB slice and freeze its interaction contract
Requirement IDs: per the task card (docs/tasks/)
Implementing commit/branch: main, the commit that adds this handoff
Status: IN_REVIEW (ledger). This handoff records the recipe added for the DoD recipe rule; it is not an acceptance review.

## Intended and delivered outcome

Adds the recorded verification recipe in `scripts/verify-task.mjs` for T051, so `pnpm verify:task -- T051` runs the checks this task depends on. The TB slice fixtures and staging contract are exercised. The repository benchmark figures in docs/benchmarks-local.json were reported, not rerun by this recipe. The 50k-row fixture test has a 5 s budget and is load-sensitive.

## Files and contracts

- `scripts/verify-task.mjs`: the T051 recipe.
- No migration, contract or dependency change for this entry.

## Decisions

Recipe rule: docs/07-definition-of-done-additions.md item 1 (proposed). Adoption is owner-pending; the recipe was added because the current AGENTS.md requires one per task.

## Executed verification

| Command | Actual result |
| :--- | :--- |
| `pnpm verify:task -- T051` (build:server, contracts:check, tb-fixtures (tests/tb-fixtures.test.mjs; 50k-row parse), trial-balance-staging (tests/tb-staging.integration.ts), tb-batch-mapping (tests/tb-batch-mapping.integration.ts)) | exit 0 on 2026-10-08 |

## Acceptance criteria

Not re-reviewed here. The recipe proves the listed tests run and pass; it does not prove the card's acceptance criteria against a reviewer's reading.

## Recovery and authorization

No data or migration change. No merge or deployment is authorized by this handoff.

## Review and next task

Reviewer: pending independent review
Review result: pending
Open blockers: independent review of the card acceptance criteria.
Next eligible task by dependency order: not assigned.
Stop after this task; do not implement the next one without assignment.
