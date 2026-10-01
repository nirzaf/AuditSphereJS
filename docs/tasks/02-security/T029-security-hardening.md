# T029 — Add CSRF, CORS, proxy and request-abuse controls

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 02-security — Identity, authorization and application controls |
| Owner area | `security` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Apply reviewed origin allowlists, secure cookie settings, CSRF checks for cookie-auth routes and bounded bearer-token audiences.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T019 — Implement the selected internal identity adapter and session boundary](T019-internal-auth.md)
- [T020 — Implement separate portal authentication and first-reset gate](T020-portal-auth.md)
- [T022 — Implement canonical runtime contracts and generated browser types](T022-api-contracts.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R006** — Isolated CLIENT portal and closure access; source lines `59-64`.
- **R081** — Preparer has no external communication or sign-off rights; source lines `61-61`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** Relevant auth, transport, storage and output boundaries; negative tests

**Non-goals:** No new malware-scanning subsystem or unrelated identity rewrite; focus on required controls.

Use existing owned records/contracts first. Add a migration or public endpoint only when the task steps require it; record the exact files in the handoff.

**Dependency focus:** Fastify-compatible helmet/cookie/CSRF/rate-limit plugins as selected in the register

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Apply reviewed origin allowlists, secure cookie settings, CSRF checks for cookie-auth routes and bounded bearer-token audiences.
- [ ] Configure trusted proxy hops explicitly and avoid trusting arbitrary forwarded headers.
- [ ] Rate-limit login/invites, uploads and expensive endpoints with separate policies.
- [ ] Reject unsafe content types and unbounded filters/sorts; create an error-redaction regression suite.

## Acceptance criteria and required tests

- [ ] **AC1:** Cross-origin state-changing portal requests fail without valid CSRF/origin evidence.
- [ ] **AC2:** Spoofed forwarded IP headers cannot bypass throttles.
- [ ] **AC3:** Auth failures do not reveal account existence or secrets.

Run negative API/browser/file fixtures, scope checks and secret-redaction assertions with the tested artifact.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T029
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
