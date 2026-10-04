# Compatibility matrix and release policy

**Research date:** 4 October 2026. **Evidence level:** primary-document and tagged-manifest review; no application stack executed here.

## Three levels of evidence

**DOCUMENTED CANDIDATE** means a stable release/support or compatibility declaration was observed. **RESOLVED** means exact published versions, engine/peer intersections, integrity, licenses and advisories were captured in the real repository. **EXECUTED** means clean install, compiled builds and the actual runtime smoke passed on the target OS/architecture. Only the third level satisfies T017; release requires repeating security/support checks at T169.

“Latest compatible stable” means the newest non-preview set in the joint support intersection, not the maximum version number from each independent package. Prefer the currently supported Node LTS line over a newer Current runtime for this production plan.

## Candidate matrix

| Component | Reviewed candidate | Evidence / unresolved work |
| :--- | :--- | :--- |
| Node.js | 24.21.0 LTS | Release/support evidence [S04](https://nodejs.org/en/about/previous-releases); pin actual available build and image digest. |
| NestJS core/common/adapter | 12.1.1 | Stable/tagged evidence [S05](https://github.com/nestjs/nest/releases) [S07](https://raw.githubusercontent.com/nestjs/nest/v12.1.1/packages/platform-fastify/package.json); matching companion packages use actual peers, not a blind major rule. |
| Fastify | 5.12.5 | Exact dependency of tagged Nest adapter [S07](https://raw.githubusercontent.com/nestjs/nest/v12.1.1/packages/platform-fastify/package.json); v6 prereleases excluded [S08](https://github.com/fastify/fastify/releases). |
| Angular runtime/compiler | 22.2.1 | Release evidence [S02](https://github.com/angular/angular/releases); CLI/build/Material/CDK exact patches resolved separately. |
| TypeScript | Stable 6.0.x | Angular range >=6.0.0 <6.1.0; Node ^22.22.3 or ^24.15.0 or ^26.0.0. Tagged compiler metadata confirms range [S01](https://angular.dev/reference/versions) [S03](https://raw.githubusercontent.com/angular/angular/v22.2.1/packages/compiler-cli/package.json). |
| pnpm | Current stable 12.x | Official installation page identifies pnpm 12; exact patch and target binary must resolve [S17](https://pnpm.io/installation). Previous plan's 10.x is not a current-latest claim. |
| PostgreSQL | 18.6 | Supported release evidence [S09](https://www.postgresql.org/support/versioning/); no PostgreSQL 19 beta. |
| Prisma family | 7.10.0 conservative candidate | Release page showed 7.10.0 stable/8 RC, while upgrade docs refer to a newer current release. Resolve this discrepancy before choosing final major [S10](https://github.com/prisma/orm/releases) [S11](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7). |
| Redis | 8.10.2 | Observed stable release [S13](https://github.com/redis/redis/releases); confirm runtime image/license/service compatibility. |
| BullMQ | 6.3.11 | Observed stable release [S14](https://github.com/taskforcesh/bullmq/releases). |
| Nest BullMQ integration | 12.0.0 candidate | Mutable manifest shows compatible Nest/Bull peers; published immutable metadata must confirm [S15](https://raw.githubusercontent.com/nestjs/bull/master/packages/bullmq/package.json). |
| Zod | Latest stable 4.x in supported integration | Exact patch and Swagger/Standard Schema bridge must resolve and pass validation/OpenAPI tests [S20](https://docs.nestjs.com/openapi/introduction). |
| Other direct dependencies | [Library register](03-library-register.md) | Exact versions pending T005 resolution; this pack does not invent unverified patch pins. |
| PDF inspection parser | pdfjs-dist 6.4.299 | Node engine `>=22.13.0 || >=24`, Apache-2.0; compatible with the pinned Node 24 line. The exact server-only static-inspection usage, worker resource bounds, advisory review and smoke result are recorded in [T033 dependency evidence](../evidence/T033/pdf-policy-2026-10-04.md). It is not used for document rendering. |

## Explicit Prisma decision

The public evidence reviewed is inconsistent about Prisma 8 GA status. **Do not label Prisma 7.10 “latest” without qualification and do not install an 8 RC.** T005 must read the current registry dist-tags, official stable release and tagged manifests together. If a stable Prisma 8 is confirmed and compatible, evaluate it before the baseline is frozen; otherwise use the verified conservative v7 candidate with the exception documented. Until resolved, the ORM row is a production blocker. For v7, driver-adapter setup, generated output, ESM and connection-pool changes are required, not optional tuning. [S10](https://github.com/prisma/orm/releases) [S11](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7) [S12](https://docs.prisma.io/docs/orm/v7/reference/system-requirements)

## Required executable matrix

| Check | Proof required |
| :--- | :--- |
| Clean installation | Exact Node/pnpm versions; frozen lockfile; strict peers; reviewed native/build scripts; no hidden overrides. |
| Server ESM/DI | Production-compiled Nest resolves providers, decorators and shared-server imports, not just a transpiled unit test. |
| Angular | Strict production/template build and supported component runner using the pinned compiler/TypeScript combination. |
| Fastify plugins | CORS, cookie/CSRF, multipart limits and realtime initialization on the real adapter. |
| PostgreSQL/Prisma | NUMERIC roundtrip, transaction rollback, scoped FKs, pool timeouts and runtime grants. |
| Queue Redis | Enqueue/process/retry, noeviction, worker recovery and durable PostgreSQL reconciliation. |
| Document malware scanner | Pinned ClamAV container starts healthy; bounded INSTREAM accepts a clean fixture, rejects EICAR, and upload storage stays fail-closed when unavailable. |
| Browser/PDF | Matching Playwright/browser image, fonts and CPU/memory/network limits. |
| API contracts | Runtime malformed payload rejected, Nest OpenAPI artifact matches controller decorators, canonical Zod-inferred browser transport compiles. |
| Optional providers | Test tenant/signing/storage-provider calls with minimum permissions, revoked credentials and retry cases. |

## Update policy

Freeze the exact successful set in package manifests, lockfile and image digests. Use one dependency change at a time and repeat affected checks. Same-major labels do not prove compatibility. A patched dependency may require a coordinated transitive update; no `--force`, unsupported peer override, pre-release or arbitrary lockfile editing to silence failures. Only approve installation scripts needed for known packages, using the actual pnpm 12 policy syntax. [S18](https://pnpm.io/settings)

The generation environment could not perform npm registry installation or run the full selected Node application target. This pack therefore deliberately does not include a made-up resolved package.json/lockfile or claim executable compatibility. T005/T017 are required work, not optional caution text.

**Post-freeze dependency change (2026-10-03):** `@fastify/multipart@10.1.2` was added for T033 after hosted T017 run 37006033506. Its exact license/advisory metadata and a Fastify 5 bounded-stream runtime smoke are recorded in [T033 evidence](../evidence/T033/multipart-adapter-2026-10-03.md). The updated lockfile passed the full local T017 command on 2026-10-04, including clean install, test suites, source-fingerprinted Linux image build and runtime smoke; see [dated evidence](../evidence/T017/local-run-2026-10-04.md). Hosted CI still verifies every pushed commit.
