# B05 — 25 session-only UI workspaces

**Status:** Partly resolved, rechecked 2026-10-08. The planning map exists at [docs/09-removal-guideline.md](09-removal-guideline.md), prepared under the owner's existing delegation for implementation defaults. **Owner:** engineering by task for persistence. **Kind:** engineering dependency.

## What is blocked

`docs/evidence/UI-MODULES.md` counts 39 workspaces. 14 are connected to the server. 25 are session-only preparation forms. Each shows "Session-only preparation; persistence and execution pending". Nothing typed into them is saved.

| Module | Session-only workspaces |
| :--- | :--- |
| Commercial | Lead pipeline; Entities & contacts; Quotes & proposals; Dual-key onboarding; Engagement letters; Advance billing & receipts |
| Governance | Acceptance & continuance; Team & milestones; Engagement directory |
| Fieldwork | Workprograms; Evidence register; Sampling; Analytical review & going concern; External confirmations |
| Reporting | Summary review memorandum; Audit opinion; Management letter; Representation letter; Correspondence trail; Partner signature & seal; Deliverable package; Compliance archive |
| Practice | Time & utilization; Engagement profitability; Billing & receivables |

`docs/09-removal-guideline.md` now maps each of the 25 screens to the task(s), records and completion boundary that own its persistence. It does not assert that any screen is connected.

## Why it is blocked

1. Most server sides belong to NOT_STARTED tasks, which wait on the review queue ([B01](BLOCKER-01-independent-review.md)).

## Steps to unblock

1. **Keep the label until the workspace is connected.** The new guideline states the required server path, tests, review and evidence; do not remove the label to look finished.
2. **Connect one workspace at a time.** Each connection is a change under the owning task, with a handoff. Update the `UI-MODULES.md` count only from its table.
3. **Keep the Angular rules.** Use signals and `OnDestroy` cleanup, native control flow, and a browser import boundary that imports nothing from `@auditsphere/server`, `@prisma/`, or `packages/server`.

## Done when

- The removal guideline is in `docs/` and every session-only workspace has mapped owning task(s).
- Each workspace is either connected with tests, or still labelled session-only.

The first two criteria are satisfied by `docs/09-removal-guideline.md`. The 25 screens remain session-only; their persistence tasks are not complete.
