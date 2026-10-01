# T047 — Build a virtualized Angular TB grid with bounded data windows

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 04-tb-proof — Trial Balance technical proof |
| Owner area | `frontend` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Create a feature-local signal state with row window, selected IDs, focused cell and dirty-change map.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T046 — Implement deterministic mapping suggestions with provenance](T046-mapping-prototype.md)
- [T010 — Create the Angular standalone shell and accessible layouts](../01-foundation/T010-angular-shell.md)
- [T022 — Implement canonical runtime contracts and generated browser types](../02-security/T022-api-contracts.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R043** — P/L top and B/S bottom dashboard; source lines `491-492`.
- **R044** — CY/PY balances and percentage variance; source lines `493-493`.
- **R045** — AR and workprogram action triggers; source lines `494-496`.
- **R046** — Concurrent FSLI work without lost updates; source lines `497-497`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** apps/web/src/app/ relevant feature; browser-safe contracts; related tests

**Non-goals:** Keep domain calculations and authorization authoritative on the server; no unneeded UI framework.

**Screen or user interaction:** Trial Balance mapping grid and error/empty/progress states.

**Dependency focus:** Angular CDK; native signals; no extra grid framework

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Create a feature-local signal state with row window, selected IDs, focused cell and dirty-change map.
- [ ] Use CDK virtualization and stable row identity; page/filter/sort on the server when the entire dataset would exceed budgets.
- [ ] Provide mapping status, CY/PY values and accessible row labels; retain split FSLI dashboard as a separate summary view.
- [ ] Avoid a custom general spreadsheet engine or paid grid dependency at this stage.

## Acceptance criteria and required tests

- [ ] **AC1:** 50k fixture does not create 50k DOM rows.
- [ ] **AC2:** Focus/selection remains stable while scrolling.
- [ ] **AC3:** Server pagination and frontend virtual scrolling are tested independently.

Run Angular strict template/production build, relevant component tests and affected Playwright keyboard/interaction tests.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T047
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
