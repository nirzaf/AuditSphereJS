# T119 — Assemble audited financial-statement snapshots for D1

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 10-reporting — Reporting and controlled release |
| Owner area | `reporting` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Assemble financial statements from approved mapped/adjusted TB snapshots, current/prior columns and reviewed classifications.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T118 — Implement the partner-only four-way opinion workflow](T118-opinion.md)
- [T104 — Approve client audit adjustments and derive adjusted balances](../08-fieldwork/T104-adjustment-approval.md)
- [T036 — Build versioned document templates and approved assets](../03-platform/T036-template-catalog.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R043** — P/L top and B/S bottom dashboard; source lines `491-492`.
- **R044** — CY/PY balances and percentage variance; source lines `493-493`.
- **R058** — AJEs, unadjusted differences, SAD/PM and estimates in SRM; source lines `517-517`.
- **R065** — D1 report and audited financial statements; source lines `541-542`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/modules/reporting/; apps/web features/reporting; owned snapshots and worker processors; tests

**Non-goals:** Use Practice final-fee facade; no stale SRM release, silent re-signing or partial bundle exposure.

**Data or records:** financial_statement_versions; notes/disclosures; reconciliation manifest.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Assemble financial statements from approved mapped/adjusted TB snapshots, current/prior columns and reviewed classifications.
- [ ] Implement the required template sections and note/disclosure inputs as versioned approved content rather than inventing missing accounting requirements.
- [ ] Reconcile statements to adjusted TB and retain source/calculation manifests.
- [ ] Surface unmapped balances or missing mandatory reporting inputs as hard preparation errors.

## Acceptance criteria and required tests

- [ ] **AC1:** Statement totals reconcile to adjusted TB and comparative sources.
- [ ] **AC2:** Unapproved adjustment cannot appear in certified financials.
- [ ] **AC3:** Missing disclosure/template policy is a visible blocker, not invented text.

Test version-bound gates, evidence/signature identity, failure recovery and portal/archival boundaries.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T119
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
