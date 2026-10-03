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
it('requires Graph storage and rejects the local RustFS/S3 fixture in production', () => {
  const production = { ...base, NODE_ENV: 'production', AUTH_PROVIDER: 'entra', WEB_ORIGIN: 'https://auditsphere.example.test' };
  expect(() => readConfiguration({ ...production, STORAGE_PROVIDER: 'local-s3' })).toThrow('Production requires Entra identity and Graph storage');
  expect(() => readConfiguration({ ...production, STORAGE_PROVIDER: 'graph' })).toThrow('Missing production configuration: M365_TENANT_ID');
});
it('accepts only an exact HTTP(S) web origin for the credentialed CORS allowlist', () => {
  expect(() => readConfiguration({ ...base, WEB_ORIGIN: 'https://auditsphere.example.test/workspace' })).toThrow('WEB_ORIGIN');
  expect(() => readConfiguration({ ...base, WEB_ORIGIN: 'ftp://auditsphere.example.test' })).toThrow('WEB_ORIGIN');
  expect(readConfiguration({ ...base, WEB_ORIGIN: 'https://auditsphere.example.test' }).WEB_ORIGIN).toBe('https://auditsphere.example.test');
});
