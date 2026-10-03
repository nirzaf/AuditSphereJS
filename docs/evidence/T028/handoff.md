# Task handoff

## Identity

Task ID: T028  
Requirement IDs: R002, R012, R013, R024, R027, R055, R056, R059, R070, R079, R080  
Implementing commit/branch: uncommitted increment on `main` (repository already has unrelated dirty work)  
Status: IN_PROGRESS

## Intended and delivered outcome

This increment strengthens the existing server-owned engagement lifecycle. It preserves the 11 canonical state names, adds explicit guarded commands for additional source edges, records prospect rejection as a reasoned terminal outcome, returns structured unmet-gate reasons, and fails closed when work owned by later workflow tasks is absent. This is an existing implementation, not a greenfield lifecycle rewrite.

The lifecycle is not accepted as complete. Successful paths through workprogram completion, managerial/Partner review, final report approval, package release and timed archive are still gated on evidence owned by unfinished tasks. AC2's real release-versus-fieldwork edit race has not been exercised because the release evidence path is not yet complete.

## Files and contracts

- `packages/server/src/modules/governance/lifecycle.ts`: explicit source/target commands, role checks, expected-version checks, terminal prospect outcome and structured gate evaluation.
- `packages/server/src/modules/governance/controller.ts` and `lifecycle-response.ts`: guarded gates route and serialized history outcome.
- `packages/server/src/index.ts`: lifecycle gates facade export.
- `packages/server/src/modules/fieldwork/service.ts` and `adjustments.ts`: lock engagement before upload completion and freeze edits after fieldwork/review states.
- `packages/contracts/src/index.ts`, `packages/contracts/schema.json`, and `packages/contracts/openapi.json`: lifecycle commands, gate reason/result schemas and generated contract/OpenAPI updates.
- `tests/lifecycle.integration.ts` and `apps/api/tests/contracts.integration.ts`: transition, blocker, terminal outcome and response-contract coverage.
- `scripts/verify-task.mjs`: T028 verification recipe.
- `docs/tasks/02-security/T028-workflow-kernel.md`, `docs/guides/13-execution-ledger.md`, `docs/IMPLEMENTATION-STATUS.md`: accurate progress and remaining acceptance.

The existing lifecycle-history migration was reused; this increment adds no database migration, dependency, tenant setting or external provider permission. The checkout also contains unrelated dirty changes; this evidence isolates T028 and does not authorize staging or committing the aggregate tree.

## Dependency evidence

No dependency changes. Existing compatibility approvals and lockfile were not changed for this increment.

## Decisions

No new D01–D12 policy decision was made. Existing entries in `docs/decisions/register.json` remain authoritative. No professional approval, image-signature acceptance, external release or archive retention claim is implied.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm build:server` | Nest/Fastify server and shared contracts | Passed | Local command output, 2026-10-03 |
| `pnpm contracts:generate` | Canonical Zod JSON schema | Passed | Local command output, 2026-10-03 |
| `pnpm openapi:generate` | Built API OpenAPI contract | Passed | Local command output, 2026-10-03 |
| `pnpm contracts:check` | Generated schema and OpenAPI drift | Passed | Local command output, 2026-10-03 |
| `node --import tsx --test tests/lifecycle.integration.ts` | PostgreSQL lifecycle command/gate integration fixture | Passed: 1/1 | Local command output, 2026-10-03 |
| `node --import tsx --test apps/api/tests/contracts.integration.ts` | Nest/Fastify lifecycle history/gates response contract | Passed: 1/1 | Local command output, 2026-10-03 |
| `pnpm verify:task -- T028` | Recorded server, lifecycle and API-contract recipe | Passed; recorded checks ran | Local command output, 2026-10-03 |
| `pnpm verify:affected` | Boundaries, server/test typechecks, Angular build, Vitest | Passed: 84/84 Vitest tests | Local command output, 2026-10-03 |
| Angular CLI MCP `web:test` via `scripts/angular-mcp.mjs` | Angular 22 application regression suite | Passed: 58/58 | Local command output, 2026-10-03 |
| `pnpm lint` | ESLint and module/browser boundaries | Passed: 0 errors; four pre-existing warnings in untouched prototype declarations | Local command output, 2026-10-03 |
| `git diff --check` | Working tree whitespace | Passed; Windows emitted line-ending normalization notices | Local command output, 2026-10-03 |

## Acceptance criteria

- AC1: Satisfied by the 2026-10-03 transition-matrix update below. The PostgreSQL integration iterates all 11 states and every lifecycle command, checks the declared source-edge matrix, validates every allowed gate, invokes each allowed command on an isolated aggregate to assert its target/version or expected evidence blocker, and rejects every unlisted jump.
- AC2: Open. Lifecycle and fieldwork paths use engagement-level locking, but no PostgreSQL race test proves that a real release transition cannot approve stale evidence while a child edit is in flight. Report-release evidence is not implemented.
- AC3: Satisfied for this increment. No test-fixture bypass route was added to the production API; integration fixtures remain test-only.

The implementation fails closed for missing workprogram submission, completed review/SRM/confirmation evidence, report opinion and image approval, signed LOR, complete bundle, final invoice settlement, upload freeze and timed archival evidence. Those are blockers, not completed acceptance paths.

## Recovery and authorization

No migration or external side effect was introduced. Lifecycle writes remain PostgreSQL transactions with expected-version and authorization checks; audit/history is append-only. No merge, deployment, tenant permission change, release or production data repair is authorized by this handoff.

## Review and next task

Reviewer: Codex self-review  
Review result: AC1 and AC3 are verified; task remains open because AC2 and downstream workflow evidence remain unproven.  
Open blockers: AC2 real child-edit/release race; workprogram, report-release and archive evidence.  
Next eligible work: continue the independent dependency-ready tasks; T031 remains gated by T030, and T032 remains gated by T006.

## Transition-matrix coverage update — 2026-10-03

- `tests/lifecycle.integration.ts` now verifies every command against every one of the 11 source states using the PostgreSQL 18.6 service. It checks `permittedCommands` against the explicit transition table, asserts every unlisted jump fails with the source-state guard, examines the structured lifecycle gate for every declared edge, and invokes each allowed edge against a separate aggregate so a successful transition cannot alter a later case's source state.
- Ready edges are verified to reach the declared target and increment version 1 to 2. Evidence-gated edges are verified to report their expected missing-evidence code. Manager-review blocker ordering is also checked with an open review note and the other outstanding gate reasons.
- `pnpm verify:task -- T028`: passed; PostgreSQL lifecycle integration 1/1 and Nest/Fastify contract integration 1/1.
- `pnpm verify:affected`: passed; boundaries, server/test typechecks, Angular production build, and Vitest 93/93.
- `pnpm lint`: passed with 0 errors and four existing unused-disable warnings in untouched `visual-prototype-simulation/worker/worker-configuration.d.ts`.
- `git diff --check`: passed; Git emitted only Windows line-ending normalization notices.
- No runtime code, migration, package, tenant setting or provider permission changed in this update. AC2 remains open: report-release and fieldwork-evidence child workflows are not yet implemented, so a real PostgreSQL release-versus-child-edit race cannot yet be exercised.
