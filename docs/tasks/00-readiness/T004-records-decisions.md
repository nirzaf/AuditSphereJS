# T004 — Approve signature, archival and engagement-type policies

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `GATE` |
| Phase | 00-readiness — Requirements, decisions and compatibility |
| Owner area | `planning` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Distinguish pasted signature/seal appearance from cryptographically verifiable PDF signing; choose the required assurance and credential provider.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T001 — Preserve the requirements and inspect the implementation starting point](T001-baseline.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. The following domain tasks cannot begin until [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) passes. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R014** — Engagement-type letter templates; source lines `415-419`.
- **R016** — Partner authorization of letter signature/seal; source lines `421-421`.
- **R062** — Four-way partner-exclusive opinion selector; source lines `529-535`.
- **R063** — Affected FSLI, mandatory rationale and modified basis text; source lines `536-536`.
- **R064** — Partner digital signature and firm seal; source lines `537-537`.
- **R065** — D1 report and audited financial statements; source lines `541-542`.
- **R067** — D3 LOR export, management signing and re-upload; source lines `544-544`.
- **R070** — 60-calendar-day signature-based archive timer; source lines `548-550`.
- **R071** — Early/manual or timed permanent application read-only state; source lines `551-551`.
- **R072** — Timestamped immutable audit events; source lines `552-552`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** docs/requirements/; docs/architecture/; docs/decisions/; dependency evidence

**Non-goals:** Planning only: no production commands or application behavior changes.

Use existing owned records/contracts first. Add a migration or public endpoint only when the task steps require it; record the exact files in the handoff.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** D03,D08,D09,D10

## Implementation checklist

- [ ] Distinguish pasted signature/seal appearance from cryptographically verifiable PDF signing; choose the required assurance and credential provider.
- [ ] Preserve the 60-day signature-based business countdown, but get records-owner decisions for report date, time zone, retention period and permitted post-archive addenda.
- [ ] Define how internal audit and agreed-upon-procedures engagements use separate reporting templates rather than statutory four-way audit opinions by accident.
- [ ] Define signed LOR timing and archive-manifest scope; no irreversible retention lock may be applied in production during development.

## Acceptance criteria and required tests

- [ ] **AC1:** Approved records policy separates assembly deadline, application read-only, object-version retention and legal hold.
- [ ] **AC2:** PNG-only signature output is never labeled cryptographically signed.
- [ ] **AC3:** Non-statutory engagement paths have an approved reporting policy before release.

Review source hashes, approvals, evidence links and unresolved blockers. No fabricated test output.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T004
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
