# T036 live-provider harness — 2026-10-05

This increment adds an explicitly opt-in live SharePoint check for the firm-private `template-assets-private` repository. It uses only a generated one-pixel PNG, verifies the selected folder identity, immutable version bytes and denied write outside the folder, then recycles its own fixture. Redacted result JSON contains hashes, not filenames, provider IDs or content.

## Verification

| Command | Result |
| --- | --- |
| `pnpm typecheck` | Passed: server build, test TypeScript and Angular production build. |
| `pnpm verify:affected` | Passed on the sequential retry: boundaries, builds and 137/137 Vitest tests. The first run overlapped a device-login attempt and reported two timeouts; both affected suites passed in isolation before the sequential full retry. |
| `pnpm lint` | Passed: ESLint and module/browser boundaries. |
| `pnpm verify:task -- T036` | Passed: six template compiler tests, PostgreSQL/fake-Graph integration, three PDF tests, four Angular template-screen tests, generated-contract checks and OpenAPI checks. |
| `git diff --check` | Passed; Git reported only its normal LF-to-CRLF notices for edited text files. |

## Live acceptance still open

`pnpm test:m365:template-assets:live` was not run. The designated Graph PowerShell device sign-in timed out twice; no SharePoint folder was created, no app permission was granted, and no Graph write was issued. The tenant inventory therefore remains at its prior verification date. After an administrator completes Graph PowerShell sign-in, provision the dedicated folder and its exact `write` grant per [tenant setup](../../microsoft365/tenant-setup.md), store its drive/folder IDs only in `.env.m365.acceptance`, run the opt-in check, and append the redacted run output. T036 remains `IN_REVIEW` until that live round-trip passes.
