# T025 handoff — append-only audit writes with database permissions

## Identity

| Field | Value |
| :--- | :--- |
| Task ID | T025 |
| Requirement IDs | R072 |
| Implementing branch | `main` |
| Status | `IN_REVIEW` |

## Intended and delivered outcome

Audit events now carry actor kind, resource identity, correlation and redacted before/after payloads; service actors are recorded without synthetic user ids; authorization denials are appended to a separate security log that survives transaction rollback; and the append-only guarantee is enforced three ways — role grants, row-level triggers and a statement-level TRUNCATE guard.

Delivered in this change:

- Migration `202610020020_audit_write_integrity`: `AuditEvent` gains `actorKind` (`USER`/`SERVICE`), `resourceType`/`resourceId`/`resourceVersion`, `correlationId` and `beforeState`/`afterState`; `actorId` becomes nullable with a database CHECK that a USER event names its actor and a SERVICE event names an initiating operation (`audit_event_actor_traceability_check`); resource columns must appear together or not at all (`audit_event_resource_shape_check`). A statement-level `BEFORE TRUNCATE` guard covers `AuditEvent` and `SecurityEvent`. A new append-only `SecurityEvent` table records claimed scope and actor without foreign keys, so probes with unknown identifiers are still logged.
- `packages/server/src/platform/audit.ts`: `recordAuditEvent` and `recordSecurityEvent` writers plus `redactValue`, which replaces values under sensitive keys (password, token, secret, credential, API/private/access keys, authorization, cookie) with a `[REDACTED]` marker and fails closed by redacting a subtree that exceeds the traversal bound. Both audit payload and before/after state are sanitized. Existing `tx.auditEvent.create` call sites continue to produce valid USER events unchanged.
- `packages/server/src/platform/authorization.ts`: `requireCapability` now appends a `CAPABILITY_DENIED` security event through the pooled client before throwing, so a denial that aborts a business transaction is still recorded. The write is best-effort; the original denial always propagates.
- `packages/server/src/platform/audit-controller.ts`: adds the scoped audit history read (`GET /engagements/:id/audit/events`, first 500 events) with `ENGAGEMENT_READ` re-checked server-side against the engagement's firm/client scope.
- `packages/server/scripts/provision-local-roles.ts`: `auditsphere_api` and `auditsphere_worker` receive `SELECT, INSERT` only on `SecurityEvent`. `AuditEvent` grants remain `SELECT, INSERT` only; no application credential holds UPDATE, DELETE or TRUNCATE on either table.

## Deliberate limitations recorded

- The v1 canonical digest continues to cover only the original columns (id, engagementId, actorId, action, payload, createdAt). New metadata columns are protected by the immutability triggers and role grants but are not yet part of the hash chain; widening the canonical format is a separate reviewed change because it must preserve historical sidecar bytes.
- Existing module call sites still write plain USER events with action+payload; adopting resource/correlation fields at each call site is incremental follow-up, and the writer + tests are the mechanism.
- The `AuditEvent` TRUNCATE statement guard cannot fire while the `AuditChainRecord` sidecar foreign key exists — PostgreSQL rejects truncation of an FK-referenced table first. The guard is exercised through `SecurityEvent` (no inbound foreign keys) and remains as defense in depth.
- Security-event writes use a pooled connection while a transaction is open; under total pool exhaustion a denial could fail to log (best-effort, recorded here rather than hidden).
- No interactive browser walkthrough is claimed. This task writes no browser surface.

## Executed verification

| Command / test | Artifact | Result |
| :--- | :--- | :--- |
| `pnpm exec prisma validate`, `pnpm db:generate`, `pnpm build:server` | Schema, Prisma 7.10.0 client, server build | PASS |
| `pnpm exec tsc -p tsconfig.tests.json --noEmit` | Server + test typecheck | PASS |
| `pnpm exec vitest run tests/audit-write.test.ts` | Redaction unit tests (3) | PASS |
| `pnpm verify:task -- T025` | `build:server` + `tests/audit-write.integration.ts` against PostgreSQL 18.6 Testcontainers | PASS, 1/1, exit 0 |
| 2026-10-02 review follow-up: `pnpm verify:task -- T025` | Audit payload redaction, five simultaneous writes and database invariants against PostgreSQL 18.6 Testcontainers | PASS, 1/1, exit 0 |
| 2026-10-02 review follow-up: `pnpm exec vitest run tests/audit-write.test.ts` | Sensitive-key and over-depth fail-closed redaction | PASS, 3/3 |
| 2026-10-02 review follow-up: `pnpm verify:affected` | Boundaries, server/test typecheck, Angular production build, unit suite | PASS, 18 files / 81 tests |
| Full `pnpm test:integration` and web suites | Combined tree | See final verification entry recorded in the handoff date |

## Review follow-up

An implementation review found that the first redaction helper returned unvisited deep subtrees unchanged and did not sanitize the general `payload` field. Both paths are fixed and covered: an over-depth subtree becomes `[REDACTED]`, while non-sensitive values remain available, and the PostgreSQL test verifies that a payload `apiKey` is stored only as `[REDACTED]`. The focused PostgreSQL test also writes five audit events concurrently, captures sequence 7 and verifies the resulting chain. This resolves those findings; T025 stays `IN_REVIEW` because T021/T024 prerequisites, independent review, and the recorded digest/call-site limitations are still open.

## Acceptance criteria

- AC1: PASS. An application-shaped role (`SELECT, INSERT` only) is denied `UPDATE`, `DELETE` and `TRUNCATE` on `AuditEvent` and `SecurityEvent` with `permission denied`; the table owner is denied by the row-level immutability triggers; `TRUNCATE "AuditEvent"` is additionally blocked by the sidecar foreign key even with user triggers disabled.
- AC2: PASS. A transaction that writes an audit event and then fails authorization leaves no event, leaves the chain head unchanged, and still records `CAPABILITY_DENIED` in `SecurityEvent`.
- AC3: PASS. A SERVICE event with a null actor and a correlation id (`outbox:job-9`) is accepted, five simultaneous USER audit writes produce a verifiable sequence-7 chain, and USER events without an actor plus SERVICE events without a correlation are rejected by database CHECK constraints.
