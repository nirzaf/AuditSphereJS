# AuditSphereJS

NestJS 12.1 + Fastify 5.12 API and BullMQ worker · Angular 22.2 standalone SPA (CDK/Material, signals, native control flow) · Prisma 7 on PostgreSQL 18 · Zod 4 browser-safe contracts

One modular monolith for an audit firm: one API process, one worker process, one Angular SPA and one PostgreSQL business database, in a single pnpm workspace.

## Scope and status

**Product.** AuditSphere replaces commercial audit platforms that license by client file — the source specification calls out rigid tiers such as a 130-file limit with steep incremental fees — with an in-house system holding unlimited client entities, historical engagements and working papers at zero subscription penalty. It unifies one lifecycle: commercial capture and versioned proposals, dual-key client acceptance, engagement letters, planning and materiality, fieldwork execution, multi-tier review, the five-part client deliverable, compliance archiving, and internal firm practice management covering ledger, billing, time and profitability. Execution is standardized on International Standards on Auditing — ISA 210, ISA 220 / ISQC 1, ISA 230 with 60-day assembly and regulatory locking, ISA 320, ISA 505, ISA 570, ISA 700 and 705. Qatari Riyal is the primary currency: money is a signed six-decimal decimal string from the browser to the database, never JavaScript floating-point arithmetic.

**Requirements.** [docs/requirements/CURRENT.md](docs/requirements/CURRENT.md) is the preserved v2.1 functional source and is never edited. `pnpm verify:task -- T001` byte-compares it against [docs/sources/requirements-current.md](docs/sources/requirements-current.md) and checks all 82 coverage IDs. That document specifies ASP.NET Core / Blazor; this repository re-implements its business requirements on the stack above.

**Delivery.** Work is decomposed into 171 tasks under [docs/tasks/](docs/tasks/) and ordered by [docs/guides/01-execution-order.md](docs/guides/01-execution-order.md). Consult the three records before judging any capability: [docs/guides/13-execution-ledger.md](docs/guides/13-execution-ledger.md) for per-task status, [docs/IMPLEMENTATION-STATUS.md](docs/IMPLEMENTATION-STATUS.md) for what is built versus presentation-only, and [docs/evidence/](docs/evidence/) for measured proof. Unverified work is recorded as unverified, and a green scaffold test is never claimed as functional acceptance.

## Repository map

| Path | Role |
| :--- | :--- |
| `apps/api/src/main.ts` | API process composition: controllers, `api/v1` global prefix, helmet, CSRF, rate limit, multipart, correlation id, log redaction, error filter, Swagger. No business logic. |
| `apps/worker/src/main.ts` | Worker process entry; the behavior lives in `packages/server/src/worker.ts` — `tb-import` consumer, outbox relay, deadline dispatch, upload sweepers, PDF rendering. |
| `apps/web/src` | Angular SPA. Lazy routes `''` internal workspace, `portal` client portal, `**` redirect. `module-catalog.ts` declares the five modules' screens; `line-editor.ts` is the shared repeating-line editor. |
| `packages/server/src/modules/<module>` | Domain services plus their `*-controller.ts`. Sibling access goes through a published `public.js` reader only. |
| `packages/server/src/platform` | Shared mechanisms as flat files, plus `observability/` and `realtime/`. |
| `packages/contracts/src` | Browser-safe Zod schemas and generated types shared by API and SPA; `packages/contracts/openapi.json` is the checked-in OpenAPI output. |
| `prisma/` | `schema.prisma`, one reviewed ordered migration history and the development seed. The generated client under `packages/server/src/generated/prisma` is never hand-edited. |
| `tests/`, `scripts/`, `docs/` | Cross-cutting suites, verification and compatibility tooling, and the requirements / guides / decisions / evidence tree. |

| Module | Owns today |
| :--- | :--- |
| `commercial` | Versioned proposals and the pure quotation fee model, Partner risk clearance, the dual-key engagement-letter gate pinning the accepted revision. |
| `governance` | Guarded engagement lifecycle commands with append-only state history, materiality assessments, risk bands and Partner clearance. |
| `fieldwork` | Trial-balance imports, staging, mapping approval, publication, taxonomy, sampling, evidence links, upload sessions, client adjustment journals. |
| `reporting` | Anchored review notes with grant-based review authority and a no-self-review rule. SRM, opinion selection, deliverables, release and archive are still pending. |
| `practice` | Firm chart of accounts, non-overlapping periods, policy-gated double-entry journals, exact reversals, expenses and receipts, invoices and payments, effective-dated charge-out rates and immutable time snapshots. |

## Platform mechanisms

| Mechanism | File in `packages/server/src/platform` | Contract |
| :--- | :--- | :--- |
| Unit of work | `unit-of-work.ts` | One business command per interactive PostgreSQL transaction on an explicitly passed context, Engagement-first lock order, retry only on transient conflicts, `afterCommit` deferral so external I/O never runs inside the transaction. |
| Money and time | `decimal6.ts`, `clock.ts` | One decimal policy with fail-closed digit and scale bounds, half-to-even QAR rounding, a zone-independent `AccountingDate`, an injectable `Clock` seam. |
| Identity | `auth.ts`, `entra.ts`, `portal-auth.ts`, `session-revocation.ts` | Entra validates issuer, audience, tenant, scope, signature and expiry; the client portal keeps separate principals, credentials and session boundaries. |
| Authorization | `authorization.ts`, `staff-access.ts` | Active identity, per-engagement membership role, exact scope, current capability grant and resource-state checks, with segregation of duties enforced server-side. |
| Audit | `audit.ts`, `audit-chain.ts` | Append-only events with redacted before/after payloads, transactionally ordered SHA-256 sidecars, engagement-scoped chain head under row lock, Ed25519 checkpoints verified against a verifier-owned trust store. Application credentials hold no UPDATE, DELETE or TRUNCATE. |
| Versions and leases | `repository.ts`, `leases.ts` | Optimistic `expectedVersion` on every editable aggregate; Redis row leases are advisory presence only and PostgreSQL version checks stay mandatory. |
| Replay safety | `idempotency.ts` | `OperationRequest` keyed by firm, client, engagement, actor, action and caller key; a replay rechecks current authority before returning the stored result. |
| Durable work | `outbox.ts`, `queue-runtime.ts`, `scheduler.ts` | Operation and outbox rows commit with the business write, a bounded `SKIP LOCKED` relay publishes deterministic BullMQ job ids, lost jobs are reconstructed and stale external outcomes become `UNKNOWN` for review rather than being resent. Deadlines are claimed the same way. |
| Files | `graph-storage.ts`, `storage.ts`, `clamav.ts`, `pdf-inspection.ts` | Uploads spool to a private mode-0600 temp file, are screened by a digest-pinned ClamAV and inspected for PDF active content in a resource-limited worker before any stored-object row or provider write; detections and scanner outages fail the session closed. |
| Rendering | `pdf-renderer.ts`, `rendered-documents.ts`, `document-templates.ts` | Versioned snapshots render through Chromium with JavaScript disabled and browser requests aborted; immutable `DocumentVersion` rows record renderer, template, data provenance and byte digests. |
| Delivery and presence | `notifications.ts`, `realtime/` | Durable role-routed inbox with auditable outbound dispatch; authenticated Socket.IO rooms revalidate access periodically. |
| Observability | `observability/` | Correlation id flows through async context into audit, outbox, queue and provider calls; Prometheus output uses bounded labels; a PostgreSQL outage is unready while a Redis outage is degraded readiness. |

## Authority model

| Role | Functional scope | Boundary |
| :--- | :--- | :--- |
| `PREPARER` | Executes assigned financial statement line item procedures, uploads working papers, submits packages for review, logs hours. | Assigned workprograms only; no sign-off or external communication rights. |
| `REVIEWER` | Verifies testing, issues review notes and drives rework, sets sampling and materiality, prepares the Summary Review Memorandum. | Engagement-wide review; can return tests but cannot sign the final opinion. |
| `APPROVER` | Dual-key acceptance, proposal and engagement-letter authorization, red-risk clearance, opinion selection and signature, release and archive locks. | Full firm and engagement sign-off authority; final gatekeeper for releases. |
| `CLIENT` | Views requested documentation with status badges, uploads PBC evidence, receives invoices, receipts and deliverables. | Isolated tokenized portal; read and upload only; access freezes at engagement closure. |

Every protected mutation requires engagement scope plus a workflow authorization, an optimistic version and an explicit capability, and writes an append-only audit event. Approved artifacts are never overwritten, and posted journals are reversed rather than edited.

## Quickstart

Node `>=24.15.0 <25` (`.node-version` pins 24.21.0), `pnpm@12.8.1`, and a running Docker Desktop. Bootstrap in order:

```
pnpm install --frozen-lockfile
pnpm setup:local      # writes the ignored .env with generated credentials; prints nothing
pnpm infra:up         # refuses to start without those generated credentials
pnpm db:generate
pnpm db:migrate
pnpm db:roles         # separate API, worker, migration and report credentials
pnpm db:seed
pnpm dev              # api :3000, web :4200 proxying /api, worker
```

`docker-compose.yml` pins every service by digest and publishes on loopback only: PostgreSQL 18.6 (`:5432`), Redis 8.10 with AOF and `noeviction` (`:6379`), ClamAV 1.5.4 (`:3310`), Mailpit (`:1025`, UI `:8025`), RustFS (`:9000`, console `:9001`). The credentials in `.env.example` are development-only; never expose this environment publicly. If the Docker socket or `host.docker.internal` misbehaves on Windows, see [docs/runbooks/docker-windows-sockets.md](docs/runbooks/docker-windows-sockets.md).

## Endpoints and sign-in

- SPA at `http://127.0.0.1:4200`; API health at `http://127.0.0.1:3000/health` and readiness at `/health/ready`.
- Prometheus text at `/health/metrics`, gated by `OBSERVABILITY_METRICS_TOKEN`.
- Swagger at `/api/docs`, mounted only outside production.
- Health routes stay unprefixed; everything else is under `/api/v1/...`. `dev:web` proxies `/api`, so browser code uses relative paths.

Internal identity has two paths: Microsoft Entra MSAL browser sign-in (tenant registration, application configuration and folder grants under [docs/microsoft365/README.md](docs/microsoft365/README.md)), or local token auth when `DEV_AUTH_ENABLED=true`, where the server compares the bearer token with `DEV_AUTH_TOKEN` in constant time. Sign-in is not engagement selection: authenticated `GET /api/v1/me/engagements` returns only memberships covered by a current `ENGAGEMENT_READ` grant, and the user explicitly picks an engagement before any protected workspace renders. `pnpm db:seed` writes one clearly labelled development fixture firm, client, `PREPARER` user and technical validation engagement, and refuses to run when `NODE_ENV=production`.

## Trial Balance ingest

A real import is a UTF-8 CSV whose headers are exactly `code,name,current,prior`, bounded to 50,000 rows and 4,096 bytes per record ([`packages/server/src/modules/fieldwork/parser.ts`](packages/server/src/modules/fieldwork/parser.ts)). The API inserts the `BackgroundOperation` and outbox event in the same transaction as the import, and the separate `tb-import` worker parses, stages, maps and finalizes. Balances are signed decimals and each accounting period must sum to zero before finalization. Finalized rows are immutable and corrections go through reversal; finalizing an import locks staging, it does not publish a versioned engagement balance. Recorded import timings in [docs/benchmarks-local.json](docs/benchmarks-local.json) are measured local history, not production SLO evidence.

## Verification

| Command | Scope |
| :--- | :--- |
| `pnpm verify:affected` | Boundaries, typecheck and unit tests. Minimum before handing work back. |
| `pnpm verify:all` | Lint, typecheck, unit including Angular, Testcontainers integration, Playwright e2e. Release-candidate scope. |
| `pnpm verify:task -- T###` | The recorded checks for one task. An ID with no recipe in `scripts/verify-task.mjs` throws instead of passing vacuously. |
| `pnpm test:unit` / `test:integration` / `test:e2e` | Vitest plus Angular component suites; real PostgreSQL 18.6 and Redis through Docker; browser journeys, whose credentialed live cases self-skip without `RUN_LIVE_E2E=1`. |
| `pnpm lint` / `boundaries` / `build` / `build:server` / `typecheck` | ESLint, import-rule checks, server `tsc -b` and the Angular production build. |
| `pnpm contracts:generate` / `openapi:generate` / `contracts:check` | Canonical Zod JSON Schemas, OpenAPI output (needs a fresh `pnpm build:server`) and the drift gate that fails on schema or OpenAPI drift. |
| `pnpm dependencies:check` | Advisory, engine, peer and license evidence. |
| `pnpm build:linux` / `smoke:linux` | Source-fingerprinted compatibility image and its runtime smoke. |
| `pnpm migration:inventory` / `migration:parity` / `migration:differential` | Legacy-finance feature-parity harness under [docs/migration/](docs/migration/). |

[AGENTS.md](AGENTS.md) states which runner picks up which test file; a test outside those globs is never executed. CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs static, unit, integration, e2e, image and web-asset jobs on every push, verifies and publishes a labelled non-production web asset, and deploys nothing. Release stays gated by [docs/guides/09-release-checklist.md](docs/guides/09-release-checklist.md).

## Storage, and what is presentation-only

Production files live in Microsoft Graph: SharePoint evidence libraries hold durable files, OneDrive holds working files, and stable drive, item, version and digest references detect external change. Download redirects never receive Graph bearer credentials. RustFS with a pinned digest remains a local development fixture. See [docs/architecture/microsoft365-storage.md](docs/architecture/microsoft365-storage.md) and keep [docs/microsoft365/](docs/microsoft365/) current in the same change as any tenant, permission, repository-binding or credential-handling edit.

Not every screen is a finished workflow. The five modules expose the catalog in `apps/web/src/module-catalog.ts`, and [docs/evidence/UI-MODULES.md](docs/evidence/UI-MODULES.md) records per screen whether it is connected to a real API or is a session-only preparation form. Preparation forms keep memory-only drafts and cannot approve, bill, send, sign, release or archive anything: the server owns every decision. Product work still open includes workpapers and external confirmations, sampling execution, archive assembly and legal holds, AR aging and credit notes, time-entry approval, production deployment, and the remaining live Microsoft 365 tenant acceptance gates.

Angular work follows the workspace-pinned Angular CLI MCP server and its standards, configured in `.codex/config.toml`; see [docs/architecture/angular-mcp.md](docs/architecture/angular-mcp.md). MCP guidance is not functional acceptance.

## Reading index

| Guide | Subject |
| :--- | :--- |
| [01](docs/guides/01-execution-order.md) | Execution order and dependency graph |
| [02](docs/guides/02-compatibility-matrix.md) | Compatibility matrix and release policy |
| [03](docs/guides/03-library-register.md) | Direct libraries and conditional dependencies |
| [04](docs/guides/04-architecture-contract.md) | Architecture and ownership contract |
| [05](docs/guides/05-decisions-and-source-conflicts.md) | Source conflicts and approval decisions |
| [06](docs/guides/06-requirements-traceability.md) | Requirement-to-task traceability |
| [07](docs/guides/07-testing-and-invariants.md) | Verification strategy and mandatory invariants |
| [08](docs/guides/08-commands-and-agent-workflow.md) | Repository commands and one-task workflow |
| [09](docs/guides/09-release-checklist.md) | Production release checklist |
| [10](docs/guides/10-corrections-to-prior-plan.md) | Corrections to the preceding architecture |
| [11](docs/guides/11-source-and-version-evidence.md) | Sources, provenance and version evidence |
| [12](docs/guides/12-performance-and-recovery-targets.md) | Capacity, performance and recovery acceptance |
| [13](docs/guides/13-execution-ledger.md) | Task execution ledger |
| [14](docs/guides/14-package-validation-report.md) | Markdown package validation report |

Also: [docs/decisions/register.json](docs/decisions/register.json) for recorded user decisions, which outrank earlier pending defaults; [docs/architecture/](docs/architecture/) for the supplied architecture and [starting point](docs/architecture/starting-point.md); [docs/runbooks/](docs/runbooks/) for operational procedures including the [PDF worker seccomp runbook](docs/runbooks/pdf-worker-seccomp.md); [docs/templates/task-handoff.md](docs/templates/task-handoff.md) for the evidence format; and [docs/AGENTS.md](docs/AGENTS.md) for the docs-tree rules.

## Working a task

Read [docs/IMPLEMENTATION-STATUS.md](docs/IMPLEMENTATION-STATUS.md), then the target `docs/tasks/<phase>/T###-*.md`, then the owning module README, then [docs/guides/04-architecture-contract.md](docs/guides/04-architecture-contract.md). Keep business rules in domain services, never in controllers or Angular components, and never mutate another module's owned tables. Make the smallest sufficient change; add that task's `verify:task` recipe to `scripts/verify-task.mjs` in the same change; run `pnpm verify:affected` and add meaningful invariant tests; append measured results to `docs/evidence/<T###>/handoff.md` without overwriting a prior run; update the ledger only after review. Do not merge, deploy, reset data or take an irreversible provider action without separate authorization, and add no package without the review in [docs/guides/02-compatibility-matrix.md](docs/guides/02-compatibility-matrix.md) and [docs/guides/03-library-register.md](docs/guides/03-library-register.md).
