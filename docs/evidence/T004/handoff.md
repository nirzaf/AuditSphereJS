# T004 handoff — signature, archive and engagement-type defaults

## Identity

Task ID: T004  
Requirement IDs: R014, R016, R062–R065, R067, R070–R072  
Implementing commit/branch: recorded after push  
Status: DONE (approved implementation defaults and specification evidence)

## Intended and delivered outcome

Recorded D03, D08, D09 and D10 defaults for signature appearance, LOR timing, archive assembly/read-only boundary, object retention, legal hold, addenda and reports by engagement type. The preserved v2.1 requirements are unchanged. No production archive lock, object-retention rule, deletion, Graph/provider operation or application behavior was executed.

## Files and contracts

- `docs/decisions/T004-records-defaults.md` — records/reporting policy with explicit limits and production acceptance gates.
- `docs/decisions/T004-records-golden.json` — UTC deadline vector, separated control states and reporting paths.
- `docs/decisions/register.json`, `docs/decisions/D08-image-signature.md`, `docs/guides/05-decisions-and-source-conflicts.md` — approval references and current policy description.
- `docs/tasks/00-readiness/T004-records-decisions.md`, `docs/guides/13-execution-ledger.md` — task and evidence status.
- `scripts/verify-task.mjs`, `scripts/verify-records-policy.mjs` — runnable records-policy checks.

No dependency, schema, generated-code or provider-configuration changes.

## Decisions

D03, D08, D09 and D10 are approved implementation defaults under user delegation. D08 additionally reflects the user's direct instruction to use image signature only and not Microsoft 365 eSignature. This does not establish cryptographic PDF signature, statutory compliance, a jurisdictional records schedule or independent professional review.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T004` | decision register, unchanged requirements, UTC deadline and reporting/control fixture | PASS, exit 0 | records vectors and task recipe passed |
| `pnpm lint` | repository ESLint and module-boundary checks | PASS, exit 0 | local checkout |
| `git diff --check` | task documentation, policy and verifier | PASS, exit 0 (expected CRLF normalization warnings) | local checkout |

## Acceptance criteria

- AC1: Countdown, application read-only, object-version retention and legal hold are independent controls; post-archive changes use linked addenda and never overwrite archived bytes.
- AC2: PNG and seal artwork are explicitly visual marks only; application copy may not call the PDF cryptographically signed.
- AC3: Statutory, internal-audit and AUP outputs have distinct templates and opinion/assurance labels.

## Limitations and next task

No live Microsoft 365 retention setting, tenant site, storage provider version, production lock, or legal-hold operation was tested. T126–T138 implement reporting/archive behavior; T133 validates provider retention; T168 captures role-based and independent professional/legal acceptance before any release. Those claims remain open.

Reviewer: Codex (implementation evidence review)  
Review result: records-policy fixture and task verifier passed  
Open blockers: downstream implementation and professional/legal UAT  
Next eligible task by dependency order: T006 (T005 is already DONE).
