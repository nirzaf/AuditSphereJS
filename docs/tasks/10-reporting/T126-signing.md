# T126 — Implement approved partner signature and seal controls

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 10-reporting — Reporting and controlled release |
| Owner area | `reporting` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Implement the approved assurance level: visible signature/seal plus a verifiable certificate-backed signature when required.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T120 — Render correct opinion-specific report sections and partner preview](T120-report-basis.md)
- [T123 — Receive and verify signed management representation before freeze](T123-lor-return.md)
- [T004 — Approve signature, archival and engagement-type policies](../00-readiness/T004-records-decisions.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R016** — Partner authorization of letter signature/seal; source lines `421-421`.
- **R064** — Partner digital signature and firm seal; source lines `537-537`.
- **R065** — D1 report and audited financial statements; source lines `541-542`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/modules/reporting/; apps/web features/reporting; owned snapshots and worker processors; tests

**Non-goals:** Use Practice final-fee facade; no stale SRM release, silent re-signing or partial bundle exposure.

**Data or records:** signature_requests; signer identity; verification results.

**Dependency focus:** Approved signing provider/SDK only after its own compatibility gate

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** D08

## Implementation checklist

- [ ] Implement the approved assurance level: visible signature/seal plus a verifiable certificate-backed signature when required.
- [ ] Bind authorization to exact final artifact digest, partner identity and fresh authentication where policy requires.
- [ ] Keep signing keys in the approved key/provider boundary, never the browser or source tree.
- [ ] Verify produced signatures and retain verification evidence before marking a final artifact certified.

## Acceptance criteria and required tests

- [ ] **AC1:** PNG placement alone never passes a cryptographic-signature acceptance test.
- [ ] **AC2:** Changed PDF bytes invalidate the signature/approval link.
- [ ] **AC3:** Unauthorized signer or unavailable provider blocks certification.

Test version-bound gates, evidence/signature identity, failure recovery and portal/archival boundaries.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T126
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
