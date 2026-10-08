import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:net';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const firmId = 'ab000000-0000-4000-8000-000000000001';
const clientId = 'ab000000-0000-4000-8000-000000000002';
const engagementId = 'ab000000-0000-4000-8000-000000000003';
const preparerId = 'ab000000-0000-4000-8000-000000000004';
const viewerId = 'ab000000-0000-4000-8000-000000000005';
const xlsxType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const eicar = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
const fixtures = resolve('fixtures/trial-balance/generated');

/** Local stand-in for the clamd INSTREAM protocol, as the upload integration test uses. */
async function startScanner(): Promise<{ server: Server; port: number }> {
  const server = createServer(socket => {
    let input = Buffer.alloc(0);
    let commandSeen = false;
    let fileBytes = Buffer.alloc(0);
    socket.on('data', chunk => {
      input = Buffer.concat([input, chunk]);
      if (!commandSeen) {
        const end = input.indexOf(0);
        if (end < 0) return;
        input = input.subarray(end + 1);
        commandSeen = true;
      }
      while (input.length >= 4) {
        const length = input.readUInt32BE(0);
        if (input.length < 4 + length) return;
        input = input.subarray(4);
        if (length === 0) {
          const infected = fileBytes.includes(Buffer.from('EICAR-STANDARD-ANTIVIRUS-TEST-FILE'));
          socket.end(Buffer.from(infected ? 'stream: Eicar-Test-Signature FOUND\0' : 'stream: OK\0'));
          return;
        }
        fileBytes = Buffer.concat([fileBytes, input.subarray(0, length)]);
        input = input.subarray(length);
      }
    });
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolveListen(); });
  });
  return { server, port: (server.address() as { port: number }).port };
}

/** A stored-method ZIP with the given parts. Used only to build hostile archives for rejection tests. */
function buildZip(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const locals: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, entry.data);
    directory.push(central, name);
    offset += local.length + name.length + entry.data.length;
  }
  const directoryBuffer = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directoryBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directoryBuffer, end]);
}

async function* bytesOf(bytes: Buffer) { yield bytes; }
const statusOf = (reason: unknown) => (reason as { getStatus?: () => number }).getStatus?.();

test('T045/D13 a screened workbook upload becomes a Trial Balance import equal to its CSV twin, and every hostile upload is refused before storage', { timeout: 300_000 }, async () => {
  const scanner = await startScanner();
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('auditsphere_xlsx_upload').withUsername('test_owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env: { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri }, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, { NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri, STORAGE_PROVIDER: 'local-s3', S3_BUCKET: 'evidence-xlsx-upload', CLAMAV_HOST: '127.0.0.1', CLAMAV_PORT: String(scanner.port) });
    const { db, initiateDocumentUpload, receiveDocumentUpload, finalizeDocumentUpload, importFromDocument, retrieveBytes, upload } = await import('@auditsphere/server');
    const { createTrialBalanceImportProcessor } = await import('../packages/server/src/modules/fieldwork/import-worker.js');
    const processImport = createTrialBalanceImportProcessor(async document => retrieveBytes(document.key));
    try {
      await db.firm.create({ data: { id: firmId, name: 'Upload firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'Upload client' } });
      await db.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'Upload engagement', state: 'FIELDWORK_EXECUTION' } });
      for (const [userId, email] of [[preparerId, 'xlsx-preparer@example.test'], [viewerId, 'xlsx-viewer@example.test']] as const) {
        await db.user.create({ data: { id: userId, email, role: 'PREPARER' } });
        await db.membership.create({ data: { userId, firmId, clientId, engagementId, role: 'PREPARER' } });
        await db.roleGrant.create({ data: { userId, capability: 'ENGAGEMENT_READ', firmId, clientId, engagementId, grantedBy: preparerId } });
      }
      await db.roleGrant.create({ data: { userId: preparerId, capability: 'FIELDWORK_WRITE', firmId, clientId, engagementId, grantedBy: preparerId } });

      const runImport = async (importId: string) => {
        const event = await db.outboxEvent.findFirstOrThrow({ where: { type: 'tb.import', importId } });
        await processImport({ id: event.operationId, data: { outboxEventId: event.id, operationId: event.operationId, payloadVersion: 1 }, attemptsMade: 0, opts: { attempts: 3 } } as never);
        return (await db.tbImport.findUniqueOrThrow({ where: { id: importId } }));
      };
      const snapshot = async (importId: string) => (await db.tbRow.findMany({
        where: { importId }, orderBy: { position: 'asc' }, select: { code: true, name: true, current: true, prior: true, sourceLine: true },
      })).map(row => ({ ...row, current: row.current.toFixed(6), prior: row.prior.toFixed(6) }));
      const documentCount = () => db.document.count({ where: { engagementId } });

      // Authorization on the upload itself: a Trial Balance workbook is for Trial Balance staff only,
      // and a workbook is refused in any other fieldwork category.
      await assert.rejects(initiateDocumentUpload(viewerId, { engagementId, category: '02_Trial Balance & Schedules', filename: 'x.xlsx', contentType: xlsxType, sizeBytes: 100 }), (reason: unknown) => statusOf(reason) === 403);
      await assert.rejects(initiateDocumentUpload(preparerId, { engagementId, category: '03_Fieldwork & Testing', filename: 'x.xlsx', contentType: xlsxType, sizeBytes: 100 }), /accepted only in the Trial Balance category/);

      // Happy path: the golden workbook is screened, stored, finalized and imported.
      const golden = readFileSync(resolve(fixtures, 'balance-5000.xlsx'));
      const goldenSha = createHash('sha256').update(golden).digest('hex');
      const session = await initiateDocumentUpload(preparerId, { engagementId, category: '02_Trial Balance & Schedules', filename: 'balance-5000.xlsx', contentType: xlsxType, sizeBytes: golden.length, expectedSha256: goldenSha }) as { id: string };
      const stored = await receiveDocumentUpload(preparerId, session.id, { filename: 'balance-5000.xlsx', mimetype: xlsxType, file: bytesOf(golden) });
      assert.deepEqual({ status: stored.status, sha256: stored.sha256 }, { status: 'STORED', sha256: goldenSha });
      const finalized = await finalizeDocumentUpload(preparerId, session.id) as { documentId: string; documentVersionId: string };
      const batch = await importFromDocument(engagementId, preparerId, { documentVersionId: finalized.documentVersionId }) as { id: string };
      const again = await importFromDocument(engagementId, preparerId, { documentVersionId: finalized.documentVersionId }) as { id: string };
      assert.equal(again.id, batch.id, 'importing the same stored version twice returns the same import');
      const xlsxBatch = await runImport(batch.id);
      assert.equal(xlsxBatch.status, 'MAPPING_REQUIRED', xlsxBatch.error ?? 'the stored workbook must stage');
      assert.equal(xlsxBatch.rowCount, 5_000);
      assert.equal(xlsxBatch.documentVersionId, finalized.documentVersionId, 'the import is pinned to the exact stored version');

      // The same balances from the CSV twin, staged through the existing CSV path.
      const csv = readFileSync(resolve(fixtures, 'balance-5000.csv'), 'utf8');
      const csvBatch = await upload(engagementId, preparerId, { filename: 'balance-5000.csv', csv }) as { id: string };
      await runImport(csvBatch.id);
      assert.deepEqual(await snapshot(batch.id), await snapshot(csvBatch.id), 'the screened workbook stages the same balances as its CSV twin');

      // Hostile uploads: each is refused before any stored object or document is created.
      const documentsBefore = await documentCount();
      const macroZip = buildZip([{ name: '[Content_Types].xml', data: Buffer.from('<Types/>') }, { name: 'xl/workbook.xml', data: Buffer.from('<workbook/>') }, { name: 'xl/vbaProject.bin', data: Buffer.from('macro') }]);
      const macro = await initiateDocumentUpload(preparerId, { engagementId, category: '02_Trial Balance & Schedules', filename: 'macro.xlsx', contentType: xlsxType, sizeBytes: macroZip.length }) as { id: string };
      await assert.rejects(receiveDocumentUpload(preparerId, macro.id, { filename: 'macro.xlsx', mimetype: xlsxType, file: bytesOf(macroZip) }), /encrypted, contains macros/);
      assert.equal((await db.documentUploadSession.findUniqueOrThrow({ where: { id: macro.id } })).status, 'FAILED');

      const infectedZip = buildZip([{ name: 'xl/workbook.xml', data: Buffer.from(`<workbook>${eicar}</workbook>`) }]);
      const infected = await initiateDocumentUpload(preparerId, { engagementId, category: '02_Trial Balance & Schedules', filename: 'infected.xlsx', contentType: xlsxType, sizeBytes: infectedZip.length }) as { id: string };
      await assert.rejects(receiveDocumentUpload(preparerId, infected.id, { filename: 'infected.xlsx', mimetype: xlsxType, file: bytesOf(infectedZip) }), /rejected by security scanning/);

      const legacy = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64, 0)]);
      const legacySession = await initiateDocumentUpload(preparerId, { engagementId, category: '02_Trial Balance & Schedules', filename: 'legacy.xlsx', contentType: xlsxType, sizeBytes: legacy.length }) as { id: string };
      await assert.rejects(receiveDocumentUpload(preparerId, legacySession.id, { filename: 'legacy.xlsx', mimetype: xlsxType, file: bytesOf(legacy) }), /does not match the permitted/);

      assert.equal(await documentCount(), documentsBefore, 'no rejected upload creates a document');
      assert.equal(await db.storedObject.count({ where: { engagementId, key: { in: [macro.id, infected.id, legacySession.id] } } }), 0);

      // A fieldwork document that is not a Trial Balance cannot be imported, and a reader cannot import at all.
      const fieldworkBytes = Buffer.from('code,name,current,prior\n');
      const fieldwork = await initiateDocumentUpload(preparerId, { engagementId, category: '03_Fieldwork & Testing', filename: 'notes.csv', contentType: 'text/csv', sizeBytes: fieldworkBytes.length }) as { id: string };
      const fieldworkSession = await receiveDocumentUpload(preparerId, fieldwork.id, { filename: 'notes.csv', mimetype: 'text/csv', file: bytesOf(fieldworkBytes) });
      assert.equal(fieldworkSession.status, 'STORED');
      const fieldworkVersion = await finalizeDocumentUpload(preparerId, fieldwork.id) as { documentVersionId: string };
      await assert.rejects(importFromDocument(engagementId, preparerId, { documentVersionId: fieldworkVersion.documentVersionId }), /Only Trial Balance documents/);
      await assert.rejects(importFromDocument(engagementId, viewerId, { documentVersionId: finalized.documentVersionId }), (reason: unknown) => statusOf(reason) === 403);

      console.log('T045/D13 screened workbook upload: CSV-equivalent import, pinned version, and hostile uploads refused before storage verified on PostgreSQL 18.6');
    } finally {
      await db.$disconnect();
    }
  } finally {
    await container.stop();
    scanner.server.close();
  }
});
