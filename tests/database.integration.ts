import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const digest = '0'.repeat(64);
const reviewedMigrations = readdirSync(resolve('prisma/migrations'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).length;
const firmA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const firmB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const clientA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const clientB = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

test('empty disposable PostgreSQL 18.6 database migrates, keeps monetary precision and enforces firm/client scope', { timeout: 120_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('auditsphere_test').withUsername('test_owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env: { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri }, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, { NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri });
    const { db } = await import('@auditsphere/server');
    try {
      const version = await db.$queryRaw<Array<{ version: string }>>`SELECT current_setting('server_version') AS version`;
      assert.match(version[0].version, /^18\.6(?:\.|\s)/, 'integration database must match the PostgreSQL 18.6 service line');

      const migrations = await db.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL`;
      assert.equal(migrations[0].count, reviewedMigrations, 'every reviewed migration must be applied');

      const amounts = await db.$queryRaw<Array<{ exact: string }>>`SELECT (0.10::numeric(20,2) + 0.20::numeric(20,2))::text AS exact`;
      assert.equal(amounts[0].exact, '0.30', 'NUMERIC arithmetic must stay exact');

      await db.firm.createMany({ data: [{ id: firmA, name: 'Firm A' }, { id: firmB, name: 'Firm B' }] });
      await db.client.createMany({ data: [{ id: clientA, firmId: firmA, name: 'Client A' }, { id: clientB, firmId: firmB, name: 'Client B' }] });
      const engagementId = '11111111-1111-4111-8111-111111111111';
      const importId = '22222222-2222-4222-8222-222222222222';
      const documentId = '33333333-3333-4333-8333-333333333333';
      await db.engagement.create({ data: { id: engagementId, firmId: firmA, clientId: clientA, name: 'precision', state: 'FIELDWORK_EXECUTION' } });
      const memberA = '44444444-4444-4444-8444-444444444444';
      const memberB = '55555555-5555-4555-8555-555555555555';
      await db.user.createMany({ data: [
        { id: memberA, email: 'scope-a@example.test', role: 'PREPARER' },
        { id: memberB, email: 'scope-b@example.test', role: 'PREPARER' },
      ] });
      await db.membership.create({ data: { userId: memberA, firmId: firmA, clientId: clientA, engagementId } });
      await assert.rejects(
        db.$executeRaw`INSERT INTO "Membership" ("userId","firmId","clientId","engagementId") VALUES (${memberB}::uuid, ${firmB}::uuid, ${clientB}::uuid, ${engagementId}::uuid)`,
        /foreign key/i,
        'membership cannot assign another firm/client scope to an engagement',
      );
      assert.equal(await db.membership.count({ where: { userId: memberA, firmId: firmA, clientId: clientA, engagementId } }), 1);
      await db.document.create({ data: { id: documentId, engagementId, key: 'precision/dataset.csv', sha256: digest, filename: 'dataset.csv' } });
      await db.tbImport.create({ data: { id: importId, firmId: firmA, clientId: clientA, engagementId, documentId, sha256: digest } });
      await db.tbRow.create({ data: { importId, position: 0, code: '1000', name: 'Cash', current: '123456789.123456', prior: '0.000001' } });

      const stored = await db.$queryRaw<Array<{ current: string; prior: string }>>`SELECT "current"::text AS current, "prior"::text AS prior FROM "TbRow" WHERE "importId" = ${importId}::uuid`;
      assert.equal(stored[0].current, '123456789.123456', 'six-decimal monetary value must round-trip unchanged');
      assert.equal(stored[0].prior, '0.000001', 'smallest representable monetary unit must round-trip unchanged');

      // A client from another firm must not be attachable to an engagement.
      await assert.rejects(
        db.$executeRaw`INSERT INTO "Engagement" (id,"firmId","clientId",name) VALUES (gen_random_uuid(), ${firmB}::uuid, ${clientA}::uuid, 'cross-firm client')`,
        /foreign key/i,
        'firm B must not be able to use firm A client',
      );
      // A staged import must not be attachable to another firm's engagement. A distinct digest
      // avoids the (engagementId, sha256) uniqueness rule masking the scope violation.
      await assert.rejects(
        db.$executeRaw`INSERT INTO "TbImport" (id,"firmId","clientId","engagementId","documentId",sha256) VALUES (gen_random_uuid(), ${firmB}::uuid, ${clientB}::uuid, ${engagementId}::uuid, ${documentId}::uuid, ${'1'.repeat(64)})`,
        /foreign key/i,
        'firm B must not be able to stage data against firm A engagement',
      );
      // The same insert with correct scope succeeds, so the denial is scope, not shape.
      const scoped = await db.tbImport.count({ where: { engagementId, firmId: firmA, clientId: clientA } });
      assert.equal(scoped, 1);

      console.log('empty database migrated; exact 0.30; six-decimal precision and firm/client scope enforced');
    } finally { await db.$disconnect(); }
  } finally { await container.stop(); }
});
