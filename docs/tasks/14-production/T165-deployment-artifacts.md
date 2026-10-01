# T165 — Build immutable API, web and worker release artifacts

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `GATE` |
| Phase | 14-production — Production verification, migration and release |
| Owner area | `infrastructure` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Build containers/static assets from one frozen lockfile and exact commit; use selected OS/browser images with pinned digests.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T161 — Tune queries and migrations using production-shaped data](T161-database-tuning.md)
- [T158 — Review authentication, object access and output security end-to-end](T158-security-review.md)
- [T016 — Create clean-install CI and supply-chain checks](../01-foundation/T016-ci.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R002** — Five connected business modules; source lines `68-129`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** infra/; CI workflows; scripts/; deployment/test documentation

**Non-goals:** Do not expose secrets to PR code or execute production deployment without separate authorization.

Use existing owned records/contracts first. Add a migration or public endpoint only when the task steps require it; record the exact files in the handoff.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Build containers/static assets from one frozen lockfile and exact commit; use selected OS/browser images with pinned digests.
- [ ] Run as nonroot with least privilege, read-only filesystem where feasible and bounded writable temp storage.
- [ ] Separate CPU document workers from API resources and include only production dependencies.
- [ ] Record an SBOM, image signatures/provenance and tested health checks.

## Acceptance criteria and required tests

- [ ] **AC1:** Rebuilding the same release inputs is traceable and artifact identities are retained.
- [ ] **AC2:** No dev credential or AI-tool access is present in production.
- [ ] **AC3:** Runtime readiness and worker shutdown smoke tests pass.

Execute isolated environment/container smoke checks; record versions, logs, image identities and actual recovery results.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T165
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
