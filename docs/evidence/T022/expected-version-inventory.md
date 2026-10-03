# T022 mutation concurrency inventory

Reviewed 2026-10-03 against the live controller/service/schema surfaces and the source requirements cited by T022 (`docs/sources/requirements-current.md`, lines 68–129). The inventory distinguishes editable versioned aggregates from append-only records and one-way decisions guarded by compare-and-set, uniqueness, idempotency, or a transaction lock.

## Versioned mutable aggregates

| Aggregate and mutation | Version supplied by the client | Backend guard and result |
| :--- | :--- | :--- |
| `TbRow` mapping (`PATCH .../imports/:id/mappings`) | Per-row `expectedVersion` | Set-based update matches every row ID and version; any mismatch rolls back the batch. Successful mapping also advances `TbImport.version`. |
| `TbImport` mapping approval, finalization and balance publication | `expectedVersion` from the current import DTO | Each command compares the submitted revision with `TbImport.version`; finalization advances it. Mapping approval binds to that exact mapped revision and digest. |
| `TaxonomyVersion` approval | `expectedVersion` equals the immutable taxonomy sequence | Content is immutable after creation; approval compares the sequence and applies a `DRAFT` compare-and-set. |
| `Engagement` lifecycle command | `expectedVersion` | Lifecycle command matches state and version and increments the engagement revision. |
| `Engagement` staff assignment/revocation | `expectedVersion` from the readable engagement DTO | The command locks the engagement, rejects stale revisions, changes membership/grants transactionally, then increments and returns the engagement revision. |
| `CommercialProposal` present/accept | `expectedVersion` equals proposal `revision` | Both commands compare the live revision and status under the engagement lock; stale actions are denied. |
| Client `AdjustmentJournal` post/reverse | `expectedVersion` equals journal `version` | Status and version predicates protect posting/reversal; posted journals are reversed with a new inverse journal. |
| Practice `PracticeJournal` post/reverse | `expectedVersion` equals journal `version` | The command matches the current journal state/version and preserves posted history. |
| Practice `PracticePeriod` close/reopen | `expectedVersion` equals period `version` | The period row is locked and the state/version are checked before incrementing the version. |

## One-way or append-only commands

These operations do not edit an existing, user-editable aggregate value. Their state is immutable or transitions once; the implementation uses the listed guard rather than inventing a synthetic version field.

| Operation family | Concurrency/integrity guard |
| :--- | :--- |
| Materiality calculation and approval | Calculations are immutable records bound to an exact publication/taxonomy; creation is idempotent, and approval is a `DRAFT` compare-and-set with a command receipt. |
| Review-note raise and resolution | Raise creates a record; resolution is a one-way `OPEN` compare-and-set. |
| Risk assessments, partner clearances and owner assignments | Decisions are new records bound to the exact assessment; clearance is unique per assessment, and only the current assessment can be cleared or assigned. |
| Invoice issue, payments and receipts | Issue/payment commands use the engagement lock and idempotency receipts; payments are separate immutable ledger rows, invoice settlement is one-way `ISSUED` to `PAID`, and the receipt is unique per invoice. |
| Taxonomy, journal, period, account, invoice, proposal and risk creation | Creates a new record; command-receipt/content uniqueness applies where retries could duplicate business work. |
| Internal session revocation and portal credential/session commands | Revocation cutoffs and token/session consumption are append-only or guarded by unconsumed/unrevoked predicates and expiry checks. |

## Evidence

- `tests/taxonomy.integration.ts` rejects stale taxonomy/import revisions and accepts current revisions.
- `tests/staff-access.integration.ts` rejects stale replacement commands, verifies assignment/revocation revision increments, and verifies receipt replay.
- `tests/commercial-onboarding.integration.ts` rejects stale proposal present/accept revisions.
- Owner-module integration tests cover lifecycle, publication, adjustment and Practice journal/period version guards.
- `pnpm verify:task -- T022` runs API contracts, portal auth, commercial onboarding, taxonomy and staff-access PostgreSQL acceptance. `pnpm verify:affected` covers boundaries, typecheck, Angular production build and unit tests.

This is a code-level inventory, not a claim of authenticated browser, live tenant, signing-provider, or complete product acceptance.
