# T001 starting point — 2026-10-01

This is an additive continuation of the local Nest/Fastify/Angular scaffold, based on Git HEAD `206491f`. The supplied CURRENT source describes .NET/Blazor, but no deployed .NET application or legacy dataset has been verified. The implementation architecture is superseded by the supplied task pack; the functional source is preserved byte-for-byte.

Existing executable code: `apps/api/src`, `apps/worker/src`, Angular/CDK workspace, browser-safe Zod contracts, Prisma schema plus two applied migrations, local Docker PostgreSQL/Redis/RustFS, scoped development-token authentication, staged CSV imports, bounded mapping/finalization, append-only audit triggers and owner-safe leases.

Existing tests: eight parser/contract invariants, browser navigation and live import/finalization, HTTP 5k/25k/50k import/conflict/rollback/idempotency tests, Redis lease tests. Existing evidence is local Windows technical proof, not production acceptance. The benchmark fixtures and local data will be preserved.

Known gaps: shared backend code lives under the API app, backend output is CommonJS, package ownership/exports are incomplete, runtime DB credentials are migration credentials, queue Redis has no persistence configuration, configuration is not centrally validated, compatibility has not been demonstrated in a clean target Linux container. No professional policies, production providers, identity adapter, signing custody, recovery objectives or user acceptance have been approved.

Non-goals: microservices, an ERP runtime, an automatic legacy rewrite, malware-scanning subsystem, automatic tenant administration, merge, deployment, production data reset or irreversible retention locks.

R001–R082 mappings remain in `docs/guides/06-requirements-traceability.md`. Planned task coverage is not proof of implementation. Source hash and Git baseline are in `docs/evidence/T001/baseline.json`.
