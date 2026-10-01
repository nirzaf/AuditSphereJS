import { createRequire } from 'node:module';
import { defineConfig } from 'vitest/config';
const requireWeb = createRequire(new URL('./package.json', import.meta.url));
// Shared test chunks are emitted at the workspace root. Resolve web-owned packages
// against their package rather than relying on accidentally hoisted dependencies.
export default defineConfig({ resolve: { alias: {
  '@azure/msal-browser': requireWeb.resolve('@azure/msal-browser'),
  '@angular/forms': requireWeb.resolve('@angular/forms'),
  '@angular/router': requireWeb.resolve('@angular/router'),
  '@angular/cdk/scrolling': requireWeb.resolve('@angular/cdk/scrolling'),
} } });
