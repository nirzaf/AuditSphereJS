# B04 — Unconditional lifecycle gates still fail every time

**Status:** Open, 2026-10-08. **Owner:** engineering, card by card. **Kind:** engineering dependency.

## What is blocked

In `packages/server/src/modules/governance/lifecycle.ts`, seven `fail(...)` calls run with no condition. Whatever the engagement's data, the command they guard is always refused. They are placeholders for evidence that the owning tasks have not yet built.

| Lines | Command | Failure code | Owning task (ledger title) | Status |
| :--- | :--- | :--- | :--- | :--- |
| 234 | `APPROVE_MANAGER_REVIEW` | `WORKPROGRAM_SUBMISSIONS_MISSING` | T106 Submit a complete version-bound workpackage for review; T110 Clear completed workprograms without self-review or stale evidence | NOT_STARTED |
| 235 | `APPROVE_MANAGER_REVIEW` | `SRM_NOT_COMPILED` | T114 Compile the SRM from authoritative versioned module queries; T115 Approve the manager recommendation and submit SRM to partner | NOT_STARTED |
| 236 | `APPROVE_MANAGER_REVIEW` | `CRITICAL_CONFIRMATIONS_PENDING` | T113 Enforce critical confirmation blockers and holding-letter idempotency; T111, T112 | NOT_STARTED |
| 246 | `AUTHORIZE_FINAL_REPORT` | `REPORT_OPINION_MISSING` | T118 Implement the partner-only four-way opinion workflow | NOT_STARTED |
| 247 | `AUTHORIZE_FINAL_REPORT` | `PARTNER_IMAGE_APPROVAL_MISSING` | T126 Implement approved partner signature and seal controls | NOT_STARTED |
| 250 | `RELEASE_FINAL_PACKAGE` | `SIGNED_LOR_MISSING` | T122 Generate D3 LOR for client letterhead and signature; T126 | NOT_STARTED |
| 251 | `RELEASE_FINAL_PACKAGE` | `FINAL_BUNDLE_MISSING` | T127 Build the mandatory five-part deliverable package; T128 Validate final package completeness; T129 Release the package | NOT_STARTED |

The owning tasks were inferred from their titles and from the comment above line 233 ("owned by the pending workprogram, SRM and confirmation tasks"). Confirm each mapping against the card before building.

The gates that already work are not in this table. For example, line 226 (`WORKPROGRAM_SUBMISSIONS_MISSING`) is conditional and checks real data. The Red-risk clearance gate at line 244 also checks real data.

## Why this is blocked

Each gate needs its owning task to supply a real record and a query. Those tasks are NOT_STARTED and wait on the review queue ([B01](BLOCKER-01-independent-review.md)).

## Steps to unblock (for each gate)

1. Build the owning task first, through its card, with its own tests.
2. Replace the unconditional `fail(...)` with a check on the real record. The check must refuse when the record is missing or stale and pass when it is present and current.
3. Add a test for each direction: refused without the evidence, allowed with it, refused again when the evidence is stale.
4. Remove only that one placeholder, in the same change.
5. Record the change in the owning task's handoff.

## Do not

- Do not delete a `fail(...)` call without a check that replaces it. That would let a command succeed with no evidence.
- Do not add a bypass flag to satisfy a gate. Gates are the control the audit trail depends on.

## Done when

- None of the seven lines is an unconditional `fail(...)`.
- Each replacement check has tests in both directions.
