# MIG-009-03 — Taxonomy authoring workspace

Status: DONE for the authoring boundary; taxonomy approval, per-import mapping approval, allocations and statement packages remain
Intent: Give the firm a staff workspace that composes a versioned mapping taxonomy through the existing guarded endpoint, so approved taxonomies no longer have to be created by calling the API directly.
Source commit and files: `nirzaf/AuditSphere@64713e808d165b4ef91ea4be4979e0f98fb2def3`; `Application/Accounting/Intake/MappingMemoryService.cs` and the taxonomy/statement-mapping administration surface.
Destination commit and files: `apps/web/src/module-catalog.ts` (taxonomy screen), `apps/web/src/line-editor.ts`, `apps/web/src/module-workspace.ts`, `apps/web/src/module-workspace.html`, `apps/web/src/module-workspace.spec.ts`.
Existing T-task links: T080, T081, T082; MIG-009-01, MIG-009-02.
Dependencies: MIG-009-01 taxonomy and mapping approval; the `createTaxonomySchema` contract.
Scope: a Fieldwork workspace that lists existing taxonomies and submits a new version with repeating lines (code, label, statement section, sort order), reusing the same repeating editor as the adjustment journal and validating locally before the reviewed submission.
Non-goals: Approving a taxonomy version, approving an import mapping, mapping allocations, statement layouts, financial packages and releases. No server contract or schema change.
Current behavior and invariants: the workspace submits the existing `createTaxonomySchema` body through `POST /engagements/:engagementId/taxonomies`; the server keeps `TAXONOMY_MAPPING`-style authorization (`TAXONOMY_MANAGE`), duplicate-code rejection, firm-scoped version numbering and immutability of approved versions. The client cannot approve, and navigation grants no authority.
Proposed contract / schema change: none.
Permission and transaction boundary: unchanged; the server re-checks `TAXONOMY_MANAGE` in the engagement scope and writes the version, its lines and the audit event in one transaction.
Historical data / document impact: none; a new version is additive and approved versions stay immutable.
Implementation steps: added the `taxonomies` screen with `lineKind: 'taxonomy'`; generalised the repeating editor with a per-screen minimum, field set and title; mapped taxonomy lines into the contract shape with an explicit statement section and integer sort order.
Relevant existing tests: `tests/taxonomy.integration.ts` (server boundary).
Minimal additional acceptance tests: `apps/web/src/module-workspace.spec.ts` — an invalid statement section is rejected locally without a request, and a valid two-line taxonomy is submitted with typed lines.
Commands actually executed: `pnpm exec tsc -p apps/web/tsconfig.spec.json --noEmit`; `pnpm exec tsc -p tsconfig.tests.json --noEmit`; `pnpm exec ng test web --watch=false` (18 passed); `pnpm exec ng build web`; `pnpm boundaries`; `pnpm contracts:check`.
Evidence and remaining blockers: the workspace renders and submits validated taxonomy versions; 18 Angular component tests and the production build pass. Remaining: taxonomy approval and per-import mapping approval actions in the UI, the suggestion/provenance view, allocations, statement layouts and financial packages.
Rollback / forward-recovery impact: none; the screen is additive presentation and can be removed without data impact.
Definition of done: met for the authoring boundary; MIG-009 stays IN_PROGRESS for approval administration, layouts and packages.