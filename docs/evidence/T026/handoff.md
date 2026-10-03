# Audit chain implementation — 2026-10-02

Migration 202610020001 creates ordered SHA-256 audit sidecars without modifying historical AuditEvent bytes. An insert trigger serializes one head per engagement and atomically appends the event canonical text, predecessor digest and format version. PostgreSQL JSONB serialization and microsecond timestamp text define format 1; it is deliberately not interchangeable with an arbitrary JavaScript JSON serializer. Pre-migration events are chained at migration time, not retrospectively attested.

The verifier compares the current event to its captured canonical bytes, checks ordering and predecessor/hash links, detects unchained records and checks independent manifests. Historical checkpoints verify a chain prefix as new events arrive. Internal scoped API routes expose checkpoint capture and verification. Runtime database roles can read sidecars but cannot write them directly; trigger authority has a fixed search path and no public execution grant.

The focused PostgreSQL 18.6 integration test covers concurrent writes, rollback, payload tampering, removed events, application-role head denial, immutable sidecars and independent checkpoint mismatch. Ed25519 checkpoint signing and verification use caller-supplied keys and a verifier-owned trust store. Format, engagement, sequence, digest, key ID and UTC timestamp are signed; malformed and noncanonical signature encodings fail closed. Tests use ephemeral keys only. Protected production key custody and independent locked storage remain required. Hashing does not defeat a privileged owner who can rewrite both the chain and every checkpoint. At this initial implementation handoff, T026 remained IN_REVIEW; see the acceptance review below for current disposition.

## T026 acceptance review — 2026-10-03

| Field | Evidence |
| :--- | :--- |
| Task / requirements | T026; R072: “Maintain an immutable, timestamped audit log of all system actions, reviews, and sign-offs.” (source line 552). R071 says “Upon timer expiration (or manual Partner command), convert the entire engagement archive to Read-Only status. Deletions, modifications, and overwrites are permanently blocked.” (source line 551); that outcome remains tracked by T131 and is not closed by this chain work. |
| Chain scope | Engagement-scoped. Every `AuditEvent` has a required engagement relation, and that engagement belongs to a firm. This is the chosen scope exercised by AC1; no firm-wide aggregate sequence is claimed. |
| Canonical format | Migration `202610020001_audit_chain` stores PostgreSQL JSONB canonical text, microsecond UTC timestamp text and format version 1; the insert trigger locks and advances one `AuditChainHead` per engagement in the same transaction. |
| Checkpoint interface | Captures independent checkpoint manifests, verifies event lineage and historical prefixes, and provides Ed25519 sign/verify helpers using caller-provided private keys and verifier-owned public-key trust. No key is generated or persisted in production code. |
| `pnpm verify:task -- T026` | PASS: server build, checkpoint signature unit test 1/1 and PostgreSQL 18.6 Testcontainers chain integration 1/1. Concurrent 20-event ordering, transaction rollback, event tampering/removal, application-role denial, historical checkpoint replay and independent digest mismatch passed. |
| `pnpm verify:affected` | PASS: boundaries, server/test typechecks, Angular production build, 18 Vitest files / 82 tests. |
| `pnpm lint` / `pnpm contracts:check` | PASS: zero lint errors (four existing unused-disable warnings in `visual-prototype-simulation/worker/worker-configuration.d.ts`); contract schemas and OpenAPI match. |
| AC3 no-mutation proof | The PostgreSQL integration snapshots an event payload, verifies a mismatched independent checkpoint, then confirms the source payload is byte-for-byte equivalent at the Prisma JSON value level. |
| Review disposition | Codex self-review; no independent reviewer was available in this task. The verifier and tests do not present hashing as protection from a privileged database owner. |
| Remaining release gates | Production Ed25519 key custody and separately locked checkpoint storage require deployment/records configuration (T006/T133). The test uses ephemeral keys and does not claim live key-provider acceptance. |
| Status | DONE for T026's code and acceptance criteria; external key custody and locked-storage provider acceptance remain explicit release gates. |
