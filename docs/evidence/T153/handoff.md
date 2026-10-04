# T153 optional Graph directory disposition — 2026-10-04

## Identity

Task ID: T153 | Requirement IDs: R029 | Implementing commit/branch: pending commit on `main` | Status: approved `NOT_APPLICABLE` under the selected nonproduction scope

## Intended and delivered outcome

Tenant-wide Graph user/group lookup and synchronization remain disabled. Staff identity mapping and engagement assignments continue to be explicitly administered in AuditSphere. No directory API, Graph permission, synchronization behavior, or tenant configuration was added. This disposition does not claim directory synchronization acceptance.

## Files and contracts

- `docs/microsoft365/permission-matrix.md` records directory lookup/synchronization as disabled.
- `docs/tasks/13-microsoft365/T153-m365-directory.md` records the optional task disposition.
- `scripts/verify-task.mjs` maps T153 to the Microsoft 365 policy test.
- `tests/m365-policy.test.ts` guards the disabled permission boundary.
- `docs/guides/13-execution-ledger.md` records the disposition and evidence link.

No schema, API, dependency, credential, tenant or business-data changes.

## Dependency evidence

No dependency changes.

## Decisions

The selected T149 scope (D11) excludes tenant-wide directory lookup/sync. Local identity mapping and assignments remain the authority for AuditSphere access.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T153` | `tests/m365-policy.test.ts`; declared Microsoft 365 permission boundary | Passed: 1 file, 3 tests; exit 0 | Local run 2026-10-04 |

This policy check confirms the disabled boundary only. No Graph directory provider or live sync test was run.

## Acceptance criteria

AC1–AC3 are not applicable while directory synchronization is disabled; they are not represented as passed. Enabling this surface requires a separate least-privilege scope decision and provider acceptance evidence.

## Recovery and authorization

Documentation and policy-test changes only. No external side effects occurred.

## Review and next task

Reviewer: Codex evidence review | Review result: Pass for recording the disabled optional surface. | Open blockers: Directory lookup/synchronization remains unimplemented and unapproved. | Next eligible task: T156 release-gate acceptance.
