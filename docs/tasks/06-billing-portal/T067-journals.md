# T067 — Implement draft journals and balanced posting transactions

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 06-billing-portal — Billing foundation and PBC portal |
| Owner area | `practice` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Model journal headers and debit/credit lines with nonnegative one-sided amounts and at least two effective lines.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T066 — Create the firm chart of accounts and accounting-period controls](T066-accounts-periods.md)
- [T024 — Share one transaction across module-owned business operations](../02-security/T024-transaction-context.md)
- [T025 — Implement append-only audit writes with database permissions](../02-security/T025-audit-write.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R077** — Rent, salaries, benefits, end of service, withdrawals, petty cash; source lines `571-577`.
- **R078** — Firm TB, monthly P/L and client AR aging; source lines `578-578`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/modules/practice/; apps/web features/practice; owned journals/billing/rates; tests

**Non-goals:** Practice is the sole posting owner; client audit AJEs never silently enter the firm ledger.

**Data or records:** practice_journals; practice_journal_lines; posting constraints.
**Interface:** Draft journal CRUD; POST /practice/journals/:id/actions/post.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Model journal headers and debit/credit lines with nonnegative one-sided amounts and at least two effective lines.
- [ ] Serialize line mutations and posting using the same header-lock protocol; compute totals from lines at posting.
- [ ] Add database-backed protection for balance/posting state and immutable posted lines.
- [ ] Keep draft edits separate from POSTED status and audit posting actor/date/source.

## Acceptance criteria and required tests

- [ ] **AC1:** Unbalanced, empty, cross-firm and invalid-account journals cannot post.
- [ ] **AC2:** A concurrent line edit cannot slip past the posting balance check.
- [ ] **AC3:** Posted header/line modification fails with ordinary app credentials.

Run real-PostgreSQL decimal, posting, reversal, allocation and reconciliation tests relevant to this change.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T067
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
