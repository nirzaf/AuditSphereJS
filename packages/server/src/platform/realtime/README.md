# Realtime platform

The API hosts Socket.IO namespace `/realtime` at `/socket.io`. It runs WebSocket-only and installs the Redis adapter before gateway initialization; Redis shares room broadcasts across API replicas. The browser reconnects to the same origin, rejoins with fresh credentials, and uses the returned PostgreSQL versions to reload current records. Realtime transport never carries business records or replaces HTTP authorization, optimistic concurrency or database reads.

## Room ownership and authorization

- Internal engagement rooms require the existing Entra/development identity adapter, current engagement membership and `ENGAGEMENT_READ` capability. A Trial Balance import room additionally verifies that the import belongs to that engagement.
- Portal sessions use the existing hashed/revocable portal session. A separate HttpOnly, Secure-in-production cookie scoped to `/socket.io` carries the same opaque session value because the normal portal session cookie is path-limited to `/api/v1/portal`. Portal rooms are disjoint from internal rooms and cannot join Trial Balance resources.
- Room names are derived on the server from validated UUIDs. Clients cannot supply room strings. Exact `WEB_ORIGIN` matching is enforced before authorization.
- Every join and reconnect repeats authorization. Active subscriptions are checked every 15 seconds; revoked/expired identities leave their room and are disconnected.

## Event boundary and invariants

`RealtimeInvalidation` contains only schema version, engagement ID, resource type, resource ID and optimistic version. Trial Balance mapping/finalization register invalidations through `UnitOfWork.afterCommit`; rolled-back transactions publish nothing. The notification is best effort. A missed or reordered hint is handled by reloading the authorized HTTP resource from PostgreSQL; unsaved browser mappings stay in memory and continue through row-version conflict checks.

The process-local invalidation bus is a wake-up seam, not durable delivery. Redis fans out namespace room emissions only. Redis is private/authenticated in deployed environments, and connection-state recovery is not enabled. The deployment proxy must forward WebSocket `Upgrade` and `Connection` headers to `/socket.io`; sticky sessions are not required because polling is disabled.

This slice does not implement PBC request records or status transitions. Portal PBC status badges and rejection reasons remain owned by the PBC workflow task; the current gateway deliberately sends no Trial Balance events to portal rooms.

## Tests

- `packages/server/tests/realtime.test.ts`: room separation, request/event contracts and payload sanitization.
- `apps/web/src/realtime-client.spec.ts`: reconnect rejoin, version-gap refresh, selected-resource changes and stale join-ack rejection.
- `apps/api/tests/realtime.integration.ts`: two Fastify API replicas, PostgreSQL 18.6, Redis 8.10, staff/portal room isolation, serialized concurrent joins, committed Trial Balance event fanout, rollback silence, lease ownership, access revocation and WebSocket-proxy failover/rejoin.
