import { it, expect } from 'vitest';
import { readConfiguration } from '../packages/server/src/platform/config.js';
const base = { DATABASE_URL: 'postgresql://localhost/test', REDIS_URL: 'redis://localhost' };
it('rejects production demo credentials without exposing secrets', () => {
  expect(() => readConfiguration({ ...base, NODE_ENV: 'production', DEV_AUTH_TOKEN: 'sensitive-value' })).toThrow('Development authentication');
  expect(() => readConfiguration({ ...base, DATABASE_URL: 'sensitive-value' })).toThrow('DATABASE_URL');
});
it('bounds pools and requires complete production providers', () => {
  expect(() => readConfiguration({ ...base, DATABASE_POOL_MAX: '1000' })).toThrow('DATABASE_POOL_MAX');
  expect(() => readConfiguration({ ...base, NODE_ENV: 'production' })).toThrow('Entra identity');
  expect(readConfiguration(base).DATABASE_POOL_MAX).toBe(10);
});
