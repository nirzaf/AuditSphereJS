# Angular application

Read `../../docs/requirements/CURRENT.md` and the owning server module README before changing business workflows. Components collect input and present server results; they do not grant authority or calculate accounting outcomes.

The shell provides five module selectors, 36 workspace links and URL-addressable views (`?module=Governance&view=risks`). Trial Balance and Practice retain their dedicated workspaces. `module-catalog.ts` defines the remaining presentation forms and guidance; `module-workspace.ts` owns typed reactive forms, loading/search, review confirmations and protected API interactions.

Connected commands use shared contract schemas before submission. Money remains decimal strings. Journal posting/reversal and lifecycle commands submit the exact loaded version; the server owns state transitions, balancing and authorization. The adjustment editor currently prepares two-line entries. More complex adjustment editing remains work to do.

Preparation-only forms never submit business commands. Their drafts are kept in memory, scoped by engagement and screen, cleared on access-token changes and discarded on reload. They are not durable client records. No client data is preloaded before connecting and explicitly loading records.

Angular 22 guidance comes from the pinned CLI MCP (`node scripts/angular-mcp.mjs`). The new component uses default standalone/OnPush, signal inputs/state, native control flow and typed FormRecord controls. The dynamic metadata form uses stable reactive forms; migration to Signal Forms, full AXE coverage and decomposition of the legacy Workspace/Practice components remain open.

Run `pnpm verify:affected`, `pnpm exec ng test web --watch=false` and affected Playwright cases. The test runner explicitly resolves web-owned packages from this package, so shared chunks do not depend on accidental root hoisting. UI tests with intercepted APIs do not establish live provider or business acceptance.
