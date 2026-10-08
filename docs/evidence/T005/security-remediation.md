# Dependency advisory remediation

The 2026-10-01 audit identified advisories in shell-quote, esbuild, CSV parsing, Vitest, Prisma CLI's deepmerge-ts and its unused MySQL driver. The original audit remains in advisories.json.

Upgrade direct tools to concurrently 10.0.5 (replaces its pinned vulnerable shell-quote), tsx 4.23.15, Vitest 4.1.11 (retain the Angular-supported 4.x runner), and csv-parse 7.0.3. All selected versions have published compatible engines and licenses.

Keep stable Prisma CLI/client/adapter 7.10.0 rather than switching to the 8 RC. Explicit parent-scoped overrides select deepmerge-ts 8.0.2 for @prisma/config 7.10.0 and mysql2 3.24.5 for Prisma CLI 7.10.0. Prisma's config dynamically imports the deepmerge function; verify config loading, generation, migrations, compiled runtime and PostgreSQL integration after changing it. No MySQL application adapter is used. These overrides are visible in pnpm-workspace.yaml and require continued review when Prisma changes.

This is an advisory database check at one date, not a guarantee of absence of vulnerabilities. A fresh audit and rerun of affected verification must pass before claiming remediation.

## CI audit follow-up (2026-10-08)

GitHub Actions exposed a new advisory through the development command runner: `concurrently@10.0.5` resolves `shell-quote@1.9.0`, affected by GHSA-pqg4-j6r4-53mv. npm registry metadata for `shell-quote@1.12.0` reports MIT, Node `>=0.4`, and integrity `sha512-PcByqNyT/38F2kDNi006HAMRJaULuBzq/FOsw3qdZvX/GA9W/jamDaRskgHjubHiftXK5sIFxLNkvrXUwcof6Q==`. A scoped `concurrently>shell-quote` override selects 1.12.0; this avoids changing the direct runner version. Final `pnpm audit --audit-level=moderate`, frozen install, install-denial checks, and `pnpm verify:affected` results are to be appended after they run.

Verification completed on 2026-10-08:

- `pnpm install --lockfile-only`: exit 0; lockfile policy passed for 1,072 entries.
- `pnpm install --frozen-lockfile`: exit 0; exact lockfile installed.
- `pnpm why shell-quote`: only `shell-quote@1.12.0` under `concurrently@10.0.5`.
- `pnpm audit --audit-level=moderate`: exit 0; no known vulnerabilities.
- `pnpm exec node scripts/verify-pnpm-install-policy.mjs`: exit 0; all three denial paths rejected as expected.
- `pnpm verify:affected`: exit 0; 33 files / 176 tests passed.

The package is a tightly scoped transitive override; no direct dependency or runtime code changed. The hosted run before this override correctly failed at `pnpm audit`; hosted verification of the corrected lockfile is pending the next push.
