import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const firmId = 'a3a3a3a3-a3a3-43a3-83a3-a3a3a3a3a3a3';
const clientId = 'b3b3b3b3-b3b3-43b3-83b3-b3b3b3b3b3b3';
const engagementId = 'c3c3c3c3-c3c3-43c3-83c3-c3c3c3c3c3c3';
const actorId = 'd3d3d3d3-d3d3-43d3-83d3-d3d3d3d3d3d3';
const header = 'code,name,current,prior\n';

type Snapshot = { position: number; code: string; name: string; current: string; prior: string; fsli: string | null; sourceLine: number | null; rawValues: unknown; version: number };

test('T043 staging keeps re-imports isolated, retries batch-scoped and traces every staged balance to its source row', { timeout: 180_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('auditsphere_tb_staging').withUsername('test_owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env: { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri }, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, { NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri, STORAGE_PROVIDER: 'local-s3', S3_BUCKET: 'evidence-tb-staging' });
    const { db, upload, retrieve } = await import('@auditsphere/server');
    const { createTrialBalanceImportProcessor } = await import('../packages/server/src/modules/fieldwork/import-worker.js');
    const processImport = createTrialBalanceImportProcessor(async document => retrieve(document.key));
    try {
      await db.firm.create({ data: { id: firmId, name: 'Staging firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'Staging client' } });
      await db.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'Staging engagement', state: 'FIELDWORK_EXECUTION' } });
      await db.user.create({ data: { id: actorId, email: 'staging-preparer@example.test', role: 'PREPARER' } });
      await db.membership.create({ data: { userId: actorId, firmId, clientId, engagementId, role: 'PREPARER' } });
      for (const capability of ['ENGAGEMENT_READ', 'FIELDWORK_WRITE'] as const) {
        await db.roleGrant.create({ data: { userId: actorId, capability, firmId, clientId, engagementId, grantedBy: actorId } });
      }

      // Runs one import's durable operation through the production processor, as a BullMQ delivery would.
      const runImport = async (importId: string, attemptsMade = 0) => {
        const event = await db.outboxEvent.findFirstOrThrow({ where: { type: 'tb.import', importId } });
        const job = {
          id: event.operationId,
          data: { outboxEventId: event.id, operationId: event.operationId, payloadVersion: 1 },
          attemptsMade,
          opts: { attempts: 3 },
        };
        await processImport(job as never);
      };
      const snapshot = async (importId: string): Promise<Snapshot[]> => (await db.tbRow.findMany({
        where: { importId }, orderBy: { position: 'asc' },
        select: { position: true, code: true, name: true, current: true, prior: true, fsli: true, sourceLine: true, rawValues: true, version: true },
      })).map(row => ({ ...row, current: row.current.toFixed(6), prior: row.prior.toFixed(6) }));

      // AC1: a re-import is a new batch on a new immutable document version; the earlier batch is untouched.
      const csvA = `${header}100,Cash,1.00,0.00\n200,Equity,-1.00,0.00\n`;
      const first = await upload(engagementId, actorId, { filename: 'tb-2026.csv', csv: csvA }) as { id: string; documentId: string };
      await runImport(first.id);
      const firstBatch = await db.tbImport.findUniqueOrThrow({ where: { id: first.id } });
      assert.equal(firstBatch.status, 'MAPPING_REQUIRED');
      assert.equal(firstBatch.rowCount, 2);
      const firstRowsBefore = await snapshot(first.id);

      // AC2 (duplicate content): identical bytes resolve to the existing batch and create no rows.
      const replay = await upload(engagementId, actorId, { filename: 'tb-2026.csv', csv: csvA }) as { id: string };
      assert.equal(replay.id, first.id, 'identical content must not create a second batch');
      assert.equal(await db.tbImport.count({ where: { engagementId } }), 1);

      const document = await db.document.findUniqueOrThrow({ where: { id: first.documentId } });
      const csvB = `${header}100,Cash,5.00,0.00\n200,Equity,-5.00,0.00\n300,Revenue,0.00,0.00\n`;
      const second = await upload(engagementId, actorId, {
        filename: 'tb-2026.csv', csv: csvB, documentId: first.documentId, expectedDocumentVersion: document.version,
      }) as { id: string };
      assert.notEqual(second.id, first.id, 're-import creates a new batch');
      await runImport(second.id);
      const secondBatch = await db.tbImport.findUniqueOrThrow({ where: { id: second.id } });
      assert.equal(secondBatch.status, 'MAPPING_REQUIRED');
      assert.equal(secondBatch.rowCount, 3);
      assert.deepEqual(await snapshot(first.id), firstRowsBefore, 'historical balances are not altered by a re-import');
      assert.equal((await db.tbImport.findUniqueOrThrow({ where: { id: first.id } })).status, 'MAPPING_REQUIRED');

      // AC3: any staged balance traces to the exact source document version and file line it came from.
      const sourceRow = await db.tbRow.findFirstOrThrow({ where: { importId: first.id, code: '200' } });
      assert.equal(sourceRow.sourceLine, 3, 'account 200 is on line 3 of the source file');
      assert.deepEqual(sourceRow.rawValues, { code: '200', name: 'Equity', current: '-1.00', prior: '0.00' });
      const version = await db.documentVersion.findUniqueOrThrow({ where: { id: firstBatch.documentVersionId! } });
      assert.equal(version.sha256, firstBatch.sha256);
      assert.equal(version.documentId, first.documentId);
      const sourceLines = (await retrieve(version.storageReference)).split('\n');
      assert.ok(sourceLines[sourceRow.sourceLine! - 1].startsWith('200,'), 'the recorded line number points at the staged account in the stored source bytes');
      assert.equal(await db.tbRow.count({ where: { importId: first.id, sourceLine: null } }), 0, 'every row staged by this change records its source line');
      // Staged source values are fixed once parsed.
      await assert.rejects(
        db.tbRow.update({ where: { id: sourceRow.id }, data: { current: '999.00' } }),
        /Staged trial-balance source values are immutable/,
      );
      // Mapping still changes the row and is versioned; it is not a source-value change.
      await db.tbRow.update({ where: { id: sourceRow.id }, data: { fsli: 'Cash and cash equivalents', version: { increment: 1 } } });

      // AC2 (retry): rows left by an earlier attempt on this batch are replaced, not appended to, and
      // the other batch is not touched by the retry.
      const retryCsv = `${header}100,Cash,1.00,0.00\n200,Equity,-1.00,0.00\n300,Revenue,0.00,0.00\n`;
      const retryBatch = await upload(engagementId, actorId, { filename: 'retry.csv', csv: retryCsv }) as { id: string };
      await db.tbRow.createMany({ data: [
        { importId: retryBatch.id, position: 0, code: 'stale-1', name: 'Left by an earlier attempt', current: '1.00', prior: '0.00' },
        { importId: retryBatch.id, position: 1, code: 'stale-2', name: 'Left by an earlier attempt', current: '-1.00', prior: '0.00' },
      ] });
      const firstRowsBeforeRetry = await snapshot(first.id);
      await runImport(retryBatch.id);
      const retried = await snapshot(retryBatch.id);
      assert.equal(retried.length, 3, 'retry must not append to rows from an earlier attempt');
      assert.deepEqual(retried.map(row => row.code), ['100', '200', '300']);
      assert.equal((await db.tbImport.findUniqueOrThrow({ where: { id: retryBatch.id } })).rowCount, 3);
      assert.deepEqual(await snapshot(first.id), firstRowsBeforeRetry, 'retry leaves the other batch untouched');

      // Failure path: a row that fails after the first 1,000-row chunk is written rolls back the whole
      // staging transaction. The batch is requeued with its error and no partial rows survive.
      const lines = [];
      // Line 1202 repeats account 10 from line 2, after the first 1,000-row chunk has been written.
      for (let index = 0; index < 1_250; index += 1) lines.push(`${index === 1_200 ? '10' : String(index + 10)},Account ${index},1.00,0.00`);
      const broken = await upload(engagementId, actorId, { filename: 'broken.csv', csv: `${header}${lines.join('\n')}\n` }) as { id: string };
      await assert.rejects(
        runImport(broken.id),
        /Invalid or duplicate account at source line 1202/,
      );
      // A duplicate account is a permanent input defect: the import fails terminally, is not requeued,
      // and records its rejected source line durably.
      const brokenBatch = await db.tbImport.findUniqueOrThrow({ where: { id: broken.id } });
      assert.equal(brokenBatch.status, 'FAILED', 'an invalid file is terminal and is not requeued');
      assert.match(brokenBatch.error ?? '', /Invalid or duplicate account at source line 1202/);
      assert.equal(await db.tbRow.count({ where: { importId: broken.id } }), 0, 'the failed attempt leaves no partial staged rows');
      assert.deepEqual(
        await db.tbImportRowError.findMany({ where: { importId: broken.id }, select: { sourceLine: true }, orderBy: { sourceLine: 'asc' } }),
        [{ sourceLine: 1202 }],
      );
      const brokenOperation = await db.backgroundOperation.findUniqueOrThrow({ where: { id: (await db.outboxEvent.findFirstOrThrow({ where: { importId: broken.id } })).operationId } });
      assert.equal(brokenOperation.state, 'FAILED');
      assert.equal(brokenOperation.errorCode, 'TB_IMPORT_INVALID');

      console.log('T043 staging: re-import isolation, batch-scoped retry, rollback and source-row lineage verified on PostgreSQL 18.6');
    } finally {
      await db.$disconnect();
    }
  } finally {
    await container.stop();
  }
});
