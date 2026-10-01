# Architecture and ownership contract

## Chosen system

One TypeScript modular monolith, one PostgreSQL business database, one Angular SPA with internal and isolated portal routes, one API deployment and one or more worker processes. No public GraphQL, generic microservices or event-sourced ledger. Keep modules simple: route/controller, runtime request validation, authorized use case, owned persistence and tests.

```text
apps/
  api/                 Nest/Fastify HTTP and realtime composition
  web/                 Angular standalone application
  worker/              Background process composition
packages/
  server/src/
    modules/
      commercial/ governance/ fieldwork/ reporting/ practice/
    platform/
      auth/ authorization/ database/ audit/ jobs/ documents/
      storage/ portal/ realtime/ notifications/ observability/
  contracts/           Browser-safe transport schemas, enums and generated types
  testing/             Small reusable fixtures and real-service test helpers
prisma/
  migrations/          One ordered reviewed migration history
infra/                 Reproducible deployment/test configuration
docs/                  Requirements, decisions, module contracts and evidence
```

This reusable `packages/server` arrangement replaces the older plan's assumption that all business modules live under the API app. API and worker share services without importing one another's entry points. Separate browser and server TypeScript configs; keep server ESM/decorator transforms out of the browser bundle.

## Ownership table

| Owner | Canonical records and operations |
| :--- | :--- |
| Identity/platform | Principals, firm/client/engagement scope, memberships, sessions, durable operations, audit events and document metadata. |
| Commercial | Leads, corporate relationships, contacts, proposals, commercial approvals and engagement-letter requests. |
| Governance | One acceptance/continuance review, team/capacity/milestones, materiality versions and planning/risk sign-offs. |
| Fieldwork | TB source/import/mapping versions, FSLIs, workprogram/evidence links, analytical review, sampling, client audit adjustments, notes, confirmations and SRM. |
| Reporting | Opinion/basis, financial-statement/report snapshots, LOR workflow, signature orchestration, bundle release and archive lifecycle. |
| Practice | Chart of accounts, fiscal periods, invoices, payments/allocations, receipts, all firm ledger postings/reversals, time/rates/budgets and financial reports. |

Client audit adjustments are not the audit firm's journal entries. Commercial/Reporting call Practice's invoice/posting facade under the caller's transaction where appropriate. They never create an alternative financial ledger. Reports read canonical postings and snapshot source versions when signed.

## Mutation transaction

```text
Authenticated, scoped principal
  -> runtime contract + authority + state/version guard
  -> one PostgreSQL transaction
       business writes
       audit append
       operation/idempotency result
       outbox event where an external effect is required
  -> commit
  -> enqueue/deliver durable work outside transaction
```

Pass a small explicit transaction context through module facades. Do not open independent transactions for the two halves of a financial action. Do not wait for Graph, email, PDF, Redis or storage network calls while holding database locks.

## Concurrency

Use expected versions on mutable aggregates. All mutations participating in an approval must also respect a short-lived engagement revision/barrier so a concurrent child edit cannot validate an old SRM or report. Define lock order and retry only transient database conflicts. Journal line edits and posting both lock their parent journal before changing/checking state.

Redis edit leases are advisory. Use random ownership tokens with atomic compare-renew/delete and TTL. A random token or arbitrary integer is not a durable fencing token. Stale writer rejection is enforced in PostgreSQL. Realtime notifications are scoped hints; reconnect reloads authoritative versions. Queue and realtime messages carry identifiers rather than all confidential evidence.

## Queue durability

Use persisted, noeviction Redis for queues. Record required business operations in PostgreSQL until terminal, not merely until enqueued. A reconciliation loop detects lost Redis jobs and retries safely. External mail/signing calls can have unknown outcomes: preserve that state and reconcile instead of assuming provider idempotency. Do not advertise exactly-once side effects.

## Financial and source-version rules

Use decimal arithmetic, bounded input precision and string transport. Dates without time remain accounting dates; instants use UTC plus an approved presentation timezone. Materiality/risk, sampling, final fees and archive trigger policies require approved decisions. TB imports retain original files and rows; re-imports create versions. Workprogram templates are copied by version into engagement work. Approvals bind exact materiality/TB/SRM/evidence revisions and are invalidated or require reapproval when underlying facts change.

## Document and archive rules

PostgreSQL owns document meaning; object storage owns bytes. Never expose storage secrets. Finalization rechecks authorization and portal freeze after bytes arrive. Retain exact object version IDs and cryptographic digests. A signed report is never silently regenerated in place.

Archive application write protection is enforced as soon as the 60-day business deadline or authorized early lock applies. Storage sealing is a separate state and may fail without reopening edits. A full archive includes source TB, planning, workpapers, review history, evidence, correspondence and final deliverables. Retention/legal-hold policy is not inferred from the 60-day assembly timer.

## AI-agent module README contract

Each module needs a short README: purpose; owned records; exported facades; allowed dependencies; important states/invariants; relevant tests. Start with straightforward files and split only as complexity actually grows. No repository interface around every Prisma call and no event emitted for every ordinary function invocation. See [AGENTS.md](../AGENTS.md).
