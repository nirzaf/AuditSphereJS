# T044 — Implement bounded CSV parsing in a background worker

| Field | Value |
| :--- | :--- |
| Current status | `IN_REVIEW` |
| Execution class | `CORE` |
| Phase | 04-tb-proof — Trial Balance technical proof |
| Owner area | `fieldwork` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Use the approved streaming CSV parser with explicit encoding, delimiter, header and quoted-value rules.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T043 — Implement import-batch staging and source-document provenance](T043-tb-staging.md)
- [T031 — Configure BullMQ workers for reliable retries and shutdown](../03-platform/T031-queue-runtime.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R041** — Excel/CSV TB imports from source systems; source lines `487-489`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/modules/fieldwork/; apps/web features/fieldwork; owned data and tests

**Non-goals:** Keep imported evidence immutable; no unapproved sampling formulas, floating-point financial truth or hidden last-write-wins.

Use existing owned records/contracts first. Add a migration or public endpoint only when the task steps require it; record the exact files in the handoff.

**Dependency focus:** csv-parse; shared decimal policy

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [x] Use the existing `csv-parse` stream parser with explicit UTF-8/BOM, comma, header and quoted-value rules.
- [x] Preserve account codes as strings including leading zeroes; parse monetary strings through the shared decimal policy.
- [x] Process bounded chunks with cancellation/progress checkpoints and durable error rows carrying source line numbers. Streaming validation, 1,000-row transactional writes, source-line errors, per-chunk progress checkpoints, cooperative cancellation and append-only `TbImportRowError` records are implemented and PostgreSQL-tested (see T044 evidence increment 2).
- [ ] Reject unexpected columns and resolve formula-like export hazards according to approved format policy without evaluating spreadsheet expressions. Unexpected/duplicate/missing columns are rejected; export policy remains unresolved.

## Acceptance criteria and required tests

- [x] **AC1 (unit evidence):** Quoted commas, BOM, CRLF and leading-zero accounts parse correctly.
- [x] **AC2 (unit evidence):** A 50k fixture is consumed as an async row stream without materializing a complete row array. The source payload and duplicate-code set remain bounded but resident.
- [x] **AC3 (unit evidence):** Malformed numerics reject with source-line context; no fallback to zero or NaN.

Focused deterministic parser evidence is recorded in `docs/evidence/T044/handoff.md`. Real PostgreSQL worker/race/lineage tests and the affected browser/editor flow remain outstanding, as do prerequisite T043, T031 and T017 acceptance gates.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T044
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
