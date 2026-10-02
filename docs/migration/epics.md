# Migration extension epics (MIG-001 – MIG-020)

Register of the migration extensions defined in plan section 16. These do **not** renumber or
replace T001–T171. Each epic must be split into child tasks carrying the plan section 16.1 fields
before implementation. Status here is deliberately coarse; the child tasks carry the evidence.

| Extension | Deliverable | Depends on | Status |
| --- | --- | --- | --- |
| MIG-001 — Baseline and inventory | Pinned source/target manifest; routes, capabilities, schema, jobs, documents and cohort graph | None | IN_PROGRESS — source manifest, capability map and schema extraction exist (`inventory/`); document/byte and cohort graph not yet enumerated |
| MIG-002 — Persistence and precision | Target scope/FKs/SQL protections, column-level type/rounding mapping | MIG-001, T011/T018/T023 | NOT_STARTED — precision map evidence gathered (445 × `numeric(19,6)`); no schema change yet |
| MIG-003 — Differential behavior harness | Language-neutral input/output fixtures extracted from source tests/services | MIG-001 | IN_PROGRESS — fixtures exist with per-case provenance and `scripts/migration/differential.mjs` runs the destination materiality and sampling calculators against them (**46/46 matched**, see docs/migration/03-differential-report.md); no extracted family is destination-absent, while currency/consolidation fixtures are not extracted yet |
| MIG-004 — Full access-model port | Identity/grants/expiry/session/SoD and scoped read/write services | MIG-001, T018–T021 | IN_PROGRESS — scoped grants with expiry/revocation and in-transaction re-checks exist (WP06); session epochs, SoD combinations and the wider source capability set remain |
| MIG-005 — Durable operation parity | Revision/authority/ownership fences, cancellation, unknown outcomes | MIG-004, T027/T030/T031 | NOT_STARTED — tb.import outbox recovery exists only |
| MIG-006 — Commercial and finance extensions | Dual-key letter, grandfathering, drafts-only policy, canonical fee/ledger behavior | MIG-002/004/005, T052–T077 | NOT_STARTED |
| MIG-007 — Client accounting model | Profiles, periods/books, chart/taxonomy, opening balances, close/reopen/rollforward/restatement | MIG-002/003 | NOT_STARTED |
| MIG-008 — Complete intake/GL/journals | Source layouts, multi-period/entity, GL completeness, source acceptance, adjustments | MIG-007, T043–T045/T078–T081 | IN_PROGRESS — single-dataset publication with an immutable accepted version exists (WP09); XLSX, multi-period/entity, GL and adjustments remain |
| MIG-009 — Mapping and financial packages | Mapping allocations/history, layouts, package reviews/checkpoints/releases | MIG-008, T080–T082/T119 | IN_PROGRESS — versioned immutable taxonomies, stale-aware mapping approvals and client-scoped approval memory with provenance exist; allocations, layouts, packages and releases remain |
| MIG-010 — Analysis and currency | Reconciliations, valuations, journal risk, remeasurement/translation | MIG-003/007/008 | NOT_STARTED |
| MIG-011 — Consolidation | Groups, perimeters, ownership, external packs, intercompany, advanced runs and lineage | MIG-009/010 | NOT_STARTED |
| MIG-012 — Microsoft capability parity | Tenant/capability consent, client repositories, privileged workers, exact versions | MIG-004/005, T149–T156 | IN_PROGRESS — per-client repository bindings and immutable document-version identity exist (WP08); tenant consent, site provisioning and live permission evidence remain |
| MIG-013 — Artifact and bundle parity | Byte-preserving import, DOCX/PDF/ZIP contracts, signed LOR and bundle mapping | MIG-009/012, T118–T130 | NOT_STARTED |
| MIG-014 — Freeze and records parity | Original deadlines, archive manifests, legal holds, amendments, audit bridge | MIG-005/013, T131–T138 | NOT_STARTED |
| MIG-015 — Remaining source UX | Technical library, scoped search, operational views, distinct financial metrics | Owner modules, T139–T148 | IN_PROGRESS — contract contribution calculator ported with 53/53 differential checks (`tasks/MIG-015-01-contract-contribution.md`); technical library, scoped search, the analytics query and its views remain |
| MIG-016 — Restartable ETL | Read-only extraction, transformation, staged loading, identity/provider maps, checkpoints | MIG-001/002 | NOT_STARTED |
| MIG-017 — Reconciliation | Schema/data/amount/permission/document/lineage comparisons and exception registry | MIG-003/016 | NOT_STARTED |
| MIG-018 — Ownership and cutover | Cohort routing, legacy/target write fences, worker/provider handover | MIG-004/005/017 | NOT_STARTED |
| MIG-019 — Post-write recovery | Change capture/export, reverse mapping or forward-fix, external-effect reconciliation | MIG-016–018 | NOT_STARTED |
| MIG-020 — Acceptance and retirement boundary | Dual traceability closure, training, retained legacy access, retirement criteria | All applicable, T168–T171 | NOT_STARTED |

## Rules applied

- No epic replaces or renumbers an existing T-task (plan section 16.2).
- Where an epic extends a T-task, the added acceptance criterion is recorded rather than a parallel
  implementation being created.
- An epic is not an instruction to create every abstraction at once; child tasks are created as work
  starts, each with exact files and acceptance checks.
