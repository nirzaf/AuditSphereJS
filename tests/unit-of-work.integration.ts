import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const firmId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const clientId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const engagementId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const actorId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

/** Derive a stable v4-shaped UUID from the command so a retry reuses the same business identifier. */
function deriveKey(...parts: string[]): string {
  const hex = createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = (parseInt(hex[16], 16) & 0b1011 | 0b1000).toString(16);
  const h = hex.join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** A module-owned facade: writes domain + audit + receipt on the shared transaction client. */
async function recordCommand(scope: any, command: string) {
  await scope.lockForUpdate(scope.client, 'Engagement', engagementId);
  const key = deriveKey(engagementId, command);
  const audit = await scope.client.auditEvent.create({ data: { engagementId, actorId, action: `UOW_${command}`, payload: { command } } });
  await scope.client.commandReceipt.create({ data: { key, engagementId, actorId, hash: key, result: { command, auditId: audit.id } } });
  return { key, auditId: audit.id };
}

test('unit of work commits atomically, shares one transaction, rolls back and retries without duplication', { timeout: 180_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('auditsphere_uow').withUsername('test_owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env: { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri }, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, { NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri });
      const { db, runUnitOfWork, lockForUpdate, createProposal, createRisk } = await import('@auditsphere/server');
    const noWait = async () => {};
    try {
      await db.firm.create({ data: { id: firmId, name: 'UoW firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'UoW client' } });
      await db.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'UoW engagement' } });
      await db.user.create({ data: { id: actorId, email: 'uow@example.test', role: 'APPROVER' } });
      await db.membership.create({ data: { userId: actorId, firmId, clientId, engagementId, role: 'APPROVER' } });
      await db.roleGrant.createMany({ data: [
        { userId: actorId, capability: 'COMMERCIAL_MANAGE', firmId, clientId, engagementId, grantedBy: actorId },
        { userId: actorId, capability: 'RISK_MANAGE', firmId, clientId, engagementId, grantedBy: actorId },
      ] });
      await assert.rejects(db.commandReceipt.create({ data: { key: deriveKey('orphan-receipt'), engagementId: deriveKey('missing-engagement'), actorId, hash: 'orphan', result: {} } }), /CommandReceipt_engagementId_fkey/);

      // AC1: an induced failure after the first write rolls back the whole command, and a deferred
      // post-commit side effect never runs when the transaction aborts.
      let externalSideEffectRan = false;
      await assert.rejects(runUnitOfWork(async (scope) => {
        await scope.client.auditEvent.create({ data: { engagementId, actorId, action: 'UOW_PARTIAL', payload: {} } });
        scope.afterCommit(() => { externalSideEffectRan = true; });
        throw new Error('induced business failure');
      }, { wait: noWait }));
      assert.equal(await db.auditEvent.count({ where: { engagementId, action: 'UOW_PARTIAL' } }), 0);
      assert.equal(externalSideEffectRan, false, 'afterCommit must not run for a rolled-back command');

      // AC2: nested module calls reuse the same connection/transaction, so a child failure
      // rolls back the parent's earlier write too.
      await assert.rejects(runUnitOfWork(async (scope) => {
        await recordCommand({ ...scope, lockForUpdate }, 'PARENT');
        await scope.client.auditEvent.create({ data: { engagementId, actorId, action: 'CHILD', payload: {} } });
        throw new Error('child failed');
      }, { wait: noWait }));
      assert.equal(await db.auditEvent.count({ where: { engagementId, action: 'UOW_PARENT' } }), 0);
      assert.equal(await db.auditEvent.count({ where: { engagementId, action: 'CHILD' } }), 0);

      // Production module facades accept the explicit context and participate in the caller's
      // transaction. A failure after both domain commands must roll back each module's records,
      // audit events and the commercial operation receipt together.
      const proposalKey = deriveKey(engagementId, 'REAL_FACADE_ROLLBACK');
      await assert.rejects(runUnitOfWork(async (scope) => {
        await createProposal(actorId, engagementId, {
          idempotencyKey: proposalKey,
          service: 'Synthetic assurance engagement',
          periodStart: '2025-01-01',
          periodEnd: '2025-12-31',
          totalAmount: '120000.00',
        }, scope);
        await createRisk(actorId, engagementId, { title: 'Synthetic risk register item' }, scope);
        throw new Error('rollback production facades');
      }, { wait: noWait }), /rollback production facades/);
      assert.equal(await db.commercialProposal.count({ where: { engagementId } }), 0);
      assert.equal(await db.riskItem.count({ where: { engagementId, title: 'Synthetic risk register item' } }), 0);
      assert.equal(await db.commandReceipt.count({ where: { key: proposalKey } }), 0);
      assert.equal(await db.auditEvent.count({ where: { engagementId, action: { in: ['PROPOSAL_CREATED', 'RISK_CREATED'] } } }), 0);

      // Retrying a real module command after a transient conflict creates one proposal and one
      // durable receipt under its caller-supplied idempotency identifier.
      const retryKey = deriveKey(engagementId, 'REAL_FACADE_RETRY');
      let realFacadeAttempts = 0;
      const retriedProposal = await runUnitOfWork(async (scope) => {
        realFacadeAttempts += 1;
        const proposal = await createProposal(actorId, engagementId, {
          idempotencyKey: retryKey,
          service: 'Synthetic assurance engagement',
          periodStart: '2025-01-01',
          periodEnd: '2025-12-31',
          totalAmount: '120000.00',
        }, scope);
        if (realFacadeAttempts === 1) throw Object.assign(new Error('serialization failure'), { code: 'P2034' });
        return proposal;
      }, { maxAttempts: 3, wait: noWait }) as { id: string };
      assert.equal(realFacadeAttempts, 2);
      assert.equal(await db.commercialProposal.count({ where: { engagementId } }), 1);
      assert.equal(await db.commandReceipt.count({ where: { key: retryKey } }), 1);
      assert.equal(await db.commercialProposal.count({ where: { engagementId, id: retriedProposal.id } }), 1);

      // A successful command commits domain + audit + receipt together and flushes deferred work.
      let published = 0;
      const committed = await runUnitOfWork(async (scope) => {
        const result = await recordCommand({ ...scope, lockForUpdate }, 'SUCCESS');
        scope.afterCommit(() => { published += 1; });
        return result;
      }, { wait: noWait });
      assert.equal(published, 1);
      assert.equal(await db.auditEvent.count({ where: { engagementId, action: 'UOW_SUCCESS' } }), 1);
      assert.equal(await db.commandReceipt.count({ where: { key: committed.key } }), 1);

      // AC3: a retryable conflict re-runs the command from the start. Because the first attempt
      // rolled back and the identifier is deterministic, the retry leaves exactly one receipt.
      let attempts = 0;
      let retried = 0;
      const retriedResult = await runUnitOfWork(async (scope) => {
        attempts += 1;
        if (attempts === 1) throw Object.assign(new Error('serialization failure'), { code: 'P2034' });
        return recordCommand({ ...scope, lockForUpdate }, 'RETRY');
      }, { maxAttempts: 3, wait: noWait, onRetry: () => { retried += 1; } });
      assert.equal(attempts, 2);
      assert.equal(retried, 1);
      assert.equal(await db.commandReceipt.count({ where: { key: deriveKey(engagementId, 'RETRY') } }), 1);
      assert.equal(retriedResult.key, deriveKey(engagementId, 'RETRY'));

      // A non-retryable failure surfaces on the first attempt with no wasted retries.
      let nonRetryableAttempts = 0;
      await assert.rejects(runUnitOfWork(async () => {
        nonRetryableAttempts += 1;
        throw new Error('validation failed');
      }, { maxAttempts: 3, wait: noWait }));
      assert.equal(nonRetryableAttempts, 1);

      // A delivery failure happens after commit: never replay an already committed command.
      let committedAttempts = 0;
      await assert.rejects(runUnitOfWork(async (scope) => {
        committedAttempts += 1;
        await recordCommand({ ...scope, lockForUpdate }, 'DELIVERY_FAILURE');
        scope.afterCommit(() => { throw Object.assign(new Error('deadlock detected'), { code: 'P2034' }); });
      }, { maxAttempts: 3, wait: noWait }), /deadlock detected/);
      assert.equal(committedAttempts, 1);
      assert.equal(await db.commandReceipt.count({ where: { key: deriveKey(engagementId, 'DELIVERY_FAILURE') } }), 1);

      console.log('unit of work commits atomically, shares one transaction, rolls back and retries safely');
    } finally { await db.$disconnect(); }
  } finally { await container.stop(); }
});
