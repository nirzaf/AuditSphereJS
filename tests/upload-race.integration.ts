import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const firmId = 'a9a9a9a9-a9a9-49a9-89a9-a9a9a9a9a9a9';
const clientId = 'b0b0b0b0-b0b0-40b0-80b0-b0b0b0b0b0b0';
const engagementId = 'c1c1c1c1-c1c1-41c1-81c1-c1c1c1c1c1c1';
const secondEngagementId = 'c2c2c2c2-c2c2-42c2-82c2-c2c2c2c2c2c2';
const actorId = 'd2d2d2d2-d2d2-42d2-82d2-d2d2d2d2d2d2';

test('concurrent identical uploads produce one authoritative import and track the duplicate objects', { timeout: 120_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('auditsphere_upload_race').withUsername('test_owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env: { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri }, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, { NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri, STORAGE_PROVIDER: 'local-s3', S3_BUCKET: 'evidence-upload-race' });
    const { db, upload, retrieve, sweepUnreferencedUploads } = await import('@auditsphere/server');
    try {
      await db.firm.create({ data: { id: firmId, name: 'Upload firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'Upload client' } });
      await db.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'Upload engagement', state: 'FIELDWORK_EXECUTION' } });
      await db.engagement.create({ data: { id: secondEngagementId, firmId, clientId, name: 'Second upload engagement', state: 'FIELDWORK_EXECUTION' } });
      await db.user.create({ data: { id: actorId, email: 'uploader@example.test', role: 'PREPARER' } });
      await db.membership.createMany({ data: [engagementId, secondEngagementId].map((assignedEngagementId) => ({ userId: actorId, firmId, clientId, engagementId: assignedEngagementId, role: 'PREPARER' })) });
      for (const scopedEngagementId of [engagementId, secondEngagementId]) {
        for (const capability of ['ENGAGEMENT_READ', 'FIELDWORK_WRITE'] as const) {
          await db.roleGrant.create({ data: { userId: actorId, capability, firmId, clientId, engagementId: scopedEngagementId, grantedBy: actorId } });
        }
      }

      const csv = 'code,name,current,prior\n100,Cash,1.00,0.00\n200,Equity,-1.00,0.00';
      // Three concurrent identical uploads all miss the fast duplicate lookup, then race the
      // uniqueness rule: exactly one may create the import and the other two are tracked duplicates.
      const results = await Promise.all([
        upload(engagementId, actorId, { filename: 'race.csv', csv }),
        upload(engagementId, actorId, { filename: 'race.csv', csv }),
        upload(engagementId, actorId, { filename: 'race.csv', csv }),
      ]) as Array<{ id: string }>;
      const ids = new Set(results.map((batch) => batch.id));
      assert.equal(ids.size, 1, 'concurrent identical uploads must resolve to one import');
      assert.equal(await db.tbImport.count({ where: { engagementId } }), 1);
      const winningImport = await db.tbImport.findFirstOrThrow({ where: { engagementId } });
      const outbox = await db.outboxEvent.findFirstOrThrow({ where: { type: 'tb.import', importId: winningImport.id } });
      assert.deepEqual(
        { firmId: outbox.firmId, clientId: outbox.clientId, engagementId: outbox.engagementId, importId: outbox.importId },
        { firmId, clientId, engagementId, importId: winningImport.id },
        'outbox ownership is persisted in relational columns',
      );
      const invalidOperationId = randomUUID();
      await assert.rejects(
        db.$transaction(async tx => {
          await tx.backgroundOperation.create({ data: {
            id: invalidOperationId,
            firmId,
            clientId,
            engagementId: secondEngagementId,
            type: 'tb.import',
          } });
          await tx.outboxEvent.create({ data: {
            id: invalidOperationId,
            operationId: invalidOperationId,
            firmId,
            clientId,
            engagementId: secondEngagementId,
            type: 'tb.import',
            payloadVersion: 1,
            importId: winningImport.id,
            payload: {},
          } });
        }),
        (error: { code?: string }) => error.code === 'P2003',
        'PostgreSQL must reject an outbox event linked across engagement scope and roll back its operation row',
      );
      assert.equal(await db.backgroundOperation.count({ where: { id: invalidOperationId } }), 0);
      assert.equal(await db.document.count({ where: { engagementId } }), 1);
      assert.equal(await db.storedObject.count({ where: { engagementId, status: 'REFERENCED' } }), 1);
      assert.equal(await db.storedObject.count({ where: { engagementId, status: 'DUPLICATE' } }), 2);

      const document = await db.document.findFirstOrThrow({ where: { engagementId } });
      assert.equal(await retrieve(document.key), csv, 'the winning evidence is readable');

      // The grace-period sweep removes only unreferenced objects and leaves the evidence intact.
      const sweep = await sweepUnreferencedUploads({ olderThanMinutes: 0 });
      assert.equal(sweep.cleaned, 2);
      assert.equal(sweep.reviewRequired, 0);
      assert.equal(await db.storedObject.count({ where: { engagementId, status: 'CLEANED' } }), 2);
      assert.equal(await db.storedObject.count({ where: { engagementId, status: 'REFERENCED' } }), 1);
      assert.equal(await retrieve(document.key), csv, 'the sweep must not remove referenced evidence');

      // A distinct upload is a second import and its object is never swept.
      const other = await upload(engagementId, actorId, { filename: 'other.csv', csv: 'code,name,current,prior\n300,Revenue,-5.00,0.00\n400,Expense,5.00,0.00' }) as { id: string };
      assert.notEqual(other.id, document.id);
      const secondEngagementImport = await upload(secondEngagementId, actorId, { filename: 'second-engagement.csv', csv: 'code,name,current,prior\n500,Other,-7.00,0.00\n600,Offset,7.00,0.00' }) as { id: string };
      assert.equal(await db.outboxEvent.count({ where: { type: 'tb.import', firmId, clientId, engagementId: secondEngagementId, importId: secondEngagementImport.id } }), 1);
      const secondSweep = await sweepUnreferencedUploads({ olderThanMinutes: 0 });
      assert.equal(secondSweep.cleaned, 0);
      assert.equal(await db.tbImport.count({ where: { engagementId } }), 2);
      assert.equal(await db.storedObject.count({ where: { engagementId, status: 'REFERENCED' } }), 2);

      console.log('concurrent identical uploads coalesced and unreferenced objects swept safely');
    } finally { await db.$disconnect(); }
  } finally { await container.stop(); }
});
