import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
test('empty disposable PostgreSQL 18.6 database migrates and round-trips exact NUMERIC', { timeout: 120_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('auditsphere_test').withUsername('test_owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    const env = { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri };
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env, timeout: 45_000, stdio: 'pipe' });
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { db } from '@auditsphere/server';
      const migrations = await db.$queryRaw\`SELECT count(*)::int AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL\`;
      if(migrations[0].count !== 4) throw new Error('Missing migrations');
      const amounts = await db.$queryRaw\`SELECT (0.10::numeric(20,2) + 0.20::numeric(20,2))::text AS exact\`;
      if(amounts[0].exact !== '0.30') throw new Error('NUMERIC precision lost');
      await db.$disconnect(); console.log('empty database migrated; exact 0.30');
    `], { env, timeout: 30_000, encoding: 'utf8' });
    assert.match(output, /empty database migrated; exact 0.30/);
  } finally { await container.stop(); }
});
