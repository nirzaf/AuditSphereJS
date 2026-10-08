# T133 — Apply and verify production object-version retention controls

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 11-archive — Archive, retention and inspection |
| Owner area | `documents` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Apply approved retention/legal-hold configuration to each required object version through a narrowly privileged worker.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T132 — Create complete archive manifests including working papers](T132-archive-manifest.md)
- [T006 — Select deployment targets, storage and external-provider boundaries](../00-readiness/T006-deployment-decisions.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R071** — Early/manual or timed permanent application read-only state; source lines `551-551`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/platform/documents and storage; apps/worker/ composition; metadata migrations; tests

**Non-goals:** No overwriting evidence versions, untrusted executable templates or public storage credentials.

Use existing owned records/contracts first. Add a migration or public endpoint only when the task steps require it; record the exact files in the handoff.

**Dependency focus:** Microsoft Graph-selected SharePoint archive repository and administrator-configured Microsoft Purview record control; verify the actual tenant configuration and tested principal behavior. The approved storage architecture does not require an S3 Object Lock provider.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** D09, D11, D31

## Implementation checklist

- [ ] Apply approved retention/legal-hold configuration to each required object version through a narrowly privileged worker.
- [ ] Distinguish governance/compliance retention from a reversible legal hold and application read-only; preserve approved retention dates.
- [ ] Verify actual provider lock responses/read-back, not an emulator-only mock.
- [ ] Record partial failures and resume only uncompleted object operations without changing frozen contents.

## Acceptance criteria and required tests

- [ ] **AC1:** Credentialed nonproduction provider tests prove deny-delete/overwrite behavior for protected versions.
- [ ] **AC2:** Partial provider failure leaves editing frozen and sealing incomplete.
- [ ] **AC3:** No task sets indefinite irreversible production retention without explicit approval.

Test real/emulated storage behavior, boundary failures and immutable hash/version references; provider-specific assurance requires real-provider evidence.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Object-retention actions may be irreversible. Test with approved disposable objects and short authorized retention; never promise rollback of compliance-mode locks.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T133
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
