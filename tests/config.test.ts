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
it('treats empty optional Graph mail environment fields as unset while keeping opt-in configuration strict', () => {
  const generatedLocalEnvironment = {
    ...base, NOTIFICATION_PROVIDER: 'disabled', M365_MAIL_TENANT_ID: '', M365_MAIL_CLIENT_ID: '', M365_MAIL_CLIENT_SECRET: '', M365_NOTIFICATION_SENDER: '',
  };
  expect(readConfiguration(generatedLocalEnvironment).NOTIFICATION_PROVIDER).toBe('disabled');
  expect(() => readConfiguration({ ...generatedLocalEnvironment, NOTIFICATION_PROVIDER: 'graph' })).toThrow('Graph notifications require separate M365_MAIL credentials');
});
it('requires Graph storage and rejects the local RustFS/S3 fixture in production', () => {
  const production = { ...base, NODE_ENV: 'production', AUTH_PROVIDER: 'entra', WEB_ORIGIN: 'https://auditsphere.example.test' };
  expect(() => readConfiguration({ ...production, STORAGE_PROVIDER: 'local-s3' })).toThrow('Production requires Entra identity and Graph storage');
  expect(() => readConfiguration({ ...production, STORAGE_PROVIDER: 'graph' })).toThrow('Missing production configuration: M365_TENANT_ID');
});
it('requires a generated metrics scrape token when configured', () => {
  const token = 't041-generated-metrics-token-0123456789';
  expect(() => readConfiguration({ ...base, OBSERVABILITY_METRICS_TOKEN: 'replace-with-generated-metrics-token' })).toThrow('OBSERVABILITY_METRICS_TOKEN');
  expect(readConfiguration({ ...base, OBSERVABILITY_METRICS_TOKEN: token }).OBSERVABILITY_METRICS_TOKEN).toBe(token);
  expect(readConfiguration({ ...base, OBSERVABILITY_METRICS_TOKEN: '' }).OBSERVABILITY_METRICS_TOKEN).toBeUndefined();
});
it('accepts only an exact HTTP(S) web origin for the credentialed CORS allowlist', () => {
  expect(() => readConfiguration({ ...base, WEB_ORIGIN: 'https://auditsphere.example.test/workspace' })).toThrow('WEB_ORIGIN');
  expect(() => readConfiguration({ ...base, WEB_ORIGIN: 'ftp://auditsphere.example.test' })).toThrow('WEB_ORIGIN');
  expect(readConfiguration({ ...base, WEB_ORIGIN: 'https://auditsphere.example.test' }).WEB_ORIGIN).toBe('https://auditsphere.example.test');
});
