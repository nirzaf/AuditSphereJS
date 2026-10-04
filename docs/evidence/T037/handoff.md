# T037 — Role-routed notifications and auditable dispatch

## Identity

Task ID: T037
Requirement IDs: R009, R019, R023, R061, R081
Implementing branch: `main`
Status: DONE

## Intended and delivered outcome

Added a scoped in-app inbox and durable email dispatch boundary. Authorized source commands may create outbound intent in their PostgreSQL transaction; the worker sends only after commit. Role routing selects MD/GM for proposals, letters and deliverables; CFO/FD for invoices, receipts and fee notes; and audit liaison for PBC/confirmation events. Recipient snapshots are immutable, role-checked and normalized. The separate Graph mail adapter is opt-in and defaults to disabled.

The workflow records provider acceptance separately from recipient delivery, stores terminal delivery attempts and append-only creation/retry/reconciliation decisions, and marks ambiguous responses or expired send claims `UNKNOWN`. Unknown outcomes never enter automatic dispatch again. Manual retry is allowed only after definite failure; reconciliation requires an authorized capability, reason and evidence reference. PREPARER has no send/reconcile capability.

## Files and contracts

- `prisma/schema.prisma`; ordered migrations `202610040001_notification_dispatch`, `202610040004_notification_action_audit`, `202610040005_notification_snapshot_integrity` add inbox, outbound intent, delivery attempts, immutable human-action records and database guards. The intermediate migration `202610040002_practice_expense_settlements` and `202610040003_practice_expense_receipts` already existed in the ordered history.
- `packages/contracts/src/index.ts`, generated `packages/contracts/schema.json` and `packages/contracts/openapi.json` define inbox, outbound status, retry and reconciliation contracts.
- `packages/server/src/platform/notifications.ts` owns role routing, trusted contact snapshot validation, Graph Mail provider and database state transitions; `notifications-controller.ts` owns scoped HTTP inbox/outbound operations.
- `packages/server/src/platform/authorization.ts` adds the read/send/reconcile capability ceilings; `apps/api/src/main.ts` registers the controller; `packages/server/src/worker.ts` polls and dispatches after commit.
- `packages/server/scripts/provision-local-roles.ts` grants least-privilege access to the new API/worker tables.
- `.env.example`, `.env.production.example`, `docs/microsoft365/permission-matrix.md`, `application-configuration.md` and `current-tenant.md` state the disabled default and separate mail-only app boundary.
- `tests/notifications.integration.ts` exercises real PostgreSQL 18.6 constraints, authorization, routing, idempotency, concurrency, retry and unknown recovery. `scripts/verify-task.mjs` and `package.json` include the test in their owning runners.

No dependency was added. No `Mail.Send` permission, app registration or tenant data was changed. `visual-prototype-simulation/` and `.zcodeignore` were not included in the implementation scope.

## Dependency evidence

No dependency changes; current lockfile and T017 compatibility record apply.

## Decisions and open gates

Microsoft Graph was selected as the provider. Its actual mail permission was not granted. Email remains disabled until a separate mail-only app registration, sender mailbox, permission review/consent and credentialed live acceptance exist. The storage app credentials are never used for email.

The T053 client contact directory does not yet exist. T037 exposes a server-only input contract and validates that fixture contacts are active, verified, role-matched and permitted; no HTTP input can supply recipient email addresses. T053 will supply persisted contact rows through this boundary. This does not block T037's platform acceptance or authorize bypassing the future contact ownership boundary.

The Graph adapter interprets HTTP 202 as accepted by Graph, never delivered. If Graph omits `request-id`, the recorded client-request correlation UUID is retained. Live tenant send acceptance is unverified.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| --- | --- | --- | --- |
| `pnpm db:generate` | Prisma 7.10 generated client | Passed | Local output |
| `pnpm db:migrate` | Local PostgreSQL 18.6; applied reviewed T037 migrations | Passed | Local output |
| `pnpm db:roles` | Local API/worker least-privilege grants | Passed | Local output |
| `pnpm contracts:generate` and `pnpm openapi:generate` | Zod contracts and Nest OpenAPI | Passed | Generated contract and OpenAPI files |
| `pnpm verify:task -- T037` | Fresh PostgreSQL 18.6 Testcontainers database; post-hardening, 2 notification tests | Passed, 2/2 | Task command output |
| `pnpm verify:affected` | Post-hardening boundaries, typecheck, production Angular build, 25 Vitest files | Passed, 114/114 Vitest tests | Task command output |
| `pnpm verify:all` | Lint, server/web builds, 114 Vitest, 73 Angular, PostgreSQL/Redis integration, Playwright | Passed before the final idempotency/claim serialization refinement; integration 44/44, E2E 10 passed / 2 live-only skipped. The task and affected gates were rerun after the refinement. | Full command output |
| `pnpm lint` | Repository ESLint and boundaries | Passed with 4 pre-existing unused-disable warnings under the excluded/untracked `visual-prototype-simulation/` tree | Full command output |
| `git diff --check` | Whitespace/error-marker check | Passed | Local output |

## Acceptance criteria

- AC1: verified with PostgreSQL fixtures for MD/GM deliverables, CFO/FD payment receipts and audit-liaison PBC requests.
- AC2: verified unique engagement/event identity, definite provider failure, same-row manual retry, and concurrent dispatch claiming. No duplicate outbound event is created.
- AC3: verified PREPARER rejection and absence of an outbound row.
- Additional invariant checks cover invalid provider configuration, rejected contact snapshots, app-only provider request correlation, stale claim to UNKNOWN, late-response fencing, reasoned retry, and evidence-linked reconciliation.

All tests used mocked Graph HTTP responses. The Microsoft tenant was not called.

## Recovery and authorization

Migrations were applied only to the local development database. No local-development or tenant business record was created; integration tests use disposable synthetic fixtures. Migrations are forward-only. A timeout, provider 5xx or expired claim is UNKNOWN and requires human review; only a definite rejection is eligible for reasoned retry. No deployment, permission consent, data reset or merge was authorized.

## Review and next task

Reviewer: Codex implementation review
Review result: T037 AC1–AC3 and the failure/recovery criteria pass. Graph provider coverage uses mocked HTTP; live Microsoft 365 mail permission and tenant acceptance remain a separate global gate.
Open blockers: no T037 blockers. Live Graph mail permission/acceptance remains open in the tenant integration scope.
Next dependency: T053 contact roles and routing preferences.
