# T149 Microsoft 365 permission-scope handoff — 2026-10-04

## Identity

Task ID: T149
Requirement IDs: R009, R020, R031, R052
Implementing commit/branch: pending commit on `main`
Status: DONE for the explicitly selected nonproduction identity and selected-folder storage boundary.

## Intended and delivered outcome

Recorded the least-privilege Microsoft 365 surface selected by the user: Entra authenticates internal staff; the SPA requests only AuditSphere's own delegated `access_as_user` API scope; a separate server app uses `Files.SelectedOperations.Selected` with explicit write grants limited to two synthetic acceptance folders. Graph mail, tenant-wide directory lookup/sync and runtime SharePoint administration remain disabled. Local test mode retains the RustFS-compatible S3 fixture and does not call Graph. No Entra, Graph or SharePoint tenant mutation occurred in this task.

## Files and contracts

- `docs/microsoft365/permission-matrix.md` defines permitted scopes, resource bounds and disabled capabilities.
- `docs/microsoft365/README.md` links the matrix and updates its review date.
- `tests/m365-policy.test.ts` guards the declared permission surface, production provider requirement and no-Graph-call behavior in local mode.
- `scripts/verify-task.mjs` records the T149 verification recipe.
- `docs/tasks/13-microsoft365/T149-m365-policy.md` records scope and acceptance evidence.

No schema, API contract, dependency, tenant permission, credential or production setting changed. Existing live storage evidence is dated in [the current tenant inventory](../../microsoft365/current-tenant.md) and [T156 tenant readiness](../T156/tenant-readiness.md); credential expiry and production limitations remain recorded there.

## Dependency evidence

No dependency changes. The SPA uses locked `@azure/msal-browser` 5.23.0. The Graph storage adapter uses native Fetch and does not add a Graph SDK. T150 remains responsible for the selected stack's dedicated MSAL/Graph package compatibility review.

## Decisions

D11 records the user-selected Entra, Graph, SharePoint and OneDrive boundaries. This T149 record does not grant Graph permissions or approve production residency/retention. Outbound mail, directory sync and runtime site provisioning are not enabled.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T149` | Server TypeScript build; `tests/m365-policy.test.ts`; `tests/config.test.ts` | Passed; 3 policy tests and 4 config tests; exit 0 | Local run 2026-10-04 |
| `pnpm verify:affected` | Boundaries, server/test typechecks, Angular production build and Vitest suite | Passed; 25 files, 110 tests; exit 0 | Local run 2026-10-04 |

The outbound-call test selected `STORAGE_PROVIDER=local-s3`, ran bucket initialization against an ephemeral loopback S3 fixture, and observed zero Fetch requests despite synthetic Graph credential variables being present. This verifies the local provider path, not live Microsoft service behavior. Separately recorded T156 live provider evidence covers exact-version SharePoint/OneDrive storage and selected-folder denial.

## Acceptance criteria

- AC1 passes: the policy matrix excludes broad tenant permissions and restricts the runtime storage role to selected resources.
- AC2 passes for local mode: no Graph token or Graph request occurs when the Graph storage adapter is not selected.
- AC3 passes for the supported local-development path: core verification succeeds with local services and without tenant credentials. Production intentionally requires the user-selected Entra and Graph providers.
- Credentialed storage acceptance is linked from T156; browser/API acceptance and provider revocation, expiry, throttling, recovery, retention, residency and production tests remain separately tracked. No external mail was sent.

## Recovery and authorization

Documentation and tests only; no persistent tenant or business data changed. No deployment, tenant permission update or production release was performed or authorized by this handoff.

## Review and next task

Reviewer: Codex evidence review
Review result: Pass for T149's approved nonproduction scope; production/provider limits remain explicit.
Open blockers: T150 package compatibility; T151–T156 endpoint/provider acceptance; production retention and residency gates.
Next eligible tasks: T150 and T144 both have recorded prerequisites; T144's firm-level expense evidence binding still needs a safe design before expense postings are implemented.
