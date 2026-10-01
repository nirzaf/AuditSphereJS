# Repository commands and one-task execution workflow

These are **scripts the foundation tasks must implement in the target repository**, not commands executable against this documentation-only ZIP. Do not claim they already exist or pass.

## Stable command interface

| Command | Contract |
| :--- | :--- |
| `pnpm install --frozen-lockfile` | Install the reviewed exact dependency graph under approved script/peer policies. |
| `pnpm dev` | Start API/web/worker development, using already running isolated data services. |
| `pnpm build` | Build shared packages and all three application artifacts in dependency order. |
| `pnpm typecheck` | Separate strict server and Angular-supported checks; never rely only on SWC. |
| `pnpm lint` | Include browser/server and private-module boundary checks. |
| `pnpm test:unit` | Pure domain/calculation and supported component tests. |
| `pnpm test:integration` | Real PostgreSQL/Redis/storage contract and compiled API tests. |
| `pnpm test:e2e` | Selected role-separated browser journeys in isolated test environment. |
| `pnpm verify:task -- T049` | Run the tests/checks assigned to that task plus affected compile/contract checks. |
| `pnpm verify:all` | Run the full mandatory test/build/security/check suite for a release candidate. |
| `pnpm contracts:generate` | Produce OpenAPI and the single selected browser contract/client surface. |
| `pnpm contracts:check` | Fail when committed generated artifacts drift from canonical schemas. |
| `pnpm db:migrate:test` | Migrate only an explicitly identified disposable test DB. |
| `pnpm db:seed:test` | Seed deterministic synthetic fixtures only in a verified test target. |
| `pnpm dependencies:check` | Record current support/engine/peer/advisory/license results and unresolved issues. |

Production migration, reset, seeding and cutover are not implicit parts of these commands. Require explicit environment safeguards and authorization for data-changing production operations. Do not ship a command that guesses a production connection from defaults.

## One-task agent prompt

```text
Implement only task T___ from the provided task pack.
Read root AGENTS.md, that task, its exact source ranges and the module README.
Inspect the actual repository and confirm direct prerequisites are complete.
Preserve the resolved dependency matrix; add no package without its review gate.
State the intended outcome, scope, non-goals and acceptance criteria before editing.
Make the smallest sufficient change. Do not alter unrelated modules.
Run the task's focused tests plus required type/build/contract checks.
Stop after this task. Return changed files, test commands/results and blockers.
Do not merge, deploy, reset data or perform irreversible actions without authorization.
```

## Task test mapping

Implement a small task-to-test/path mapping in the repository, not a new build orchestration product. Accept the numeric task ID and fail clearly for unknown IDs or missing intended tests. Run only relevant checks locally; the release pipeline runs broader suites. A planning task can use documentation/review checks, but a functional task may not be treated as a documentation-only pass.

## Handoff discipline

Keep task outcome, requirement IDs, actual files, contract/schema changes, decision approvals, exact dependency changes, commands/output and limitations. See [the handoff template](../templates/task-handoff.md). Re-run verification when the tested commit/lockfile changes. Never copy a previous successful result onto a different build.
