# Blockers and pending work — index

**Status as of 2026-10-08.** Ledger counts from `docs/guides/13-execution-ledger.md`: 171 tasks in total — 53 DONE, 4 NOT_APPLICABLE, 37 IN_REVIEW, 1 IN_PROGRESS (T108), 76 NOT_STARTED. Remaining work: 114 tasks.

This index lists every item that is blocked, and what each block needs before work can continue. Each linked file gives the evidence, the owner, and the steps to unblock. Nothing here changes a ledger status. A task becomes DONE only after independent review, recorded in its handoff, and the owner updates the ledger.

## Blocks

| ID | Blocks | Kind | Who must act | File |
| :--- | :--- | :--- | :--- | :--- |
| B01 | 37 IN_REVIEW tasks; 76 NOT_STARTED tasks that wait on them; T108 | Independent review | A reviewer who did not implement the task; the owner assigns reviewers | [BLOCKER-01-independent-review.md](BLOCKER-01-independent-review.md) |
| B02 | Specific tasks and spike outputs (T140, T045, T133, T134, T138, SPK-01/02/03/05) | Owner decisions and professional acceptance | Repository owner; a qualified audit-methodology professional for the methodology defaults | [BLOCKER-02-owner-decisions.md](BLOCKER-02-owner-decisions.md) |
| B03 | STE-JS-04: staff can still record client acceptance of a proposal (T062 AC3); T062 itself | Engineering, after B02 decision | Engineering; owner confirms the expiry rule first | [BLOCKER-03-proposal-acceptance.md](BLOCKER-03-proposal-acceptance.md) |
| B04 | Seven unconditional `fail(...)` gates in `lifecycle.ts` for T106, T110, T113, T114, T118, T122, T126, T127–T129 | Engineering, depends on the owning tasks | Engineering, card by card | [BLOCKER-04-lifecycle-gates.md](BLOCKER-04-lifecycle-gates.md) |
| B05 | 25 session-only UI workspaces; the removal guideline the index refers to is not in the repository | Product decision, then engineering | Owner (guideline); engineering (persistence) | [BLOCKER-05-session-only-workspaces.md](BLOCKER-05-session-only-workspaces.md) |
| B06 | Live Microsoft 365 tenant checks, Cloudflare hosting, production inputs (T006), SPK-02 test-tenant proof, SPK-06 (needs T036) | External: sign-in, tenant access, production inputs | User signs in and supplies inputs; no credentials go through chat | [BLOCKER-06-external-tenant-and-hosting.md](BLOCKER-06-external-tenant-and-hosting.md) |
| B07 | Verification follow-ups that weaken evidence: a loose assertion, a stale differential record, timing flakes, and an open recipe-rule adoption | Engineering and owner | Engineering; owner for the recipe rule | [BLOCKER-07-verification-follow-ups.md](BLOCKER-07-verification-follow-ups.md) |

## Pending but not blocked

- **STE-JS-01 — FSLI choices on the Trial Balance mapping screen.** Done in code and committed on 2026-10-08. Its web spec passes (14/14, `pnpm test:web:leases`), the Angular production build passes, lint passes, and `pnpm verify:affected` passes (33 files, 176 tests). The 176 count covers the server-side suites; the web spec runs separately. Index finding 2 in `docs/00-index.md` is updated. It still needs independent review, as T049 and the other mapping tasks do.
- **STE-JS-03 — T087 risk colours.** Committed as `e645727` and pushed to `origin/main`. Verified by `pnpm lint`, `pnpm verify:affected` (33 files, 176 tests), and `pnpm verify:task -- T087`. T087 stays IN_REVIEW until B01 closes it. Open follow-ups are in B07.

## How the blocks relate

- B01 gates most of the remaining work: 76 NOT_STARTED tasks wait on IN_REVIEW tasks. Closing B01 is the largest single unblock.
- B02 items are decisions only the owner can make. They are small in effort but gate specific tasks.
- B03 needs the B02 expiry decision before it is built.
- B04 cannot be closed by removing the `fail(...)` calls. Each one comes out only when its owning task supplies the real check and its test.
- B05 needs a product guideline before engineering can choose between persisting each workspace and labelling it.
- B06 depends on the user. Nothing in B06 should be provisioned or changed without an explicit request.

## Rules for working on any block

1. Do not mark a task DONE. IN_REVIEW is the most an implementer may set; the owner updates the ledger after review.
2. Evidence is append-only under `docs/evidence/<T###>/`. Add a new section; never overwrite a prior result.
3. Do not edit `docs/requirements/CURRENT.md`.
4. Money is decimal (`Decimal6`), never JavaScript arithmetic.
5. Each task needs a `pnpm verify:task -- T###` recipe, and `pnpm verify:affected` must pass before a change is committed.
