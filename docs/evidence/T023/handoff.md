# T023 handoff — decimal, accounting-date and deterministic clock

## Identity

Task ID: T023  
Requirement IDs: R036–R039, R044, R073, R075, R078  
Implementing commit/branch: uncommitted working tree on `main`  
Status: DONE

## Intended and delivered outcome

The platform has one exact six-decimal arithmetic policy for money, bounded decimal input, explicit QAR rounding and signed-balance formatting, zero-prior variance semantics, date-only accounting dates, and a deterministic clock seam. `ClockModule` is now included in and exported through `RuntimeModule`, so the API/worker composition can inject `CLOCK` at runtime. No schema migration or dependency change was needed.

## Files and contracts

- `packages/server/src/platform/decimal6.ts`: bigint-backed six-decimal arithmetic, `numeric(28,6)` input bounds, half-to-even rounding, QAR formatting, and explicit `NO_BASE` variance.
- `packages/server/src/platform/clock.ts`: production and fixed clocks, `CLOCK`, date-only `AccountingDate`, and UTC calendar-day deadline helper.
- `packages/server/src/platform/runtime.ts` and `packages/server/src/index.ts`: runtime provider composition and public exports.
- `tests/money-clock.test.ts`: 18 deterministic arithmetic/date/clock tests.
- `tests/foundation.integration.ts`: compiled Nest ESM injection assertion with a real PostgreSQL readiness query.
- `scripts/verify-task.mjs`: T023 recipe now runs the real runtime integration alongside the server build and focused unit suite.
- No database migration, generated contract, or package dependency changed for T023.

The checkout also contains unrelated work from the broader product backlog. This handoff records only T023; the whole mixed worktree was not committed or otherwise isolated as part of this task.

## Dependency evidence

No dependency changes. The focused runtime check used the existing PostgreSQL 18.6 Testcontainers integration environment; no new provider or external service was involved.

## Decisions

- D05 and D06 are recorded as `APPROVED_IMPLEMENTATION_DEFAULT` in `docs/decisions/register.json`, under the user’s explicit delegation to Codex.
- The UTC-midnight helper gives a stable calendar boundary. The exact archival enforcement hour remains an owning archive decision under D09/T131 and is not decided by this platform task.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T023` | Server build, money/date/clock unit suite, compiled ESM Nest runtime plus PostgreSQL readiness | PASS; 18/18 Vitest tests and 2/2 integration tests | Current task recipe output, 2026-10-03 |
| `pnpm verify:affected` | Boundaries, server/test typecheck, Angular production build, affected Vitest suite | PASS; boundaries and builds passed, 82/82 Vitest tests | Current command output, 2026-10-03 |
| `pnpm lint` | ESLint and module/browser import boundaries | PASS; 0 errors, 4 existing unused-disable warnings in the prototype worker declaration | Current command output, 2026-10-03 |
| `git diff --check` | Current working-tree whitespace | PASS, exit 0; Git printed existing LF-to-CRLF notices | Current command output, 2026-10-03 |

The task’s intended unit tests were discovered and executed (18), and the PostgreSQL-backed integration file ran both tests (2). The runtime integration performs a read-only `SELECT 1`; it does not mutate business records.

## Acceptance criteria

- **AC1:** `Decimal6.from('0.1').add(Decimal6.from('0.2'))` is exactly `0.300000` at storage scale; the test also exercises final two-decimal half-to-even rounding.
- **AC2:** a nonzero current balance against zero prior returns `direction: 'NO_BASE'` and `percent: null`, rather than a false 0% result.
- **AC3:** date-only projection and a 60-day boundary are asserted across UTC, Pacific/Kiritimati, Pacific/Niue, and Asia/Kathmandu; invalid calendar days are rejected.
- Invalid decimal syntax, excess integer digits/scale, invalid clock instants and invalid countdowns fail closed. The Nest integration confirms `CLOCK` resolves from `RuntimeModule`; its companion test confirms missing injection tokens fail.

The platform clock is available for deadline consumers; migrating every business workflow to use it remains in the owning lifecycle, retention, billing, and archive tasks. No race claim is made by T023.

## Recovery and authorization

This change is source-only and has no database migration or external side effect. Reverting the source change does not require data repair. No merge, deployment, or provider action was performed or authorized by this handoff.

## Review and next task

Reviewer: Codex evidence review  
Review result: T023 acceptance criteria and the runtime DI integration passed.  
Open blockers: Authenticated browser walkthrough remains separate; downstream clock adoption and D09/T131 archival cutoff policy remain open in their owner tasks.  
Next eligible task by dependency order: T024, subject to its remaining prerequisites.
