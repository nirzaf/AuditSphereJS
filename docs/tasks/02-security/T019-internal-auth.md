# T019 — Implement the selected internal identity adapter and session boundary

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Current status | `IN_PROGRESS` |
| Execution class | `CORE` |
| Phase | 02-security — Identity, authorization and application controls |
| Owner area | `identity` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Implement the approved internal identity route from deployment decisions: production Entra/OIDC adapter or another reviewed provider, never a demo login.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T018 — Implement firm, client and engagement ownership constraints](T018-scope-model.md)
- [T012 — Add typed configuration and secret-safe environment separation](../01-foundation/T012-configuration.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R003** — PREPARER responsibilities and assignment limits; source lines `59-61`.
- **R004** — REVIEWER responsibilities and boundaries; source lines `59-62`.
- **R005** — APPROVER authority and sign-offs; source lines `59-63`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/platform/auth and authorization; identity tables; apps/web auth; tests

**Non-goals:** No automatic partner privileges from system administrator or external directory roles.

**Interface:** GET /api/v1/me; provider-specific authentication callbacks.

**Dependency focus:** jose or approved OIDC/MSAL server package; no hand-written token cryptography

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [x] Implement production Entra identity validation and the authenticated `GET /api/v1/me` self endpoint; development token use remains explicit and isolated.
- [x] Validate issuer, audience, RS256 signature, token lifetime, authorized tenant and delegated API scope; bind by immutable tenant/object identifiers, not email.
- [x] Deny inactive local users and rely on engagement membership plus scoped PostgreSQL grants for business permissions; directory administrator claims grant no audit authority.
- [x] Add MSAL popup sign-out and clear app-held token, identity, records and unsaved drafts even if Microsoft logout cannot be confirmed. Access-token expiry is enforced by token validation and silent renewal.
- [ ] Complete explicit server-side session revocation and interactive Entra acceptance; no live SPA sign-in acceptance is claimed.

## Acceptance criteria and required tests

- [x] **AC1:** Entra unit tests reject wrong-audience, wrong-issuer, expired, foreign-tenant, invalid-scope and malformed credentials.
- [x] **AC2:** PostgreSQL/Fastify integration returns 401 for an inactive local user on `/api/v1/me` and a protected engagement route.
- [x] **AC3:** The authenticated read-only fixture is denied a lifecycle command with 403 and the engagement remains unchanged.

Test valid/invalid/expired credentials and cross-firm/client/engagement access through actual API boundaries.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T019
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

Current implementation evidence: [T019 handoff](../../evidence/T019/handoff.md). AC tests pass locally, but the task remains `IN_PROGRESS` until logout/revocation/session expiry and interactive live Entra acceptance are proven, and prerequisite scope review is complete.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
