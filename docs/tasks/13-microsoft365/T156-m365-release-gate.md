# T156 — Run tenant-consent, throttling and revocation integration tests

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Current status | `DONE` for the approved nonproduction scope — enabled staff identity and SharePoint/OneDrive access were accepted; consent-denial, expiry, throttle and unknown-outcome failure paths have deterministic adapter coverage. No live permission revocation or production acceptance is claimed. |
| Execution class | `OPTIONAL` |
| Phase | 13-microsoft365 — Optional Microsoft 365 integration |
| Owner area | `microsoft365` |
| Completion unit | One focused, reviewable change and its evidence |

> Optional extension. Implement only when enabled and approved; otherwise retain an explicit `NOT_APPLICABLE` decision.

## Outcome

Run credentialed nonproduction tests for the enabled integration subset and record actual consent/permission state.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T151 — Implement internal Entra single sign-on and local role mapping](T151-m365-sso.md)
- [T152 — Implement Graph mail with bounded permissions and unknown-outcome handling](T152-m365-mail.md)
- [T153 — Implement staff lookup or synchronization without privilege escalation](T153-m365-directory.md)
- [T154 — Implement optional SharePoint workspace provisioning behind storage boundaries](T154-m365-sharepoint.md)
- [T155 — Implement optional Graph change notifications and reconciliation](T155-m365-webhooks.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R009** — Role-based contact and communication routing; source lines `394-397`.
- **R020** — Isolated portal and temporary credentials; source lines `428-430`.
- **R031** — Five-folder engagement taxonomy; source lines `454-463`.
- **R052** — Electronic evidence and PBC linking; source lines `504-505`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/platform/microsoft365/; selected web auth adapter; isolated integration tests

**Non-goals:** Only enabled approved integration scope; no production tenant mutations or blanket administrator consent.

Use existing owned records/contracts first. Add a migration or public endpoint only when the task steps require it; record the exact files in the handoff.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [x] Run credentialed nonproduction tests for enabled SharePoint/OneDrive storage and record the selected-folder permission boundary.
- [x] Exercise token expiry, consent-denied, throttling and unknown provider outcome using deterministic adapter tests. Deleted-item behavior is covered live for both selected drives. Actual tenant permission revocation was not performed.
- [x] Confirm business modules still depend on platform interfaces, not direct Graph imports; `pnpm verify:affected` runs the boundary checker.
- [x] Record disabled optional integrations as `NOT_APPLICABLE` under the T149-approved scope; no untested integration is marked production-ready.

## Acceptance criteria and required tests

- [x] **AC1:** The Staff Fixture's mapped sign-in and scoped engagement were observed in the built-in browser; SharePoint and OneDrive passed credentialed selected-folder checks (2/2, zero skips).
- [x] **AC2:** The live harness created, edited and deleted only its own uniquely named synthetic acceptance files. No production tenant resource or permission was changed.
- [x] **AC3:** The recorded live evidence contains only byte counts and hashes; OAuth error details are not exposed by the adapter. Existing T032/T034 evidence covers provider-reference redaction and scoped audited document access.

Require exact SDK peer/install evidence and least-privilege credentialed nonproduction tests for enabled endpoints.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
M365_ACCEPTANCE_ENV_FILE=.env.m365.acceptance pnpm verify:task -- T156
```

The T156 verifier runs the Graph storage unit suite and the credentialed SharePoint/OneDrive acceptance subset; it fails if the designated private environment is absent. It does not revoke or restore tenant permissions. Consent denial, token-cache expiry, throttling and unknown upload outcome are deterministic adapter fault cases, not live tenant permission changes.

The live command requires the designated credentials and must fail closed when they are missing. A storage-subset pass is not full T156 acceptance.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.

## Historical partial evidence

The enabled SharePoint/OneDrive storage subset passed credentialed nonproduction verification at commit `9f6b9e0daa10a25129475e5e7aad53d881108a76` on 2026-10-02: 2 passed, 0 failed, 0 skipped, including `pnpm verify:task -- T156`. Both providers passed exact-byte/version checks after an external edit, denied a root write (403), and failed closed with 404 after this run deleted its own synthetic file. See [the redacted per-run evidence](../../evidence/T156/live-storage-delete-2026-10-02.json); earlier retained evidence remains at [the prior run](../../evidence/T156/live-storage-2026-10-02-b409b2a.json). T156 remains incomplete: identity sign-in, token expiry, consent revocation, throttling and unknown provider outcomes have not all been accepted. The SPA currently returns 401 because its signed-in tenant identity has no active local user mapping.

The same storage subset was rerun on 2026-10-03 local time at commit `829dfef871315a48cdb29fa0610103bcbc9ad1a6`: 2 passed, 0 failed, 0 skipped. SharePoint and OneDrive both passed version roundtrip, external-edit isolation, selected-folder 403 and deleted-item fail-closed checks; only the test-created synthetic files were deleted. See [the dated evidence](../../evidence/T156/live-storage-2026-10-03-829dfef.json). T156 remains `IN_PROGRESS` because SPA/local-user mapping, token expiry, consent revocation, throttling and unknown provider outcome checks remain open.

Latest enabled-storage subset rerun on 2026-10-03 at working tree based on `c43810b5b4fdb0a3599d5a6fae46bbb4f8a850f4`: 2 passed, 0 failed, 0 skipped. SharePoint and OneDrive again passed exact-version roundtrip, external-edit isolation, selected-folder 403 denial and deleted-item fail-closed checks. The evidence records hashes for the dirty adapter/test source files; both unique synthetic fixtures were deleted. See [the latest redacted evidence](../../evidence/T156/live-storage-2026-10-03-f6f0f539.json). This does not close T156's consent revocation, throttling, unknown-outcome or wider identity acceptance.

## Approved nonproduction scope acceptance — 2026-10-04

T156's approved nonproduction scope is accepted. `M365_ACCEPTANCE_ENV_FILE=.env.m365.acceptance pnpm verify:task -- T156` passed 10 Graph adapter unit tests and 2 live provider tests (0 failed, 0 skipped). Unit tests cover token refresh after the expiry safety window, sanitized OAuth consent failure, a Graph 429 response surfaced without automatic replay, and an upload transport failure after dispatch that is not replayed. The credentialed run streamed and verified SharePoint and OneDrive versions, detected same-size external edits, denied writes outside the selected folders with HTTP 403, deleted only its synthetic files, then confirmed deleted-item reads fail closed. Redacted output is at [the dated run record](../../evidence/T156/live-storage-2026-10-04-6ad456e8.json).

The built-in browser displayed the active mapped `auditp0-staff@easyguide.onmicrosoft.com` identity and its single authorized synthetic engagement. The Client X identity remains a client persona and is intentionally not mapped as internal staff. T152–T155 are `NOT_APPLICABLE` under the approved permission boundary. No tenant grant was revoked or modified. These results do not establish production readiness, Microsoft service throttling behavior, legal retention/hold or data residency.
