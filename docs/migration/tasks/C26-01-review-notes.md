# C26-01 — Anchored review notes with explicit review authority

Status: DONE (notes, authority and no-self-review); rework, SRM, clearances and the UI remain
Intent: Record reviewer points against a workpackage with explicit, grant-based review authority, refuse self-review, and freeze a resolved note so review history cannot be rewritten.
Source commit and files: `nirzaf/AuditSphere@64713e808d165b4ef91ea4be4979e0f98fb2def3`; `Application/Reviews/ReviewNotesService.cs` and the review/completion services in `Application/Reviews` and `Application/Completion`.
Destination commit and files: `packages/server/src/modules/reporting/review-notes.ts`, `packages/server/src/modules/reporting/review-notes-controller.ts`, `prisma/migrations/202610010018_review_notes/migration.sql`, `tests/review-notes.integration.ts`.
Existing T-task links: T107–T110; C26.
Dependencies: WP6 capabilities and the WP4 scope model.
Scope: `ReviewNote` anchored to a workpackage reference; `REVIEW_RAISE` to raise and `REVIEW_RESOLVE` to resolve; the raiser can never resolve; one OPEN→RESOLVED transition; a resolved note is frozen and notes are never deleted; open/resolved listing and a summary.
Non-goals: Reviewer inbox, rework loop, SRM compilation, manager/Partner clearance records, procedure reviews and the UI.
Current behavior and invariants: authority is expressed by holding a distinct capability, not by a self-declared level, so a preparation-only grant cannot clear a reviewer's point. The database additionally rejects a self-resolved row, an inconsistent OPEN/RESOLVED shape, and any update to a resolved note or delete of a note.
Proposed contract / schema change: `raiseReviewNoteSchema`, `resolveReviewNoteSchema`; one table with check constraints and a freeze trigger; two capabilities added to the grant check constraint.
Permission and transaction boundary: capability checks before the write; resolution and its audit event share a transaction; the update is conditioned on the note still being OPEN.
Historical data / document impact: notes are history; a correction is a new note rather than an edit.
Implementation steps: as recorded in migration 202610010018, the service and the controller.
Relevant existing tests: `tests/authorization.integration.ts` (capability model).
Minimal additional acceptance tests: raise denied without `REVIEW_RAISE`; malformed note rejected; resolve denied without `REVIEW_RESOLVE`; self-resolution refused even with both capabilities; second resolution refused; database self-review check; frozen resolved note; no deletion; status filtering and summary.
Commands actually executed: `pnpm exec prisma validate`; `pnpm exec prisma migrate deploy`; `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`; `pnpm build:server`; `pnpm contracts:generate`; `pnpm exec tsc -p tsconfig.tests.json --noEmit`; `pnpm exec tsx --test tests/review-notes.integration.ts`; `pnpm test:integration`.
Evidence and remaining blockers: `tests/review-notes.integration.ts` passed against PostgreSQL 18.6 for every case above. Remaining: reviewer inbox and rework loop, current-revision anchoring (a note currently anchors to a free-text workpackage reference), SRM compilation, manager and Partner clearances, and the UI.
Rollback / forward-recovery impact: additive history; a withdrawn point would be recorded as a new note rather than deleting the old one.
Definition of done: met for review-note authority, self-review refusal and freeze; the wider C26 capability remains open.
