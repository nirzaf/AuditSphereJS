# SPK-04 — Load-test harness

Status: recommendation complete. The proposed harness is not written; the scenarios below are the outline the owner approves first.
Time box: 1 day. Feeds: T159 and `03-nfr-targets.md` (the file the pack index names is not in the repository; the p95 targets are therefore not yet approved).

## Question and answer

Question: which load tool fits the rule "no new package without compatibility and library-register review": an external binary (k6, run outside the pnpm workspace), or a Node harness extending `scripts/benchmark.ts`? How are authenticated staff and portal sessions created for the test without real tenant credentials?

Answer: extend `scripts/benchmark.ts` with a Node HTTP scenario runner that uses the built-in `fetch`. It adds no package, so no new compatibility or library-register entry is needed. Staff and portal sessions come from the test seed, which runs only when `NODE_ENV=test` and never touches tenant credentials.

## Facts from the repository

- `scripts/benchmark.ts` measures the CSV parser in process for 5k, 25k and 50k rows and prints one JSON line per size (`parseMs`, `heapMB`). It is the existing benchmark entry point.
- `tests/factories/tb-engagement-seed.ts` is test-only and throws unless `NODE_ENV=test`; it seeds one synthetic engagement with its grants.
- Staff requests are authorized by the internal identity adapter (T019). Portal requests use portal sessions (T020). Neither needs a tenant credential in a test environment.
- The compatibility and library-register guides (02, 03) require a review entry for every new package. A k6 binary outside the workspace would be a new tool to review, install and version.

## Recommendation

1. Extend `scripts/benchmark.ts`: keep the parser measurements, and add an HTTP scenario runner that calls the running API with `fetch`, with a fixed concurrency and duration and per-request timings.
2. Session creation: a `scripts/` helper that runs only when `NODE_ENV=test` and the API runs against the seeded local database. It seeds the synthetic engagement, issues staff and portal sessions through the existing identity and portal code paths, and prints nothing secret. It never reads a tenant credential.
3. Results: append each run to `docs/benchmarks-local.json` as new history. Never overwrite a prior run, and never reuse a run on a new build (AGENTS.md).
4. Review entries needed: none, because no package is added. If the owner later prefers k6, the entries are a compatibility-matrix row and a library-register row, and the binary is run outside the pnpm workspace.

## Scenario outline (for the owner to approve with the p95 targets)

| Scenario | Route | Notes |
| :--- | :--- | :--- |
| Staff reads the TB summary | `GET /api/v1/engagements/:engagementId/imports/:id/summary` | Finalized import in the seed |
| Staff lists materiality | `GET /api/v1/engagements/:engagementId/materiality` | Approved assessment in the seed |
| Portal reads its own proposal | `GET` portal proposal (after T062) | Blocked until the T062 portal path exists |
| Practice firm trial balance | `GET /api/v1/firm/practice/reports/trial-balance` | Firm-wide grant in the seed (DN-11) |
| Time entry save | `POST …/practice/time-entries` | Idempotent; each request carries its own key |

Concurrency and duration are parameters, not fixed values, until the owner approves the p95 targets.

## Not decided here

- The p95 targets and the concurrency levels (owner, in `03-nfr-targets.md`, which is not in the repository).
- Whether a k6 run is ever wanted (owner).
