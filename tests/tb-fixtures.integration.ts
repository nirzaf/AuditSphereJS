import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { seedAuthorizedTbFixtureScopes } from './factories/tb-engagement-seed.js';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const accountCode = '10000000';

test('T042 test-only seed scopes lookalike TB accounts to isolated authorized client engagements', { timeout: 120_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6@sha256:5a5a84b19854a9ffaa54082c166ff4ec27473a361e496e5ea167f298f2da9722')
    .withDatabase('auditsphere_test')
    .withUsername('test_owner')
    .withPassword(randomBytes(24).toString('hex'))
    .start();
  try {
    const uri = container.getConnectionUri();
    const env = { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri };
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, { NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri });
    const { db, hasCapability } = await import('@auditsphere/server');
    try {
      const seed = await seedAuthorizedTbFixtureScopes(db);
      const [scopeA, scopeB] = seed.engagements;
      assert.notEqual(scopeA.clientId, scopeB.clientId);
      assert.notEqual(scopeA.engagementId, scopeB.engagementId);
      assert.equal(await hasCapability(db, scopeA.userId, 'ENGAGEMENT_READ', scopeA), true);
      assert.equal(await hasCapability(db, scopeA.userId, 'ENGAGEMENT_READ', scopeB), false, 'client A staff cannot read client B engagement');
      assert.equal(await hasCapability(db, scopeB.userId, 'FIELDWORK_WRITE', scopeB), true);
      assert.equal(await hasCapability(db, scopeB.userId, 'FIELDWORK_WRITE', scopeA), false, 'client B staff cannot write client A engagement');

      const manifest = JSON.parse(readFileSync(resolve('fixtures/trial-balance/generated/manifest.json'), 'utf8'));
      const csv = readFileSync(resolve('fixtures/trial-balance/generated/balance-5000.csv'));
      const hash = createHash('sha256').update(csv).digest('hex');
      assert.equal(hash, manifest.datasets.find((item: { filename: string }) => item.filename === 'balance-5000.csv').sha256);
      const imports: Array<{ importId: string; engagementId: string }> = [];
      for (const scope of [scopeA, scopeB]) {
        const documentId = randomUUID();
        const importId = randomUUID();
        await db.document.create({ data: {
          id: documentId,
          engagementId: scope.engagementId,
          key: `t042/${scope.clientId}/balance-5000.csv`,
          sha256: hash,
          filename: 'balance-5000.csv',
        } });
        await db.tbImport.create({ data: {
          id: importId,
          firmId: scope.firmId,
          clientId: scope.clientId,
          engagementId: scope.engagementId,
          documentId,
          sha256: hash,
        } });
        await db.tbRow.create({ data: { importId, position: 0, code: accountCode, name: 'Synthetic cash lookalike', current: '1.00', prior: '0.00' } });
        imports.push({ importId, engagementId: scope.engagementId });
      }
      for (const item of imports) {
        const rows = await db.tbRow.findMany({ where: { importId: item.importId }, select: { code: true } });
        assert.deepEqual(rows.map(row => row.code), [accountCode], `same source account code remains local to engagement ${item.engagementId}`);
      }
      assert.equal(await db.engagement.count({ where: { firmId: seed.firmId, state: 'FIELDWORK_EXECUTION' } }), 2);
      console.log('T042 authorized synthetic scopes and cross-client lookalike rows verified on PostgreSQL 18.6');
    } finally {
      await db.$disconnect();
    }
  } finally {
    await container.stop();
  }
});
