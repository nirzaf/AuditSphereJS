# Dependency advisory remediation

The 2026-10-01 audit identified advisories in shell-quote, esbuild, CSV parsing, Vitest, Prisma CLI's deepmerge-ts and its unused MySQL driver. The original audit remains in advisories.json.

Upgrade direct tools to concurrently 10.0.5 (replaces its pinned vulnerable shell-quote), tsx 4.23.15, Vitest 4.1.11 (retain the Angular-supported 4.x runner), and csv-parse 7.0.3. All selected versions have published compatible engines and licenses.

Keep stable Prisma CLI/client/adapter 7.10.0 rather than switching to the 8 RC. Explicit parent-scoped overrides select deepmerge-ts 8.0.2 for @prisma/config 7.10.0 and mysql2 3.24.5 for Prisma CLI 7.10.0. Prisma's config dynamically imports the deepmerge function; verify config loading, generation, migrations, compiled runtime and PostgreSQL integration after changing it. No MySQL application adapter is used. These overrides are visible in pnpm-workspace.yaml and require continued review when Prisma changes.

This is an advisory database check at one date, not a guarantee of absence of vulnerabilities. A fresh audit and rerun of affected verification must pass before claiming remediation.
