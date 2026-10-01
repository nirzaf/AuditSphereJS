# T054 — Implement lead stages and proposal-entry workflow

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 05-commercial — Commercial and acceptance onboarding |
| Owner area | `commercial` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Create phone/WhatsApp/email/web/referral source labels and a manual intake form.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T052 — Implement client legal profiles and organizational hierarchy](T052-client-directory.md)
- [T028 — Implement guarded engagement transitions and state history](../02-security/T028-workflow-kernel.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R007** — Lead capture channels; source lines `390-392`.
- **R010** — Brief quotation and 50/50 payment terms; source lines `399-401`.
- **R079** — All 11 lifecycle states and rework transitions; source lines `584-624`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/modules/commercial/; apps/web features/commercial; owned data; related contracts/tests

**Non-goals:** Use Governance acceptance and Practice billing facades; never add duplicate canonical approvals or ledgers.

**Interface:** Lead create/query and explicit stage commands.
**Screen or user interaction:** Lead pipeline and intake form.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Create phone/WhatsApp/email/web/referral source labels and a manual intake form.
- [ ] Validate minimum entity/primary-contact fields before proposal generation.
- [ ] Support search, assignment and rejected/closed lead outcomes with audit history.
- [ ] Add a rate-limited web lead form only through the approved public-ingress path; live channel APIs remain optional.

## Acceptance criteria and required tests

- [ ] **AC1:** Incomplete profile cannot advance to proposal generation.
- [ ] **AC2:** Duplicate submission is visible and handled without implicit entity merging.
- [ ] **AC3:** Public intake cannot assign privileges or engagement states.

Run relevant command/API/UI tests including role restrictions, state gates, versioning and duplicate requests.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T054
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
