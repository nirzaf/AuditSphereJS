# Task handoff

## Identity

Task ID: T022  
Requirement IDs: R002 (source lines 68–129)  
Implementing commit/branch: Not committed; existing checkout on `main` already contained unrelated mixed worktree changes  
Status: IN_REVIEW

## Intended and delivered outcome

Added a canonical, browser-safe contract foundation for identity, readable engagements, session revocation, staff assignments and the shared API problem envelope. Internal identity and team-assignment endpoints validate request JSON through Nest 12's Standard Schema pipe and serialize responses through allowlist schemas. The Angular identity adapter now derives its response types from the same Zod schemas and rejects malformed server JSON at runtime. Nest Swagger generates a checked-in API document, while contract checks fail on schema or OpenAPI drift.

This closes only the shared foundation slice of T022. The worktree is an existing application; it does not change the preserved requirements. It does not yet migrate all business endpoints to response schemas, connect pagination to every list endpoint, or prove that every mutation contract carries `expectedVersion`.

## Files and contracts

- `packages/contracts/src/index.ts`, `packages/contracts/schema.json`: canonical identity, session, engagement, staff-result, problem and bounded pagination schemas plus inferred browser types; the schema artifact is regenerated from the exported schema map.
- `packages/contracts/openapi.json`: generated Nest Swagger document with request/response schemas for the converted identity/team endpoints and the structured problem response.
- `packages/server/src/platform/identity-controller.ts`: applies Nest Standard Schema input validation, output allowlists and OpenAPI response metadata for identity and team access routes.
- `apps/api/src/main.ts`: validates the identity configuration response and API problem payload; exports OpenAPI creation and only starts the listener when executed as the process entry point, allowing generation and tests to import the module safely.
- `apps/web/src/api-client.ts`, `identity.ts`, `identity.spec.ts`, `workspace.spec.ts`: one runtime-checked browser transport helper, inferred identity types and malformed-response/secret-stripping tests.
- `scripts/contracts.mjs`, `scripts/openapi.mjs`, `scripts/verify-task.mjs`, `package.json`: deterministic schema/OpenAPI drift check and a recorded T022 verification recipe.
- `docs/guides/02-compatibility-matrix.md`, `03-library-register.md`, `10-corrections-to-prior-plan.md`, `13-execution-ledger.md`, `docs/IMPLEMENTATION-STATUS.md`: record the client-generation compatibility decision and the task's remaining scope.
- `apps/api/tests/contracts.integration.ts`: real Nest/Fastify request rejection, response allowlisting and generated-artifact contract checks.

No Prisma migration, credential, tenant permission, SharePoint/OneDrive object or business record was changed. No package or lockfile dependency was added. The shared working tree contained unrelated edits before this slice; they were not staged or committed.

## Dependency evidence

No dependency changes. T005's preserved `openapi-typescript@7.13.0` registry record declares `typescript: ^5.x`, while the chosen Angular toolchain requires TypeScript 6.0.x. The implementation therefore keeps Zod as the single source for runtime schemas and inferred browser types, with the Nest Standard Schema Swagger bridge for OpenAPI. No new install, advisory or license review was required.

## Decisions

No D01–D12 business decision changed. The client-generation compatibility choice is documented in the library register and corrections guide. It does not alter source requirements or professional policy.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm build:server` | Compiled Nest API and shared contracts | PASS, exit 0 | T022 recipe reran it |
| `pnpm contracts:generate` | Zod-to-JSON-Schema output | PASS; artifact regenerated | Local command output |
| `pnpm openapi:generate` | Compiled AppModule and controller decorators; no database query | PASS; OpenAPI artifact regenerated | Local command output |
| `pnpm verify:task -- T022` | Build, schema drift, OpenAPI drift, Nest/Fastify contract test | PASS, exit 0; 1/1 test | Recipe output, 2026-10-03 |
| `pnpm exec ng test web --watch=false` | Angular workspace and identity adapter | PASS, 52/52 tests | Angular CLI output, 2026-10-03 |
| `pnpm verify:affected` | Boundaries, typecheck, Angular production build, Vitest | PASS; 82/82 Vitest tests | Command output, 2026-10-03 |
| `pnpm lint` | ESLint and module/browser boundaries | PASS, 0 errors; 4 existing unused-disable warnings in prototype worker declarations | Command output, 2026-10-03 |

The Nest/Fastify contract fixture rejects malformed JSON with HTTP 400, strips `passwordHash` and `entraObjectId` from output, rejects an invalid response shape, and confirms the generated contract artifact contains request, response and problem schemas. These are local contract tests, not live Entra or browser acceptance.

## Acceptance criteria

- **AC1:** Proven for the annotated identity/team request route: an invalid runtime payload receives HTTP 400 before service execution.
- **AC2:** Proven for generated JSON Schema and Nest OpenAPI drift by `pnpm contracts:check` inside the T022 recipe.
- **AC3:** Proven for annotated identity output: unknown persistence fields are removed by the Standard Schema serializer and the corresponding response contract excludes them. Other endpoint response surfaces still need allowlist schemas; task-wide completion is not claimed.
- **Remaining contract work:** apply canonical request/response schemas across the other API modules, use the pagination contract on actual list endpoints, and complete the mutation `expectedVersion` inventory.
- **Browser:** user reported completing sign-in. The built-in browser tool explicitly refused the localhost tab and prohibited alternate browser surfaces or workarounds; no browser acceptance is claimed.

## Recovery and authorization

The change is code/schema-only and has no data migration or external side effect to roll back. Generated artifacts can be recreated after `pnpm build:server` with `pnpm contracts:generate` and `pnpm openapi:generate`. No merge, push, release or deployment was performed.

## Review and next task

Reviewer: Pending  
Review result: Not independently reviewed  
Open blockers: Full T022 endpoint/schema coverage; built-in browser URL policy prevents the requested localhost UI walkthrough.  
Next eligible task by dependency order: Continue T022 to cover remaining request/response contracts; T023/T024 remain gated on T022 closure.

## Progress update — 2026-10-03

This continuation extended the same contract boundary beyond identity/team routes. Shared request schemas now validate the portal authentication routes, and the portal Angular adapter parses both outgoing input and returned JSON at runtime. The API integration fixture proves malformed values fail with HTTP 400, response allowlists omit password/session/CSRF secrets, invalid response shapes fail closed, and every documented operation includes the standard problem response.

Bounded `offset`/`limit` query validation is now wired through the controller and service for Trial Balance imports/rows, taxonomy versions, materiality assessments, risks, review notes, adjustment journals, practice invoices and commercial proposals. The API test rejects out-of-range paging, accepts numeric query strings, and checks that generated OpenAPI exposes the same `offset` 0–1,000,000 and `limit` 1–200 constraints.

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T022` | Server build, generated schema/OpenAPI drift, Nest/Fastify contract fixture, PostgreSQL 18.6 portal acceptance | PASS, exit 0; API contracts 1/1 and portal auth 1/1 | Command output, 2026-10-03 |
| `pnpm verify:affected` | Boundaries, server/test typecheck, Angular production build, Vitest | PASS, exit 0; 82/82 Vitest tests | Command output, 2026-10-03 |
| Angular CLI MCP `web:test` | Angular web application | PASS, exit 0; 54/54 tests | Angular CLI MCP output, 2026-10-03 |
| `pnpm lint` | ESLint and module/browser boundaries | PASS, exit 0; 0 errors, 4 pre-existing unused-disable warnings in prototype worker declarations | Command output, 2026-10-03 |
| `pnpm contracts:generate`, `pnpm openapi:generate`, `pnpm contracts:check` | Shared Zod schemas and compiled Nest decorators | PASS, exit 0; generated artifacts match | Command output, 2026-10-03 |
| `git diff --check` | Current tracked diff | PASS, exit 0 | Command output, 2026-10-03 |

The user reported completing sign-in with the existing client fixture account. This does not create or authorize a staff identity. The built-in browser tool still refuses the localhost app tab under its URL policy, so authenticated UI acceptance was not performed. No live tenant permission or business-data change was made in this increment.

T022 remains `IN_PROGRESS`: response schemas/allowlists still need to cover the remaining business endpoints, and mutation `expectedVersion` coverage still needs an endpoint-by-endpoint review. Browser acceptance also remains unverified.

## Progress update 5 — 2026-10-03

Completed the next allowlist slice for Trial Balance publications, taxonomy views, mapping suggestions and governance lifecycle history. Transport mappers convert persisted dates and decimals into contract forms while omitting ownership, actor and provenance-only persistence fields where the browser does not need them. OpenAPI success responses now cover these routes. The contract fixture exercises taxonomy list serialization through Nest/Fastify.

That runtime test exposed a Nest 12 array-serialization trap: `StandardSchemaSerializerInterceptor` applies the configured schema to each top-level array element, so passing an array schema returns HTTP 500. Corrected the serializer configuration for Trial Balance imports and summary rows, taxonomy, materiality assessments, risks, review notes and adjustment journals. Swagger continues to describe those operations with the item schema and `isArray: true`.

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm contracts:generate`, `pnpm openapi:generate`, `pnpm contracts:check` | Shared schemas and compiled Nest decorators | PASS, exit 0; generated schema and OpenAPI match | Command output, 2026-10-03 |
| `pnpm build:server` | Prisma generation and server TypeScript build | PASS, exit 0 | Command output, 2026-10-03 |
| `pnpm verify:task -- T022` | T022 recipe: build, drift checks, Nest/Fastify contract test, PostgreSQL portal-auth and commercial-onboarding tests | PASS, exit 0; each listed integration test 1/1 | Command output, 2026-10-03 |
| `pnpm verify:affected` | Boundaries, server and test typecheck, Angular production build, Vitest | PASS, exit 0; 82/82 Vitest tests | Command output, 2026-10-03 |
| `pnpm lint` | ESLint and boundaries | PASS, exit 0; 0 errors and 4 existing unused-disable warnings in prototype worker declarations | Command output, 2026-10-03 |
| `git diff --check` | Current worktree diff | PASS, exit 0 | Command output, 2026-10-03 |

Browser recheck: `/health/ready`, direct API identity configuration and the web-proxied identity configuration returned HTTP 200; the configured provider is Entra. Reloading the workspace rendered “Sign in to continue.” The Microsoft tab is at a password challenge for `auditp0-staff@easyguide.onmicrosoft.com`; credentials and MFA were left for the user to enter. No authenticated workflow action was tested, and no account, tenant permission or business data was changed.

T022 remains `IN_PROGRESS`: more endpoint response allowlists and the endpoint-by-endpoint `expectedVersion` inventory remain open. Authenticated browser acceptance is still blocked until the user finishes Microsoft sign-in in the visible tab.

## Progress update 6 — 2026-10-03

Commercial and Practice now have response allowlists across their current controller surfaces. Proposal lists/actions, dual-key status and risk-clearance results are mapped without tenant or staff identity columns. Practice ledger output maps chart accounts, date-only periods, journals, six-place journal/balance amounts and invoices; create/post/reverse, close/reopen, posting-policy, payment and receipt results have explicit contracts. Invoice and proposal list responses also use item schemas for top-level array serialization.

The expanded Nest/Fastify fixture covers commercial proposal/dual-key outputs, Practice ledger and invoice list serialization, plus OpenAPI success schemas. Command-result mappers preserve idempotent receipt replay where Prisma dates and decimals may already be JSON strings.

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm build:server` | Prisma generation and controller/mapping TypeScript build | PASS, exit 0 | Command output, 2026-10-03 |
| `node --import tsx --test apps/api/tests/contracts.integration.ts` | Nest/Fastify allowlist fixtures, including Commercial and Practice outputs | PASS, exit 0; 1/1 | Command output, 2026-10-03 |
| `pnpm contracts:generate`, `pnpm openapi:generate`, `pnpm contracts:check` | Shared contracts and all annotated API success responses | PASS, exit 0; artifacts match | Command output, 2026-10-03 |
| `pnpm verify:task -- T022` | Server build, schema/OpenAPI drift, contract fixture, PostgreSQL portal-auth and commercial-onboarding tests | PASS, exit 0; all recipe steps passed | Command output, 2026-10-03 |
| `pnpm verify:affected` | Boundaries, server/test typecheck, Angular production build, Vitest | PASS, exit 0; 82/82 Vitest tests | Command output, 2026-10-03 |
| `pnpm lint` and `git diff --check` | ESLint/boundaries and worktree formatting | PASS; 0 lint errors, 4 existing prototype declaration warnings; whitespace check exit 0 | Command output, 2026-10-03 |

T022 stays `IN_PROGRESS`. Audit/system success response contracts and the endpoint-by-endpoint `expectedVersion` inventory remain open. Browser inspection again found the live workspace signed out; its Microsoft tab is waiting for the staff fixture password and MFA. No credential was entered, and no external permission or business record changed.

## Progress update 2 — 2026-10-03

The Trial Balance endpoints now return explicit allowlisted DTOs instead of raw import/row persistence records. Import responses omit firm, client, engagement and storage-digest columns; account rows expose decimal amounts as fixed six-place strings; summary rows and mutation results have shared schemas. Nest response serialization enforces those DTOs, and OpenAPI includes the success schemas. The Angular Trial Balance workspace now validates upload/mapping/finalize inputs and parses import, row-page and summary responses using the shared contract types instead of `any`.

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T022` | Build, contract/OpenAPI drift, invalid input, bounded paging, Trial Balance allowlist fixture, PostgreSQL 18.6 portal acceptance | PASS, exit 0; both integration tests 1/1 | Command output, 2026-10-03 |
| `pnpm verify:affected` | Boundaries, server/test typecheck, Angular production build, Vitest | PASS, exit 0; 82/82 Vitest tests | Command output, 2026-10-03 |
| Angular CLI MCP `web:test` | Angular web application after typed Trial Balance migration | PASS, exit 0; 55/55 tests | Angular CLI MCP output, 2026-10-03 |
| Angular CLI MCP `web:build` | Angular production build | PASS, exit 0 | Angular CLI MCP output, 2026-10-03 |
| `pnpm lint` and `git diff --check` | Current repository changes | PASS; 0 lint errors and 4 pre-existing prototype declaration warnings | Command output, 2026-10-03 |

The contract integration verifies the Trial Balance response serializer strips internal firm/client/engagement/document/digest properties, rejects malformed runtime input and enforces bounded query values. It also checks generated OpenAPI for paging limits, response DTO shape and default structured error responses. This is contract-level evidence; it is not an authenticated browser walkthrough or full database-backed Trial Balance UI journey.

T022 remains `IN_PROGRESS`: the other business modules still need explicit response DTOs/serialization, and the complete mutation `expectedVersion` inventory remains open. The built-in browser still refuses the localhost app tab under its current URL policy, so user-reported sign-in cannot be confirmed through the requested visual workflow.

## Progress update 3 — 2026-10-03

The expected-version review also corrected Commercial proposal present/accept behavior: both now compare the submitted version against the live proposal revision and deny stale calls. The PostgreSQL onboarding acceptance asserts each stale path before exercising the successful current-version path. `pnpm verify:task -- T069` passed. The T022 verification recipe now includes that regression test so future contract-task checks cover the optimistic-version behavior as well.

## Verification re-run — 2026-10-03

After adding `commercial-onboarding` to the T022 recipe, `pnpm verify:task -- T022` passed all recorded steps: server build, schema/OpenAPI drift check, API contracts (1/1), PostgreSQL 18.6 portal auth (1/1), and PostgreSQL 18.6 commercial onboarding (1/1, including stale present/accept denials). The subsequent `pnpm verify:affected` passed boundaries, test typecheck, Angular build and 82/82 Vitest tests. `pnpm lint` passed with zero errors and the same four existing prototype declaration warnings. T022 remains open for remaining API response allowlists, full mutation-version review and browser acceptance.

## Progress update 4 — 2026-10-03

Reporting review-note endpoints now return explicit schemas for bounded lists, summary counts, raise results and resolution results. The transport mapper converts timestamps to ISO strings and omits reviewer/author and tenant ownership columns. Fieldwork adjustment endpoints now have explicit schemas for journal lists/details, create/post/reverse results and adjusted balances; detail mapping serializes debit/credit as fixed six-place decimal strings and strips line, actor and tenant persistence identifiers. The generated OpenAPI includes success responses for all affected routes.

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm contracts:generate`, `pnpm openapi:generate`, `pnpm contracts:check` | Review-note and adjustment schemas, generated JSON Schema/OpenAPI | PASS, exit 0; generated artifacts match | Command output, 2026-10-03 |
| `pnpm verify:task -- T022` | Server build, contract/OpenAPI drift, Nest/Fastify response allowlists, PostgreSQL portal and commercial acceptance | PASS, exit 0; all recorded tests 1/1 | Command output, 2026-10-03 |
| `pnpm verify:affected` | Boundaries, server/test typecheck, Angular production build, Vitest | PASS, exit 0; 82/82 Vitest tests | Command output, 2026-10-03 |
| `node --import tsx --test tests/review-notes.integration.ts` | PostgreSQL review authority, self-review denial, immutable resolution and updated result shape | PASS, exit 0; 1/1 integration test | Command output, 2026-10-03 |
| `pnpm lint` | ESLint and module/browser boundaries | PASS, exit 0; 0 errors, 4 existing prototype declaration warnings | Command output, 2026-10-03 |
| `git diff --check` | Current worktree diff | PASS, exit 0 | Command output, 2026-10-03 |
| Built-in browser workspace check | `http://localhost:4200/?module=Fieldwork&view=trial-balance` | PASS for load and route navigation only; app displayed its signed-out gate | Browser accessibility tree, 2026-10-03 |

The browser route changed to `view=workprogram` and back to `view=trial-balance`. The app still said “Sign in to load engagements,” so authenticated engagement data and workflow actions remain untested; no credentials or tenant permissions were changed. T022 remains `IN_PROGRESS` for remaining module response schemas, the endpoint-by-endpoint `expectedVersion` audit and authenticated browser acceptance.

## Final contract and concurrency review — 2026-10-03

The remaining current controller success responses now have shared response schemas and allowlist mappers, including Commercial, Practice, audit and health/system surfaces. The runtime fixture asserts that every documented success operation has an `application/json` schema; the generated document contains 75 success schemas across 66 paths. Top-level array serializers are configured with item schemas, so Nest validates each list item successfully. Angular uses browser-safe schemas and inferred types through the shared transport helpers.

The stale-mutation review found and fixed three replacement/approval gaps. Mapping approval now checks the submitted import revision; taxonomy approval checks the immutable taxonomy sequence; staff assignment/revocation checks and advances the engagement revision. The complete reviewed inventory, including one-way/append-only commands and their CAS/idempotency guards, is in [expected-version-inventory.md](expected-version-inventory.md).

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm contracts:generate`, `pnpm openapi:generate`, `pnpm contracts:check` | Shared contracts, JSON Schema and compiled Nest/OpenAPI decorators | PASS; generated artifacts match runtime definitions | Command output, 2026-10-03 |
| `pnpm verify:task -- T022` | Build, drift checks, Nest/Fastify contracts, PostgreSQL portal auth, commercial onboarding, taxonomy and staff assignment | PASS; all recorded steps completed, including stale-version denial cases | Command output, 2026-10-03 |
| `pnpm verify:affected` | Boundaries, server/test typecheck, Angular build and Vitest | PASS; 18 test files, 82/82 tests | Command output, 2026-10-03 |
| Angular CLI MCP `web:test` | Angular 22 web tests | PASS; 8 test files, 55/55 tests | Angular CLI MCP output, 2026-10-03 |
| Angular CLI MCP `web:build` | Angular application default build configuration | PASS | Angular CLI MCP output, 2026-10-03 |
| `pnpm lint` | ESLint and module/browser boundaries | PASS; 0 errors, 4 existing unused-disable warnings in prototype worker declarations | Command output, 2026-10-03 |
| `git diff --check` | Current working-tree diff | PASS; Git emitted line-ending conversion warnings | Command output, 2026-10-03 |

The live browser reaches AuditSphere and shows its signed-out workspace; the Microsoft tab is at the password prompt for `auditp0-staff@easyguide.onmicrosoft.com`. `/health/ready` and both direct/proxied `/api/v1/identity/config` return HTTP 200. I did not enter credentials, and no authenticated workflow action was tested. The user said they had logged in, but the browser state still requires their password/MFA action; authenticated UI acceptance remains open. No tenant permissions, migrations or business records changed in this increment.

T022 is `IN_REVIEW`: task checks and the endpoint-by-endpoint version review pass, while independent review and the requested authenticated browser walkthrough remain pending. This is not completion evidence for the wider product goal.

## Stable API problem codes — 2026-10-03

An independent contract review found that `error.code` was a duplicate numeric HTTP status despite the task requiring stable error codes. The contract now uses a string code (`BAD_REQUEST`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `PAYLOAD_TOO_LARGE`, `SERVICE_UNAVAILABLE`, `INTERNAL_SERVER_ERROR`, and documented fallback codes) with a separate numeric `status`. `ApiProblemExceptionFilter` maps HTTP status to stable code, normalizes invalid exception statuses to 500, and suppresses exception detail for all server errors. Angular API-error parsing continues to use the shared response contract.

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T022` | API contract/OpenAPI drift, Nest/Fastify problem envelope, PostgreSQL portal auth, commercial onboarding, taxonomy and staff assignment | PASS, exit 0; all recorded steps passed | Current command output, 2026-10-03 |
| `pnpm verify:affected` | Boundaries, server/test typecheck, Angular production build, Vitest | PASS, exit 0; 18 files / 82 tests | Current command output, 2026-10-03 |
| Angular CLI MCP `web:test` | Angular 22 UI and API-error consumers | PASS, exit 0; 8 files / 55 tests | Current Angular CLI MCP output, 2026-10-03 |
| `pnpm lint` | ESLint and import boundaries | PASS, exit 0; 0 errors, 4 existing unused-disable warnings in the prototype worker declaration | Current command output, 2026-10-03 |
| `git diff --check` | Current combined worktree | PASS, exit 0; line-ending conversion warnings only | Current command output, 2026-10-03 |

The built-in browser was rechecked after the user reported sign-in. AuditSphere still renders its signed-out gate, and Entra still displays the staff fixture password prompt. No password or MFA was entered by automation; authenticated UI acceptance remains pending. T022 remains `IN_REVIEW` for a separate review and that browser walkthrough.

## Full repository verification — 2026-10-03

`pnpm verify:all` now passes in one run after correcting two stale fixtures: the internal identity acceptance now includes the engagement revision used by staff mutations, and the client portal assertion scopes its Sign in button to the form submit control. The run completed lint, boundaries, server and test typechecks, Angular production build, 82 Vitest tests, 55 Angular tests, 25 PostgreSQL/Fastify integration tests, and Playwright with 9 passed and 2 credentialed live journeys skipped. The only lint output is four pre-existing unused-disable warnings in the prototype worker declaration. This verifies the configured repository test surface; it does not replace the still-pending authenticated built-in-browser walkthrough or live provider acceptance.

## Codex evidence review and T022 closure — 2026-10-03

Review checked the task's outcome and all acceptance criteria against current code, generated artifacts, the CI workflow, test fixtures and the current task recipe. AC1 is proven by malformed runtime JSON rejected with HTTP 400 before command execution. AC2 is enforced by the explicit `pnpm contracts:check` CI step; the script compares generated JSON Schema and OpenAPI to their sources. AC3 is covered by Zod response allowlists on all controller handlers (the multi-path health handler covers two paths), with the HTTP fixture verifying sensitive fields are removed. Current OpenAPI contains 75 JSON-schema-backed success operations over 66 paths. The expected-version inventory covers mutable versioned aggregates; append-only operations use their documented guards. No T022-specific acceptance gap remains. `pnpm verify:task -- T022` and the full `pnpm verify:all` both pass. T022 is therefore `DONE`; reviewer is Codex evidence review, not an external professional or tenant acceptance. The authenticated built-in-browser walkthrough remains open at the user-operated Microsoft password/MFA step and does not change the T022 contract-task result.
