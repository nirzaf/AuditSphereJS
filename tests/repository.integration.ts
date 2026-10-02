import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const firmId = '1a1a1a1a-1a1a-41a1-81a1-1a1a1a1a1a1a';
const otherFirmId = '0b0b0b0b-0b0b-40b0-80b0-0b0b0b0b0b0b';
const clientA = '2a2a2a2a-2a2a-42a2-82a2-2a2a2a2a2a2a';
const clientB = '3a3a3a3a-3a3a-43a3-83a3-3a3a3a3a3a3a';
const clientC = '4a4a4a4a-4a4a-44a4-84a4-4a4a4a4a4a4a';
const engagementId = '5a5a5a5a-5a5a-45a5-85a5-5a5a5a5a5a5a';
const documentId = '6a6a6a6a-6a6a-46a6-86a6-6a6a6a6a6a6a';
const actorId = '7a7a7a7a-7a7a-47a7-87a7-7a7a7a7a7a7a';

test('per-client repository bindings resolve per purpose and document versions are append-only', { timeout: 120_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('auditsphere_repository').withUsername('test_owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env: { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri }, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, { NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri, STORAGE_PROVIDER: 'graph' });
    const { db, resolveClientRepository } = await import('@auditsphere/server');
    try {
      await db.firm.createMany({ data: [{ id: firmId, name: 'Repository firm' }, { id: otherFirmId, name: 'Other repository firm' }] });
      await db.client.createMany({ data: [{ id: clientA, firmId, name: 'Client A' }, { id: clientB, firmId, name: 'Client B' }, { id: clientC, firmId, name: 'Client C' }] });
      await db.engagement.create({ data: { id: engagementId, firmId, clientId: clientA, name: 'Repository engagement' } });
      await db.clientRepository.createMany({ data: [
        { firmId, clientId: clientA, purpose: 'evidence', provider: 'graph', driveId: 'driveA', folderId: 'evidenceA' },
        { firmId, clientId: clientA, purpose: 'working', provider: 'graph', driveId: 'workingA', folderId: 'folderA' },
        { firmId, clientId: clientB, purpose: 'evidence', provider: 'graph', driveId: 'driveB', folderId: 'evidenceB', retiredAt: new Date() },
      ] });
      await assert.rejects(
        db.$executeRaw`INSERT INTO "ClientRepository" (id,"firmId","clientId",purpose,provider,"driveId","folderId") VALUES (gen_random_uuid(), ${otherFirmId}::uuid, ${clientA}::uuid, 'evidence', 'graph', 'foreign-drive', 'foreign-folder')`,
        /foreign key/i,
        'a repository cannot bind a different firm to an existing client',
      );

      // Each client binds to its own repository; the retired binding is never selected.
      assert.deepEqual(await resolveClientRepository(db, firmId, clientA, 'evidence'), { driveId: 'driveA', folderId: 'evidenceA', purpose: 'evidence' });
      assert.deepEqual(await resolveClientRepository(db, firmId, clientA, 'working'), { driveId: 'workingA', folderId: 'folderA', purpose: 'working' });
      await assert.rejects(resolveClientRepository(db, firmId, clientB, 'evidence'), /binding or local fixture configuration/);

      // Production fails closed instead of falling back to a shared location.
      const previous = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        await assert.rejects(resolveClientRepository(db, firmId, clientC, 'evidence'), /No evidence repository is provisioned/);
      } finally { process.env.NODE_ENV = previous; }

      // Version identity is append-only and constrained.
      await db.document.create({ data: { id: documentId, engagementId, key: 'repository/dataset.csv', sha256: 'a'.repeat(64), filename: 'dataset.csv' } });
      await db.documentVersion.create({ data: { documentId, provider: 'graph', driveId: 'driveA', itemId: 'item-1', versionId: '1.0', eTag: 'etag-1', sha256: 'a'.repeat(64), sizeBytes: 5, createdBy: actorId } });
      assert.equal(await db.documentVersion.count({ where: { documentId } }), 1);
      await assert.rejects(db.$executeRaw`UPDATE "DocumentVersion" SET "versionId" = '9.9' WHERE "documentId" = ${documentId}::uuid`, /append-only/);
      await assert.rejects(db.$executeRaw`DELETE FROM "DocumentVersion" WHERE "documentId" = ${documentId}::uuid`, /append-only/);
      await assert.rejects(db.$executeRaw`INSERT INTO "DocumentVersion" (id,"documentId",provider,"driveId","itemId","versionId","eTag",sha256,"sizeBytes","createdBy") VALUES (gen_random_uuid(), ${documentId}::uuid, 'graph', 'd', 'i', '2.0', 'e', 'not-a-hash', 1, ${actorId}::uuid)`, /document_version_sha256_check/);
      await assert.rejects(db.$executeRaw`INSERT INTO "ClientRepository" (id,"firmId","clientId",purpose,provider,"driveId","folderId") VALUES (gen_random_uuid(), ${firmId}::uuid, ${clientC}::uuid, 'index', 'graph', 'd', 'f')`, /client_repository_purpose_check/);

      console.log('client repositories isolated per purpose and document versions append-only');
    } finally { await db.$disconnect(); }
  } finally { await container.stop(); }
});
