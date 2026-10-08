# Task handoff

## Identity

Task ID: T088 — Version-bound planning approval and fieldwork unlock
Requirement IDs: per the task card (docs/tasks/)
Implementing commit/branch: main, the commit that adds this handoff
Status: IN_REVIEW (ledger). This handoff records the recipe added for the DoD recipe rule; it is not an acceptance review.

## Intended and delivered outcome

Adds the recorded verification recipe in `scripts/verify-task.mjs` for T088, so `pnpm verify:task -- T088` runs the checks this task depends on. Materiality approval binds the exact published version; START_FIELDWORK refuses stale or unapproved plans. The first recipe run failed because the lifecycle test exceeded its 120 s limit (104 s on the idle rerun). The limit is now 240 s and the rerun passed.

## Files and contracts

- `scripts/verify-task.mjs`: the T088 recipe.
- No migration, contract or dependency change for this entry.

## Decisions

Recipe rule: docs/07-definition-of-done-additions.md item 1 (proposed). Adoption is owner-pending; the recipe was added because the current AGENTS.md requires one per task.

## Executed verification

| Command | Actual result |
| :--- | :--- |
| `pnpm verify:task -- T088` (build:server, contracts:check, materiality-persistence (tests/materiality-persistence.integration.ts), lifecycle (tests/lifecycle.integration.ts)) | exit 0 on 2026-10-08 |

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
