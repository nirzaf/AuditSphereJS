import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/e2e', use: { baseURL: 'http://127.0.0.1:4200' }, webServer: { command: 'pnpm dev:web', url: 'http://127.0.0.1:4200', reuseExistingServer: true } });
