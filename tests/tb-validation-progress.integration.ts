import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const firmId = 'a4a4a4a4-a4a4-44a4-84a4-a4a4a4a4a4a4';
const clientId = 'b4b4b4b4-b4b4-44b4-84b4-b4b4b4b4b4b4';
const engagementId = 'c4c4c4c4-c4c4-44c4-84c4-c4c4c4c4c4c4';
const actorId = 'd4d4d4d4-d4d4-44d4-84d4-d4d4d4d4d4d4';
const header = 'code,name,current,prior\n';

test('T044 Trial Balance validation records source lines durably and checkpoints cancelled progress', { timeout: 180_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('auditsphere_tb_validation').withUsername('test_owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env: { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri }, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, { NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri, STORAGE_PROVIDER: 'local-s3', S3_BUCKET: 'evidence-tb-validation' });
    const { db, upload, retrieve } = await import('@auditsphere/server');
    const { createTrialBalanceImportProcessor } = await import('../packages/server/src/modules/fieldwork/import-worker.js');
    const processImport = createTrialBalanceImportProcessor(async document => retrieve(document.key));
    try {
      await db.firm.create({ data: { id: firmId, name: 'Validation firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'Validation client' } });
      await db.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'Validation engagement', state: 'FIELDWORK_EXECUTION' } });
      await db.user.create({ data: { id: actorId, email: 'validation-preparer@example.test', role: 'PREPARER' } });
      await db.membership.create({ data: { userId: actorId, firmId, clientId, engagementId, role: 'PREPARER' } });
      for (const capability of ['ENGAGEMENT_READ', 'FIELDWORK_WRITE'] as const) {
        await db.roleGrant.create({ data: { userId: actorId, capability, firmId, clientId, engagementId, grantedBy: actorId } });
      }

      const jobFor = async (importId: string, attemptsMade = 0) => {
        const event = await db.outboxEvent.findFirstOrThrow({ where: { type: 'tb.import', importId } });
        return {
          operation: event.operationId,
          job: { id: event.operationId, data: { outboxEventId: event.id, operationId: event.operationId, payloadVersion: 1 }, attemptsMade, opts: { attempts: 3 } },
        };
      };

      // Several distinct defects, on the lines a reviewer would open in the source file. Line 4 repeats
      // account 100 from line 2; line 6 is valid and must not mask the other defects.
      const defects = `${header}100,Cash,1.00,0.00\n200,Equity,NaN,0.00\n100,Duplicate,1.00,0.00\n300,Revenue,1.00,abc\n400,Expense,-1.00,0.00\n`;
      const rejected = await upload(engagementId, actorId, { filename: 'defects.csv', csv: defects }) as { id: string };
      const { job: rejectedJob, operation: rejectedOperation } = await jobFor(rejected.id);
      await assert.rejects(processImport(rejectedJob as never), /3 invalid rows; first: Invalid current balance at source line 3/);

      const rejectedBatch = await db.tbImport.findUniqueOrThrow({ where: { id: rejected.id } });
      assert.equal(rejectedBatch.status, 'FAILED');
      assert.equal(rejectedBatch.error, '3 invalid rows; first: Invalid current balance at source line 3');
      assert.equal(await db.tbRow.count({ where: { importId: rejected.id } }), 0, 'a rejected import stages no rows');
      assert.deepEqual(
        await db.tbImportRowError.findMany({ where: { importId: rejected.id }, orderBy: { sourceLine: 'asc' }, select: { sourceLine: true, message: true } }),
        [
          { sourceLine: 3, message: 'Invalid current balance at source line 3' },
          { sourceLine: 4, message: 'Invalid or duplicate account at source line 4' },
          { sourceLine: 5, message: 'Invalid prior balance at source line 5' },
        ],
        'every rejected row is recorded with its source line',
      );
      const rejectedOperationRow = await db.backgroundOperation.findUniqueOrThrow({ where: { id: rejectedOperation } });
      assert.equal(rejectedOperationRow.state, 'FAILED');
      assert.equal(rejectedOperationRow.errorCode, 'TB_IMPORT_INVALID');
      assert.equal(rejectedOperationRow.attemptCount, 1, 'the first delivery is terminal; no retry is scheduled');

      // A later delivery of the same job cannot claim a terminal operation, so it changes nothing.
      await processImport(rejectedJob as never);
      assert.equal(await db.tbImportRowError.count({ where: { importId: rejected.id } }), 3, 'redelivery does not duplicate evidence');

      // Bounded collection: a hostile file stops at 100 recorded defects instead of growing without limit.
      const flood = `${header}${Array.from({ length: 150 }, (_, index) => `${index},Flood ${index},NaN,0.00`).join('\n')}\n`;
      const floodImport = await upload(engagementId, actorId, { filename: 'flood.csv', csv: flood }) as { id: string };
      const floodJob = await jobFor(floodImport.id);
      await assert.rejects(processImport(floodJob.job as never), /100 or more invalid rows; first: Invalid current balance at source line 2/);
      assert.equal(await db.tbImportRowError.count({ where: { importId: floodImport.id } }), 100);

      // Progress is checkpointed after each committed chunk and survives the rollback of that chunk's
      // transaction. The cancellation signal fires on the check that follows the first 1,000-row write.
      const staged = `${header}${Array.from({ length: 2_500 }, (_, index) => `${String(index).padStart(5, '0')},Account ${index},1.00,-1.00`).join('\n')}\n`;
      const cancelled = await upload(engagementId, actorId, { filename: 'cancel.csv', csv: staged }) as { id: string };
      const cancelledJob = await jobFor(cancelled.id);
      let checks = 0;
      const abort = { aborted: false };
      const signal = {
        get aborted() { return abort.aborted; },
        throwIfAborted() {
          checks += 1;
          if (checks === 1_001) {
            abort.aborted = true;
            throw Object.assign(new Error('Cancelled for acceptance'), { name: 'AbortError' });
          }
        },
      } as unknown as AbortSignal;
      await processImport(cancelledJob.job as never, undefined, signal);
      assert.equal(checks, 1_001, 'cancellation is observed exactly at the boundary after the first chunk');
      const cancelledOperation = await db.backgroundOperation.findUniqueOrThrow({ where: { id: cancelledJob.operation } });
      assert.equal(cancelledOperation.state, 'CANCELLED');
      assert.equal(cancelledOperation.progressRows, 1_000, 'the committed chunk checkpoint is durable after the staging rollback');
      assert.equal(await db.tbRow.count({ where: { importId: cancelled.id } }), 0, 'cancelled staging leaves no partial rows');
      const cancelledBatch = await db.tbImport.findUniqueOrThrow({ where: { id: cancelled.id } });
      assert.equal(cancelledBatch.status, 'FAILED');
      assert.equal(cancelledBatch.error, 'Background operation cancelled');
      assert.equal(await db.tbImportRowError.count({ where: { importId: cancelled.id } }), 0, 'cancellation is not a validation defect');

      console.log('T044 validation: source-line row errors, bounded collection, terminal redelivery and cancelled checkpoints verified on PostgreSQL 18.6');
    } finally {
      await db.$disconnect();
    }
  } finally {
    await container.stop();
  }
});
