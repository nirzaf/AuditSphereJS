# Remaining stories — 09-review: Review, confirmations and SRM

**Status: PROPOSED** · verified against `main` at `9b65b2b` (2026-10-08). Completed tasks of this phase are not listed.

Each entry is the *delta* to the task card. The card keeps the full checklist and acceptance criteria; read it, then this entry, then only the files named here.

| Remaining | IN_PROGRESS: 1 | NOT_STARTED: 10 |
| :--- | :--- | :--- |

## T107 — Implement the reviewer inbox and version-aware inspection

`NOT_STARTED` · CORE · owner `fieldwork` · [task card](../../tasks/09-review/T107-review-inbox.md)

**Requirements:** R004 REVIEWER responsibilities and boundaries; R056 Manager review comments and rework.

**Depends on:** T106 (NOT_STARTED), T021 (DONE).

**Can start:** after T106 is DONE (the card requires DONE dependencies).

**Already in code:** nothing found for this task’s records or routes; build from the card.

**Remaining:**

- Everything in the card. Outcome: List submitted workpackages by engagement, FSLI risk, preparer and due date.

**Done when:** the card’s acceptance criteria pass on real code; `pnpm verify:task -- T107` has a recipe in `scripts/verify-task.mjs` and passes; `pnpm verify:affected` passes; `docs/evidence/T107/handoff.md` is appended; the ledger row is updated after review.

## T108 — Implement inline review notes and resolution lifecycle

`IN_PROGRESS` · CORE · owner `fieldwork` · [task card](../../tasks/09-review/T108-review-notes.md)

**Requirements:** R056 Manager review comments and rework; R057 SRM automatically compiled after manager clearance.

**Depends on:** T107 (NOT_STARTED), T025 (DONE).

**Can start:** after T107 is DONE (the card requires DONE dependencies).

**Already in code:** Review notes with atomic audit, single OPEN → RESOLVED, no self-review (`modules/reporting/review-notes.ts`).

**Remaining:**

- RESPONDED and REOPENED states with full history, assigned preparer, severity, step/FSLI anchors, blocking counts for workprogram and engagement gates.
- Ownership: the card assigns review notes to `fieldwork`; the code lives in `reporting`. Decide and move once (DN-08).

**Done when:** the card’s acceptance criteria pass on real code; `pnpm verify:task -- T108` has a recipe in `scripts/verify-task.mjs` and passes; `pnpm verify:affected` passes; `docs/evidence/T108/handoff.md` is appended; the ledger row is updated after review.

## T109 — Return workpackages with mandatory comments and reassignment

`NOT_STARTED` · CORE · owner `fieldwork` · [task card](../../tasks/09-review/T109-rework.md)

**Requirements:** R056 Manager review comments and rework; R079 All 11 lifecycle states and rework transitions.

**Depends on:** T108 (IN_PROGRESS), T028 (DONE).

**Can start:** after T108 is DONE (the card requires DONE dependencies).

**Already in code:** nothing found for this task’s records or routes; build from the card.

**Remaining:**

- Everything in the card. Outcome: Require a meaningful reason and identified incomplete procedures when returning work.

**Done when:** the card’s acceptance criteria pass on real code; `pnpm verify:task -- T109` has a recipe in `scripts/verify-task.mjs` and passes; `pnpm verify:affected` passes; `docs/evidence/T109/handoff.md` is appended; the ledger row is updated after review.

## T110 — Clear completed workprograms without self-review or stale evidence

`NOT_STARTED` · CORE · owner `fieldwork` · [task card](../../tasks/09-review/T110-manager-clearance.md)

**Requirements:** R004 REVIEWER responsibilities and boundaries; R040 Green/Amber/Red stratification and required reviewers; R056 Manager review comments and rework; R057 SRM automatically compiled after manager clearance.

**Depends on:** T109 (NOT_STARTED), T087 (IN_REVIEW).

**Can start:** after T109 and T087 are DONE (the card requires DONE dependencies).

**Already in code:** nothing found for this task’s records or routes; build from the card.

**Remaining:**

- Everything in the card. Outcome: Require completion of mandatory steps and resolved blocking notes for the current resubmission.

**Done when:** the card’s acceptance criteria pass on real code; `pnpm verify:task -- T110` has a recipe in `scripts/verify-task.mjs` and passes; `pnpm verify:affected` passes; `docs/evidence/T110/handoff.md` is appended; the ledger row is updated after review.

## T111 — Implement all required third-party confirmation categories

`NOT_STARTED` · CORE · owner `fieldwork` · [task card](../../tasks/09-review/T111-confirmation-register.md)

**Requirements:** R060 Bank/AR/AP/inventory/legal confirmations; R061 Critical confirmation blocks release and triggers holding letter.

**Depends on:** T110 (NOT_STARTED), T053 (IN_REVIEW), T032 (DONE).

**Can start:** after T110 and T053 are DONE (the card requires DONE dependencies).

**Already in code:** nothing found for this task’s records or routes; build from the card.

**Remaining:**

- Everything in the card. Outcome: Model Bank, AR, AP, Inventory and Legal confirmations with counterparty, critical flag, due dates and assigned owner.

**Done when:** the card’s acceptance criteria pass on real code; `pnpm verify:task -- T111` has a recipe in `scripts/verify-task.mjs` and passes; `pnpm verify:affected` passes; `docs/evidence/T111/handoff.md` is appended; the ledger row is updated after review.

## T112 — Dispatch, remind and verify confirmation responses

`NOT_STARTED` · CORE · owner `fieldwork` · [task card](../../tasks/09-review/T112-confirmation-dispatch.md)

**Requirements:** R009 Role-based contact and communication routing; R060 Bank/AR/AP/inventory/legal confirmations; R081 Preparer has no external communication or sign-off rights.

**Depends on:** T111 (NOT_STARTED), T037 (DONE), T040 (DONE).

**Can start:** after T111 is DONE (the card requires DONE dependencies).

**Already in code:** nothing found for this task’s records or routes; build from the card.

**Remaining:**

- Everything in the card. Outcome: Generate/send approved requests to authorized counterparties using staff with external-communication permission.

**Done when:** the card’s acceptance criteria pass on real code; `pnpm verify:task -- T112` has a recipe in `scripts/verify-task.mjs` and passes; `pnpm verify:affected` passes; `docs/evidence/T112/handoff.md` is appended; the ledger row is updated after review.

## T113 — Enforce critical confirmation blockers and holding-letter idempotency

`NOT_STARTED` · CORE · owner `fieldwork` · [task card](../../tasks/09-review/T113-holding-letters.md)

**Requirements:** R061 Critical confirmation blocks release and triggers holding letter.

**Depends on:** T112 (NOT_STARTED), T037 (DONE), T035 (DONE).

**Can start:** after T112 is DONE (the card requires DONE dependencies).

**Already in code:** Lifecycle placeholder `CRITICAL_CONFIRMATIONS_PENDING` (line 236).

**Remaining:**

- Everything in the card.

**Done when:** the card’s acceptance criteria pass on real code; `pnpm verify:task -- T113` has a recipe in `scripts/verify-task.mjs` and passes; `pnpm verify:affected` passes; `docs/evidence/T113/handoff.md` is appended; the ledger row is updated after review.

## T114 — Compile the SRM from authoritative versioned module queries

`NOT_STARTED` · CORE · owner `fieldwork` · [task card](../../tasks/09-review/T114-srm-snapshot.md)

**Requirements:** R057 SRM automatically compiled after manager clearance; R058 AJEs, unadjusted differences, SAD/PM and estimates in SRM.

**Depends on:** T110 (NOT_STARTED), T105 (NOT_STARTED), T113 (NOT_STARTED).

**Can start:** after T110, T105 and T113 are DONE (the card requires DONE dependencies).

**Already in code:** Lifecycle placeholder `SRM_NOT_COMPILED` (line 235).

**Remaining:**

- Everything in the card.

**Done when:** the card’s acceptance criteria pass on real code; `pnpm verify:task -- T114` has a recipe in `scripts/verify-task.mjs` and passes; `pnpm verify:affected` passes; `docs/evidence/T114/handoff.md` is appended; the ledger row is updated after review.

## T115 — Approve the manager recommendation and submit SRM to partner

`NOT_STARTED` · CORE · owner `fieldwork` · [task card](../../tasks/09-review/T115-srm-manager.md)

**Requirements:** R004 REVIEWER responsibilities and boundaries; R057 SRM automatically compiled after manager clearance; R058 AJEs, unadjusted differences, SAD/PM and estimates in SRM; R079 All 11 lifecycle states and rework transitions.

**Depends on:** T114 (NOT_STARTED).

**Can start:** after T114 is DONE (the card requires DONE dependencies).

**Already in code:** nothing found for this task’s records or routes; build from the card.

**Remaining:**

- Everything in the card. Outcome: Allow manager commentary and recommended completion conclusion within the retained source snapshot.

**Done when:** the card’s acceptance criteria pass on real code; `pnpm verify:task -- T115` has a recipe in `scripts/verify-task.mjs` and passes; `pnpm verify:affected` passes; `docs/evidence/T115/handoff.md` is appended; the ledger row is updated after review.

## T116 — Implement mandatory Red-area review and partner SRM clearance

`NOT_STARTED` · CORE · owner `fieldwork` · [task card](../../tasks/09-review/T116-partner-clearance.md)

**Requirements:** R005 APPROVER authority and sign-offs; R040 Green/Amber/Red stratification and required reviewers; R059 Partner review of Red areas and SRM; R079 All 11 lifecycle states and rework transitions.

**Depends on:** T115 (NOT_STARTED).

**Can start:** after T115 is DONE (the card requires DONE dependencies).

**Already in code:** nothing found for this task’s records or routes; build from the card.

**Remaining:**

- Everything in the card. Outcome: Require partner inspection/clearance records for every Red area and the current SRM.

**Done when:** the card’s acceptance criteria pass on real code; `pnpm verify:task -- T116` has a recipe in `scripts/verify-task.mjs` and passes; `pnpm verify:affected` passes; `docs/evidence/T116/handoff.md` is appended; the ledger row is updated after review.

## T117 — Verify the complete preparer-manager-partner rejection loop

`NOT_STARTED` · GATE · owner `testing` · [task card](../../tasks/09-review/T117-review-e2e.md)

**Requirements:** R003 PREPARER responsibilities and assignment limits; R004 REVIEWER responsibilities and boundaries; R005 APPROVER authority and sign-offs; R055 Preparer execution and submission; R056 Manager review comments and rework; R057 SRM automatically compiled after manager clearance; R059 Partner review of Red areas and SRM; R060 Bank/AR/AP/inventory/legal confirmations; R061 Critical confirmation blocks release and triggers holding letter; R079 All 11 lifecycle states and rework transitions.

**Depends on:** T116 (NOT_STARTED).

**Can start:** after T116 is DONE (the card requires DONE dependencies).

**Already in code:** nothing found for this task’s records or routes; build from the card.

**Remaining:**

- Everything in the card. Outcome: Run the full submission, notes, return, response, resubmit, manager and partner journey with separate identities.

**Done when:** the card’s acceptance criteria pass on real code; `pnpm verify:task -- T117` has a recipe in `scripts/verify-task.mjs` and passes; `pnpm verify:affected` passes; `docs/evidence/T117/handoff.md` is appended; the ledger row is updated after review.
