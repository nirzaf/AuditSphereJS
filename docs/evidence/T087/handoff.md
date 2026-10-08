# Task handoff

## Identity

Task ID: T087 — Risk colours and mandatory review routing
Requirement IDs: per the task card (docs/tasks/)
Implementing commit/branch: main, the commit that adds this handoff
Status: IN_REVIEW (ledger). This handoff records the recipe added for the DoD recipe rule; it is not an acceptance review.

## Intended and delivered outcome

Adds the recorded verification recipe in `scripts/verify-task.mjs` for T087, so `pnpm verify:task -- T087` runs the checks this task depends on. Colour derivation, append-only risk assessments and the RISK_PARTNER_CLEAR gate are exercised. Routing into workprograms (ledger note: remaining) is not covered. The colour rule is the open correction STE-JS-03 in the index.

## Files and contracts

- `scripts/verify-task.mjs`: the T087 recipe.
- No migration, contract or dependency change for this entry.

## Decisions

Recipe rule: docs/07-definition-of-done-additions.md item 1 (proposed). Adoption is owner-pending; the recipe was added because the current AGENTS.md requires one per task.

## Executed verification

| Command | Actual result |
| :--- | :--- |
| `pnpm verify:task -- T087` (build:server, contracts:check, risk (tests/risk.integration.ts)) | exit 0 on 2026-10-08 |

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
