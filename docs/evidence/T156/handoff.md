# T156 Microsoft 365 nonproduction acceptance — 2026-10-04

## Identity

Task ID: T156 | Requirement IDs: R009, R020, R031, R052 | Implementing commit/branch: pending commit on `main` | Status: DONE for the approved nonproduction scope

## Intended and delivered outcome

Accepted the enabled Microsoft 365 subset: Entra staff identity mapping, scoped engagement discovery, and SharePoint/OneDrive versioned storage. Optional mail, directory synchronization, runtime site provisioning and webhooks are recorded as `NOT_APPLICABLE` under the T149 permission boundary. No tenant permission or production resource was changed.

## Files and contracts

- `tests/graph-storage.test.ts` adds deterministic coverage for access-token refresh, sanitized OAuth consent denial, throttling and ambiguous upload transport failure.
- `scripts/verify-task.mjs` runs the Graph storage unit suite before the credentialed live test for T156.
- `docs/tasks/13-microsoft365/T156-m365-release-gate.md` records the accepted scope and limitations.
- `docs/microsoft365/current-tenant.md` records the current verification state without secrets.
- `docs/evidence/T156/live-storage-2026-10-04-6ad456e8.json` preserves redacted per-provider evidence.
- `docs/guides/13-execution-ledger.md` records the reviewed status.

No schema, API contract, migration or dependency changed.

## Dependency evidence

No dependency changes. Tests use the existing Vitest suite, Node Fetch mocks and the existing live acceptance harness.

## Decisions

The T149 selected-folder scope remains in force. The live app permission was not revoked or modified. Disabled T152–T155 surfaces remain outside enabled acceptance scope and are individually recorded as `NOT_APPLICABLE`.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T156` with `M365_ACCEPTANCE_ENV_FILE=.env.m365.acceptance` | `tests/graph-storage.test.ts`; synthetic SharePoint and OneDrive acceptance folders | Passed: 10 unit tests and 2 live provider tests; 0 failed, 0 skipped; exit 0 | Local run 2026-10-04; [redacted provider record](live-storage-2026-10-04-6ad456e8.json) |
| `pnpm verify:affected` | Boundaries, server/test typechecks, Angular production build and Vitest suite | Passed; 25 files, 114 tests; exit 0 | Local run 2026-10-04 |

Live checks verified immutable streamed bytes/hash, external-edit isolation, outside-selected-folder HTTP 403, and deleted-item fail-closed behavior. They created and deleted only the test's uniquely named synthetic files. The designated private environment was read from the ignored local file; no values were printed or recorded.

The unit cases exercise cache expiry via a controlled clock, a sanitized OAuth 400 consent-denied response, a Graph 429 response surfaced without automatic retry, and a transport failure after upload dispatch with exactly one request. They do not claim live tenant revocation or live Microsoft throttling.

The built-in browser displayed the mapped `auditp0-staff@easyguide.onmicrosoft.com` Staff Fixture identity and its one synthetic authorized engagement. It did not display the active-staff identity error. The client persona `auditp0-client-x` remains intentionally unmapped from internal staff authority.

## Acceptance criteria

- AC1 passes for enabled features: live mapped Staff Fixture sign-in and scoped engagement discovery are evidenced in T019 and the current browser observation; SharePoint and OneDrive passed live selected-folder checks.
- AC2 passes: all live file operations used synthetic acceptance folders and deleted only their own test files. No production resource or Graph grant was changed.
- AC3 passes within this adapter scope: provider evidence contains hashes/byte counts only; OAuth response details are not included in the thrown authentication error. T032/T034 cover scoped audited document access and provider-reference redaction.

## Recovery and authorization

The live harness removes its own synthetic objects and verifies that deleted references fail closed. It does not touch retained fixtures, tenant permissions, app registrations or credentials. No deployment or production action occurred.

## Review and next task

Reviewer: Codex evidence review | Review result: Pass for the approved nonproduction Microsoft 365 scope | Open blockers: Production retention/residency/readiness; no actual tenant consent revocation was performed | Next eligible task: T157 full source lifecycle acceptance

## Recheck — 2026-10-08

`pnpm test:m365:storage:live` passed against the existing designated nonproduction acceptance folders: SharePoint 1/1 and OneDrive 1/1, zero failures/skips. It verified exact version bytes and SHA-256 through buffered and streamed reads, selected-folder binding, outside-folder 403 denial, same-size external-edit isolation, staged-item cleanup and fail-closed reads after deleting only the test-created objects. The two redacted records are [SharePoint](live-storage-2026-10-08-56361a8d.json) and [OneDrive](live-storage-2026-10-08-56361a8d-onedrive.json). Both state `fixtureRetained: false` and contain only synthetic fixture hashes/byte counts and hashed provider identities.

The first run without network escalation failed before reaching Graph because the sandbox could not resolve `login.microsoftonline.com`; it created no objects. The same run was retried with network access after the existing explicit authorization for synthetic acceptance-folder tests, and passed. The configured private environment file was read without printing values. No Entra permission, app registration, user, local authority, retention policy or production resource changed. This refreshes selected-folder provider evidence only; it does not establish consent revocation, SharePoint retention behavior or production readiness.
