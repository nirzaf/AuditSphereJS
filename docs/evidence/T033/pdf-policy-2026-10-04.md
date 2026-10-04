# T033 PDF upload-policy increment — 2026-10-04

## Delivered

PDF upload bytes are first screened by ClamAV, then parsed in a dedicated Node worker thread before any `StoredObject` row or storage-provider write. The worker has a 5-second deadline, 128 MB old-generation and 32 MB young-generation limits, and a 4 MB stack. It rejects encrypted or malformed PDFs, parser-visible JavaScript/open actions, attachments, forms/XFA, non-passive annotation types, unsafe annotation/outline actions, over 500 pages, over 10,000 annotations, and direct or escaped active PDF names outside literal strings, hex strings and comments. PDF.js runs with XFA and system fonts disabled; its viewer and scripting layer are not loaded.

The lexical check is a defense-in-depth rule, not a full PDF grammar verifier. The parser limits reduce exposure to hostile parser inputs, but this work does not prove that every active construct hidden in compressed object streams or every viewer-specific behavior is detected. PDF files that fail inspection are rejected before storage; this does not certify other file types or PDF content as safe. The broader T033 policy acceptance remains open.

## Dependency review

- Direct server dependency: `pdfjs-dist@6.4.299`, exact-pinned in `packages/server/package.json` and `pnpm-lock.yaml`.
- Registry metadata recorded by `pnpm dependencies:check`: Apache-2.0; Node engine `>=22.13.0 || >=24`, compatible with the repository's Node 24.15+ baseline.
- Locked package integrity: `sha512-AVl138zALtfaAPvADulE0PZThbYzCBS79nL4pOSL/6Sm/4AH5A21BD9VHt97OlCuzJuCpmeZtAtkinisF4Vb1g==`.
- `pnpm audit --audit-level=moderate`: no known vulnerabilities found on 2026-10-04. The upstream PDF.js scripting advisory GHSA-hq66-cqwq-w95j affects versions below 6.2.108; the pinned 6.4.299 release is outside that range. The server does not load the viewer/scripting layer.
- Primary references: [PDF.js 6.4.299 release](https://github.com/mozilla/pdf.js/releases/tag/v6.4.299), [PDF.js API](https://mozilla.github.io/pdf.js/api/), [GHSA-hq66-cqwq-w95j](https://github.com/mozilla/pdf.js/security/advisories/GHSA-hq66-cqwq-w95j).

## Verification

| Check | Result |
| :--- | :--- |
| `pnpm build:server` | PASS; Prisma client generated and server TypeScript build passed. |
| `node --import tsx --test packages/server/tests/pdf-inspection.integration.ts` | PASS; 7/7 tests cover passive files, marker-like visible text/comments/hex strings, encrypted files, plain and escaped-name JavaScript, URI actions, annotations, attachments, and malformed files. |
| `pnpm verify:task -- T033` | PASS; server build, contracts/OpenAPI, multipart 2/2, ClamAV unit 3/3, real-daemon 1/1, PDF inspection 7/7, and PostgreSQL/Fastify upload integration 1/1. Denied upload cases did not create document/version rows or provider writes. |
| `pnpm verify:affected` | PASS; boundaries, server/tests typecheck, Angular production build, 24 Vitest files and 107 tests. |
| `pnpm lint` | PASS with four unused eslint-disable warnings in the excluded, untracked `visual-prototype-simulation/worker/worker-configuration.d.ts`; no errors. |
| `pnpm dependencies:check` | PASS; engine/license metadata recorded above. |
| `pnpm audit --audit-level=moderate` | PASS; no known vulnerabilities found. |

This is not live provider acceptance. Portal/PBC freeze and cross-client upload authorization, T064 category-folder binding, compressed-object-stream action coverage, and live Graph staging-cleanup acceptance remain separate open items.
