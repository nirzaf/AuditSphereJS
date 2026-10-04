# T150 MSAL and Graph compatibility handoff — 2026-10-04

## Identity

Task ID: T150
Requirement IDs: R002
Implementing commit/branch: pending commit on `main`
Status: DONE for the selected nonproduction Entra SPA and Graph-storage integration.

## Intended and delivered outcome

Reviewed current official npm metadata and verified the existing direct MSAL Browser adapter against Angular 22.2.1 and Node 24.19.0. Updated `@azure/msal-browser` from 5.23.0 to 5.24.0, the exact stable version required by the supported MSAL Angular wrapper peer range. Kept the direct adapter because runtime identity settings come from an asynchronous API endpoint and the app deliberately uses an authenticated Fetch boundary rather than the wrapper interceptor. The wrapper is compatible, but not needed. Graph uses native Fetch; `@microsoft/microsoft-graph-client`, Graph types, Azure Identity and MSAL Node are not installed. No tenant mutation occurred.

## Exact published metadata

Metadata read from the npm registry on 2026-10-04 using `npm view <package>@<version> version peerDependencies engines license --json`. Official support is linked to the Microsoft library documentation and source repository.

| Candidate | Exact version | Engine | Peer dependencies | License | Decision |
| --- | --- | --- | --- | --- | --- |
| `@azure/msal-browser` | 5.24.0 | `node >=0.8.0` | None | MIT | Selected, direct runtime-configured browser integration |
| `@azure/msal-angular` | 6.2.2 | Not published | `@azure/msal-browser ^5.24.0`, `rxjs ^7.4.0` | MIT | Compatible with Angular 22; not installed because runtime config and custom Fetch do not use its providers/interceptor |
| `@azure/msal-node` | 7.0.1 | `node >=20` | None | MIT | Not used; API verifies bearer JWTs through JOSE |
| `@azure/identity` | 4.13.3 | `node >=22.0.0` | None | MIT | Not used; selected storage flow obtains app tokens with its existing small native-Fetch adapter |
| `@microsoft/microsoft-graph-client` | 3.0.7 | `node >=12.0.0` | None | MIT | Not used; selected Graph adapter uses native Fetch and bounds resource/version semantics explicitly |
| `@microsoft/microsoft-graph-types` | 2.43.1 | Not published | Not published | MIT | Not used; runtime responses are validated at the existing adapter boundary |

The current Angular project is 22.2.1, Node is 24.19.0, RxJS is 7.8.2 and the `@azure/msal-browser` exact lockfile integrity is `sha512-jS1stt81tslcVZi7fqVD+g6vr8w/IWqFl/vAB2dx/6EOroQDuCR4+z0o3C+d6a/GpLATvdoO+kwnDcYzsBXKQA==`. Angular wrapper v6 supports Angular 22 per Microsoft's version table. The selected versions satisfy its exact browser/RxJS peers; no `--force`, peer override or type cast is used.

Official metadata references: [MSAL Browser npm](https://www.npmjs.com/package/@azure/msal-browser/v/5.24.0), [MSAL Angular npm](https://www.npmjs.com/package/@azure/msal-angular/v/6.2.2), [MSAL Angular Angular-version support](https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-angular/FAQ.md), [MSAL Node npm](https://www.npmjs.com/package/@azure/msal-node/v/7.0.1), [Azure Identity npm](https://www.npmjs.com/package/@azure/identity/v/4.13.3), [Graph client npm](https://www.npmjs.com/package/@microsoft/microsoft-graph-client/v/3.0.7), [Graph types npm](https://www.npmjs.com/package/@microsoft/microsoft-graph-types/v/2.43.1).

## Files and contracts

- `apps/web/package.json`, `pnpm-lock.yaml`: exact MSAL Browser bump to 5.24.0; transitive `@azure/msal-common` resolves to 16.14.2.
- `package.json`: focused Angular MSAL adapter test command.
- `scripts/verify-task.mjs`: recorded T150 checks.
- `docs/guides/02-compatibility-matrix.md`, `docs/guides/03-library-register.md`: resolved current compatibility facts and selected/unused package boundaries.
- `docs/tasks/13-microsoft365/T150-m365-compatibility.md`, `docs/guides/13-execution-ledger.md`: acceptance status.
- `docs/evidence/T150/handoff.md`: this exact metadata, verification and rationale.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm install --frozen-lockfile` | Exact workspace lockfile, no peer bypass | Passed; lockfile up to date, no resolution changes | Local task run 2026-10-04 |
| `pnpm dependencies:check` | Direct dependency engines, licenses and package metadata | Passed; includes selected browser 5.24.0, MIT | Local task run 2026-10-04 |
| `pnpm audit --audit-level=moderate` | Resolved workspace dependency tree | Passed; no known vulnerabilities | Local task run 2026-10-04 |
| `pnpm test:web:identity` (`ng test web`) | `apps/web/src/identity.spec.ts` with mocked redirect/token responses | Passed; 9 tests | Local task run 2026-10-04 |
| `pnpm verify:task -- T150` | Server build, dependency audit, Entra token cases, Graph Fetch adapter, config and Angular identity | Passed; server build, test typecheck, Angular production build, identity 1, storage 6, config 4, web identity 9 | Local task run 2026-10-04 |
| `pnpm verify:affected` | Boundaries, typechecks, production Angular build and Vitest | Passed; module/browser boundaries, server and web builds, 25 test files / 110 tests | Local task run 2026-10-04 |

Credentialed, nonproduction acceptance was previously recorded: T019 confirms a mapped Staff Fixture sign-in and wrong-tenant/audience signed-token failures; T156 confirms selected-folder SharePoint/OneDrive exact-version behavior. These are references to existing evidence, not live tests rerun during this T150 slice.

## Acceptance criteria and limits

- AC1 passes: the selected direct browser dependency has no peers, runs on the exact Angular/Node project pins, and the optional wrapper peer range is satisfied without forced overrides.
- AC2 passes from the existing signed-token and browser evidence: valid configured tenant/audience accepted; wrong tenant/audience rejected; the exact browser integration is re-tested by the task recipe.
- AC3 passes: unsupported combinations are not installed or bypassed. No server Graph SDK is required for the selected native-Fetch adapter.
- The npm browser engine metadata is broad (`>=0.8.0`), not proof of a current vendor Node support commitment. Current executable proof uses Node 24.19.0. Production provider acceptance and ongoing vendor support/security rechecks remain release work.

## Recovery and authorization

The only runtime change is a lockfile-pinned public package patch/minor update; there is no database migration, tenant write, credential change or production deployment. Revert the package/lockfile change if the focused identity/browser tests fail. No M365 permission changed.

## Review and next task

Reviewer: Codex evidence review
Review result: Accepted after task recipe and affected checks passed 2026-10-04
Open blockers: T151–T156 integration acceptance; production retention/residency/revocation and tenant credential expiry remain tracked separately.
Next eligible task: T151, subject to the accepted internal SSO scope in T149.
