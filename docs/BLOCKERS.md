# Blockers and pending work — index

**Status rechecked 2026-10-08.** Ledger counts remain 171 tasks — 53 DONE, 4 NOT_APPLICABLE, 37 IN_REVIEW, 1 IN_PROGRESS (T108), 76 NOT_STARTED. Remaining work: 114 tasks. B02 rows T140/SPK-01/SPK-03/DoD and the B05 planning map have been addressed in this pass; B07 engineering follow-ups are fixed and reverified. B01, B03 implementation, B04, most B05 persistence, parts of B06 and SPK-05/SPK-06 remain gated below.

This index lists every item that is blocked, and what each block needs before work can continue. Each linked file gives the evidence, the owner, and the steps to unblock. Nothing here changes a ledger status. A task becomes DONE only after independent review, recorded in its handoff, and the owner updates the ledger.

## Blocks

| ID | Blocks | Kind | Who must act | File |
| :--- | :--- | :--- | :--- | :--- |
| B01 | 37 IN_REVIEW tasks; 76 NOT_STARTED tasks that wait on them; T108 | Independent review | A reviewer who did not implement the task; the owner assigns reviewers | [BLOCKER-01-independent-review.md](BLOCKER-01-independent-review.md) |
| B02 | Remaining decisions and professional acceptance (SPK-02/05/06; T045 final target measurement) | Partly resolved; release and dependency gates remain | Qualified records/methodology reviewers; task owner for edge review | [BLOCKER-02-owner-decisions.md](BLOCKER-02-owner-decisions.md) |
| B03 | STE-JS-04 / T062 staff acceptance path | Expiry decision recorded; implementation awaits T061 and T053 dependencies | Engineering after prerequisites are accepted | [BLOCKER-03-proposal-acceptance.md](BLOCKER-03-proposal-acceptance.md) |
| B04 | Eight unconditional lifecycle evidence gates in `lifecycle.ts` | Engineering, tied to owning evidence tasks | Task owners after prerequisite review | [BLOCKER-04-lifecycle-gates.md](BLOCKER-04-lifecycle-gates.md) |
| B05 | 25 session-only UI workspaces | Planning map exists; persistence remains in owning tasks | Engineering by task; keep preparation labels | [BLOCKER-05-session-only-workspaces.md](BLOCKER-05-session-only-workspaces.md) |
| B06 | Production hosting/region/recovery; archive retention assurance; T036 asset-folder Graph acceptance | Nonproduction provider check reverified; production not requested | User/records owner only if production or retention proof is requested | [BLOCKER-06-external-tenant-and-hosting.md](BLOCKER-06-external-tenant-and-hosting.md) |
| B07 | Verification evidence precision, CI suite coverage and audit follow-ups | Engineering fixes and local reruns complete; hosted run is the final check; independent review still required for T087 | Engineering; independent reviewer under B01 | [BLOCKER-07-verification-follow-ups.md](BLOCKER-07-verification-follow-ups.md) |

## Pending but not blocked

- **STE-JS-01 — FSLI choices on the Trial Balance mapping screen.** Done in code and committed on 2026-10-08. Its web spec passes (14/14, `pnpm test:web:leases`), the Angular production build passes, lint passes, and `pnpm verify:affected` passes (33 files, 176 tests). The 176 count covers the server-side suites; the web spec runs separately. Index finding 2 in `docs/00-index.md` is updated. It still needs independent review, as T049 and the other mapping tasks do.
- **STE-JS-03 — T087 risk colours.** Committed as `e645727` and pushed to `origin/main`. This pass tightened its invalidation assertion and differential reporting; T087 stays IN_REVIEW until B01 closes it.

## How the blocks relate

- B01 gates most of the remaining work: 76 NOT_STARTED tasks wait on IN_REVIEW tasks. Closing B01 is the largest single unblock.
- B02 recommendations D26–D29 are recorded under the user's existing delegation for implementation defaults. Professional acceptance, target-environment proof, 142 dependency-edge review and archive retention period remain open.
- B03's expiry choice is settled by D28, but T062 remains gated by T061 (NOT_STARTED) and T053 (IN_REVIEW); do not build around those dependencies.
- B04 cannot be closed by removing the `fail(...)` calls. Each one comes out only when its owning task supplies the real check and its test.
- B05's workspace/task guideline is now present at `docs/09-removal-guideline.md`; the 25 views remain preparation-only until their tasks deliver and pass.
- B06 has no production deployment scope under T006; do not create hosting or change tenant configuration to close it.

## Rules for working on any block

1. Do not mark a task DONE. IN_REVIEW is the most an implementer may set; the owner updates the ledger after review.
2. Evidence is append-only under `docs/evidence/<T###>/`. Add a new section; never overwrite a prior result.
3. Do not edit `docs/requirements/CURRENT.md`.
4. Money is decimal (`Decimal6`), never JavaScript arithmetic.
5. Each task needs a `pnpm verify:task -- T###` recipe, and `pnpm verify:affected` must pass before a change is committed.
