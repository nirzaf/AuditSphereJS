# AuditSphereJS — Remaining-work agent pack (index)

**Status: CURRENT** · verified against `main` at `9b65b2b` (2026-10-08) for the STE Audit Management Tool specification v2.1 (`docs/requirements/CURRENT.md`).

**Purpose:** the inputs an AI coding agent needs to finish AuditSphereJS, scoped to work that is **not done**. Completed tasks are listed once in section 4 so agents skip them; nothing else in `docs/plan/` describes them.

## 1. Where each input lives

The repository already has most layers. This pack adds only what is missing or wrong, and points to the rest.

| # | Input | Authoritative file | This pack |
| --- | --- | --- | --- |
| 1 | Product brief / requirements | `docs/requirements/CURRENT.md` (byte-locked v2.1), coverage IDs in `docs/guides/06-requirements-traceability.md` | — (do not edit CURRENT) |
| 2 | Glossary | none existed | [01-glossary.md](01-glossary.md) |
| 3 | Architecture | `docs/guides/04-architecture-contract.md`, module READMEs `packages/server/src/modules/*/README.md` | Corrections in [04-agent-manual-corrections.md](04-agent-manual-corrections.md) (`docs/architecture/ARCHITECTURE.md` is stale) |
| 4 | Decisions | `docs/decisions/register.json` (D01–D12, all approved defaults), `docs/adr/0001-rustfs.md` | New open decisions DN-01…DN-13 in [02-decisions-needed.md](02-decisions-needed.md) |
| 5 | Data model | `prisma/schema.prisma`, `prisma/migrations/` | — (executable; read the model you change) |
| 6 | API contract | `packages/contracts/src/index.ts`, `packages/contracts/openapi.json`, `pnpm contracts:check` | — |
| 7 | Non-functional requirements | `docs/guides/12-performance-and-recovery-targets.md` (targets "approval pending") | Proposed numbers to approve in [03-nfr-targets.md](03-nfr-targets.md) |
| 8 | Agent manual | `AGENTS.md` (root), `docs/AGENTS.md` | Exact corrections in [04-agent-manual-corrections.md](04-agent-manual-corrections.md) |
| 9 | Test strategy / Definition of Done | `docs/guides/07-testing-and-invariants.md`, DoD in `AGENTS.md` | Additions for remaining work in [07-definition-of-done-additions.md](07-definition-of-done-additions.md) |
| 10 | Roadmap | `docs/guides/01-execution-order.md` (numeric order) | Dependency- and review-ordered plan in [05-roadmap.md](05-roadmap.md) |
| 11 | Stories | task cards `docs/tasks/<phase>/T###-*.md` | Verified deltas per remaining task in [stories/](stories/) |
| 12 | Spikes | none | [06-spikes.md](06-spikes.md) |
| 13 | Task prompt | none | [08-task-prompt.md](08-task-prompt.md) |
| + | Removal guideline | none | [09-removal-guideline.md](09-removal-guideline.md) |

## 2. Status at `9b65b2b`

| Ledger status | Tasks | After verification |
| --- | --- | --- |
| DONE | 53 | Excluded (section 4). |
| NOT_APPLICABLE | 4 | Excluded (T152–T155, optional Microsoft 365). |
| IN_REVIEW | 33 | Remaining. Most are waiting for independent review plus a short list of open items. |
| IN_PROGRESS | 1 | Remaining (T108). |
| NOT_STARTED | 80 | Remaining. Three of them (T045, T049, T079) were implemented on 2026-10-08 and belong in IN_REVIEW; T062 is partly implemented. |

**Remaining: 114 tasks**, plus six corrections found by verification ([stories/00-corrections.md](stories/00-corrections.md)) that must land inside tasks already marked IN_REVIEW.

## 3. What the verification found (confirmed by reading code)

1. **The review queue blocks everything.** Cards require DONE dependencies. With 33 tasks IN_REVIEW, only **T036** and **T043** have all dependencies DONE. T043 alone sits upstream of 123 tasks. Closing reviews in critical-path order (roadmap M0) unblocks more work than any new feature.
2. **Two FSLI vocabularies contradict each other** — hard-coded `fslis` (seven labels, no COGS or Inventory) versus approved taxonomy codes (STE-JS-01).
3. **Materiality ranges in code differ from CURRENT and D05** (PBT 3–10 %, total assets 0.5–2 %, net assets 1–5 %, SAD 1–5 %), two extra benchmarks are offered, and the manager ±5 % adjustment does not exist (STE-JS-02).
4. **Risk colours come from likelihood × magnitude**, not from balance versus TE/PM as D05 specifies (STE-JS-03).
5. **Staff can record client acceptance** of a proposal, contrary to T062 AC3 — and Key 1 reads that record (STE-JS-04).
6. **The ledger lags the code** by one day of merges (STE-JS-05).
7. **25 UI workspaces are session-only preparation forms** (`docs/evidence/UI-MODULES.md` table; its summary line still says 27 of 38). They include Lead pipeline, Entities & contacts and Billing & receivables, whose server side already exists. The removal guideline maps each one to the task that replaces it.
8. **The engagement lifecycle has nine unconditional `fail(...)` placeholders** in `packages/server/src/modules/governance/lifecycle.ts` (lines 226, 234, 235, 236, 246, 247, 250, 251, 255). Each is removed by the task that supplies its evidence (removal guideline §2).

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
