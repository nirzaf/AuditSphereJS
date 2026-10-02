# T009 handoff — NestJS and Fastify API shell

## Identity

Task ID: T009  
Requirement IDs: R002  
Implementing commit/branch: `2398266788c270ca3e1492e4dd56967873f15fff` on `main`  
Status: DONE

## Intended and delivered outcome

The API shell now exposes an unprefixed health surface and a versioned `/api/v1/system/version` endpoint. It validates caller-supplied correlation IDs, creates a UUID for invalid or absent IDs, returns the correlation ID in a response header, rejects malformed and oversized JSON at the HTTP boundary, explicitly disables proxy trust, and redacts request URLs, bodies and credential headers from Fastify logs. Existing startup configuration checks and shutdown hooks remain in place.

## Files and contracts

- `apps/api/src/main.ts`: version controller, root health-route exclusions, validated request ID generation, response correlation header, Fastify body/proxy/log configuration, and testable API composition.
- `apps/api/tests/shell.test.ts`: actual Nest/Fastify injection of version, health, correlation, malformed-body and oversized-body cases.
- `vitest.config.ts` and `tsconfig.tests.json`: include API-owned tests without adding framework dependencies to the root package.
- `scripts/verify-task.mjs`: T009 build, shell and configuration verification recipe.
- `docs/tasks/01-foundation/T009-api-shell.md` and execution ledger: acceptance status and evidence.

No database migration, generated contract or new dependency was added.

## Dependency evidence

No dependency changes.

## Decisions

No unresolved policy decisions affect the API shell.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T009` | Server/API/Angular typecheck and production Angular build, API shell injection (2 tests), configuration denial tests (2 tests) | PASS, exit 0 | Local output, 2026-10-02 |
| `pnpm lint` | ESLint and dependency boundaries | PASS, exit 0 | Local output, 2026-10-02 |
| `pnpm verify:affected` | Module boundaries, server/API/Angular typecheck and production build, Vitest suite | PASS, 17 test files / 78 tests | Local output, 2026-10-02 |

## Acceptance criteria

- AC1: `/api/v1/system/version` returns `{ service: 'auditsphere-api', version: '0.1.0' }`; valid request IDs are echoed, and unsafe values are replaced with a UUID.
- AC2: malformed JSON returns 400 and a payload above 16 MiB returns 413 before a controller executes.
- AC3: the configuration suite verifies invalid and missing required settings fail closed without printing secret values.

## Recovery and authorization

No persistent data changes were made. User authorized direct pushes to `main`; no application deployment was requested.

## Review and next task

Reviewer: pending  
Review result: local verification passed; hosted verification pending  
Open blockers: none within T009.  
Next eligible task by dependency order: review remaining T018 ownership acceptance and resume its downstream identity tasks.
