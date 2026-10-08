# T140 — Record daily hours by engagement, phase and FSLI

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 12-practice — Practice analytics and bookkeeping reports |
| Owner area | `practice` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Capture work date, exact duration/minutes or approved decimal hours, engagement, phase, FSLI and description.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T139 — Implement effective-dated staff charge-out rates](T139-rate-cards.md)

**Removed sequencing edge (D20, DN-13): T088, planning approval.** Recording daily hours does not read an approved plan; the data it needs is the rate-card snapshot from T139. The task enters lane D by its entry criterion in [the roadmap](../../05-roadmap.md) §3.

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R003** — PREPARER responsibilities and assignment limits; source lines `59-61`.
- **R074** — Daily hours by engagement/phase/FSLI; source lines `335-339`.
- **R073** — Role charge-out rates: 1000/750/500/200 QAR; source lines `560-564`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/modules/practice/; apps/web features/practice; owned journals/billing/rates; tests

**Non-goals:** Practice is the sole posting owner; client audit AJEs never silently enter the firm ledger.

**Data or records:** time_entries; rate snapshots; correction history.
**Screen or user interaction:** Daily/weekly timesheet.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** D22 (DN-09): the FSLI must be a line of the approved taxonomy. D24 (DN-11): time entries are attributed to an engagement and stay on the engagement path. The phase set (PLANNING, FIELDWORK, REVIEW, REPORTING) is an implementation choice awaiting owner confirmation.

## Implementation checklist

- [x] Capture work date, exact duration/minutes or approved decimal hours, engagement, phase, FSLI and description.
- [x] Validate assignment and permitted periods; protect against accidental duplicate saves.
- [x] Snapshot applied charge-out rate/value and show daily/weekly totals.
- [x] Define correction history for approved time without silently editing financial source records.

## Acceptance criteria and required tests

- [x] **AC1:** Unassigned engagement time entry fails.
- [x] **AC2:** Decimal/hour conversion matches approved rounding fixtures.
- [x] **AC3:** Changing the current rate card does not change prior time value.

Run real-PostgreSQL decimal, posting, reversal, allocation and reconciliation tests relevant to this change.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T140
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
