# T150 — Verify MSAL and Graph packages against the selected Angular/Node stack

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Current status | `DONE` — selected MSAL Browser and server Fetch paths match the Node 24 / Angular 22 stack; exact metadata and runtime acceptance are recorded in the [handoff](../../evidence/T150/handoff.md) |
| Execution class | `OPTIONAL` |
| Phase | 13-microsoft365 — Optional Microsoft 365 integration |
| Owner area | `microsoft365` |
| Completion unit | One focused, reviewable change and its evidence |

> Optional extension. Implement only when enabled and approved; otherwise retain an explicit `NOT_APPLICABLE` decision.

## Outcome

Read exact MSAL Angular/browser/node, Azure Identity and Graph package engines/peers from current official metadata.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T149 — Approve optional Microsoft 365 tenant integration scope](T149-m365-policy.md)
- [T005 — Review every direct dependency and reconcile version evidence](../00-readiness/T005-dependency-review.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R002** — Five connected business modules; source lines `68-129`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/platform/microsoft365/; selected web auth adapter; isolated integration tests

**Non-goals:** Only enabled approved integration scope; no production tenant mutations or blanket administrator consent.

Use existing owned records/contracts first. Add a migration or public endpoint only when the task steps require it; record the exact files in the handoff.

**Dependency focus:** MSAL Angular/browser/node; Azure Identity; Graph client/types as actually selected

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [x] Read exact MSAL Angular/browser/node, Azure Identity and Graph package engines/peers from current official metadata; record selected and rejected candidates in [T150 evidence](../../evidence/T150/handoff.md).
- [x] Keep the supported, direct `msal-browser` integration. It obtains public configuration asynchronously from the API before Router startup and uses explicit authenticated Fetch for the API; the Angular wrapper's published browser/rxjs peers are satisfied by the selected versions, but its synchronous application-instance provider adds no value to this adapter.
- [x] Run browser redirect/token adapter, API token-validation, Graph Fetch-adapter and selected-folder live storage checks on the pinned stack; no forced peer bypass.
- [x] Record exact registry versions and the `msal-browser` lockfile update. Do not install unused Node/Graph/Azure Identity SDKs.

## Acceptance criteria and required tests

- [x] **AC1:** The selected browser package has no published peer dependencies; runtime Node/Angular/RxJS pins pass install, engine/license review and dependency audit. The optional wrapper's exact peer range is satisfied by the selected browser/RxJS versions.
- [x] **AC2:** Existing signed-token tests accept the configured tenant/audience and reject wrong-tenant and wrong-audience tokens; the dated T019 browser evidence verifies the mapped acceptance Staff Fixture sign-in, and T156 records credentialed Graph storage acceptance.
- [x] **AC3:** No peer bypass or type cast is used. The wrapper's published support is Angular 22 and its required browser peer is `^5.24.0`; the selected browser is 5.24.0. Unused Node/Azure Identity/Graph SDK packages are not introduced.

See the handoff for exact npm metadata, licenses, lockfile integrity, no-vulnerability result, direct runtime smoke and credentialed nonproduction evidence. Graph mail and directory features remain disabled under T149.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T150
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
