import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const firmId = 'a5a5a5a5-a5a5-45a5-85a5-a5a5a5a5a5a5';
const clientId = 'b5b5b5b5-b5b5-45b5-85b5-b5b5b5b5b5b5';
const engagementId = 'c5c5c5c5-c5c5-45c5-85c5-c5c5c5c5c5c5';
const actorId = 'd5d5d5d5-d5d5-45d5-85d5-d5d5d5d5d5d5';
const xlsxType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const fixtures = resolve('fixtures/trial-balance/generated');

test('T045 workbook imports match their CSV twins, fail within limits and never change a finalized batch', { timeout: 300_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('auditsphere_tb_workbook').withUsername('test_owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env: { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri }, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, { NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri, STORAGE_PROVIDER: 'local-s3', S3_BUCKET: 'evidence-tb-workbook' });
    const { db, retrieveBytes, storeBytes } = await import('@auditsphere/server');
    const { createTrialBalanceImportOutbox } = await import('../packages/server/src/platform/outbox.js');
    const { runUnitOfWork } = await import('../packages/server/src/platform/unit-of-work.js');
    const { createTrialBalanceImportProcessor } = await import('../packages/server/src/modules/fieldwork/import-worker.js');
    const processImport = createTrialBalanceImportProcessor(async document => retrieveBytes(document.key));
    try {
      await db.firm.create({ data: { id: firmId, name: 'Workbook firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'Workbook client' } });
      await db.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'Workbook engagement', state: 'FIELDWORK_EXECUTION' } });
      await db.user.create({ data: { id: actorId, email: 'workbook-preparer@example.test', role: 'PREPARER' } });

      // Stores the exact bytes and creates the same records an accepted upload creates, in one transaction.
      const stage = async (filename: string, bytes: Buffer, contentType: string) => {
        const key = await storeBytes(`${engagementId}/${randomUUID()}`, bytes, contentType);
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        return runUnitOfWork(async ({ client: tx }) => {
          const document = await tx.document.create({ data: { engagementId, key, sha256, filename, category: '02_Trial Balance & Schedules' } });
          const batch = await tx.tbImport.create({ data: { firmId, clientId, engagementId, sha256, documentId: document.id } });
          await createTrialBalanceImportOutbox(tx, { firmId, clientId, engagementId, importId: batch.id });
          return batch.id;
        });
      };
      const run = async (importId: string) => {
        const event = await db.outboxEvent.findFirstOrThrow({ where: { type: 'tb.import', importId } });
        const job = { id: event.operationId, data: { outboxEventId: event.id, operationId: event.operationId, payloadVersion: 1 }, attemptsMade: 0, opts: { attempts: 3 } };
        return { job, operationId: event.operationId };
      };
      const snapshot = async (importId: string) => (await db.tbRow.findMany({
        where: { importId }, orderBy: { position: 'asc' }, select: { position: true, code: true, name: true, current: true, prior: true, sourceLine: true },
      })).map(row => ({ ...row, current: row.current.toFixed(6), prior: row.prior.toFixed(6) }));

      // AC1: the golden workbook stages the same balances from the same source lines as its CSV twin.
      const csvBytes = readFileSync(resolve(fixtures, 'balance-5000.csv'));
      const xlsxBytes = readFileSync(resolve(fixtures, 'balance-5000.xlsx'));
      const csvImport = await stage('balance-5000.csv', csvBytes, 'text/csv');
      const xlsxImport = await stage('balance-5000.xlsx', xlsxBytes, xlsxType);
      await processImport((await run(csvImport)).job as never);
      await processImport((await run(xlsxImport)).job as never);
      const csvBatch = await db.tbImport.findUniqueOrThrow({ where: { id: csvImport } });
      const xlsxBatch = await db.tbImport.findUniqueOrThrow({ where: { id: xlsxImport } });
      assert.equal(xlsxBatch.status, 'MAPPING_REQUIRED', xlsxBatch.error ?? 'workbook must stage');
      assert.equal(xlsxBatch.rowCount, 5_000);
      assert.equal(csvBatch.rowCount, 5_000);
      assert.deepEqual(await snapshot(xlsxImport), await snapshot(csvImport), 'the workbook and CSV stage identical balances from identical source lines');
      const firstRow = await db.tbRow.findFirstOrThrow({ where: { importId: xlsxImport }, orderBy: { position: 'asc' } });
      assert.equal(firstRow.sourceLine, 2);
      assert.equal(firstRow.code, '10000000');

      // AC3: once the batch is finalized, a redelivered workbook job cannot change its rows or status.
      const finalizedRows = await snapshot(xlsxImport);
      await db.tbImport.update({ where: { id: xlsxImport }, data: { status: 'FINALIZED', version: { increment: 1 } } });
      const redelivery = await run(xlsxImport);
      await processImport(redelivery.job as never);
      assert.deepEqual(await snapshot(xlsxImport), finalizedRows, 'a finalized batch keeps its rows through a workbook retry');
      assert.equal((await db.tbImport.findUniqueOrThrow({ where: { id: xlsxImport } })).status, 'FINALIZED');

      // D18: the earlier finalized batch is superseded before another batch of the engagement is finalized.
      await db.tbImport.update({ where: { id: xlsxImport }, data: { status: 'SUPERSEDED' } });
      // AC3 (status guard): even a fresh, queued job for a finalized batch completes without restaging,
      // whatever evidence it is handed.
      // Never parsed: a finalized batch returns before its evidence is read.
      const guarded = await stage('guarded.xlsx', Buffer.from('guard-evidence-never-read'), xlsxType);
      await db.tbRow.create({ data: { importId: guarded, position: 0, code: 'KEEP', name: 'Finalized account', current: '5.00', prior: '0.00' } });
      await db.tbImport.update({ where: { id: guarded }, data: { status: 'FINALIZED' } });
      const guardedRun = await run(guarded);
      await processImport(guardedRun.job as never);
      assert.deepEqual((await db.tbRow.findMany({ where: { importId: guarded }, select: { code: true } })).map(row => row.code), ['KEEP']);
      assert.equal((await db.backgroundOperation.findUniqueOrThrow({ where: { id: guardedRun.operationId } })).state, 'COMPLETED');

      // AC2: corrupt and excessively expanding workbooks fail terminally, within limits, and stage nothing.
      const truncated = await stage('truncated.xlsx', xlsxBytes.subarray(0, 4_096), xlsxType);
      const truncatedRun = await run(truncated);
      await assert.rejects(processImport(truncatedRun.job as never), /not a valid spreadsheet archive/);
      assert.equal((await db.tbImport.findUniqueOrThrow({ where: { id: truncated } })).status, 'FAILED');
      assert.equal(await db.tbRow.count({ where: { importId: truncated } }), 0);
      assert.equal((await db.backgroundOperation.findUniqueOrThrow({ where: { id: truncatedRun.operationId } })).errorCode, 'TB_IMPORT_INVALID');

      const { deflateRawSync } = await import('node:zlib');
      const expanding = deflateRawSync(Buffer.alloc(64 * 1024 * 1024 + 1, 0));
      assert.ok(expanding.length < 1024 * 1024, 'the expansion fixture is small on the wire');
      const started = Date.now();
      const bomb = await stage('expansion.xlsx', Buffer.from(bombArchive(expanding)), xlsxType);
      const bombRun = await run(bomb);
      await assert.rejects(processImport(bombRun.job as never), /expands beyond the accepted size/);
      assert.ok(Date.now() - started < 60_000, 'expansion is refused without decompressing the whole part');
      assert.equal((await db.tbImport.findUniqueOrThrow({ where: { id: bomb } })).status, 'FAILED');
      assert.equal(await db.tbRow.count({ where: { importId: bomb } }), 0);

      console.log('T045 workbook: CSV-equivalent staging, finalized-batch protection and bounded rejection verified on PostgreSQL 18.6');
    } finally {
      await db.$disconnect();
    }
  } finally {
    await container.stop();
  }
});

/** Wrap an already-deflated payload in a single-entry archive whose directory declares the true size. */
function bombArchive(deflated: Buffer): Uint8Array {
  const name = Buffer.from('xl/worksheets/sheet1.xml', 'utf8');
  const workbook = Buffer.from('<workbook/>', 'utf8');
  const workbookName = Buffer.from('xl/workbook.xml', 'utf8');
  const uncompressed = 64 * 1024 * 1024 + 1;
  const parts: Buffer[] = [];
  const directory: Buffer[] = [];
  const entries = [
    { name: workbookName, data: workbook, method: 0, size: workbook.length },
    { name, data: deflated, method: 8, size: uncompressed },
  ];
  let offset = 0;
  for (const entry of entries) {
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(entry.method, 8);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.size, 22);
    local.writeUInt16LE(entry.name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(entry.method, 10);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.size, 24);
    central.writeUInt16LE(entry.name.length, 28);
    central.writeUInt32LE(offset, 42);
    parts.push(local, entry.name, entry.data);
    directory.push(central, entry.name);
    offset += local.length + entry.name.length + entry.data.length;
  }
  const directoryBuffer = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directoryBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directoryBuffer, end]);
}
