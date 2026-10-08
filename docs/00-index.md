# AuditSphereJS — Remaining-work agent pack (index)

**Status: CURRENT** · verified against `main` at `9b65b2b` (2026-10-08); sections 2 and 3 updated on 2026-10-08 for the STE Audit Management Tool specification v2.1 (`docs/requirements/CURRENT.md`).

**Purpose:** the inputs an AI coding agent needs to finish AuditSphereJS, scoped to work that is **not done**. Completed tasks are listed once in section 4 so agents skip them; nothing else in `docs/plan/` describes them.

## 1. Where each input lives

The repository already has most layers. This pack adds only what is missing or wrong, and points to the rest.

| # | Input | Authoritative file | This pack |
| --- | --- | --- | --- |
| 1 | Product brief / requirements | `docs/requirements/CURRENT.md` (byte-locked v2.1), coverage IDs in `docs/guides/06-requirements-traceability.md` | — (do not edit CURRENT) |
| 2 | Glossary | none existed | [01-glossary.md](01-glossary.md) |
| 3 | Architecture | `docs/guides/04-architecture-contract.md`, module READMEs `packages/server/src/modules/*/README.md` | Corrections applied in `653fdcb` (pack file removed) (`docs/architecture/ARCHITECTURE.md` is stale) |
| 4 | Decisions | `docs/decisions/register.json` (D01–D12, all approved defaults), `docs/adr/0001-rustfs.md` | New open decisions DN-01…DN-13 in [02-decisions-needed.md](02-decisions-needed.md) |
| 5 | Data model | `prisma/schema.prisma`, `prisma/migrations/` | — (executable; read the model you change) |
| 6 | API contract | `packages/contracts/src/index.ts`, `packages/contracts/openapi.json`, `pnpm contracts:check` | — |
| 7 | Non-functional requirements | `docs/guides/12-performance-and-recovery-targets.md` (targets "approval pending") | Proposed numbers to approve in [03-nfr-targets.md](03-nfr-targets.md) |
| 8 | Agent manual | `AGENTS.md` (root), `docs/AGENTS.md` | Exact corrections applied in `653fdcb` (pack file removed) |
| 9 | Test strategy / Definition of Done | `docs/guides/07-testing-and-invariants.md`, DoD in `AGENTS.md` | Additions for remaining work in [07-definition-of-done-additions.md](07-definition-of-done-additions.md) |
| 10 | Roadmap | `docs/guides/01-execution-order.md` (numeric order) | Dependency- and review-ordered plan in [05-roadmap.md](05-roadmap.md) |
| 11 | Stories | task cards `docs/tasks/<phase>/T###-*.md` | Verified deltas per remaining task in [stories/](stories/) |
| 12 | Spikes | none | [06-spikes.md](06-spikes.md) |
| 13 | Task prompt | none | Superseded: `AGENTS.md` and `CLAUDE.md` are the session entry point (pack file removed) |
| + | Removal guideline | none | [09-removal-guideline.md](09-removal-guideline.md) |

## 2. Status

Status at `9b65b2b` (the baseline this index was written against) and as updated on 2026-10-08 (the current ledger, read from `docs/guides/13-execution-ledger.md`):

| Ledger status | Tasks at `9b65b2b` | Tasks on 2026-10-08 | Note |
| --- | --- | --- | --- |
| DONE | 53 | 53 | Unchanged. Excluded (section 4). |
| NOT_APPLICABLE | 4 | 4 | T152–T155, optional Microsoft 365. |
| IN_REVIEW | 33 | 37 | +4: T045, T049 and T079 (moved from NOT_STARTED, as the baseline already noted) and T140 (implemented on 2026-10-08). |
| IN_PROGRESS | 1 | 1 | T108 (its review-notes module moved to fieldwork under D21). |
| NOT_STARTED | 80 | 76 | T140 left this group. |

**Remaining: 114 tasks** (every status except DONE and NOT_APPLICABLE). Under the cards' own rule that every dependency must be DONE, only T140 could start on 2026-10-08. The other 76 NOT_STARTED tasks wait on IN_REVIEW dependencies, which need independent review. The owner decided on 2026-10-08 to hold dependent tasks until their dependencies close.

Work done on 2026-10-08, recorded here so that agents skip it:

- Owner decisions DN-01 to DN-13 are all resolved, recorded as D13 to D25 in `docs/decisions/register.json`. DN-08 to DN-12 were implemented: review notes moved to fieldwork, the statement split follows the approved taxonomy, systematic sampling is in place, firm-level Practice reads are on `/api/v1/firm/practice`, and the contract-contribution label is attached.
- Verification recipes were added for the IN_REVIEW tasks that lacked one (T046, T051, T060, T080, T087, T088, T098–T101, T103, T104, T108), and T085, T086, T089 and T140 have recipes.
- Spikes SPK-01 to SPK-06 have recorded outputs in `docs/evidence/SPK-0x/`. SPK-06 is recorded as not run.
- The UI summary in `docs/evidence/UI-MODULES.md` was recounted from its table: 39 workspaces, 14 connected and 25 session-only.
- Blockers B01–B07 were rechecked on 2026-10-08: D26–D29 record delegated implementation defaults; `docs/09-removal-guideline.md` maps all 25 session-only workspaces; B07's test and differential evidence follow-ups were fixed; nonproduction SharePoint/OneDrive acceptance passed 2/2. No task status was changed.

## 3. What the verification found, and where each finding stands

1. **The review queue blocks everything.** Open. Thirty-seven tasks are IN_REVIEW and need an independent reviewer. An agent cannot close this, and the ledger must not be marked DONE by the implementer.
2. **Two FSLI vocabularies contradicted each other.** Partly corrected. The mapping contract no longer restricts codes to the seven labels; the approved taxonomy decides validity (`approveImportMapping` refuses codes outside it), and the statement split follows the taxonomy's `statementSection` (D22). Corrected on 2026-10-08 (STE-JS-01): the mapping screen in `apps/web/src/workspace.ts` offers the lines of the newest approved taxonomy version, the same version `approveImportMapping` checks when none is named. The seven labels are no longer offered. Covered by `apps/web/src/workspace.spec.ts` (approved-only, newest version, taxonomy order).
3. **Materiality ranges in code differed from CURRENT and D05.** Resolved by DN-07 / D19 (commit `d3e399b`): the four CURRENT benchmarks and ranges, profit before tax normalized only through recorded adjustments, and manager rounding limited to ±5 %.
4. **Risk colours came from likelihood times magnitude, not from balance against TE and PM.** Corrected in code (STE-JS-03, 2026-10-08; see `docs/evidence/T087/handoff.md`). The colour follows CURRENT section 4 on the absolute published balance against the approved TE and PM, with significant or fraud-risk forced RED (D05). T087 remains IN_REVIEW until an independent reviewer accepts the change.
5. **Staff can record client acceptance of a proposal, contrary to T062 AC3.** Open (STE-JS-04). `acceptProposal` still accepts a `COMMERCIAL_MANAGE` actor, and Key 1 reads that record. The correction needs the portal acceptance path designed in SPK-03, which is not built. Removing the staff path without it would make Key 1 unreachable, so it was not removed in this pass.
6. **The ledger lags the code.** Resolved for the cited tasks: T045, T049 and T079 are IN_REVIEW in the ledger, and T140 was added on 2026-10-08.
7. **Session-only workspaces.** The planning gap is resolved: `docs/09-removal-guideline.md` maps all 25 preparation forms to owning tasks and their completion boundaries. The 25 screens remain session-only until those server-backed tasks, tests and review are complete (`docs/evidence/UI-MODULES.md`).
8. **Placeholder gates in the lifecycle.** Open. Unconditional `fail(...)` calls remain in `packages/server/src/modules/governance/lifecycle.ts` for workprogram completion (T106), the SRM (T110), critical confirmations (T117) and the report opinion (T118). Each is removed by the task that supplies its evidence; those tasks are not done.

## 4. Completed — do not re-implement

These are DONE or NOT_APPLICABLE in `docs/guides/13-execution-ledger.md`. Each has a ledger evidence note; most also have `docs/evidence/<ID>/` and a recipe in `scripts/verify-task.mjs` (T005, T010 and T011 have no recipe; T007, T008, T010–T012, T014, T015 and T066 have no evidence folder). Agents may read their code as patterns; they must not reopen them except through a correction story.

| ID | Phase | Status | Task |
| --- | --- | --- | --- |
| T001 | 00-readiness | DONE | Preserve the requirements and inspect the implementation starting point |
| T002 | 00-readiness | DONE | Resolve workflow and billing ambiguities without changing the source silently |
| T003 | 00-readiness | DONE | Approve numerical, sampling and professional-judgment specifications |
| T004 | 00-readiness | DONE | Approve signature, archival and engagement-type policies |
| T005 | 00-readiness | DONE | Review every direct dependency and reconcile version evidence |
| T006 | 00-readiness | DONE | Select deployment targets, storage and external-provider boundaries |
| T007 | 01-foundation | DONE | Create a minimal pnpm workspace with explicit package ownership |
| T008 | 01-foundation | DONE | Make backend ESM builds and decorator injection testable |
| T009 | 01-foundation | DONE | Bootstrap NestJS with the matched Fastify adapter |
| T010 | 01-foundation | DONE | Create the Angular standalone shell and accessible layouts |
| T011 | 01-foundation | DONE | Configure Prisma and PostgreSQL with explicit pool limits |
| T012 | 01-foundation | DONE | Add typed configuration and secret-safe environment separation |
| T013 | 01-foundation | DONE | Provision reproducible local data services and test containers |
| T014 | 01-foundation | DONE | Wire minimal backend, Angular and browser test runners |
| T015 | 01-foundation | DONE | Expose predictable agent verification and dependency-boundary commands |
| T016 | 01-foundation | DONE | Create clean-install CI and supply-chain checks |
| T017 | 01-foundation | DONE | Freeze the executable compatibility baseline before domain work |
| T018 | 02-security | DONE | Implement firm, client and engagement ownership constraints |
| T019 | 02-security | DONE | Implement the selected internal identity adapter and session boundary |
| T020 | 02-security | DONE | Implement separate portal authentication and first-reset gate |
| T021 | 02-security | DONE | Create explicit permission and segregation-of-duties checks |
| T022 | 02-security | DONE | Implement canonical runtime contracts and generated browser types |
| T023 | 02-security | DONE | Implement decimal, accounting-date and deterministic clock primitives |
| T024 | 02-security | DONE | Share one transaction across module-owned business operations |
| T025 | 02-security | DONE | Implement append-only audit writes with database permissions |
| T026 | 02-security | DONE | Add concurrent-safe audit hash chains and checkpoints |
| T027 | 02-security | DONE | Persist idempotent operation outcomes in PostgreSQL |
| T028 | 02-security | DONE | Implement guarded engagement transitions and state history |
| T029 | 02-security | DONE | Add CSRF, CORS, proxy and request-abuse controls |
| T030 | 03-platform | DONE | Implement a durable outbox with operation reconciliation |
| T031 | 03-platform | DONE | Configure BullMQ workers for reliable retries and shutdown |
| T032 | 03-platform | DONE | Implement private SharePoint/OneDrive storage and immutable document versions |
| T033 | 03-platform | DONE | Implement bounded upload initiation and finalize-time authorization |
| T034 | 03-platform | DONE | Implement scoped document downloads and delivery receipts |
| T035 | 03-platform | DONE | Prove a constrained HTML-to-PDF worker on the target image |
| T037 | 03-platform | DONE | Implement role-routed notifications and auditable outbound dispatch |
| T038 | 03-platform | DONE | Implement authenticated Socket.IO rooms and safe reconnects |
| T039 | 03-platform | DONE | Implement owner-safe advisory edit leases |
| T040 | 03-platform | DONE | Implement durable deadline scanning and maintenance claims |
| T041 | 03-platform | DONE | Add operational metrics, redaction and dependency health |
| T042 | 04-tb-proof | DONE | Build deterministic TB fixtures and a test-only engagement seed |
| T066 | 06-billing-portal | DONE | Create the firm chart of accounts and accounting-period controls |
| T067 | 06-billing-portal | DONE | Implement draft journals and balanced posting transactions |
| T068 | 06-billing-portal | DONE | Implement journal reversal and controlled period close |
| T069 | 06-billing-portal | DONE | Implement canonical invoices, numbering and billing ownership |
| T139 | 12-practice | DONE | Implement effective-dated staff charge-out rates |
| T144 | 12-practice | DONE | Record the required operating expense and withdrawal categories |
| T145 | 12-practice | DONE | Implement the firm trial balance with opening and period movement |
| T146 | 12-practice | DONE | Implement monthly firm Profit and Loss reporting |
| T149 | 13-microsoft365 | DONE | Approve optional Microsoft 365 tenant integration scope |
| T150 | 13-microsoft365 | DONE | Verify MSAL and Graph packages against the selected Angular/Node stack |
| T151 | 13-microsoft365 | DONE | Implement internal Entra single sign-on and local role mapping |
| T152 | 13-microsoft365 | NOT_APPLICABLE | Implement Graph mail with bounded permissions and unknown-outcome handling |
| T153 | 13-microsoft365 | NOT_APPLICABLE | Implement staff lookup or synchronization without privilege escalation |
| T154 | 13-microsoft365 | NOT_APPLICABLE | Implement optional SharePoint workspace provisioning behind storage boundaries |
| T155 | 13-microsoft365 | NOT_APPLICABLE | Implement optional Graph change notifications and reconciliation |
| T156 | 13-microsoft365 | DONE | Run tenant-consent, throttling and revocation integration tests |
