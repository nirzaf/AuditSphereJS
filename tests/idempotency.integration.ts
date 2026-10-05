import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const isHttpStatus = (status: number) => (error: unknown) => Boolean(error && typeof error === 'object' && 'getStatus' in error && typeof (error as { getStatus?: unknown }).getStatus === 'function' && (error as { getStatus: () => number }).getStatus() === status);
function invoiceId(value: unknown): string {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value) && 'id' in value && typeof value.id === 'string', 'invoice command returned no invoice id');
  return value.id;
}

test('operation idempotency is durable, scoped, authorized and safe under concurrent payment retries', { timeout: 180_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('idempotency').withUsername('owner').withPassword(randomBytes(24).toString('hex')).start();
  const previousRedisUrl = process.env.REDIS_URL;
  try {
    const uri = container.getConnectionUri();
    const env = { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri };
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env, timeout: 60_000, stdio: 'pipe' });
    Object.assign(process.env, env);
    // Deliberately unavailable Redis: the financial command's durable key is PostgreSQL-owned.
    process.env.REDIS_URL = 'redis://127.0.0.1:1';
    const [{ db }, { issueInvoice, recordInvoicePayment }, { normalizedRequestHash, recordUnknownOperation, startOperation }] = await Promise.all([
      import('../packages/server/src/platform/db.js'),
      import('../packages/server/src/modules/practice/invoices.js'),
      import('../packages/server/src/platform/idempotency.js'),
    ]);
    try {
      const firmId = randomUUID(), clientId = randomUUID(), engagementId = randomUUID(), secondEngagementId = randomUUID(), actorId = randomUUID();
      await db.user.create({ data: { id: actorId, email: 'billing-idempotency@test.local', role: 'BILLING' } });
      await db.firm.create({ data: { id: firmId, name: 'Idempotency firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'Idempotency client' } });
      await db.engagement.createMany({ data: [
        { id: engagementId, firmId, clientId, name: 'Primary test engagement' },
        { id: secondEngagementId, firmId, clientId, name: 'Second test engagement' },
      ] });
      await db.membership.createMany({ data: [
        { userId: actorId, firmId, clientId, engagementId, role: 'BILLING' },
        { userId: actorId, firmId, clientId, engagementId: secondEngagementId, role: 'BILLING' },
      ] });
      await db.roleGrant.createMany({ data: [
        { userId: actorId, capability: 'PRACTICE_MANAGE', firmId, grantedBy: actorId },
        { userId: actorId, capability: 'PRACTICE_POST', firmId, grantedBy: actorId },
      ] });
      await db.practiceAccount.createMany({ data: [
        { firmId, code: '100', name: 'Cash and bank', kind: 'ASSET' },
        { firmId, code: '120', name: 'Client receivables', kind: 'ASSET' },
        { firmId, code: '200', name: 'Deferred engagement fees', kind: 'LIABILITY' },
      ] });
      await db.practicePeriod.create({ data: { firmId, startsOn: new Date('2000-01-01T00:00:00.000Z'), endsOn: new Date('2100-12-31T00:00:00.000Z') } });
      await db.firmPostingPolicy.create({ data: { firmId, policyVersion: 'TEST-D07-IDEMPOTENCY', approvedBy: actorId, revenueTreatment: 'DEFERRED_UNTIL_RELEASE', taxTreatment: 'NO_TAX' } });

      for (const scopedEngagementId of [engagementId, secondEngagementId]) {
        const proposal = await db.commercialProposal.create({ data: {
          firmId, clientId, engagementId: scopedEngagementId, service: 'Idempotency test audit',
          periodStart: new Date('2025-01-01T00:00:00.000Z'), periodEnd: new Date('2025-12-31T00:00:00.000Z'),
          totalAmount: '100.00', status: 'ACCEPTED', revision: 1,
          presentedSnapshot: { revision: 1, totalAmount: '100.00', service: 'Idempotency test audit' },
          clientResponse: { revision: 1, evidenceRef: 'synthetic-acceptance' }, createdBy: actorId,
        } });
        await db.engagementLetterRecord.create({ data: {
          firmId, clientId, engagementId: scopedEngagementId, proposalId: proposal.id,
          letterText: 'Synthetic issued engagement letter', issuedBy: actorId,
        } });
      }

      const sameKeyAcrossScopes = randomUUID();
      const invoiceInput = { idempotencyKey: sameKeyAcrossScopes, kind: 'ADVANCE_50' as const, dueOn: '2026-12-31' };
      const firstInvoiceId = invoiceId(await issueInvoice(actorId, engagementId, invoiceInput));
      const scopedInvoiceId = invoiceId(await issueInvoice(actorId, secondEngagementId, invoiceInput));
      assert.notEqual(firstInvoiceId, scopedInvoiceId, 'the same caller key in another engagement is a distinct operation');
      assert.equal(invoiceId(await issueInvoice(actorId, engagementId, invoiceInput)), firstInvoiceId, 'a durable same-key replay returns the original invoice');
      await assert.rejects(issueInvoice(actorId, engagementId, { ...invoiceInput, dueOn: '2027-01-01' }), isHttpStatus(409), 'same scope/action/key with changed terms conflicts');

      const legacyKey = randomUUID();
      const legacyBody = { idempotencyKey: legacyKey, kind: 'ADVANCE_50' as const, amount: '100.00' };
      const legacyHash = createHash('sha256').update(JSON.stringify({ engagementId, operation: 'ISSUE_INVOICE', body: legacyBody })).digest('hex');
      const legacyResult = { id: firstInvoiceId, number: 1, kind: 'ADVANCE_50', amount: '100.00', status: 'ISSUED' };
      await db.commandReceipt.create({ data: { key: legacyKey, engagementId, actorId, hash: legacyHash, result: legacyResult } });
      assert.equal(invoiceId(await issueInvoice(actorId, engagementId, legacyBody)), firstInvoiceId, 'a matching historical invoice receipt still replays after the additive migration');
      assert.equal(await db.engagementInvoice.count({ where: { engagementId, kind: 'ADVANCE_50' } }), 1, 'legacy replay does not issue a duplicate invoice');

      // The action dimension permits a caller key used to create an invoice to be reused for
      // a separate payment command in that same authorized engagement.
      const crossActionKey = randomUUID();
      const paymentInvoiceId = invoiceId(await issueInvoice(actorId, engagementId, { idempotencyKey: crossActionKey, kind: 'FINAL_50', dueOn: '2027-01-31' }));
      await recordInvoicePayment(actorId, engagementId, paymentInvoiceId, { idempotencyKey: crossActionKey, amount: '5.00', reference: 'BANK-ACTION-KEY' });

      const paymentKey = randomUUID();
      const paymentBody = { idempotencyKey: paymentKey, amount: '7.00', reference: 'BANK-RACE-001' };
      const [first, concurrentRetry] = await Promise.all([
        recordInvoicePayment(actorId, engagementId, paymentInvoiceId, paymentBody),
        recordInvoicePayment(actorId, engagementId, paymentInvoiceId, paymentBody),
      ]);
      assert.deepEqual(concurrentRetry, first, 'identical simultaneous retries return one committed result');
      assert.equal(await db.invoicePayment.count({ where: { invoiceId: paymentInvoiceId, reference: paymentBody.reference } }), 1, 'one payment row exists for the concurrent command');
      assert.equal(await db.operationRequest.count({ where: { engagementId, actorId, action: 'PRACTICE.INVOICE.PAYMENT', callerKey: paymentKey } }), 1);
      await assert.rejects(
        recordInvoicePayment(actorId, engagementId, paymentInvoiceId, { ...paymentBody, amount: '8.00' }),
        isHttpStatus(409),
        'a reused operation key cannot change its body',
      );

      // Current authority is rechecked before a stored response can be replayed.
      const manageGrant = await db.roleGrant.findFirstOrThrow({ where: { userId: actorId, capability: 'PRACTICE_MANAGE', firmId } });
      await db.roleGrant.update({ where: { id: manageGrant.id }, data: { revokedAt: new Date(), revokedBy: actorId, reason: 'Verify replay authorization boundary' } });
      await assert.rejects(recordInvoicePayment(actorId, engagementId, paymentInvoiceId, paymentBody), isHttpStatus(403));
      await db.roleGrant.update({ where: { id: manageGrant.id }, data: { revokedAt: null, revokedBy: null, reason: null } });

      const unknownKey = randomUUID();
      const unknownHash = normalizedRequestHash({ target: 'synthetic-mail-dispatch' });
      const unknownStart = await db.$transaction(tx => startOperation(tx, {
        firmId, clientId, engagementId, actorId, action: 'TEST.EXTERNAL.DISPATCH', callerKey: unknownKey, requestHash: unknownHash,
      }));
      assert.equal(unknownStart.kind, 'execute');
      if (unknownStart.kind === 'execute') {
        await recordUnknownOperation(unknownStart.operationId, 'PROVIDER_TIMEOUT');
        await recordUnknownOperation(unknownStart.operationId, 'PROVIDER_TIMEOUT');
        const unknown = await db.operationRequest.findUniqueOrThrow({ where: { id: unknownStart.operationId } });
        assert.equal(unknown.state, 'UNKNOWN');
        assert.equal(unknown.unknownCode, 'PROVIDER_TIMEOUT');
        await assert.rejects(db.$transaction(tx => startOperation(tx, {
          firmId, clientId, engagementId, actorId, action: 'TEST.EXTERNAL.DISPATCH', callerKey: unknownKey, requestHash: unknownHash,
        })), isHttpStatus(409), 'an unresolved external result cannot be blindly resent');
      }
    } finally {
      await db.$disconnect();
    }
  } finally {
    if (previousRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previousRedisUrl;
    await container.stop();
  }
});
