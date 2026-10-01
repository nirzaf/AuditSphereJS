# T026 — Add concurrent-safe audit hash chains and checkpoints

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 02-security — Identity, authorization and application controls |
| Owner area | `audit` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Define canonical serialization, stable timestamps and per-firm/per-engagement chain ordering.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T025 — Implement append-only audit writes with database permissions](T025-audit-write.md)
- [T023 — Implement decimal, accounting-date and deterministic clock primitives](T023-money-clock.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R072** — Timestamped immutable audit events; source lines `552-552`.
- **R071** — Early/manual or timed permanent application read-only state; source lines `551-551`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/platform/audit/; audit migrations; verifier and integration tests

**Non-goals:** Do not mutate historical events or present hashing as protection from all privileged actors.

**Data or records:** audit_chain_heads; checkpoint metadata.

**Dependency focus:** Node crypto; canonical JSON policy without unnecessary framework

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Define canonical serialization, stable timestamps and per-firm/per-engagement chain ordering.
- [ ] Serialize chain-head advancement transactionally so concurrent events cannot share the same predecessor accidentally.
- [ ] Build a verifier and signed/locked checkpoint manifest interface; describe this as tamper-evident, not superuser-proof magic.
- [ ] Retain event format versions and test replay of older checkpoint formats.

## Acceptance criteria and required tests

- [ ] **AC1:** Concurrent inserts verify as one valid ordered chain for the chosen scope.
- [ ] **AC2:** Tampered or removed test events are detected.
- [ ] **AC3:** Independent checkpoint hash mismatch is surfaced without modifying the source events.

Test application-role denial and simultaneous writes against PostgreSQL; validate exact audit/checkpoint lineage.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T026
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
