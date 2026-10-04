# T016 CI and supply-chain handoff

**Review state:** DONE under the user's direct-push policy (implementation and automated checks pass; branch protection is not configured)

**Code commit:** `ba46d5db5efc5bc1fff184b97c672208c4e761cb`

**Hosted run:** [Build and test #37006033506](https://github.com/nirzaf/AuditSphereJS/actions/runs/37006033506) — success, 2026-10-02.

**Generated public assets:** [verified build release](https://github.com/nirzaf/AuditSphereJS/releases/tag/build-ba46d5db5efc5bc1fff184b97c672208c4e761cb). It contains `web.tar.gz` and `web-SHA256SUMS`; the web archive SHA-256 is `2f39f5162da6f522bff8d8e0adb8924bdf94f208b121af4d2b764d62922a91fc`. This publishes static assets only; no application deployment occurred.

## Verification

- `pnpm verify:task -- T016` passed locally: lint/boundaries, server and Angular production builds, 67 server unit tests, 29 Angular tests, 16 PostgreSQL/RustFS integration tests, 9 browser tests, contract parity, audit, workflow policy assertions and all three pnpm denial fixtures. Two live-only browser scenarios are intentionally skipped without their explicit acceptance flag; the hosted workflow runs `verify:all` with `RUN_LIVE_E2E=1`.
- `pnpm verify:affected` passed: boundaries, type/build checks and 67 unit tests.
- `pnpm install --frozen-lockfile` passed under pnpm 12.8.1; no lockfile changes were produced.
- `pnpm contracts:check` passed; `pnpm audit --audit-level=moderate` reported no known vulnerabilities.
- `node scripts/verify-ci-workflow.mjs` passed. The hosted verify job uses read-only `contents`, `pnpm/setup@v3` with cache disabled, exact pnpm 12.8.1 and Node 24.21.0, and a frozen install. The only `contents: write` permission and `GH_TOKEN` are in the post-verification publisher, which is skipped for pull requests and non-main refs.
- `pnpm exec node scripts/verify-pnpm-install-policy.mjs` proved that an unapproved dependency build script, an incompatible peer and a lockfile mismatch each fail installation in isolated temporary workspaces.
- Hosted `verify:all`, contract check, audit, Linux compatibility build, Linux runtime smoke, artifact packaging/upload, and the gated asset publication all passed in run #37006033506.

The dependency/license/version inventory and recorded advisory review remain in [T005 evidence](../T005/). The lockfile and image identities are source-controlled; published web assets carry a SHA-256 manifest.

## Repository policy

Read-only GitHub inspection found no `main` branch protection and no repository rulesets. On 2026-10-02, the user explicitly chose to keep direct pushes. That instruction supersedes T016's planned no-direct-push policy for this repository. The branch-rule checklist was revised accordingly; no protection is claimed or configured. Required CI checks still run, and asset publication remains gated on successful verification.

## CI pipeline parallelization — 2026-10-04

The single-job `verify` workflow (9m49s wall time on recent runs) was split into five parallel read-only jobs: `static` (policy gates, lint, typecheck, contracts, audit), `unit` (vitest + Angular), `integration` (the 38 PostgreSQL/Testcontainers suites sharded into a 3-way fail-open matrix), `e2e` (compose infra, compiled services, Chromium, live Playwright suite with diagnostics artifact), and `image` (T035 PDF runtime gate, Linux image build/smoke, verified-build artifact packaging). `publish-web-assets` now needs all five jobs, so publication still happens only after every verification job succeeds on the same commit.

`scripts/verify-ci-workflow.mjs` was rewritten to assert the same security invariants across every job — read-only permissions, frozen-lockfile install, pinned pnpm 12.8.1 / Node 24.21.0 setup with `install: false` / `cache: false`, no dependency cache anywhere, no credentials outside the publisher — plus new structural checks: publication must wait for all five jobs, and every integration suite listed in `package.json test:integration` must appear in a CI shard and exist on disk, so shard lists cannot silently rot. The deliberate no-cache supply-chain policy is preserved (no pnpm/browser caches were introduced); the speedup comes from parallelism and per-job scoping of infra and Chromium installation only where needed. Runners are pinned to `ubuntu-24.04` to match the Chromium sandbox allowance ahead of the ubuntu-latest migration to 26.

Validated locally in the integration worktree: `node scripts/verify-ci-workflow.mjs` passes the rewritten invariants; `verify-pnpm-install-policy.mjs` passes; the workflow parses as YAML with the expected job/matrix structure. The first hosted run on main is the remaining acceptance evidence for actual wall-time savings.
