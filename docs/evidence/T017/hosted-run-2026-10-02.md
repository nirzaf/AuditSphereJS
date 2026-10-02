# T017 hosted compatibility recheck

**Review state:** DONE. The compatibility execution passed; T016 is complete under the user's explicit direct-push policy. GitHub `main` has no required-PR/status-check rules, and none are claimed.

**Source commit:** `ba46d5db5efc5bc1fff184b97c672208c4e761cb`

**Hosted run:** [Build and test #37006033506](https://github.com/nirzaf/AuditSphereJS/actions/runs/37006033506) — success, 2026-10-02.

The run passed the clean install and policy denial tests, `verify:all` with `RUN_LIVE_E2E=1`, contract parity, moderate-severity audit, `build:linux`, and `smoke:linux`. The Linux smoke covers compiled Nest dependency injection and PostgreSQL readiness, PostgreSQL NUMERIC transaction, Fastify plugins/rate-limit denial, BullMQ with Redis, Socket.IO websocket handshake, and the Chromium PDF executable. The run also packaged and published a web-only build; it did not deploy the application.

## Compatibility freeze

- Runtime selected by CI: Node `24.21.0`, Linux x64; package manager pnpm `12.8.1`.
- Direct dependency versions and reviewed integrity/license/advisory evidence: [T005 registry metadata](../T005/registry-metadata.json), [candidate pins](../T005/candidate-pins.json), and [advisory evidence](../T005/advisories-after.json).
- Lockfile SHA-256: `5E3AF76467FB4103385DBA5BA04D69D68DF06EF1313E59F60305117F6D495DBE`.
- Preserved v2.1 source requirements SHA-256: `5B111C9BD9372300F5D9EE4A44D1564228F1ADBA5515B2533FF4C79D83278A13`.
- Install enforces strict peers, supported engines, strict dependency build-script approval, frozen lockfiles and explicit `allowBuilds` policy.
- Local Docker Desktop reports `running`; engine API is Docker `29.8.1`; the local PostgreSQL 18.6, Redis 8.10 and RustFS services reported healthy.

Credentialed Microsoft tenant/provider acceptance and production signing are not part of this compatibility smoke and remain separate gates. No tenant secrets are recorded here.
