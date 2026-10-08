# AuditSphereJS — Corrections to the agent manual and architecture docs

**Status: PROPOSED.** Each item quotes the current text, says why it is wrong at `9b65b2b`, and gives the replacement. Apply them in one documentation change; no code changes.

## 1. `AGENTS.md` — read order

**Current (lines 7–12):** step 1 is `docs/IMPLEMENTATION-STATUS.md`.

**Why change.** It is a 45 KB chronological log whose header still reads "Implementation evidence — 2026-10-02"; an agent spends a large share of its context reading history.

**Replace step 1 with:**

```markdown
1. [docs/plan/00-index.md](docs/plan/00-index.md) — what is done (skip it), what remains, open decisions, and the story file for your task. `docs/IMPLEMENTATION-STATUS.md` is history; read it only for a specific dated entry.
```

and renumber; add after the task card:

```markdown
3. The task's entry in `docs/plan/stories/<phase>.md` — the verified delta to the card (what already exists, what is left, which decision blocks it).
```

## 2. `AGENTS.md` — stale facade trap

**Current (Traps, line 94):** "No `public.ts` facade exists yet, so reaching a sibling module requires creating that facade in the same change."

**Why change.** `packages/server/src/modules/commercial/public.ts` and `practice/public.ts` exist and are used (`governance/lifecycle.ts` imports `../practice/public.js`; `practice/invoices.ts` imports `../commercial/public.js`).

**Replace with:**

```markdown
- Cross-module access is permitted only through `../<module>/public.js` (`scripts/check-boundaries.mjs`). `commercial` and `practice` already have a `public.ts`; add exports there rather than importing implementation files. `fieldwork`, `governance` and `reporting` have none yet — create it in the same change that first needs it.
```

## 3. `AGENTS.md` — ledger freshness

**Add under "Traps":**

```markdown
- The execution ledger can lag the code. Before trusting a status, check `git log -- docs/evidence/<T###>` and the task's story entry. T045, T049 and T079 were implemented on 2026-10-08 while still listed NOT_STARTED.
```

(Remove this bullet once STE-JS-05 is merged.)

## 4. `AGENTS.md` — specification precedence over ported source

**Add under "Non-negotiable rules → Domain and data":**

```markdown
- Where a ported legacy calculator and docs/requirements/CURRENT.md or an approved decision disagree, CURRENT and the decision win. A differential "match" against the source is not acceptance (see docs/plan/stories/00-corrections.md, STE-JS-02 and STE-JS-03).
```

## 5. `docs/architecture/ARCHITECTURE.md` — stale content

**Current:** "RustFS holds immutable CSV bytes." and "Production identity, business lifecycle guards, portal, leases and realtime remain backlog items."

**Why change.** Evidence and generated documents are stored in SharePoint/OneDrive through Graph (`platform/graph-storage.ts`, T032 DONE); RustFS is the local/CI S3 fixture. Identity (T019), lifecycle kernel (T028), portal auth (T020), leases (T039) and realtime (T038) are DONE.

**Replace the file body with:**

```markdown
# Architecture

Authoritative contract: [guide 04](../guides/04-architecture-contract.md). Module ownership and facades: `packages/server/src/modules/*/README.md`.

- Processes: Nest 12 + Fastify 5 API, Angular 22 SPA (staff workspace and isolated client portal), Nest application-context BullMQ worker.
- PostgreSQL 18 (Prisma 7) holds all business truth: scope, lifecycle, documents' metadata and versions, TB data, audit chain, outbox and deadlines.
- Evidence and generated documents: SharePoint (durable) and OneDrive (working files) through Microsoft Graph behind `platform/storage.ts`. RustFS is the S3-compatible fixture for local development and CI only.
- Redis 8 (AOF, noeviction): queues and advisory leases; never authoritative.
- Identity: Entra ID for staff (MSAL), separate portal principals with single-use credentials and forced first reset.
```

## 6. Root `nestjs-fastify-angular-architecture.md`

**Why change.** A 70 KB "Production Architecture & AI-Agent-Friendly Implementation Plan v1.0" at the repository root reads like current authority. It is an edited copy of `docs/sources/architecture-original-reference.md` (differs only by the RustFS edits), and guide 04 states it supersedes parts of that plan. See the removal guideline §1 for the move; until then add as its first line:

```markdown
> **Historical plan.** Not implementation authority. Current architecture: docs/guides/04-architecture-contract.md. Preserved original: docs/sources/architecture-original-reference.md.
```

## 7. `docs/AGENTS.md`

**Why change.** Its two paragraphs duplicate the root `AGENTS.md` (the Microsoft 365 documentation rule is root line 88). Two agent files with overlapping rules drift. Fold any sentence not already in the root file into the root file, then delete `docs/AGENTS.md` (removal guideline §1).

## 8. Add `CLAUDE.md` for Claude Code

Claude Code reads `CLAUDE.md`, not `AGENTS.md`. Add a root `CLAUDE.md` containing only:

```markdown
@AGENTS.md
```

so Codex and Claude Code follow one file.

## 9. `.codex/config.toml`

**Current:** `cwd = "C:/Users/DELL/repos/AuditSphereJS"`.

**Why change.** An absolute path to one developer's machine; the Angular MCP server fails to start on any other checkout or in CI.

**Replace with** a relative working directory (`cwd = "."`) if the client resolves it from the project root, or remove `cwd` and document the requirement in `docs/architecture/angular-mcp.md`.
