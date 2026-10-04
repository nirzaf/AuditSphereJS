import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:net';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);

async function startScanner() {
  const server: Server = createServer(socket => {
    let input = Buffer.alloc(0); let started = false;
    socket.on('data', chunk => {
      input = Buffer.concat([input, chunk]);
      if (!started) { const separator = input.indexOf(0); if (separator < 0) return; input = input.subarray(separator + 1); started = true; }
      while (input.length >= 4) {
        const length = input.readUInt32BE(0);
        if (input.length < length + 4) return;
        input = input.subarray(length + 4);
        if (length === 0) { socket.end(Buffer.from('stream: OK\0')); return; }
      }
    });
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); }); });
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Test malware scanner failed to bind');
  return { server, port: address.port };
}

test('Practice receipt versions are firm-scoped, scanned, immutable and provider-pinned', { timeout: 120_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('practice_receipts').withUsername('receipt_owner').withPassword(randomBytes(24).toString('hex')).start();
  const originalFetch = globalThis.fetch;
  const names = ['DATABASE_URL', 'MIGRATION_DATABASE_URL', 'NODE_ENV', 'STORAGE_PROVIDER', 'M365_TENANT_ID', 'M365_CLIENT_ID', 'M365_CLIENT_SECRET', 'CLAMAV_HOST', 'CLAMAV_PORT'];
  const originalEnv = new Map(names.map(name => [name, process.env[name]]));
  const objects = new Map<string, Buffer>();
  let scanner: Server | undefined;
  try {
    const uri = container.getConnectionUri();
    const env = { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri };
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, env, {
      STORAGE_PROVIDER: 'graph', M365_TENANT_ID: randomUUID(), M365_CLIENT_ID: randomUUID(), M365_CLIENT_SECRET: 'synthetic-test-secret',
    });
    scanner = (await startScanner()).server;
    const scannerAddress = scanner.address();
    if (!scannerAddress || typeof scannerAddress === 'string') throw new Error('Test malware scanner failed to bind');
    process.env.CLAMAV_HOST = '127.0.0.1'; process.env.CLAMAV_PORT = String(scannerAddress.port);

    globalThis.fetch = (async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      if (url.hostname === 'login.microsoftonline.com') return Response.json({ access_token: 'synthetic-graph-token', expires_in: 3600 });
      const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      if (init?.method === 'PUT' && url.pathname.includes(':/')) {
        const id = `receipt-${objects.size + 1}`;
        const body = init.body;
        objects.set(id, body instanceof ReadableStream ? Buffer.from(await new Response(body).arrayBuffer()) : Buffer.from(body as Uint8Array));
        return Response.json({ id, eTag: `etag-${id}` });
      }
      const itemIndex = segments.indexOf('items'); const itemId = segments[itemIndex + 1]; const bytes = objects.get(itemId);
      if (url.pathname.endsWith('/versions')) return bytes ? Response.json({ value: [{ id: 'v1', size: bytes.byteLength }] }) : Response.json({ error: 'missing' }, { status: 404 });
      if (url.pathname.endsWith('/versions/v1')) return bytes ? Response.json({ id: 'v1', size: bytes.byteLength }) : Response.json({ error: 'missing' }, { status: 404 });
      if (url.pathname.endsWith('/versions/v1/content')) return bytes ? new Response(new Uint8Array(bytes)) : Response.json({ error: 'missing' }, { status: 404 });
      throw new Error(`Unexpected Graph request ${init?.method ?? 'GET'} ${url.pathname}`);
    }) as typeof fetch;

    const { db, approveFirmPostingPolicy, createPracticeAccount, createPracticePeriod, createPracticeExpenseDraft, postPracticeJournal, attachPracticeExpenseReceipt, listPracticeExpenseReceipts, practiceLedger } = await import('@auditsphere/server');
    try {
      const firmId = randomUUID(), clientId = randomUUID(), engagementId = randomUUID(), actorId = randomUUID();
      await db.firm.create({ data: { id: firmId, name: 'Private receipt test firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'Synthetic client' } });
      await db.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'Receipt test engagement' } });
      await db.user.create({ data: { id: actorId, email: `receipt-${actorId}@example.test`, role: 'BILLING' } });
      await db.membership.create({ data: { userId: actorId, firmId, clientId, engagementId, role: 'BILLING' } });
      for (const capability of ['PRACTICE_READ', 'PRACTICE_MANAGE', 'PRACTICE_POST'] as const) {
        await db.roleGrant.create({ data: { userId: actorId, capability, firmId, grantedBy: actorId } });
        await db.roleGrant.create({ data: { userId: actorId, capability, firmId, clientId, engagementId, grantedBy: actorId } });
      }
      const driveId = randomUUID(), folderId = randomUUID();
      await db.firmRepository.create({ data: { firmId, purpose: 'practice-private', provider: 'graph', driveId, folderId } });
      const expenseAccount = await createPracticeAccount(actorId, engagementId, { code: '500', name: 'Office rent', kind: 'EXPENSE' });
      const payable = await createPracticeAccount(actorId, engagementId, { code: '210', name: 'Accrued expense', kind: 'LIABILITY' });
      const period = await createPracticePeriod(actorId, engagementId, { startsOn: '2026-01-01', endsOn: '2026-12-31' });
      await approveFirmPostingPolicy(actorId, engagementId, { policyVersion: 'TEST-D07-1', revenueTreatment: 'DEFERRED_UNTIL_RELEASE', taxTreatment: 'NO_TAX', idempotencyKey: randomUUID() });
      const draft = await createPracticeExpenseDraft(actorId, engagementId, { periodId: period.id, accountingDate: '2026-10-04', category: 'OFFICE_RENT_FACILITIES', reference: 'EXP-RECEIPT-1', description: 'Synthetic rent receipt test', amount: '100.25', debitAccountId: expenseAccount.id, creditAccountId: payable.id, idempotencyKey: randomUUID() });

      const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0xff, 0xd9]);
      await assert.rejects(attachPracticeExpenseReceipt(actorId, engagementId, draft.id, randomUUID(), { filename: 'spoof.png', mimetype: 'image/png', file: (async function* () { yield jpeg; })() }), /must match/);
      assert.equal(await db.practiceExpenseReceipt.count({ where: { firmId } }), 0, 'mismatched signature is never attached');

      const uploadKey = randomUUID();
      const attached = await attachPracticeExpenseReceipt(actorId, engagementId, draft.id, uploadKey, { filename: 'rent.jpg', mimetype: 'image/jpeg', file: (async function* () { yield jpeg.subarray(0, 3); yield jpeg.subarray(3); })() });
      assert.equal(attached.sequence, 1);
      assert.equal(attached.filename, 'rent.jpg');
      assert.equal(attached.contentType, 'image/jpeg');
      assert.equal(attached.sizeBytes, jpeg.byteLength);
      assert.equal(objects.size, 1);
      const record = await db.practiceExpenseReceipt.findUniqueOrThrow({ where: { id: attached.id } });
      assert.equal(record.provider, 'graph');
      assert.equal(record.driveId, driveId);
      assert.equal(record.sha256, createHash('sha256').update(jpeg).digest('hex'));
      assert.equal(record.storageReference.startsWith('graph:'), true);
      assert.deepEqual(await listPracticeExpenseReceipts(actorId, engagementId, draft.id), [attached]);
      const replay = await attachPracticeExpenseReceipt(actorId, engagementId, draft.id, uploadKey, { filename: 'rent.jpg', mimetype: 'image/jpeg', file: (async function* () { yield jpeg; })() });
      assert.deepEqual(replay, attached, 'same-key retry returns the original immutable version without another provider write');
      assert.equal(objects.size, 1);
      assert.deepEqual((await practiceLedger(actorId, engagementId)).expenses.find(item => item.journalId === draft.id)?.receipts, [attached]);
      const session = await db.practiceExpenseReceiptUploadSession.findFirstOrThrow({ where: { receiptId: attached.id } });
      assert.equal(session.status, 'ATTACHED');
      assert.equal(session.actorId, actorId);
      await assert.rejects(db.practiceExpenseReceipt.update({ where: { id: attached.id }, data: { filename: 'changed.jpg' } }), /immutable/);
      await assert.rejects(db.practiceExpenseReceiptUploadSession.update({ where: { id: session.id }, data: { status: 'STORED' } }), /terminal/);
      const event = await db.auditEvent.findFirstOrThrow({ where: { engagementId, action: 'PRACTICE_EXPENSE_RECEIPT_ATTACHED', resourceId: attached.id } });
      assert.equal(event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload) ? (event.payload as Record<string, unknown>).storageReference : null, undefined, 'provider references do not enter the audit payload');

      const forbiddenActor = randomUUID();
      await db.user.create({ data: { id: forbiddenActor, email: `ungranted-${forbiddenActor}@example.test`, role: 'BILLING' } });
      await db.membership.create({ data: { userId: forbiddenActor, firmId, clientId, engagementId, role: 'BILLING' } });
      await assert.rejects(attachPracticeExpenseReceipt(forbiddenActor, engagementId, draft.id, randomUUID(), { filename: 'denied.jpg', mimetype: 'image/jpeg', file: (async function* () { yield jpeg; })() }), /not granted|firm-wide/);
      assert.equal(objects.size, 1, 'unauthorized receipt attempts never reach Graph');

      const posted = await postPracticeJournal(actorId, engagementId, draft.id, { expectedVersion: 1, idempotencyKey: randomUUID() });
      assert.equal(posted.status, 'POSTED', 'receipt support does not bypass canonical journal posting');
      const postedLedger = await practiceLedger(actorId, engagementId);
      assert.equal(postedLedger.expenses.find(item => item.journalId === draft.id)?.receipts.length, 1);
      console.log('Practice receipt bytes were scanned, stored in the firm-only Graph binding, pinned immutably, audited and returned without provider references.');
    } finally { await db.$disconnect(); }
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of originalEnv) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    if (scanner) await new Promise<void>(resolve => scanner!.close(() => resolve()));
    await container.stop();
  }
});
