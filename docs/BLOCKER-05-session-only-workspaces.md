# B05 — 25 session-only UI workspaces

**Status:** Open, 2026-10-08. **Owner:** product owner (removal guideline), then engineering (persistence). **Kind:** product decision and engineering dependency.

## What is blocked

`docs/evidence/UI-MODULES.md` counts 39 workspaces. 14 are connected to the server. 25 are session-only preparation forms. Each shows "Session-only preparation; persistence and execution pending". Nothing typed into them is saved.

| Module | Session-only workspaces |
| :--- | :--- |
| Commercial | Lead pipeline; Entities & contacts; Quotes & proposals; Dual-key onboarding; Engagement letters; Advance billing & receipts |
| Governance | Acceptance & continuance; Team & milestones; Engagement directory |
| Fieldwork | Workprograms; Evidence register; Sampling; Analytical review & going concern; External confirmations |
| Reporting | Summary review memorandum; Audit opinion; Management letter; Representation letter; Correspondence trail; Partner signature & seal; Deliverable package; Compliance archive |
| Practice | Time & utilization; Engagement profitability; Billing & receivables |

`docs/00-index.md` finding 7 says their server sides belong to the tasks named in a "removal guideline". That guideline is not in the repository. Without it, nobody can say which task persists which screen, or when a screen may stop being labelled session-only.

## Why it is blocked

1. The removal guideline does not exist in the repository.
2. Most of the server sides belong to NOT_STARTED tasks, which wait on the review queue ([B01](BLOCKER-01-independent-review.md)).

## Steps to unblock

1. **Write the removal guideline** (owner). It should say, for each workspace:
   - which task persists it;
   - which records it writes, and who may write them (the authority rules in `docs/guides/04-architecture-contract.md`);
   - what the screen must show until persistence exists.
2. **Map each workspace to its owning task.** Use the module READMEs under `packages/server/src/modules/<module>/README.md` and the phase READMEs under `docs/tasks/`. Record the mapping in `docs/evidence/UI-MODULES.md`, not in code.
3. **Keep the label until the workspace is connected.** "Session-only preparation" stays on each screen until its server path, its tests, and its evidence exist. Do not remove the label to look finished.
4. **Connect one workspace at a time.** Each connection is a change under its owning task, with a handoff. Update the count in `UI-MODULES.md` only from its table.
5. **Keep the Angular rules.** Use signals and `OnDestroy` cleanup, native control flow, and a browser import boundary that imports nothing from `@auditsphere/server`, `@prisma/`, or `packages/server`.

## Done when

- The removal guideline is in `docs/` and the owner has approved it.
- Every session-only workspace has a mapped owning task.
- Each workspace is either connected with tests, or still labelled session-only.
