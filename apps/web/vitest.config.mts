import { createRequire } from 'node:module';
import { defineConfig } from 'vitest/config';
const requireWeb = createRequire(new URL('./package.json', import.meta.url));
// Shared test chunks are emitted at the workspace root. Resolve web-owned packages
// against their package rather than relying on accidentally hoisted dependencies.
export default defineConfig({ test: { maxWorkers: 2 }, resolve: { alias: [
  { find: /^@angular\/forms\/signals$/, replacement: requireWeb.resolve('@angular/forms/signals') },
  { find: 'rxjs', replacement: requireWeb.resolve('rxjs') },
  { find: '@azure/msal-browser', replacement: requireWeb.resolve('@azure/msal-browser') },
  { find: '@angular/forms', replacement: requireWeb.resolve('@angular/forms') },
  { find: '@angular/router', replacement: requireWeb.resolve('@angular/router') },
  { find: '@angular/cdk/scrolling', replacement: requireWeb.resolve('@angular/cdk/scrolling') },
] } });
