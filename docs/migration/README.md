# Migration workspace (AuditSphere → AuditSphereJS)

This directory holds the execution artifacts for the migration plan at
`C:/Users/DELL/Downloads/AuditSphere-to-AuditSphereJS-Complete-Migration-Plan.md` (document
version 1.0, pinned source `nirzaf/AuditSphere@64713e8`, pinned target
`nirzaf/AuditSphereJS@8d19e6c`).

It complements, and does not replace, `docs/tasks/T001–T171` and
`docs/guides/13-execution-ledger.md`. Requirement traceability and legacy parity
traceability are kept separate on purpose (plan section 3.1).

## Contents

| Artifact | Purpose |
| --- | --- |
| `00-baseline-reconciliation.md` | WP1: executed baseline commands and T001–T017 evidence reconciliation |
| `01-source-inventory.md` | WP2: source capability/schema/document inventory (MIG-001) |
| `02-capability-parity-matrix.md` | C01–C38 disposition with the required four independent states |
| `03-differential-report.md` | Destination-vs-fixture differential results (MIG-003), generated |
| `destination-status.json` | Maintained destination status record consumed by the parity generator |
| `inventory/*.json` | Machine-readable extraction (manifest, schema, capabilities, routes, jobs, tests, parity) |
| `inventory/SUMMARY.md` | Generated human-readable inventory summary |
| `decisions/ADR-0001-target-architecture.md` | ADR resolving the ASP.NET header versus Nest/Fastify/Angular decision |
| `epics.md` | MIG-001–MIG-020 epic register (plan section 16) |
| `tasks/` | First ten bounded work packages with the plan's task template (section 25.2) |
| `../../fixtures/characterization/` | Source-quoted characterization fixtures for differential testing (WP03) |

## Regenerating the source-derived artifacts

The extractors read a pinned source checkout and never mutate it:

```bash
git clone --filter=blob:none https://github.com/nirzaf/AuditSphere.git tmp/AuditSphere
git -C tmp/AuditSphere checkout 64713e808d165b4ef91ea4be4979e0f98fb2def3
node scripts/migration/inventory.mjs
node scripts/migration/capability-map.mjs
node scripts/migration/parity.mjs
```

`parity.mjs` fails if the source map and the destination status record disagree about which
capabilities exist, so a row cannot disappear silently.

## Evidence boundary

Source extraction is textual (regex over C#, Razor and EF migrations) and is not a compiler
analysis. Every record carries its file and line so a reviewer can check it. Nothing in this
directory asserts professional approval, live Microsoft tenant acceptance, production data
reconciliation, deployment or cutover. Those stay **NOT_VERIFIED** until their own evidence
exists. The plan's own rule applies here: a successful build or a matching count is not
functional acceptance.
