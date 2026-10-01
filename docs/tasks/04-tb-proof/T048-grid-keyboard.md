# T048 — Add keyboard editing, selection, clipboard and local undo

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 04-tb-proof — Trial Balance technical proof |
| Owner area | `frontend` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Implement arrow, Tab/Shift+Tab and Enter behavior with roving focus and predictable row traversal.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T047 — Build a virtualized Angular TB grid with bounded data windows](T047-grid-shell.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R042** — Historical FSLI mapping memory; source lines `490-490`.
- **R046** — Concurrent FSLI work without lost updates; source lines `497-497`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** apps/web/src/app/ relevant feature; browser-safe contracts; related tests

**Non-goals:** Keep domain calculations and authorization authoritative on the server; no unneeded UI framework.

**Screen or user interaction:** TB keyboard/clipboard behavior; edit preview; unsaved changes dialog.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Implement arrow, Tab/Shift+Tab and Enter behavior with roving focus and predictable row traversal.
- [ ] Support bounded multi-row selection and paste of mapping values; validate pasted shape and show a preview before applying.
- [ ] Keep dirty edits, local undo/redo and unsaved-navigation warning inside the feature store.
- [ ] Prevent pasted content from becoming executable HTML or spreadsheet export formulas.

## Acceptance criteria and required tests

- [ ] **AC1:** Keyboard-only user can map multiple rows and reverse unsaved edits.
- [ ] **AC2:** Undo never silently reverses a committed server transaction.
- [ ] **AC3:** Oversized paste is rejected with a useful bound and no browser freeze.

Run Angular strict template/production build, relevant component tests and affected Playwright keyboard/interaction tests.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T048
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
