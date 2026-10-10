# T062 — Dispatch proposals and record client acceptance of an exact version

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Current status | `IN_PROGRESS` (client-acceptance security correction; full dispatch pending) |
| Execution class | `CORE` |
| Phase | 05-commercial — Commercial and acceptance onboarding |
| Owner area | `commercial` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Partner-authorize the proposal before dispatch under the role policy.

## Required context and prerequisites

**2026-10-09 correction scope (D32):** the confirmed staff-acceptance defect may be corrected using the tested existing portal, contact, audit and receipt interfaces while their wider task reviews remain pending. This does not satisfy T061 comprehensive rendering or T062 notification dispatch. Full task acceptance retains those prerequisites. See [D32](../../decisions/D32-implementation-readiness.md).

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T061 — Implement the comprehensive proposal document](T061-proposal.md)
- [T053 — Implement contact roles and routing preferences](T053-contacts.md)
- [T037 — Implement role-routed notifications and auditable outbound dispatch](../03-platform/T037-notifications.md)
- [T027 — Persist idempotent operation outcomes in PostgreSQL](../02-security/T027-idempotency.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R009** — Role-based contact and communication routing; source lines `394-397`.
- **R012** — Client commercial acceptance key; source lines `409-412`.
- **R079** — All 11 lifecycle states and rework transitions; source lines `584-624`.
- **R081** — Preparer has no external communication or sign-off rights; source lines `61-61`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/modules/commercial/; apps/web features/commercial; owned data; related contracts/tests

**Non-goals:** Use Governance acceptance and Practice billing facades; never add duplicate canonical approvals or ledgers.

**Data or records:** commercial_approvals; proposal dispatch record.
**Interface:** Proposal dispatch; scoped client acceptance callback.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Partner-authorize the proposal before dispatch under the role policy.
- [ ] Persist delivery attempts and a secure client-acceptance flow tied to proposal ID/version/fee/terms digest.
  - Client-acceptance credential, exact displayed commercial terms, partner authorization and portal decision are implemented; automatic document/notification delivery attempts remain pending.
- [ ] Verify acceptance token scope, expiry and single-use behavior; separate acceptance from ordinary portal access.
- [ ] A revised fee or scope requires acceptance of the revised proposal, not reuse of an old key.

## Acceptance criteria and required tests

- [ ] **AC1:** Expired or wrong-client acceptance fails.
- [ ] **AC2:** Acceptance is bound to the actual dispatched terms.
- [ ] **AC3:** Preparer cannot send proposals or generate client acceptance on behalf of a client.

Run relevant command/API/UI tests including role restrictions, state gates, versioning and duplicate requests.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T062
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
