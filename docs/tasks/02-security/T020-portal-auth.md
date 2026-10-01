# T020 — Implement separate portal authentication and first-reset gate

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 02-security — Identity, authorization and application controls |
| Owner area | `identity` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Create portal principals and session storage separate from internal role grants.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T018 — Implement firm, client and engagement ownership constraints](T018-scope-model.md)
- [T012 — Add typed configuration and secret-safe environment separation](../01-foundation/T012-configuration.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R006** — Isolated CLIENT portal and closure access; source lines `59-64`.
- **R020** — Isolated portal and temporary credentials; source lines `428-430`.
- **R021** — Mandatory first-login password reset; source lines `431-431`.
- **R080** — Advance must clear before client portal activation; source lines `588-592`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/platform/auth and authorization; identity tables; apps/web auth; tests

**Non-goals:** No automatic partner privileges from system administrator or external directory roles.

**Data or records:** portal_users; portal_memberships; session and invitation records.
**Interface:** Portal invite/redeem/login/reset/logout endpoints.

**Dependency focus:** Node crypto; approved password-hash library if password authentication is selected

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** D02,D04

## Implementation checklist

- [ ] Create portal principals and session storage separate from internal role grants.
- [ ] Issue expiring single-use invitations or temporary credentials according to the approved source reconciliation; store only secure hashes and never log credentials.
- [ ] Require first-login password establishment/reset before document submission; rotate session identifiers on authentication changes.
- [ ] Apply HttpOnly/Secure cookies, CSRF defenses and origin checks to portal mutations; add reset/recovery throttles.

## Acceptance criteria and required tests

- [ ] **AC1:** An invitation replay or expired reset token fails.
- [ ] **AC2:** Portal credentials cannot use internal routes.
- [ ] **AC3:** Upload remains forbidden until first reset and engagement payment gates both pass.

Test valid/invalid/expired credentials and cross-firm/client/engagement access through actual API boundaries.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T020
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
