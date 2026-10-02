# T016 CI and supply-chain handoff

**Review state:** IN_REVIEW (implementation and automated checks pass; repository branch rules remain an external gate)

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

## Remaining gate

Read-only GitHub inspection found no `main` branch protection and no repository rulesets. Therefore required PR checks and the prohibition on direct default-branch pushes are not proven. Do not mark T016 `DONE` until that repository policy is configured and verified. This has not been changed because doing so would alter the user's existing direct-push workflow.
