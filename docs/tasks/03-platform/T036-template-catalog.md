# T036 — Build versioned document templates and approved assets

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 03-platform — Durable jobs, documents and realtime |
| Owner area | `documents` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Store approved template versions, allowed variables, engagement types and activation history.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T035 — Prove a constrained HTML-to-PDF worker on the target image](T035-pdf-runtime.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R010** — Brief quotation and 50/50 payment terms; source lines `399-401`.
- **R011** — Comprehensive proposal with all five content blocks; source lines `402-407`.
- **R014** — Engagement-type letter templates; source lines `415-419`.
- **R016** — Partner authorization of letter signature/seal; source lines `421-421`.
- **R064** — Partner digital signature and firm seal; source lines `537-537`.
- **R065** — D1 report and audited financial statements; source lines `541-542`.
- **R066** — D2 deficiency-impact-recommendation management letter; source lines `543-543`.
- **R067** — D3 LOR export, management signing and re-upload; source lines `544-544`.
- **R068** — D4 correspondence and confirmation trail; source lines `545-545`.
- **R069** — D5 remaining 50% fee note; source lines `546-546`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/platform/documents and storage; apps/worker/ composition; metadata migrations; tests

**Non-goals:** No overwriting evidence versions, untrusted executable templates or public storage credentials.

**Data or records:** document_templates; template_versions; approved_assets.
**Screen or user interaction:** Template preview and authorized version management.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Store approved template versions, allowed variables, engagement types and activation history.
- [ ] Bind firm profile, registration, credentials, team CVs, signature appearance and seal assets to explicit versions.
- [ ] Separate draft preview from partner-authorized generation; reject arbitrary template code from ordinary users.
- [ ] Add a controlled preview page and rendered golden fixtures.

## Acceptance criteria and required tests

- [ ] **AC1:** Updating a template cannot change a previously generated document.
- [ ] **AC2:** Missing required template variables fail with useful errors.
- [ ] **AC3:** Unapproved signature assets are not accessible to preparers.

Test real/emulated storage behavior, boundary failures and immutable hash/version references; provider-specific assurance requires real-provider evidence.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T036
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
