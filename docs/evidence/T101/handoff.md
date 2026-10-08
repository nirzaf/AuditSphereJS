# Task handoff

## Identity

Task ID: T101 — Stratified sampling
Requirement IDs: per the task card (docs/tasks/)
Implementing commit/branch: main, the commit that adds this handoff
Status: IN_REVIEW (ledger). This handoff records the recipe added for the DoD recipe rule; it is not an acceptance review.

## Intended and delivered outcome

Adds the recorded verification recipe in `scripts/verify-task.mjs` for T101, so `pnpm verify:task -- T101` runs the checks this task depends on. selectStratified (key items first, then the seeded non-key stratum) is covered by the unit suite.

## Files and contracts

- `scripts/verify-task.mjs`: the T101 recipe.
- No migration, contract or dependency change for this entry.

## Decisions

Recipe rule: docs/07-definition-of-done-additions.md item 1 (proposed). Adoption is owner-pending; the recipe was added because the current AGENTS.md requires one per task.

## Executed verification

| Command | Actual result |
| :--- | :--- |
| `pnpm verify:task -- T101` (build:server, sampling (tests/sampling.test.ts, unit)) | exit 0 on 2026-10-08 |

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
