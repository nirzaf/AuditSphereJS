# T006 — Select deployment targets, storage and external-provider boundaries

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Current status | `DONE` for the user-authorized non-production build and public-asset scope; production readiness remains separately gated |
| Execution class | `GATE` |
| Phase | 00-readiness — Requirements, decisions and compatibility |
| Owner area | `planning` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Record the selected application and file-storage provider boundaries. The user has explicitly requested public assets without deployment; do not select or provision a production host, registry, database or cache on their behalf. Keep production readiness gated until a deployment is requested and its region, recovery, retention and accountable owners are supplied.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T001 — Preserve the requirements and inspect the implementation starting point](T001-baseline.md)
- [T004 — Approve signature, archival and engagement-type policies](T004-records-decisions.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. The following domain tasks cannot begin until [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) passes. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R001** — No per-file licensing caps; capacity remains bounded by infrastructure; source lines `42-45`.
- **R020** — Isolated portal and temporary credentials; source lines `428-430`.
- **R031** — Five-folder engagement taxonomy; source lines `454-463`.
- **R052** — Electronic evidence and PBC linking; source lines `504-505`.
- **R064** — Partner digital signature and firm seal; source lines `537-537`.
- **R070** — 60-calendar-day signature-based archive timer; source lines `548-550`.
- **R071** — Early/manual or timed permanent application read-only state; source lines `551-551`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** docs/requirements/; docs/architecture/; docs/decisions/; dependency evidence

**Non-goals:** Planning only: no production commands or application behavior changes.

Use existing owned records/contracts first. Add a migration or public endpoint only when the task steps require it; record the exact files in the handoff.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** D11,D12

## Implementation checklist

- [x] Record the selected boundary: Microsoft Entra ID for internal identity, Microsoft Graph as the server-side integration, SharePoint for evidence/released files and OneDrive for Business for working files. Keep Graph app credentials and provider upload/download URLs server-side. RustFS is a local S3-compatible test fixture only.
- [x] Record the user's signature choice: approved image signature/seal artwork only; no cryptographic signing provider is selected or represented as a certificate-backed signature.
- [x] Record the current non-production baseline without treating it as a production target: Node 24 Bookworm Slim build image, PostgreSQL 18.6, Redis 8.10 and RustFS pinned in the local Compose configuration; the required Linux/amd64 test profile and 5k/25k/50k Trial Balance fixture sizes remain the engineering baseline.
- [x] (Not applicable to the user-authorized no-deployment scope.) If deployment is later requested, select Linux/CPU hosting, registry, managed PostgreSQL and Redis, public region, TLS topology, backup/restore plan and RPO/RTO with named accountable owners. No deployment target or region is selected now; this remains a release gate.
- [x] (Not applicable to a non-production tenant.) Confirm SharePoint/OneDrive production data residency, backup/recovery and retention/legal-hold assurance with records/security owners before deployment. Non-production version and selected-folder tests do not prove production retention controls.
- [x] Microsoft Graph is the selected notification provider per the user's identity/notification-provider decision. Outbound mail stays disabled until its tenant permission and recipient policy are separately approved and implemented under T037.
- [x] Record that no per-file product cap is allowed, no cryptographic-signing provider is selected and the current Angular grid uses CDK rather than a paid grid provider.
- [x] Production Redis and dependency/provider license terms remain a predeployment review gate; local image pins do not approve production service terms.
- [x] The 5k/25k/50k Trial Balance resource and latency budgets remain provisional until T051 measurement; no production SLO is claimed for this non-production scope.

## Acceptance criteria and required tests

- [x] **AC1 (development baseline only):** The local Dockerfile/Compose pins the Node build image and PostgreSQL, Redis and RustFS fixtures; this does not select a production image or registry.
- [x] **AC2 (not applicable to current scope):** The user explicitly requested public assets without deployment. No production region, recovery or retention decision is fabricated or claimed; these remain mandatory release gates if deployment is requested.
- [x] **AC3 (configuration boundary only):** Production configuration requires Entra and Graph storage and refuses the local S3 fixture; provider acceptance and production retention remain open.

Review source hashes, approvals, evidence links and unresolved blockers. No fabricated test output.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T006
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.

Current evidence: [T006 handoff](../../evidence/T006/handoff.md). T006 is complete for the explicitly non-production, no-deployment project scope. Production hosting, region, backup/recovery, retention, named accountable owners, production license review and measured workload SLOs remain separately gated and are not represented as accepted.
