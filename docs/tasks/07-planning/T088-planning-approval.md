# T088 — Approve version-bound planning and unlock fieldwork

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 07-planning — Production Trial Balance and planning |
| Owner area | `governance` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Require mapped finalized TB, materiality approval, assigned team, acceptance clearance and required planning evidence.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T087 — Implement risk colors and mandatory review routing](T087-risk-classification.md)
- [T084 — Implement statutory-relative milestone planning](T084-milestones.md)
- [T064 — Provision the five-folder engagement taxonomy idempotently](../05-commercial/T064-directories.md)
- [T028 — Implement guarded engagement transitions and state history](../02-security/T028-workflow-kernel.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R027** — Partner risk acceptance blocks operational planning; source lines `446-446`.
- **R029** — Engagement team roles; source lines `451-451`.
- **R030** — Statutory milestone scheduling; source lines `452-452`.
- **R036** — Planning materiality formula; source lines `473-474`.
- **R039** — Practical rounding within +/-5%; source lines `477-477`.
- **R040** — Green/Amber/Red stratification and required reviewers; source lines `478-481`.
- **R079** — All 11 lifecycle states and rework transitions; source lines `584-624`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/modules/governance/; apps/web features/governance; owned data; related tests

**Non-goals:** Preserve approved method/template versions and require professional decisions for undefined rules.

**Data or records:** planning_approvals; gate manifest.
**Interface:** POST /engagements/:id/planning/actions/approve.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Require mapped finalized TB, materiality approval, assigned team, acceptance clearance and required planning evidence.
- [ ] Capture one planning approval manifest with TB/materiality/risk/template versions.
- [ ] Use partner authorization and expected engagement revision in the state transition.
- [ ] Reject stale sign-off after TB/materiality change and provide impacted-item explanations.

## Acceptance criteria and required tests

- [ ] **AC1:** No missing planning gate can be bypassed through direct API calls.
- [ ] **AC2:** A race changing materiality causes approval conflict.
- [ ] **AC3:** FIELDWORK_EXECUTION references the approved manifest.

Use approved numerical/checklist examples; test unauthorized sign-off, stale inputs and transition gates.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T088
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
