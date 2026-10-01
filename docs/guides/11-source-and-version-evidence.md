# Sources, provenance and version evidence

**Reviewed:** 1 October 2026. The user supplied the business source and architecture. Outside sources were used specifically to check technical compatibility/production behavior, as requested. They do not replace the business specification or supply missing professional decisions.

## Preserved user files

| File in pack | Original uploaded name | SHA-256 |
| :--- | :--- | :--- |
| [Current requirements](../sources/requirements-current.md) | `auditsphere-accounting-module-requirements-current.md` | `5b111c9bd9372300f5d9ee4a44d1564228f1adba5515b2533ff4c79d83278a13` |
| [Original architecture reference](../sources/architecture-original-reference.md) | `auditsphere-nestjs-fastify-angular-architecture-implementation-plan.md` | `82e018de10836c82ae87f551ba053b9ede10d09d7e97e99bd80c830194c6ddfa` |

Line ranges throughout the pack refer to physical lines in the preserved current requirements. They are plain-file navigation aids, not newly authored requirements. R001–R082 and all task IDs are planning identifiers added by this pack.

## Primary technical references

| ID | Source | Use and limitation |
| :--- | :--- | :--- |
| S01 | [Angular supported-version compatibility](https://angular.dev/reference/versions) | Node/TypeScript/RxJS constraints; consult tagged package peers for minor/patch differences. |
| S02 | [Angular release list](https://github.com/angular/angular/releases) | Stable Angular release evidence; exclude next/RC tags. |
| S03 | [Angular compiler-cli v22.2.1 source manifest](https://raw.githubusercontent.com/angular/angular/v22.2.1/packages/compiler-cli/package.json) | Tagged TypeScript peer range and development pin; repository placeholders are not published versions. |
| S04 | [Node.js release and support table](https://nodejs.org/en/about/previous-releases) | LTS status and observed 24.21.0 release; Node 26 is Current, not selected LTS. |
| S05 | [NestJS releases](https://github.com/nestjs/nest/releases) | Observed stable core 12.1.1 release. |
| S06 | [NestJS migration guide](https://docs.nestjs.com/migration-guide) | Nest 12 ESM and runtime/CLI prerequisites; read before generating config. |
| S07 | [Nest Fastify adapter v12.1.1 manifest](https://raw.githubusercontent.com/nestjs/nest/v12.1.1/packages/platform-fastify/package.json) | Tagged Fastify dependency, optional plugin peers and ESM exports. |
| S08 | [Fastify releases](https://github.com/fastify/fastify/releases) | Stable v5 versus pre-release v6. |
| S09 | [PostgreSQL versioning policy](https://www.postgresql.org/support/versioning/) | Supported database release lines and patch policy. |
| S10 | [Prisma release list](https://github.com/prisma/orm/releases) | Observed 7.10.0 stable and 8 release-candidate evidence; must reconcile with current docs. |
| S11 | [Prisma upgrade documentation](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7) | ESM, driver-adapter and pool changes; banner indicates newer release status than observed release list. |
| S12 | [Prisma v7 system requirements](https://docs.prisma.io/docs/orm/v7/reference/system-requirements) | Node/TypeScript/runtime constraints for the conservative v7 candidate. |
| S13 | [Redis releases](https://github.com/redis/redis/releases) | Observed stable Redis 8.10.2; confirm image, licensing and advisories. |
| S14 | [BullMQ releases](https://github.com/taskforcesh/bullmq/releases) | Observed stable BullMQ 6.3.11. |
| S15 | [Nest BullMQ package manifest](https://raw.githubusercontent.com/nestjs/bull/master/packages/bullmq/package.json) | Observed 12.0.0 peer declarations allow BullMQ 6; master is mutable, so re-read immutable published metadata. |
| S16 | [BullMQ production guidance](https://docs.bullmq.io/guide/going-to-production) | Persistence, noeviction, connection retries and graceful shutdown. |
| S17 | [pnpm installation and support](https://pnpm.io/installation) | Current pnpm 12 line, native runtime and installation platform requirements. |
| S18 | [pnpm settings](https://pnpm.io/settings) | Use selected-version strict peer and build-script policies; do not copy obsolete setting names. |
| S19 | [Nest SWC development compiler](https://docs.nestjs.com/recipes/swc) | Transpilation and type checking are distinct. |
| S20 | [Nest OpenAPI introduction](https://docs.nestjs.com/openapi/introduction) | OpenAPI and selected Standard Schema path; exact library integration must be tested. |
| S21 | [Angular testing guide](https://angular.dev/guide/testing) | CLI-supported Vitest/jsdom setup; preserve the builder toolchain. |
| S22 | [Vitest guide](https://vitest.dev/guide/) | Runner requirements and configuration reference. |
| S23 | [Playwright CI guide](https://playwright.dev/docs/ci) | Browser binaries, image and package compatibility. |
| S24 | [Testcontainers for Node](https://node.testcontainers.org/) | Real service integration tests; Docker access requirements. |
| S25 | [Socket.IO Redis adapter](https://socket.io/docs/v4/redis-adapter/) | Scale-out, transport and sticky-session constraints; adapter-specific recovery limits. |
| S26 | [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/welcome.html) | Modular S3 client family. |
| S27 | [S3 Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html) | Object-version retention and legal hold are distinct capabilities. |
| S28 | [ExcelJS project](https://github.com/exceljs/exceljs) | Workbook parser candidate; independent security/resource tests remain mandatory. |
| S29 | [CSV Parse project](https://csv.js.org/parse/) | Streaming CSV parser reference. |
| S30 | [Microsoft identity libraries](https://learn.microsoft.com/en-us/entra/identity-platform/reference-v2-libraries) | Official MSAL families; exact Angular wrapper peers still need verification. |
| S31 | [Microsoft Graph throttling](https://learn.microsoft.com/en-us/graph/throttling) | Endpoint throttling and Retry-After behavior. |
| S32 | [Microsoft Graph sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0) | Accepted send request is not proof of delivered mail. |

## Evidence limitations

Tagged package manifests and official documentation were readable, but direct package-registry installation and the full target application runtime were not executable in this generation environment. The pack contains no invented lockfile, passing test logs or peer-resolution output. Some pages are rolling documentation; a mutable branch manifest is weaker evidence than a published immutable package. Exact current registry state and advisories must be captured by the implementation agent in T005/T017 and again before release.

Where evidence conflicts, the compatibility matrix explicitly records a blocker. Where a package patch is not verified, the library register specifies a supported family/peer intersection instead of inventing a patch number. Web/API source contents may change after this date.
