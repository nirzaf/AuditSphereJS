# T027 — PostgreSQL operation idempotency handoff

## Identity

Task ID: T027  
Requirement IDs: R017, R018, R019, R046, R069  
Implementing commit/branch: uncommitted changes on the current working branch  
Status: DONE (Codex self-review, 2026-10-03)

## Intended and delivered outcome

Invoice issuance, payments and receipts now use durable operation requests keyed by firm, client, engagement, actor, action and caller key. The normalized request hash sorts object properties recursively while preserving array order. Authorization runs before stored-result lookup, and the operation result, invoice/payment/receipt effect and audit event commit in one PostgreSQL transaction. A PostgreSQL transaction advisory lock serializes attempts for an operation tuple; PostgreSQL uniqueness remains the durable correctness boundary. Redis is not used for financial idempotency.

An operation may be `IN_PROGRESS`, `COMPLETED` or `UNKNOWN`. Ambiguous external outcomes can be marked with a stable reconciliation code; an unresolved `UNKNOWN` request is denied on retry instead of being resent automatically. The current invoice path performs no external dispatch. Report-release commands are not implemented yet; existing lifecycle transitions keep their pre-existing PostgreSQL `CommandReceipt` behavior, and future release-delivery work must adopt the scoped mechanism. Other Practice journal commands also continue to use `CommandReceipt` in their owning workflow.

## Files and contracts

- `prisma/schema.prisma`, `prisma/migrations/202610030003_operation_requests/migration.sql` — added the mapped `operation_requests` table, scoped unique key, scope/actor foreign keys, state/result constraints and reconciliation index. The migration is additive; it does not rewrite historical receipts.
- `packages/server/src/platform/idempotency.ts`, `packages/server/src/index.ts` — canonical request hashing, tuple locking, start/replay, atomic completion and unknown-outcome marker.
- `packages/server/src/modules/practice/invoices.ts` — applies authorization-before-replay and operation requests to invoice issue, payment and receipt; recognizes matching historical invoice `CommandReceipt` records for retry compatibility.
- `packages/server/tests/idempotency.test.ts`, `tests/idempotency.integration.ts` — canonical-hash unit checks and PostgreSQL 18.6 concurrency/scope/authorization/Redis-loss/unknown-state acceptance.
- `scripts/verify-task.mjs`, `package.json` — recorded T027 unit and Testcontainers recipes; included the integration test in the full manifest.
- `packages/server/src/modules/practice/README.md`, `docs/tasks/02-security/T027-idempotency.md`, `docs/guides/13-execution-ledger.md` — ownership and task evidence.

No dependencies or transport contracts changed.

## Dependency evidence

No dependency changes. Existing Prisma 7.10.0 and PostgreSQL/Testcontainers dependencies were used.

## Decisions

No new professional-policy defaults or D01–D12 decisions were required. Unknown outcome codes are constrained to stable uppercase machine identifiers; secrets or provider error text must not be stored there.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T027` | Prisma build, normalized hash unit test, disposable PostgreSQL 18.6 Testcontainers databases | PASS; unit 2/2, focused idempotency integration 1/1, commercial-onboarding integration 1/1 | Output: `T027: recorded checks passed; acceptance review and live-provider evidence are separate.` |
| `pnpm verify:affected` | Boundaries, server/test typechecks, Angular production build, Vitest | PASS; 19 files / 84 tests | Build output at `dist/web` |
| `pnpm lint` | ESLint and import boundaries | PASS; zero errors, four pre-existing unused-disable warnings in `visual-prototype-simulation/worker/worker-configuration.d.ts` | Exit 0 |
| `pnpm contracts:check` | Runtime Zod schemas and OpenAPI | PASS; schemas and OpenAPI match | Exit 0 |
| `pnpm db:migrate` | Local development PostgreSQL `auditsphere` | PASS; additive migration `202610030003_operation_requests` applied | Migration status checked before apply; no other migration was pending |

## Acceptance criteria

- **AC1:** Two concurrent identical payment requests under PostgreSQL 18.6 return the same result, with exactly one `InvoicePayment` row and one `operation_requests` row.
- **AC2:** Reusing a payment key with an amount changed from `7.00` to `8.00` returns 409. The same caller key is independently accepted across another engagement and across invoice-issue/payment actions.
- A matching historical invoice `CommandReceipt` is replayed without issuing a duplicate invoice after the additive migration.
- **AC3:** With `REDIS_URL=redis://127.0.0.1:1`, payment posting succeeds once using PostgreSQL persistence. Redis availability cannot erase or duplicate the committed result.
- Revoking `PRACTICE_MANAGE` before replay returns 403 instead of disclosing the prior result.
- An `IN_PROGRESS` request can be marked `UNKNOWN`; repeating the same marker is safe, and replay while unresolved returns 409.

## Recovery and authorization

The migration is additive and preserves `CommandReceipt` rows. Invoice handlers recognize matching historical invoice receipts for same-action retries. No production migration or data repair occurred. Local migration applied only to the development database, and Testcontainers used a disposable database. A rollback would require stopping code that reads the table before dropping it; no destructive rollback was executed.

## Review and next task

Reviewer: Codex self-review; no independent reviewer was available.  
Review result: implementation and tests satisfy the T027 operation-record criteria.  
Open blockers: no report-release delivery command exists to adopt this API yet; provider reconciliation remains future outbox/notification work (T030/T037). This handoff does not claim live Microsoft provider acceptance or exactly-once email delivery.  
Next eligible task by dependency order: T028 workflow kernel (while the full execution ledger still has earlier in-review work).  
Stop after T027; do not implement the next task without assignment.
