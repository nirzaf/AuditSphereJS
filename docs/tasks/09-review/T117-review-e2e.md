# T117 — Verify the complete preparer-manager-partner rejection loop

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `GATE` |
| Phase | 09-review — Review, confirmations and SRM |
| Owner area | `testing` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Run the full submission, notes, return, response, resubmit, manager and partner journey with separate identities.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T116 — Implement mandatory Red-area review and partner SRM clearance](T116-partner-clearance.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R003** — PREPARER responsibilities and assignment limits; source lines `59-61`.
- **R004** — REVIEWER responsibilities and boundaries; source lines `59-62`.
- **R005** — APPROVER authority and sign-offs; source lines `59-63`.
- **R055** — Preparer execution and submission; source lines `509-511`.
- **R056** — Manager review comments and rework; source lines `512-514`.
- **R057** — SRM automatically compiled after manager clearance; source lines `515-516`.
- **R059** — Partner review of Red areas and SRM; source lines `518-518`.
- **R060** — Bank/AR/AP/inventory/legal confirmations; source lines `520-522`.
- **R061** — Critical confirmation blocks release and triggers holding letter; source lines `523-523`.
- **R079** — All 11 lifecycle states and rework transitions; source lines `584-624`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** Relevant test suites, representative fixtures and evidence; minimal associated fixes

**Non-goals:** Do not weaken source invariants to make a test pass or rewrite unrelated modules.

Use existing owned records/contracts first. Add a migration or public endpoint only when the task steps require it; record the exact files in the handoff.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Run the full submission, notes, return, response, resubmit, manager and partner journey with separate identities.
- [ ] Add concurrent evidence change and unresolved-critical-confirmation cases.
- [ ] Verify every source state transition and event chain.
- [ ] Confirm no backend route or worker can skip approval by directly updating a state field.

## Acceptance criteria and required tests

- [ ] **AC1:** All intended positive and denial paths pass against PostgreSQL.
- [ ] **AC2:** State/audit history exactly explains each review decision.
- [ ] **AC3:** No fake approval or mock-only financial proof is accepted.

Run exact documented scenarios on real selected services; record fixture sizes, versions and observed outcomes.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T117
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
