# T017 — Freeze the executable compatibility baseline before domain work

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Current status | `DONE` |
| Execution class | `GATE` |
| Phase | 01-foundation — Workspace and executable foundation |
| Owner area | `gate` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

In the selected Node/container target, install every mandatory direct dependency selected in the library register with strict peers.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T016 — Create clean-install CI and supply-chain checks](T016-ci.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. The following domain tasks cannot begin until [the executable compatibility gate](T017-compatibility-smoke.md) passes. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R002** — Five connected business modules; source lines `68-129`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** Compatibility/proof scripts; evidence documents; fixes limited to failing prerequisite scope

**Non-goals:** Do not proceed on an unverified library or mask incompatibility using forced peers/suppressed tests.

Use existing owned records/contracts first. Add a migration or public endpoint only when the task steps require it; record the exact files in the handoff.

**Dependency focus:** Complete mandatory dependency set

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [x] In the selected Node/container target, install every mandatory direct dependency selected in the library register with strict peers.
- [x] Exercise Angular production build, compiled Nest DI, Fastify plugins, Prisma NUMERIC transaction, BullMQ Redis job, Socket.IO handshake and PDF/browser executable smoke.
- [x] Record exact versions, package integrity, operating-system dependencies and warnings; reject silent overrides and unsupported preview packages.
- [x] Commit the resolved lockfile and evidence; keep optional Microsoft/signing providers gated until their own credentialed tests.

## Acceptance criteria and required tests

- [x] **AC1:** Every mandatory compatibility row has a passing smoke or is an explicit production blocker.
- [x] **AC2:** Results include the actual command output and runtime versions.
- [x] **AC3:** A source-reviewed claim is not substituted for a run result.

Run every stated gate in the intended target; BLOCKED is the correct result when evidence is missing.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T017
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

Evidence: [hosted compatibility run](../../evidence/T017/hosted-run-2026-10-02.md) and [current-lockfile local recheck](../../evidence/T017/local-run-2026-10-04.md). Technical compatibility checks pass on the updated dependency lockfile. T016 is complete under the user's explicitly selected direct-push policy; branch protection is not configured and is not represented as a control.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
