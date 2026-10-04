import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/**/*.test.{ts,mjs}', 'apps/api/tests/**/*.test.ts', 'packages/server/tests/**/*.test.ts'], maxWorkers: 4 } });
