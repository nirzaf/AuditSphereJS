# Corrections and clarifications to the preceding architecture

The unchanged [original architecture](../sources/architecture-original-reference.md) is included for lineage, not as a guarantee that every dependency exists or every control was complete. The following decisions in this task pack supersede the older technical assumptions. Business requirement changes still require an approved source decision.

| Earlier assumption | This task pack requires |
| :--- | :--- |
| Every selected version is already a verified production set. | Public-source review is only candidate evidence. T005 resolves the registry/peers; T017 runs the actual clean install/build/runtime gates. |
| pnpm 10 is the current package-manager choice. | Current official installation documentation identifies pnpm 12. Resolve an exact compatible stable patch and its native/install-script requirements. |
| Prisma 7 is unquestionably the latest stable. | Release list and upgrade-document banner conflict on Prisma 8 GA. Resolve before freeze; do not silently install a prerelease or mislabel the conservative candidate. |
| All Nest-named companions should have the same major number. | Core/adapter alignment plus each companion's published peer range controls compatibility. Companion version numbers alone prove nothing. |
| API owns all shared module implementation while a separate worker reuses it. | `packages/server` owns reusable module/platform logic; API and worker are small independent composition roots. |
| Zod/Swagger/client generation are assumed to integrate automatically. | Execute malformed-payload, OpenAPI and generated-browser-compile tests on the exact selected package versions. |
| Fast transpilation is sufficient verification. | Compiled Nest ESM imports/decorator DI and separate type checking are mandatory; Angular retains its own supported test/build toolchain. |
| Redis is wholly disposable even for queued required operations. | Queue Redis is persisted/noeviction; PostgreSQL durable operations and reconciliation recover lost jobs. Cache ephemerality is not queue durability. |
| An edit lease containing a fencingNumber guarantees safe writes. | Ownership-safe random tokens protect lease operations; authoritative expected versions and DB transition barriers protect business state. A token is not automatic fencing. |
| Commercial and Reporting can each own billing records while Practice owns accounting. | Practice has one canonical invoice/payment/posting owner. Other modules call its transaction-aware facade. |
| Practice accounting can wait until the end without affecting early invoices. | T066–T072 provide minimal ledger/billing foundations before portal activation; later tasks add reports, time and analytics. |
| Header debit and credit totals are sufficient or only checked in app code. | Balance actual lines and serialize draft line changes/posting on parent journals; posted lines are immutable. |
| URL authorization is sufficient for uploads. | Finalize-time policy/state/version checks race safely with release and archive freeze. |
| Missing archive artifacts can delay read-only protection. | Freeze application writes when due, independently of external sealing success; make failed sealing visible and recoverable. |
| S3-compatible storage implies equivalent permanent regulatory retention. | Verify object version locking, retention/legal holds, credentials and selected provider behavior. The 60-day business timer is not a storage retention duration. |
| Hash chaining or PNG signatures alone establish immutability/authenticity. | Hash append order must be concurrent-safe with external checkpoints; signature assurance requires a separately approved verifiable mechanism when needed. |
| Every requirement has one obvious interpretation. | D01–D12 preserve fee timing, LOR, portal closure, numerical/sampling and scope conflicts with approval gates. |
| Microsoft administration is implicitly a core feature. | M365 is a separately approved optional/provider-specific track; core communication requirements do not grant tenant-wide administration authority. |
| A large list of tasks proves implementation or regulatory compliance. | Traceability is planned coverage only. All statuses start NOT_STARTED and close only with real evidence and professional approvals. |

## Change management

Do not silently rewrite the preserved source or claim these clarifications were already in it. Technical additions such as idempotency, immutable versions, outbox recovery and access-race tests are explicit engineering controls needed to implement the source reliably. Unspecified professional policy remains pending until its owner decides.

See [compatibility evidence](02-compatibility-matrix.md), [library register](03-library-register.md) and [source links](11-source-and-version-evidence.md) for verification references.
