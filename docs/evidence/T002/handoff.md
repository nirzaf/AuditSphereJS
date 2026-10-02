# T002 handoff — workflow decisions and policy gate

## Identity

Task ID: T002
Requirement IDs: R010, R020, R024, R027, R067, R069, R079, R080, R082
Implementing commit/branch: recorded after push
Status: DONE (approved implementation defaults and planning gate)

## Intended and delivered outcome

Recorded user-delegated D01–D12 defaults while preserving the source ambiguities and the original v2.1 requirements. The task readiness verifier distinguishes an affected pending decision (`POLICY_PENDING`) from an ordinary malformed/unmapped task (`VALIDATION_ERROR`) and permits unrelated tasks. This is planning verification only; it does not replace authorization checks in production commands.

## Files and contracts

- `docs/decisions/T002-business-defaults.md` — final fee milestone, client upload/download lifecycle, risk-review ordering, provider and authority defaults.
- `docs/decisions/T002-policy-gate.json` — task-to-decision map and expected gate vectors.
- `docs/decisions/register.json` — D01–D12 owners, source lines, approval state and decision links.
- `docs/guides/05-decisions-and-source-conflicts.md`, `docs/tasks/00-readiness/T002-business-decisions.md` — reconciled source conflicts and completion state.
- `scripts/verify-business-decisions.mjs`, `scripts/verify-task.mjs` — automated state and failure-path check.

No application behavior, API, migration, dependency or generated-code changes.

## Decisions and source boundaries

D01–D12 are recorded as `APPROVED_IMPLEMENTATION_DEFAULT` under user delegation. They remain implementation choices and do not rewrite CURRENT or certify ISA/IFRS/legal/accounting compliance. Provider, records and professional acceptance limitations remain recorded in the linked T003/T004/T006 decisions.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T002` | all 12 decision records, source-line/conflict presence, preserved CURRENT, feature-to-policy mapping and gate outcomes | PASS, exit 0 | output: D01–D12 source, owner, approval and affected-task gates passed |
| `git diff --check` | T002 changes | PASS, exit 0; expected unrelated checkout CRLF warnings | local checkout |

## Acceptance criteria

- AC1: Every D01–D12 source-line reference and ambiguity remains in `register.json`; CURRENT stays byte-identical to its preserved source.
- AC2: User-delegated defaults are labeled separately from functional-source requirements and external acceptance.
- AC3: The fixture proves D01 pending blocks T060, does not block unrelated T028, and unknown T999 yields `VALIDATION_ERROR`; missing approval evidence fails closed as `POLICY_PENDING`.

## Limitations and next task

The verifier gates task-readiness evidence, not production runtime commands. Each owning task must enforce the decision inside its domain transaction. Live provider, legal, finance and professional acceptance remain distinct gates. No deployment or provider change occurred.

Reviewer: Codex (implementation evidence review)
Review result: task verifier passed
Open blockers: production commands must implement their mapped policies; T006 production region/recovery acceptance remains open
Next eligible task by dependency order: T006 (T003/T004/T005 are DONE)
