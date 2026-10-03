# T068 handoff — controlled Practice period close and reopen

## Identity

| Field | Value |
| :--- | :--- |
| Task ID | T068 |
| Requirement IDs | R077, R078 |
| Implementing branch | `main` |
| Status | `DONE` |

## Intended and delivered outcome

The Practice ledger now has a reasoned close command that refuses to close a period with draft journals, and a separate privileged reopen command. Both use an expected version and idempotency receipt. The target reversal period must be open and contain the reversal date. PostgreSQL guards period transitions and prevents draft journal insertion into a closed or out-of-range period. The existing reversal continues to append a linked, exact inverse while leaving the original posted journal immutable. The Angular Practice workspace exposes close/reopen reason entry and version-bound submission.

Invoices, allocations, receipts, reopening professional policy review, production tenant acceptance and other billing workflows are outside this bounded task and remain incomplete.

## Files and contracts

- `packages/contracts/src/index.ts`, generated `packages/contracts/schema.json`: add `PRACTICE_REOPEN_PERIOD` and a shared reasoned period-transition contract.
- `packages/server/src/modules/practice/ledger.ts`, `ledger-controller.ts`, `index.ts`, `README.md`: add scoped close/reopen service and API commands; validate reversal period/date; lock the period and check drafts before close.
- `prisma/schema.prisma` and `prisma/migrations/202610020004_practice_period_reopen/migration.sql`: retain latest actor/reason, allow only versioned reasoned transitions, add capability, and defend journal inserts/posting dates at the database boundary.
- `prisma/seed.ts`: grant reopen only to the explicitly development-only fixture user.
- `apps/web/src/practice.ts` and `practice.spec.ts`: expose an accessible reason form and verify it binds the current version and exact close/reopen route.
- `tests/practice-ledger.integration.ts`: add PostgreSQL assertions for draft-free close, closed-period denial, unauthorized reopen, reason validation, optimistic versioning, idempotent replay and audit evidence.
- `scripts/verify-task.mjs`: register T068's focused integration recipe.
- `docs/tasks/06-billing-portal/T068-reversals.md`, `docs/guides/13-execution-ledger.md`, `docs/IMPLEMENTATION-STATUS.md`, `docs/architecture/angular-mcp.md`: record scope, current status and evidence.

No other module's tables are changed. The additive migration contains no data rewrite or destructive action. `.zcodeignore` and the unrelated dirty ModuleWorkspace files are preserved and excluded.

## Dependency evidence

No dependency changes. The workspace-pinned Angular CLI MCP identified the Angular 22 `web` project. Native guidance and documentation calls returned an unexpected response; `scripts/angular-mcp.mjs` successfully loaded Angular 22 guidance and the official forms comparison. No browser walkthrough is claimed.

## Decisions

D07's delegated implementation default is retained. The separate firm-wide `PRACTICE_REOPEN_PERIOD` capability operationalizes D12's least-privilege/segregation boundary. Reasons are required on close and reopen and written to the append-only command audit event. Neither choice is professional accounting approval.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm contracts:generate` / `pnpm contracts:check` | Shared Zod contracts and generated schema | PASS; exit 0 | Terminal output, 2026-10-02 |
| `pnpm db:generate` / `pnpm build:server` | Prisma 7.10.0 schema/client and server TypeScript | PASS; exit 0 | Terminal output, 2026-10-02 |
| Angular CLI MCP `web:build` | Angular 22.2.1 production application | PASS; exit 0 | MCP structured status `success` |
| Angular CLI MCP `web:test` | Angular unit suite, including Practice close/reopen | PASS, 29/29; exit 0 | MCP structured status `success` |
| `pnpm verify:affected` | Boundaries, TypeScript, Angular production build, Vitest | PASS, 67/67 Vitest; exit 0 | Terminal output, 2026-10-02 |
| `pnpm lint` | ESLint and module boundaries | PASS; exit 0 | Terminal output, 2026-10-02 |
| GitHub Actions `Build and test` | Commit `6c95f93c991636ba09d3416f08342d99265bb4fd` | PASS, 6m22s; verification, contracts, audit, Linux build/smoke, artifact package and public web asset release passed | [Run 36997592292](https://github.com/nirzaf/AuditSphereJS/actions/runs/36997592292) |
| `pnpm verify:task -- T068` | `tests/practice-ledger.integration.ts` against PostgreSQL 18.6 Testcontainers; Docker Desktop 4.93.0 / Engine 29.8.1 | PASS, 1/1; exit 0; 87.4 seconds | Terminal output, 2026-10-02 |
| Angular local preview | `http://127.0.0.1:4200/` | HTTP 200; Angular dev server remains running | Local HTTP response, 2026-10-02; no workflow interaction claimed |
| Built-in browser workflow walkthrough | Practice close/reopen workflow | NOT RUN | No browser workflow walkthrough was performed |

## Acceptance criteria

- AC1: PASS in the focused PostgreSQL run. Reversal creation swaps debit/credit lines, links the original, preserves posted history, and rejects an invalid target period/date.
- AC2: PASS in the focused PostgreSQL run. Service and database guards reject draft insertion or posting work in a closed or out-of-range period.
- AC3: PASS in the focused PostgreSQL run. Versioned close/reopen receipts replay idempotently; duplicate reversal remains protected by the unique `reversalOf` constraint.
- The focused PostgreSQL run also passed draft-free close, insufficient reopen permission, required-reason validation, stale-version rejection, and direct closed-period insertion denial.

## Recovery and authorization

Migration `202610020004_practice_period_reopen` is additive. The local PostgreSQL integration run passed after Docker Desktop was upgraded to 4.93.0; Docker Engine 29.8.1 was available. Do not hand-edit production records or reverse posted journals. If deployment migration fails, retain the schema and inspect PostgreSQL migration logs before retrying; no production migration or data repair occurred. Periodic commits/pushes and GitHub Actions are authorized; no deployment is authorized or performed.

## Review and next task

Reviewer: independent peer review, ZCode agent (separate session from the implementing agent), 2026-10-02.
Review result: PASS with observations. Reviewed commits `6c95f93` and `937dce1` against the task scope:

- Close and reopen both take the practice-period row lock before reading and re-check the expected version in the `updateMany` predicate, so a concurrent close cannot interleave with journal creation, which locks the same period row first. The draft-free close check is therefore race-free against journal creation.
- The database trigger independently enforces what the service checks: transitions require version+1, an actor and a reason of at least 10 characters; non-transition updates may not change identity, version, reason or actor; journals must begin as drafts inside an open, in-range period; posted journals are immutable; reversals must exactly invert a posted journal of the same firm. Service-level `practiceFailure` mapping covers every trigger message.
- Reversal validates the target period is open and contains the accounting date in the service before insert; the trigger re-validates at posting. The original journal is never modified; duplicate reversal is blocked by the unique `reversalOf` constraint.
- Observations (non-blocking, recorded for follow-up): the period guard takes a `FOR UPDATE` lock on the whole `Firm` row for every period write, serializing period administration per firm — acceptable at practice-ledger volumes and consistent with the engagement-row locking pattern used elsewhere, but worth revisiting if contention appears; `lastTransitionReason` defaults to an empty string on pre-existing rows, which only matters because the ≥10-character rule applies to transitions, not to legacy rows; the capability CHECK extension is additive and the seed grants reopen only to the explicitly labeled development fixture user.
- Reviewer verification: `pnpm verify:task -- T067` (build:server + practice-ledger integration, PostgreSQL 18.6 Testcontainers) PASS; T068's own recorded `verify:task -- T068` run stands as executed by the implementer.

Open blockers: none within this task's scope. Prerequisite dispositions: T017 is DONE (hosted run 37006033506); T067 is closed this date; T025 append-only audit writes landed separately as `IN_REVIEW` (evidence/T025/handoff.md) and does not gate this task's dependency list. No interactive close/reopen browser walkthrough was performed; the Angular spec verifies reason-form submission binding and route shape only.
Next eligible task by dependency order: T069 invoice foundation.
