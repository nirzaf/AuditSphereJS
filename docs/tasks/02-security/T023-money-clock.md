# T023 — Implement decimal, accounting-date and deterministic clock primitives

| Field | Value |
| :--- | :--- |
| Initial status | `IN_PROGRESS` |
| Execution class | `CORE` |
| Phase | 02-security — Identity, authorization and application controls |
| Owner area | `platform` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Use a single decimal arithmetic policy with NUMERIC storage and string transport; define input digit/scale bounds and final QAR rounding.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T022 — Implement canonical runtime contracts and generated browser types](T022-api-contracts.md)
- [T003 — Approve numerical, sampling and professional-judgment specifications](../00-readiness/T003-methodology-decisions.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R036** — Planning materiality formula; source lines `473-474`.
- **R037** — TE/performance-materiality range; source lines `475-475`.
- **R038** — SAD/trivial threshold range; source lines `476-476`.
- **R039** — Practical rounding within +/-5%; source lines `477-477`.
- **R044** — CY/PY balances and percentage variance; source lines `493-493`.
- **R073** — Role charge-out rates: 1000/750/500/200 QAR; source lines `560-564`.
- **R075** — Contracted fee minus charge-out-value calculation; source lines `565-567`.
- **R078** — Firm TB, monthly P/L and client AR aging; source lines `578-578`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/platform/ relevant capability; packages/contracts/; related tests

**Non-goals:** Add the minimum shared mechanism; do not centralize every business rule in a platform service.

**Data or records:** Decimal and clock utilities; golden fixtures.

**Dependency focus:** decimal.js or the approved Prisma Decimal abstraction, not both as competing policies

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** D05,D06

## Implementation checklist

- [x] Use a single decimal arithmetic policy with NUMERIC storage and string transport; define input digit/scale bounds and final QAR rounding.
- [x] Add UTC instants, date-only accounting dates and an injectable clock for deadlines.
- [x] Implement safe percent/variance helpers with explicit zero-base results and signed-balance display policy.
- [x] Keep browser calculations as previews; authoritative totals are recomputed by server rules.

## Acceptance criteria and required tests

- [x] **AC1:** 0.1 + 0.2 yields exactly 0.3 under the selected decimal abstraction.
- [x] **AC2:** Zero-PY variance is not falsely reported as 0% when CY is nonzero.
- [x] **AC3:** Date-boundary and midnight tests do not depend on the server local zone.

Run focused unit plus real-service integration tests for affected contracts, transactions and failure behavior.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T023
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
