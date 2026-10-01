# C15-03 — Multi-line adjustment authoring

Status: DONE for the presentation boundary; the persisted adjusted snapshot and the differences register remain
Intent: Let a preparer compose a client adjustment journal with more than the two fixed lines the earlier workspace hard-coded, with per-line validation and a reviewed submission that cannot post an incomplete journal.
Source commit and files: `nirzaf/AuditSphere@64713e808d165b4ef91ea4be4979e0f98fb2def3`; `Application/Accounting/AdjustmentJournalService.cs` line-set handling.
Destination commit and files: `apps/web/src/line-editor.ts` (new), `apps/web/src/module-workspace.ts`, `apps/web/src/module-workspace.html`, `apps/web/src/module-catalog.ts`, `apps/web/src/styles.css`, `apps/web/src/line-editor.spec.ts`, `apps/web/src/module-workspace.spec.ts`.
Existing T-task links: T104, T105; C15-01, C15-02.
Dependencies: C15-01 adjustment journals and the existing `/adjustments` contract.
Scope: a repeating editor for journal lines with add/remove between two and 500 lines, required account code, optional FSLI, six-decimal debit/credit validation, `submitted`-driven error reveal, scope-keyed rebuild and a parent gate that blocks the reviewed submission while the lines are invalid.
Non-goals: Persisting drafts, adjustment plans, eligibility queries, the adjusted-balance snapshot and the differences register. No server contract change.
Current behavior and invariants: the editor holds presentation state only; the posted version is still bound by `expectedVersion` from the protected detail read, and the server re-validates balance, one-sided lines and separation of duties. Adding or removing a row never recreates the whole collection (tracked by control identity), and changing the engagement or screen rebuilds a clean line set.
Proposed contract / schema change: none; the workspace submits the existing `createAdjustmentJournalSchema` shape.
Permission and transaction boundary: unchanged; the submission still requires `ADJUSTMENT_MANAGE` inside the engagement scope.
Historical data / document impact: none; no record is created until the server accepts the command.
Implementation steps: extracted the repeating editor into `line-editor.ts`; made the workspace own the reviewed lines and reuse the existing idempotent command key; kept the journal-level fields in the existing draft form.
Relevant existing tests: `apps/web/src/module-workspace.spec.ts` (protected line review and version binding).
Minimal additional acceptance tests: `apps/web/src/line-editor.spec.ts` — minimum/maximum bounds, malformed money rejection, error reveal on submit, scope rebuild; `module-workspace.spec.ts` — three-line submission, incomplete-line refusal.
Commands actually executed: `pnpm exec tsc -p apps/web/tsconfig.spec.json --noEmit`; `pnpm exec tsc -p tsconfig.tests.json --noEmit`; `pnpm exec ng test web --watch=false` (18 passed); `pnpm exec ng build web`; `pnpm boundaries`; `pnpm contracts:check`.
Evidence and remaining blockers: 18 Angular component tests pass and the production web build succeeds. Remaining: the adjusted-balance snapshot that statements and materiality must bind to, the differences register, and server-side authoring of adjustment plans.
Rollback / forward-recovery impact: none; the change is presentation-only and the previous two-line shape can be restored without data impact.
Definition of done: met for the authoring boundary; persistence of the approved adjusted snapshot stays a separate task.