import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const firmId = 'a0a0a0a0-a0a0-40a0-80a0-a0a0a0a0a0a0';
const clientId = 'b0b0b0b0-b0b0-40b0-80b0-b0b0b0b0b0b0';
const engagementId = 'c0c0c0c0-c0c0-40c0-80c0-c0c0c0c0c0c0';
const documentId = 'd0d0d0d0-d0d0-40d0-80d0-d0d0d0d0d0d0';
const actorId = 'e0e0e0e0-e0e0-40e0-80e0-e0e0e0e0e0e0';
const auditorId = 'f0f0f0f0-f0f0-40f0-80f0-f0f0f0f0f0f0';
const key = (suffix: string) => `00000000-0000-4000-8000-0000000000${suffix}`;

test('publishing creates immutable accepted balance versions bound to one finalized import and a current mapping approval', { timeout: 120_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('auditsphere_publication').withUsername('test_owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env: { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri }, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, { NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri });
    const { db, publishBalances, latestPublication, publicationDetail, createTaxonomyVersion, approveTaxonomyVersion, approveImportMapping } = await import('@auditsphere/server');
    try {
      await db.firm.create({ data: { id: firmId, name: 'Publication firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'Publication client' } });
      await db.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'Publication engagement', state: 'FIELDWORK_EXECUTION' } });
      await db.user.createMany({ data: [{ id: actorId, email: 'publisher@example.test', role: 'PREPARER' }, { id: auditorId, email: 'auditor@example.test', role: 'REVIEWER' }] });
      await db.document.create({ data: { id: documentId, engagementId, key: 'publication/dataset.csv', sha256: 'b'.repeat(64), filename: 'dataset.csv' } });
      for (const capability of ['ENGAGEMENT_READ', 'FIELDWORK_WRITE', 'FIELDWORK_FINALIZE', 'TB_PUBLISH', 'MAPPING_APPROVE', 'TAXONOMY_MANAGE'] as const) {
        await db.roleGrant.create({ data: { userId: actorId, capability, firmId, clientId, engagementId, grantedBy: actorId } });
      }
      // A taxonomy is required before a mapping can be approved.
      const taxonomy = await createTaxonomyVersion(actorId, engagementId, { name: 'STE-STATUTORY', lines: [
        { code: 'Cash and equivalents', label: 'Cash and equivalents', statementSection: 'ASSETS', sortOrder: 1 },
        { code: 'Equity', label: 'Equity', statementSection: 'EQUITY', sortOrder: 2 },
      ] }) as { id: string };
      await approveTaxonomyVersion(actorId, engagementId, taxonomy.id);

      let sequence = 0;
      const makeImport = async (rows: Array<[string, string, string, string, string]>, status: string, version: number) => {
        sequence += 1;
        const id = `10000000-0000-4000-8000-0000000000${String(sequence).padStart(2, '0')}`;
        await db.tbImport.create({ data: { id, firmId, clientId, engagementId, documentId, sha256: String(sequence).repeat(64).slice(0, 64), status: 'MAPPING_REQUIRED' } });
        await db.tbRow.createMany({ data: rows.map(([code, name, fsli, current, prior], position) => ({ importId: id, position, code, name, fsli: fsli || null, current, prior })) });
        if (status === 'FINALIZED') {
          await approveImportMapping(actorId, engagementId, id, { idempotencyKey: randomUUID() });
          await db.tbImport.update({ where: { id }, data: { status: 'FINALIZED', version } });
        }
        return id;
      };

      const balanced = await makeImport([['100', 'Cash', 'Cash and equivalents', '1000.000001', '900.000001'], ['200', 'Equity', 'Equity', '-1000.000001', '-900.000001']], 'FINALIZED', 2);
      const unbalanced = await makeImport([['100', 'Cash', 'Cash and equivalents', '1000.000000', '0.000000'], ['200', 'Equity', 'Equity', '-999.000000', '0.000000']], 'FINALIZED', 2);
      const staging = await makeImport([['100', 'Cash', 'Cash and equivalents', '1.000000', '0.000000'], ['200', 'Equity', 'Equity', '-1.000000', '0.000000']], 'MAPPING_REQUIRED', 1);
      const version2 = await makeImport([['100', 'Cash', 'Cash and equivalents', '2000.000001', '1000.000001'], ['200', 'Equity', 'Equity', '-2000.000001', '-1000.000001']], 'FINALIZED', 2);

      await assert.rejects(publishBalances(engagementId, auditorId, { importId: balanced, expectedVersion: 2, idempotencyKey: key('01') }), /not granted/i);
      await assert.rejects(publishBalances(engagementId, actorId, { importId: staging, expectedVersion: 1, idempotencyKey: key('02') }), /Only a finalized trial balance/);
      await assert.rejects(publishBalances(engagementId, actorId, { importId: balanced, expectedVersion: 1, idempotencyKey: key('03') }), /Import changed/);
      await assert.rejects(publishBalances(engagementId, actorId, { importId: unbalanced, expectedVersion: 2, idempotencyKey: key('04') }), /balance to zero/);

      // An import whose mapping was changed after approval cannot be published.
      const tampered = await makeImport([['100', 'Cash', 'Cash and equivalents', '5.000000', '0.000000'], ['200', 'Equity', 'Equity', '-5.000000', '0.000000']], 'MAPPING_REQUIRED', 1);
      await approveImportMapping(actorId, engagementId, tampered, { idempotencyKey: randomUUID() });
      await db.tbRow.updateMany({ where: { importId: tampered, code: '100' }, data: { fsli: 'Equity' } });
      await db.tbImport.update({ where: { id: tampered }, data: { status: 'FINALIZED', version: 2 } });
      await assert.rejects(publishBalances(engagementId, actorId, { importId: tampered, expectedVersion: 2, idempotencyKey: key('08') }), /mapping changed after approval/);

      const first = await publishBalances(engagementId, actorId, { importId: balanced, expectedVersion: 2, idempotencyKey: key('05') }) as { publicationId: string; sequence: number; rowCount: number; digest: string; currency: string };
      assert.equal(first.sequence, 1);
      assert.equal(first.rowCount, 2);
      assert.equal(first.currency, 'QAR');
      assert.match(first.digest, /^[0-9a-f]{64}$/);

      const again = await publishBalances(engagementId, actorId, { importId: balanced, expectedVersion: 2, idempotencyKey: key('06') }) as { publicationId: string; sequence: number };
      assert.equal(again.publicationId, first.publicationId);
      assert.equal(again.sequence, 1);

      const detail = await publicationDetail(engagementId, first.publicationId);
      assert.equal(detail.rows.length, 2);
      assert.equal(detail.rows[0].current, '1000.000001');
      assert.equal(detail.rows[1].prior, '-900.000001');
      assert.equal((await latestPublication(engagementId)).sequence, 1);

      await assert.rejects(db.$executeRaw`UPDATE "PublishedBalanceRow" SET current = 0 WHERE "publicationId" = ${first.publicationId}::uuid`, /immutable/);
      await assert.rejects(db.$executeRaw`DELETE FROM "BalancePublication" WHERE id = ${first.publicationId}::uuid`, /immutable/);

      const second = await publishBalances(engagementId, actorId, { importId: version2, expectedVersion: 2, idempotencyKey: key('07') }) as { sequence: number };
      assert.equal(second.sequence, 2);
      assert.equal((await publicationDetail(engagementId, first.publicationId)).rows[0].current, '1000.000001');

      console.log('publication enforced: current mapping approval, single source version, immutability and lineage');
    } finally { await db.$disconnect(); }
  } finally { await container.stop(); }
});
