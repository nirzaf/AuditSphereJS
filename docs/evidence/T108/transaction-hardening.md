# T108 partial implementation — review-note transaction hardening

Status: IN_PROGRESS. No dependency changes, migration or generated contract changes.

The existing Reporting review-note service now locks the engagement, re-checks the actor's scoped capability inside the transaction, and allows mutations only in planning, fieldwork and review states. Raising a note and appending its audit event commit together. Resolving a note uses the same transaction boundary. This closes the previous failure path where a raised note could survive a failed audit write.

Verification on 2026-10-02:

- `node --import tsx --test tests/review-notes.integration.ts`: 1 real PostgreSQL 18.6 integration test passed. It injects a failing audit insert and verifies both the note count and audit-chain head remain unchanged; also covers revoked authority, released-engagement refusal, no self-review and database immutability.
- `pnpm verify:affected`: boundaries, server compilation, test typecheck, Angular build and 60 unit tests passed after the Graph current-version regression test was added.
- `git diff --check`: passed.

The first test run exposed an invalid revocation fixture missing required actor/reason fields; the fixture was corrected before the passing run. Local verification used the available bundled pnpm 11.25.0 launcher after the pinned launcher failed; repository pin remains pnpm 12.8.1, exercised by hosted CI.

This does not complete T108. Assigned preparers, severity, distinct responses, RESPONDED/REOPENED history, reviewer inbox integration and workprogram blocking-note derivation remain pending. The current OPEN/RESOLVED immutable-note model must be extended with append-only transition history for that acceptance scope.
