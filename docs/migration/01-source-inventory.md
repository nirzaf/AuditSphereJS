# Source inventory (MIG-001)

## How this was produced

`scripts/migration/inventory.mjs` reads the pinned AuditSphere checkout
(`nirzaf/AuditSphere`, commit `64713e808d165b4ef91ea4be4979e0f98fb2def3`, clean worktree) and
emits `docs/migration/inventory/*.json` plus `SUMMARY.md`. `scripts/migration/capability-map.mjs`
then resolves the migration plan's C01–C38 rows to real source symbols and files. Extraction is
textual; it is reproducible and points at exact file/line locations, but it is not a substitute
for reading a service before porting it (plan section 25.1 rule 2).

## Headline counts

| Artifact | Count |
| --- | ---: |
| C# files under `src` | 510 |
| Razor components | 88 |
| Registered Razor routes | 59 |
| EF migration files | 124 |
| Distinct created tables | 252 |
| EF `DbSet` declarations | 210 |
| Explicit `ToTable` bindings | 152 |
| Source test files | 138 |
| Source documentation files | 123 |
| Durable job / hosted-service types | 14 |

Full per-artifact detail: [`inventory/SUMMARY.md`](inventory/SUMMARY.md),
[`inventory/manifest.json`](inventory/manifest.json), [`inventory/schema.json`](inventory/schema.json),
[`inventory/capabilities.json`](inventory/capabilities.json), [`inventory/routes.json`](inventory/routes.json),
[`inventory/jobs.json`](inventory/jobs.json), [`inventory/tests.json`](inventory/tests.json),
[`inventory/capability-map.json`](inventory/capability-map.json).

## Findings that drive the P0 work

### 1. Financial precision is documented as `decimal(19,6)` in the source

The source persistence layer states "Money decimal(19,6)" and its EF migrations declare
`numeric(19,6)` **445 times** (plus two `numeric(9,6)` ratio columns). The destination's only
monetary columns, `TbRow.current` / `TbRow.prior`, are `Decimal(20,2)`, and
`packages/contracts/src/index.ts` restricts money to at most two decimal places. Importing
source values through that path would truncate a documented six-decimal precision. This is the
evidence for P0 "remove lossy narrowing before importing legacy values" and work package 5.

### 2. The source schema is 252 tables; the destination schema is 9 models

`inventory/schema.json` lists created tables, `DbSet` declarations, `ToTable` bindings, money
properties and precision declarations. The destination has `User`, `Membership`,
`Engagement`, `Document`, `TbImport`, `TbRow`, `AuditEvent`, `OutboxEvent`,
`CommandReceipt` — a trial-balance slice, not an accounting context. No firm, client, period,
book, chart, journal, invoice or ledger model exists.

### 3. Compound `(firm, client, engagement)` scope is the source's ownership discipline

The source DbContext header comments state the composite `(firm, client, engagement)` FK
discipline. The destination `Engagement` carries a bare scalar `clientId` with no `Firm`, no
`Client` table and no composite constraint, which is the P0 scope-model gap.

### 4. Capability resolution is complete

All 38 capability rows resolve to at least one source symbol or capability folder; the extractor
reports unresolved symbols rather than dropping them. One plan symbol `AutomaticFeeInvoices` is
a filename, not a type; the real types are `AutomaticFeeInvoiceHandler` and
`AutomaticFeeInvoicePolicy`.

## What this inventory does not claim

- No production database was inspected, so real row counts and control totals are unknown
  (plan section 17.1 requires them before cutover; they are **NOT_ASSESSED**).
- Document/artifact bytes were not enumerated against provider versions.
- No source test was executed; source test files are counted, not run.
- The inventory lists behavior to port. It does not conclude that any of it is correct.
