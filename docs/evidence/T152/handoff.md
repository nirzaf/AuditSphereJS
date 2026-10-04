# T152 optional Graph mail disposition — 2026-10-04

## Identity

Task ID: T152 | Requirement IDs: R009, R019, R061, R068 | Implementing commit/branch: pending commit on `main` | Status: approved `NOT_APPLICABLE` under the selected nonproduction scope

## Intended and delivered outcome

Graph mail remains disabled because the T149 permission boundary approves no mail permission or sender mailbox. No mail API, dispatch behavior, Graph permission, or tenant configuration was added. This disposition does not claim the mail acceptance criteria have been implemented.

## Files and contracts

- `docs/microsoft365/permission-matrix.md` records Graph mail as disabled with no mail read/send permission.
- `docs/tasks/13-microsoft365/T152-m365-mail.md` records the optional task disposition.
- `scripts/verify-task.mjs` maps T152 to the Microsoft 365 policy test.
- `tests/m365-policy.test.ts` guards the disabled permission boundary.
- `docs/guides/13-execution-ledger.md` records the disposition and evidence link.

No schema, API, dependency, credential, tenant or business-data changes.

## Dependency evidence

No dependency changes.

## Decisions

The selected T149 scope (D11) excludes Graph mail. No new mail permission or sender mailbox is approved by this task.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T152` | `tests/m365-policy.test.ts`; declared Microsoft 365 permission boundary | Passed: 1 file, 3 tests; exit 0 | Local run 2026-10-04 |

This policy check confirms the disabled boundary only. No mail provider or live send test was run.

## Acceptance criteria

AC1–AC3 are not applicable while Graph mail is disabled; they are not represented as passed. Enabling mail requires a separate scope decision, least-privilege permission review, recipient policy and subsequent acceptance evidence.

## Recovery and authorization

Documentation and policy-test changes only. No external side effects occurred.

## Review and next task

Reviewer: Codex evidence review | Review result: Pass for recording the disabled optional surface. | Open blockers: Mail functionality remains unimplemented and unapproved. | Next eligible task: T156 release-gate acceptance.
