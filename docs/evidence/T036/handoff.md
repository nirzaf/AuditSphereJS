# T036 handoff — versioned document templates and approved assets

## Identity

Task ID: T036
Requirement IDs: R010, R011, R014, R016, R064–R069
Implementing commit/branch: `main` (this handoff is committed with the implementation)
Status: IN_REVIEW — code acceptance is complete; live Graph acceptance for the new firm-private asset repository is pending.

## Intended and delivered outcome

The Reporting workspace now reads firm template and approved-asset catalogs from the API. It supports version selection, allow-listed controlled preview, draft creation/append, reasoned approval/revocation, activation/deactivation, private artwork upload, malware/hash checks and immutable asset-version approval. `DOCUMENT_TEMPLATE_MANAGE` is bounded to the APPROVER role and rechecked against the selected engagement in each write transaction. Ordinary readers receive only exact approved active templates and no firm-asset metadata. Angular clears catalog data and all in-progress template values when the engagement or staff session changes.

Template text is a closed set of typed blocks, not executable HTML. Signature/seal inputs are PNG/JPEG visual artwork under the user's D08 decision; the application does not claim a cryptographic PDF signature or call Microsoft 365 eSignature. New template/asset revisions append immutable content; existing rendered PDF bytes, digests and provenance remain unchanged.

## Files and contracts

Changed: API composition; Reporting module catalog/workspace; new standalone Angular template screen, styles and four tests; server contracts and generated JSON Schema/OpenAPI; platform template compiler, service, controller and documentation; authorization capability ceiling; Graph private repository purpose, streaming storage hook and worker upload cleanup; Prisma schema and migration `202610040007_document_template_catalog`; local least-privilege role provisioner; T036 task recipe and CI integration list; `.env.example`; Microsoft 365 configuration/permission/tenant status and UI/implementation evidence. The local deployment applied migration `202610040006_rendered_pdf_provenance` followed by `202610040007_document_template_catalog`. No package dependency changed.

The DB migration explicitly adds `DOCUMENT_TEMPLATE_MANAGE` to the RoleGrant allowlist and the separate `template-assets-private` FirmRepository purpose. The local role provisioner grants the API only the template/asset table privileges needed by its commands and the worker only read/update rights needed for bounded stale-upload cleanup. The migration does not provision or grant a tenant folder.

## Dependency evidence

No dependency changes. The image signer is visual-only under D08. Graph storage remains behind the existing adapter; no Graph scope, app registration, credential, selected-folder permission or external repository was changed.

## Decisions

D08 image-only signature/seal is implemented. D10 keeps statutory, internal-audit and AUP templates distinct. These recorded decisions are followed; professional certification and Microsoft 365 provider acceptance remain outside the local test claims.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| --- | --- | --- | --- |
| `pnpm verify:task -- T036` | Compiler/golden fixture, PostgreSQL 18.6 Testcontainers + fake Graph + fake ClamAV, T035 PDF worker, Angular template screen | PASS, exit 0: 6 compiler tests; integration 1/1; PDF 3/3; Angular 4/4; contracts and OpenAPI matched | Current task recipe |
| `pnpm verify:affected` | Boundaries, server and test TypeScript, Angular production build, Vitest | PASS, exit 0: 26 files / 121 tests | Current local run |
| `pnpm exec ng test web --watch=false` | Full Angular component suite | PASS, exit 0: 12 files / 77 tests | Current local run |
| `pnpm lint` | Repository ESLint and import boundaries | PASS, exit 0; 0 errors and 4 warnings confined to untouched `visual-prototype-simulation/worker/worker-configuration.d.ts` | Current local run |
| GitHub Actions run `37207565756` on `8a037c5b557eec98f66449a8b82a783deca50375` | Frozen install, CI policy, static checks, unit tests, all three integration shards including T036, Playwright e2e, T035 PDF/image runtime and Linux smoke | PASS, exit 0; all verification jobs passed and the public web asset publisher completed | [Hosted workflow](https://github.com/nirzaf/AuditSphereJS/actions/runs/37207565756); [published web assets](https://github.com/nirzaf/AuditSphereJS/releases/tag/build-8a037c5b557eec98f66449a8b82a783deca50375) |
| `pnpm db:migrate` | Local `auditsphere` PostgreSQL at `127.0.0.1` | PASS, applied the two pending reviewed migrations; no reset | Local development DB |
| `pnpm db:roles` | Local API/worker least-privilege roles | PASS; exact table grants added by the provisioner; private credentials remain in ignored `.env` | Local development DB |
| Built-in browser: Reporting → Document templates | Existing mapped Staff Fixture, one synthetic engagement, only `ENGAGEMENT_READ` | PASS: empty catalog loaded; no drafts, asset metadata or manager controls; no mutation submitted | Browser acceptance 2026-10-04 |

## Acceptance criteria

- **AC1 PASS:** the PostgreSQL integration renders a generated PDF, revises/activates the template, and verifies the previous `DocumentVersion` SHA-256, provenance and provider bytes remain identical. An appended image-asset version is sequence 2; the older template remains linked to exact image version 1.
- **AC2 PASS:** compiler unit and PostgreSQL tests reject a missing required template variable with the missing key in the error.
- **AC3 PASS:** PREPARER catalog excludes all firm asset metadata; pre-approval and post-approval asset downloads return authorization denial; only partner-capability manager sees asset versions.
- The controlled HTML preview is compared against the checked-in safe golden fixture. Malformed/unlisted variables, HTML blocks, content-type spoofing, size/hash mismatch and stale upload cleanup have negative-path coverage.

## Recovery and authorization

Uploads are tracked before storage; invalid or incomplete uploads fail closed and bounded worker cleanup retries stale provider deletion. Approval, activation and upload identities are append-only; revisions use optimistic aggregate versions and exact asset/template-version references. The production Graph resolver fails closed without an active firm-private `template-assets-private` binding. The current tenant has only two existing synthetic client-folder grants, which were intentionally not reused for firm templates. No production operation or external tenant change was made.

## Review and next task

Reviewer: Codex implementation review
Review result: local acceptance criteria, affected checks and hosted CI pass. The hosted workflow published the labelled nonproduction web bundle; no deployment occurred. Keep T036 in review until an administrator-provisioned firm-private SharePoint/OneDrive asset repository and its separate selected-folder grant are available for live Graph upload/download acceptance.
Open blockers: live Graph asset repository binding/grant and provider roundtrip; no signing-provider task applies because the user selected image appearance only.
Next eligible task: T037 is already complete; T038 remains next in dependency order after T036 review closure.

## Live provider harness update — 2026-10-05

Added `tests/live/m365-template-assets.acceptance.ts` and the opt-in `pnpm test:m365:template-assets:live` command. The harness targets only the dedicated `template-assets-private` folder, checks byte-identical version retrieval and denies a write to `root`, then recycles only the item it created. Setup instructions and acceptance-only environment key names are in [tenant setup](../../microsoft365/tenant-setup.md) and [application configuration](../../microsoft365/application-configuration.md). `pnpm verify:affected` passed 137/137 tests, `pnpm lint` passed, and `pnpm verify:task -- T036` passed. The live command remains unrun because the Graph PowerShell device flow timed out; no folder or permission change was made. See [dated harness evidence](live-provider-harness-2026-10-05.md).
