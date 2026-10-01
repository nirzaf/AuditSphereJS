# Angular MCP and implementation standards

Verified setup: 2026-10-02, workspace Angular CLI 22.2.1. The official [Angular MCP guide](https://angular.dev/ai/mcp) describes the server shipped with the CLI.

## Connection

Project configuration is in `.codex/config.toml`. It runs `node node_modules/@angular/cli/bin/ng.js mcp` in this repository, using the installed lockfile-pinned CLI. No globally installed/latest CLI is downloaded. The configured `cwd` is this Windows checkout's absolute path; update it when moving or cloning the project elsewhere. The local Codex configuration marks this exact project trusted so its project settings are loaded. No model or approval settings were changed.

`codex mcp get angular-cli` verifies the enabled stdio configuration. Reload/reopen the Codex session to discover newly configured native tools. This running session already called the actual server through the existing stdio client; configuring a server does not hot-add tools to the current session. See [Codex MCP configuration](https://developers.openai.com/codex/mcp).

When native tools are unavailable, run these commands from the repository root:

```powershell
node scripts/angular-mcp.mjs tools-list
node scripts/angular-mcp.mjs call list_projects
node scripts/angular-mcp.mjs call get_best_practices '{"workspacePath":"C:/Users/DELL/repos/AuditSphereJS/angular.json"}'
node scripts/angular-mcp.mjs call run_target '{"workspace":"C:/Users/DELL/repos/AuditSphereJS","project":"web","target":"test"}'
node scripts/angular-mcp.mjs call run_target '{"workspace":"C:/Users/DELL/repos/AuditSphereJS","project":"web","target":"build"}'
```

`get_best_practices` accepts the workspace configuration path; `run_target.workspace` takes the directory containing `angular.json`. Inspect returned `isError` and structured build/test status, not only shell exit status. The fallback client supports basic request/response calls, not a full interactive sampling client: an `onpush_zoneless_migration` call timed out, so no successful automated migration analysis is claimed. Use a capable native MCP host for that interactive workflow. The client now clears successful request timers instead of waiting an unnecessary minute before exiting.

## Required workflow

Before Angular changes, discover projects and load version-aligned practices. Search official documentation for APIs in question. Keep server business rules in domain services, and apply the Angular guidance to presentation and interaction. Run affected Angular tests/build and normal repository verification. Record the actual outcome and remaining deviations.

The retrieved Angular 22 guidance calls for standalone components and default OnPush, signal state and signal inputs, native template control flow, lazy routes, strict types, focused components, accessible controls and optimized static images. It recommends Signal Forms for new forms. Do not add redundant `standalone: true` or explicit OnPush settings merely because an older example did so.

This first pass converted Practice's decorator inputs to `input()` signals and updated their reads, preserving the parent bindings. Existing routes are lazy-loaded and templates use native control flow. Further work remains: template-driven forms, `any` API/view-model boundaries, large Workspace/Practice components, static image optimization and full accessibility verification. MCP configuration and guidance do not establish universal best-practice compliance or product acceptance.

Keep this guide and root `AGENTS.md` aligned when the Angular version, MCP startup command or verification workflow changes. Local raw server outputs are retained under ignored `test-results/angular-mcp/`.

## Executed verification

On 2026-10-02, the CLI MCP server identified one Angular 22 `web` application with build/serve/test targets, returned its best-practice guide, and completed `run_target` for build and test with structured status `success`. The Angular test target discovered and passed 2 tests. `pnpm verify:affected` passed boundaries, server/test typechecks, Angular build and 60 unit tests; lint and `git diff --check` passed. No browser accessibility scan or full best-practice migration was performed in this setup pass.
