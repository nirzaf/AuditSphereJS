# T045 dependency review — exceljs 4.4.0

Reviewed on 2026-10-08 for the workspace package `@auditsphere/server`. Recorded in the compatibility matrix and in `docs/guides/03-library-register.md` entry L28.

## Selected package

| Field | Value | Source |
| :--- | :--- | :--- |
| Package | `exceljs` | registry `npm view exceljs` |
| Pinned version | `4.4.0` (exact, `saveExact`) | `packages/server/package.json` |
| Latest published stable | `4.4.0`, published 2023-10-19 | registry `time` metadata |
| Newer prerelease, not used | `4.4.1-prerelease.0`, published 2024-12-20 | registry; prereleases are not adopted for production |
| Engines | `node >=8.3.0`; the pinned Node `>=24.15.0 <25` satisfies it | registry metadata |
| Peer dependencies | none | registry metadata |
| License | MIT | registry metadata |

## Dependency tree and licenses

`exceljs@4.4.0` adds about 200 packages to the lockfile, including `archiver`, `unzipper`, `jszip`, `saxes`, `fast-csv` and `tmp`. All direct and transitive licenses are permissive. Notes:

- `jszip@3.10.2` is dual-licensed `MIT OR GPL-3.0-or-later`. This project uses it under the MIT option.
- `pako@1.0.11` is `MIT AND Zlib`; `big-integer` is Unlicense; `crc-32` is Apache-2.0.
- `buffers@0.1.1` has no license field in the lockfile. Its upstream repository must be checked before production release. This is an open item, not a clearance.

## Advisory review

| Check | Result |
| :--- | :--- |
| `npm audit` on a clean install of `exceljs@4.4.0` (no overrides) | 2 moderate: `uuid` below 11.1.1 (GHSA-w5hq-g745-h8pq, missing buffer bounds check in v3/v5/v6 when `buf` is supplied). ExcelJS only reaches it through `uuid@^8`. |
| Mitigation | Scoped override `exceljs>uuid: 11.1.1` in `pnpm-workspace.yaml`, with an inline comment naming the advisory. Other packages keep their own `uuid` versions. |
| `pnpm audit --prod --filter @auditsphere/server` after the override | `No known vulnerabilities found`, exit 0 |
| ZIP and XML transitive advisories (`unzipper`, `tmp`, `saxes`) | none reported by the audit |

The advisory check is a point-in-time registry check and does not replace a vulnerability review of ExcelJS's own parser.

## Executable smoke

| Check | Result |
| :--- | :--- |
| Load ExcelJS from `packages/server` on Node v24.19.0 and read `fixtures/trial-balance/generated/balance-5000.xlsx` | 1 sheet, `rowCount` 5001, header and first data row correct, codes kept as strings; 628 ms including load |
| Resolved `uuid` for ExcelJS | `11.1.1` (confirmed with `pnpm why`) |
| Default ESM import (`import ExcelJS from 'exceljs'`) | works; named ESM exports are not present, so the default export is used |
| Test suites that load ExcelJS | `packages/server/tests/workbook.test.ts` (13 tests), `tests/xlsx-import.integration.ts` (PostgreSQL 18.6) |

Not yet run: the Linux compatibility image smoke (`pnpm build:linux` and `pnpm smoke:linux`, T017). That image checks Nest, Fastify, BullMQ, Socket.IO and Chromium PDF, and does not yet exercise ExcelJS. Adding an ExcelJS parse to that image is a required follow-up before any release.

## Resource limits measured

Measured on the local Windows development machine on Node v24.19.0, using the T042 fixtures:

| Input | Rows | Time | Peak RSS |
| :--- | :--- | :--- | :--- |
| `balance-50000.xlsx` (workbook path, full validation) | 50,000 | 3.75 s | about 348 MB |
| `balance-50000.csv` (CSV path) | 50,000 | 0.95 s | about 364 MB |

These are development-machine measurements, not production SLO evidence. ExcelJS loads the whole workbook into memory, so peak memory scales with the decompressed size, which the reader caps at 64 MiB. Worker memory limits and load evidence remain with T159.

## Decision

Accepted for the T045 technical proof, subject to: the Linux image smoke above, the `buffers` license check, and the independent review recorded in the T045 handoff. This review does not approve a production release.
