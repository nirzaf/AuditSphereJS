# T149 — Approve optional Microsoft 365 tenant integration scope

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Current status | `DONE` — selected nonproduction Entra/Graph storage scope is documented and regression-tested; production and optional mail/directory features remain gated |
| Execution class | `OPTIONAL` |
| Phase | 13-microsoft365 — Optional Microsoft 365 integration |
| Owner area | `microsoft365` |
| Completion unit | One focused, reviewable change and its evidence |

> Optional extension. Implement only when enabled and approved; otherwise retain an explicit `NOT_APPLICABLE` decision.

## Outcome

Define only the approved features: internal SSO, mail, directory lookup and optional SharePoint workspace; full tenant administration is not implied by the functional file.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T006 — Select deployment targets, storage and external-provider boundaries](../00-readiness/T006-deployment-decisions.md)
- [T021 — Create explicit permission and segregation-of-duties checks](../02-security/T021-authorization.md)

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

- [x] Define only the approved features: internal SSO and selected-folder SharePoint/OneDrive storage; mail, directory lookup and runtime workspace provisioning remain disabled. Full tenant administration is not implied by the functional file.
- [x] Create a least-privilege permission/consent matrix for delegated versus application access in [the permission boundary](../../microsoft365/permission-matrix.md).
- [x] Separate AuditSphere roles from Entra roles and admin-consent ability; only local identity mapping, membership and grants establish application authority.
- [x] Keep optional integration disabled until tenant approval and credentialed tests are recorded. The selected nonproduction storage app has only `Files.SelectedOperations.Selected`, explicit synthetic-folder grants and dated credentialed acceptance in [T156 evidence](../../evidence/T156/tenant-readiness.md); no tenant change was made in this task.

## Acceptance criteria and required tests

- [x] **AC1:** No broad tenant permission is requested solely for convenience. The matrix names the sole runtime Graph role and prohibits tenant-wide permissions.
- [x] **AC2:** Disabled Graph storage makes no outbound Graph/token request in local S3 mode; `tests/m365-policy.test.ts` exercises `ensureBucket()` against an ephemeral local S3 endpoint while spying on `fetch`.
- [x] **AC3:** Local nonproduction storage and the core affected verification run without Microsoft Graph credentials; production remains intentionally configured to require the selected Entra/Graph providers.

No dependency was added. `@azure/msal-browser` is pinned at 5.23.0 for the existing SPA login; the server Graph storage adapter uses the native Fetch API, not a Graph SDK. T150 owns independent MSAL/Graph package compatibility review. The enabled storage endpoint has credentialed nonproduction evidence in T156; this task does not claim production-provider acceptance.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T149
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
