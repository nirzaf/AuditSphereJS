# T038 — Authenticated realtime rooms and reconnects

## Identity

Task ID: T038

Requirement IDs: R022, R023, R046 (Realtime invalidations support this work; PBC status/rejection workflows remain owned by their workflow task.)

Implementing commit/branch: `main` (this handoff is included in the implementation commit)

Status: DONE

## Intended and delivered outcome

The API now hosts authenticated Socket.IO rooms on WebSocket-only transport. Internal staff and portal identities are revalidated against their existing server-side authorization boundaries; clients cannot choose room names. A Redis adapter broadcasts across API replicas. Fieldwork publishes small Trial Balance version hints only after the PostgreSQL transaction commits. The Angular client rejoins after reconnect, uses the server acknowledgement as its version baseline, and reloads authorized API data after invalidation or a version gap. PostgreSQL remains authoritative and local unsaved mappings remain in the editor.

The behavior reference was the public [AuditSphere visual prototype](https://github.com/nirzaf/auditsphere-visual-prototype), inspected at commit `a23ba7e3a450ae99122c9402db934d3bbdfca89e`. It informed row-conflict/reload expectations only; no prototype source or `visual-prototype-simulation/` files were copied or changed.

## Files and contracts

- `apps/api/src/main.ts` — registers realtime and edit-lease lifecycle providers, installs the Redis Socket.IO adapter before application initialization, and enables orderly shutdown.
- `.github/workflows/ci.yml` — places the new real-service realtime integration in the integration shard matrix.
- `apps/api/tests/realtime.integration.ts` — two API replicas with real PostgreSQL 18.6 and Redis 8.10; exercises room authorization, serialized concurrent joins, lease ownership, post-commit publication, rollback silence, access revocation and WebSocket-proxy failover.
- `apps/api/tests/portal-auth.integration.ts` — verifies the portal socket cookie's `/socket.io` path and security attributes.
- `apps/web/package.json`, `apps/web/proxy.json`, `apps/web/src/realtime-client.ts`, `apps/web/src/realtime-client.spec.ts`, `apps/web/src/workspace.ts`, `apps/web/src/workspace.html` — typed browser client, WebSocket proxy, reconnect/reload behavior and Fieldwork connection state.
- `apps/web/src/workspace.spec.ts`, `apps/web/src/workspace-auth.spec.ts` — keep workspace fixtures within the UUID contract used by server-backed engagement selection.
- `packages/contracts/src/index.ts` — validated room requests, version snapshots/acknowledgements and sanitized invalidation contract. Runtime schemas and OpenAPI were regenerated and checked; no HTTP endpoint or database migration was added.
- `packages/server/src/platform/realtime/README.md`, `authorization.ts`, `gateway.ts`, `invalidation.ts`, `module.ts`, `redis-transport.ts`, `rooms.ts` — room boundary, origin checks, serialized join changes, live session revalidation, cross-replica transport and event contract.
- `packages/server/src/platform/auth.ts`, `portal-auth.ts`, `portal-auth-controller.ts` — reuse internal identity and revocable portal sessions; issue the scoped HttpOnly socket cookie needed because the existing portal cookie is path-limited to `/api/v1/portal`.
- `packages/server/src/platform/leases.ts` — closes the advisory lease Redis client with API module shutdown.
- `packages/server/src/modules/fieldwork/service.ts` — registers Trial Balance version hints with `UnitOfWork.afterCommit` for mapping/finalization.
- `packages/server/src/index.ts`, `packages/server/package.json`, `apps/web/package.json`, root `package.json`, `pnpm-lock.yaml` — exports, exact dependency pins and recorded verification commands.
- `packages/server/tests/realtime.test.ts` — room separation, schema validation and payload sanitization.
- `scripts/verify-task.mjs` — T038 now has an executable verification recipe including the CI workflow invariant checker.
- `docs/guides/03-library-register.md` — records realtime libraries and transport constraints.
- `docs/guides/13-execution-ledger.md` and this handoff — task status and evidence.

The unrelated pre-existing untracked `.zcodeignore` was left untouched and excluded. No `visual-prototype-simulation/` files are in this change.

## Dependency evidence

- `socket.io@4.8.3` is the server version pinned by `@nestjs/platform-socket.io@12.1.2`; browser `socket.io-client@4.8.4` speaks the same Socket.IO v4 protocol.
- `@socket.io/redis-adapter@8.3.0` (MIT; Node `>=10`; peer `socket.io-adapter@^2.5.4`) and `ioredis@5.8.2` are used for cross-replica fanout. The adapter supports the selected server generation; connection-state recovery is not supported and is not enabled.
- `pnpm dependencies:check` passed for exact pins, engines, peers, licenses and advisory checks. The task's real-service smoke passed with Node 24.19.0 on Windows, PostgreSQL 18.6 and Redis 8.10.0. No native module or provider-specific credential is introduced.
- `pnpm-lock.yaml` SHA-256: `B8596C71EAA2F8804B6CAD1946B768E280C5D28BAB48DDF88D695D5AFD5AC996`.

## Decisions

No unresolved D01–D12 decision changes realtime room authorization or transport. No Entra registration, Microsoft Graph permission, storage binding or tenant setting was changed. T038's fixture uses the existing development identity adapter; live tenant sign-in was not part of this task's acceptance.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T038` | Server build; generated contracts/OpenAPI; 4 realtime unit tests; PostgreSQL 18.6 + Redis 8.10 integration; portal-auth PostgreSQL/Fastify integration; 3 Angular realtime tests; boundaries; CI matrix/security invariant checker | PASS, exit 0. Realtime integration 1/1, portal auth 1/1, Angular 3/3, CI checker passed. | Console output in task run; no skipped tests. |
| `pnpm test:unit` | Root Vitest and all Angular browser unit tests | PASS, exit 0; 27 files / 125 Vitest tests and 13 Angular files / 80 tests passed. | Console output in task run. |
| `pnpm verify:affected` | Boundary check, server and test typechecks, Angular production build, Vitest suite | PASS, exit 0; 27 files and 125 tests passed. | Console output in task run. |
| `pnpm lint` | ESLint and import boundaries | PASS, exit 0. | Console output in task run. |
| `pnpm dependencies:check` | Installed dependency metadata and advisories | PASS, exit 0. | Console output in task run; compatibility entries are in `docs/guides/03-library-register.md`. |
| `git diff --check` | Current implementation diff | PASS, exit 0. | No whitespace errors. |

The T038 realtime unit suite contains 4 tests. The real-service test uses two Nest/Fastify API replicas, PostgreSQL 18.6 and Redis 8.10; the separate portal-auth integration is one PostgreSQL/Fastify test. The browser realtime suite contains 3 tests. All nine task-recipe tests passed; no acceptance test was skipped.

## Acceptance criteria

- **AC1 — PASS:** staff without an engagement grant and portal users outside their membership are denied; portals cannot join Trial Balance import rooms; authorized internal engagement/import and portal engagement joins are independently allowed. A denied concurrent room switch clears the earlier room; periodic revalidation removes a room after grant revocation.
- **AC2 — PASS:** committed mapping changes emit only engagement/resource identifiers and version; rollback emits nothing. Angular tests verify it reloads from the API on a version gap, ignores stale join acknowledgements and never treats an invalidation as business data. The real-service test also verifies editor A cannot release editor B's replacement Redis lease using a stale token.
- **AC3 — PASS:** the integration sends WebSocket traffic through an upgrade proxy, changes the target from replica A to B, closes replica A, and proves the reconnect reauthorizes and rejoins with a current PostgreSQL version.

## Recovery and authorization

Realtime messages are best-effort hints. If a hint is lost, duplicated or reordered, the Angular client reloads its currently authorized HTTP resource; optimistic database versions still arbitrate edits. Redis does not own business state. Subscription authorization runs on join/reconnect and every 15 seconds while active. Portal rooms are separate and receive no Trial Balance invalidations. API shutdown now closes the advisory edit-lease Redis client.

There are no migrations, production data changes, Graph permissions or external provider actions. No deployment was performed. PBC request/status records and mandatory rejection-reason workflow do not yet exist in the server; this task deliberately does not synthesize R022/R023 business events, so those source behaviors remain pending their PBC workflow implementation.

## Review and next task

Reviewer: Codex implementation review

Review result: All T038 acceptance criteria and required task/affected checks pass.

Open blockers: R022/R023 PBC workflow implementation is not part of this task; live Entra provider acceptance remains separately gated.

Next eligible task by dependency order: T039 — Implement owner-safe advisory edit leases.
Stop after this task; do not implement the next one without assignment.
