# T010 — Create the Angular standalone shell and accessible layouts

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 01-foundation — Workspace and executable foundation |
| Owner area | `frontend` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Scaffold matched Angular core/compiler/CLI/build packages with strict TypeScript/template checking.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T007 — Create a minimal pnpm workspace with explicit package ownership](T007-workspace.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. The following domain tasks cannot begin until [the executable compatibility gate](T017-compatibility-smoke.md) passes. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R003** — PREPARER responsibilities and assignment limits; source lines `59-61`.
- **R004** — REVIEWER responsibilities and boundaries; source lines `59-62`.
- **R005** — APPROVER authority and sign-offs; source lines `59-63`.
- **R006** — Isolated CLIENT portal and closure access; source lines `59-64`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** apps/web/src/app/ relevant feature; browser-safe contracts; related tests

**Non-goals:** Keep domain calculations and authorization authoritative on the server; no unneeded UI framework.

**Screen or user interaction:** Internal shell; portal shell; not-authorized and error pages.

**Dependency focus:** Angular family; Material/CDK; RxJS; supported TypeScript

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Scaffold matched Angular core/compiler/CLI/build packages with strict TypeScript/template checking.
- [ ] Create internal and portal layouts with lazy routes and authentication placeholders that cannot grant backend access.
- [ ] Add Material/CDK tokens, reusable loading/error/empty states and keyboard-visible focus.
- [ ] Keep SPA rendering; do not introduce SSR, a global state library, or a data-grid vendor in this task.

## Acceptance criteria and required tests

- [ ] **AC1:** Production build and the supported Angular test builder pass.
- [ ] **AC2:** Keyboard navigation reaches both layouts and major navigation controls.
- [ ] **AC3:** No server secrets or backend package imports appear in the bundle.

Run Angular strict template/production build, relevant component tests and affected Playwright keyboard/interaction tests.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T010
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
