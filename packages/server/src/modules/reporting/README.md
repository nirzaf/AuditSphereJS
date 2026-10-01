# Reporting
Purpose: own the reporting domain described in the architecture plan.
Owned use cases: anchored review notes with grant-based review authority and a no-self-review rule. Reviews inbox, rework, SRM, opinions, deliverables, release and archive are still pending.
Owned tables: ReviewNote (frozen once resolved).
Public services: raiseReviewNote, resolveReviewNote, listReviewNotes, reviewSummary.
Published events: none yet; audit events are written with the note transition.
Consumed events: none.
Allowed dependencies: platform services (db, authorization) and shared browser-safe contracts.
Forbidden dependencies: another module internals or owned-table mutations.
State transitions: a note is OPEN then RESOLVED exactly once, by a different user holding `REVIEW_RESOLVE`; a resolved note is immutable and notes are never deleted.
Critical invariants: lock the engagement and re-check scoped authorization inside the write transaction; only planning, fieldwork and review states allow edits. Persist each note transition and its audit atomically. No self-review, one transition per note, append-only audit, and a resolved note frozen by database trigger plus check constraints.
Relevant tests: tests/review-notes.integration.ts; broader reporting acceptance still pending.

Functional source: docs/requirements/CURRENT.md (unchanged v2.1). Decision defaults: docs/decisions/register.json. Production evidence and task completion remain separate from this module scaffold.
