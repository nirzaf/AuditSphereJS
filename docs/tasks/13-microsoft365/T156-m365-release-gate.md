# T156 — Run tenant-consent, throttling and revocation integration tests

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
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

- [ ] Run credentialed nonproduction tests for the enabled integration subset and record actual consent/permission state.
- [ ] Exercise token expiry, revoked consent, throttling, deleted external item and unknown provider outcome.
- [ ] Confirm business modules still depend on platform interfaces, not direct Graph imports.
- [ ] Mark disabled integrations NOT_APPLICABLE with owner approval; never mark an untested integration production-ready.

## Acceptance criteria and required tests

- [ ] **AC1:** Enabled features pass their real-tenant evidence checks.
- [ ] **AC2:** No test creates or modifies production tenant resources.
- [ ] **AC3:** Audit logs and secrets are redacted.

Require exact SDK peer/install evidence and least-privilege credentialed nonproduction tests for enabled endpoints.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T156
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
