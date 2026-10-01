# T085 — Implement TB-linked benchmark selection and normalization

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 07-planning — Production Trial Balance and planning |
| Owner area | `governance` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Offer PBT, revenue, assets and equity/net-assets with the exact source percentage ranges.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T081 — Finalize an immutable TB version through real business gates](T081-tb-finalize.md)
- [T003 — Approve numerical, sampling and professional-judgment specifications](../00-readiness/T003-methodology-decisions.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R032** — PBT materiality benchmark 5%-10%; source lines `468-469`.
- **R033** — Revenue benchmark 0.5%-2%; source lines `470-470`.
- **R034** — Assets benchmark 0.5%-1%; source lines `471-471`.
- **R035** — Equity/net-assets benchmark 1%-2%; source lines `472-472`.
- **R036** — Planning materiality formula; source lines `473-474`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/modules/governance/; apps/web features/governance; owned data; related tests

**Non-goals:** Preserve approved method/template versions and require professional decisions for undefined rules.

**Data or records:** materiality drafts; benchmark provenance.
**Screen or user interaction:** Benchmark selection and normalization form.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Offer PBT, revenue, assets and equity/net-assets with the exact source percentage ranges.
- [ ] Derive benchmark amounts from identified TB/FSLI snapshots; retain normalization adjustments and explanations.
- [ ] Block zero/negative or exceptional bases unless the approved methodology explicitly handles them.
- [ ] Display source balances and proposed percentage validation before calculating.

## Acceptance criteria and required tests

- [ ] **AC1:** All four benchmark ranges are tested at their endpoints.
- [ ] **AC2:** Selected benchmark reconciles to its retained financial snapshot.
- [ ] **AC3:** Unsupported normalization cannot silently change PM.

Use approved numerical/checklist examples; test unauthorized sign-off, stale inputs and transition gates.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T085
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
