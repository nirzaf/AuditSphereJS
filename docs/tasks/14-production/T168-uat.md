# T168 — Conduct role-based UAT and professional-policy sign-off

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `GATE` |
| Phase | 14-production — Production verification, migration and release |
| Owner area | `acceptance` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Run stakeholder scripts for preparer, manager, partner, billing administrator and client liaison.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T167 — Create the source-controlled hotfix and incident-repair workflow](T167-hotfix-runbook.md)
- [T162 — Perform PostgreSQL and object-store restore drills](T162-backup-restore.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R001** — No per-file licensing caps; capacity remains bounded by infrastructure; source lines `42-45`.
- **R002** — Five connected business modules; source lines `68-129`.
- **R003** — PREPARER responsibilities and assignment limits; source lines `59-61`.
- **R004** — REVIEWER responsibilities and boundaries; source lines `59-62`.
- **R005** — APPROVER authority and sign-offs; source lines `59-63`.
- **R006** — Isolated CLIENT portal and closure access; source lines `59-64`.
- **R049** — Monetary Unit Sampling; source lines `503-503`.
- **R050** — Systematic Random Sampling; source lines `503-503`.
- **R051** — Stratified Attribute Sampling; source lines `503-503`.
- **R062** — Four-way partner-exclusive opinion selector; source lines `529-535`.
- **R064** — Partner digital signature and firm seal; source lines `537-537`.
- **R070** — 60-calendar-day signature-based archive timer; source lines `548-550`.
- **R071** — Early/manual or timed permanent application read-only state; source lines `551-551`.
- **R075** — Contracted fee minus charge-out-value calculation; source lines `565-567`.
- **R078** — Firm TB, monthly P/L and client AR aging; source lines `578-578`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** UAT scripts; decisions; release-readiness and evidence records

**Non-goals:** Never convert planned or skipped tests into a passing production-certification statement.

Use existing owned records/contracts first. Add a migration or public endpoint only when the task steps require it; record the exact files in the handoff.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** D31; also check the decision register for any other applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Run stakeholder scripts for preparer, manager, partner, billing administrator and client liaison.
- [ ] Obtain professional approval of methodology, sampling, opinion templates, LOR, signing and archive policies; software tests are not certification of ISA/IFRS compliance.
- [ ] Verify all unresolved D01-D12 decisions and optional-feature dispositions.
- [ ] Record accepted limitations and reject unimplemented critical source behavior.

## Acceptance criteria and required tests

- [ ] **AC1:** Each required persona completes the agreed scenarios.
- [ ] **AC2:** No source conflict remains silently resolved by an agent.
- [ ] **AC3:** All production-blocking decisions have named approvals.

Review actual test/provider/policy evidence and record GO/NO-GO with named approval and artifact identity.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T168
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
