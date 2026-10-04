import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);

test('role-routed notifications use durable snapshots, explicit retries and UNKNOWN reconciliation', { timeout: 120_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('notifications').withUsername('notifications_owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const databaseUrl = container.getConnectionUri();
    const env = { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'notifications-integration', DATABASE_URL: databaseUrl, MIGRATION_DATABASE_URL: databaseUrl };
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env, timeout: 75_000, stdio: 'pipe' });
    Object.assign(process.env, env);
    const [database, notificationModule] = await Promise.all([
      import('../packages/server/src/platform/db.js'),
      import('../packages/server/src/platform/notifications.js'),
    ]);
    const { db } = database;
    try {
      const firmId = randomUUID(), clientId = randomUUID(), engagementId = randomUUID();
      const approverId = randomUUID(), billingId = randomUUID(), preparerId = randomUUID(), reviewerId = randomUUID(), adminId = randomUUID();
      await db.firm.create({ data: { id: firmId, name: 'Synthetic notification firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'Synthetic notification client' } });
      await db.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'Synthetic notification engagement' } });
      await db.user.createMany({ data: [
        { id: approverId, email: 'approver@fixture.test', role: 'APPROVER' },
        { id: billingId, email: 'billing@fixture.test', role: 'BILLING' },
        { id: preparerId, email: 'preparer@fixture.test', role: 'PREPARER' },
        { id: reviewerId, email: 'reviewer@fixture.test', role: 'REVIEWER' },
        { id: adminId, email: 'admin@fixture.test', role: 'ADMIN' },
      ] });
      await db.membership.createMany({ data: [
        { userId: approverId, firmId, clientId, engagementId, role: 'APPROVER' },
        { userId: billingId, firmId, clientId, engagementId, role: 'BILLING' },
        { userId: preparerId, firmId, clientId, engagementId, role: 'PREPARER' },
        { userId: reviewerId, firmId, clientId, engagementId, role: 'REVIEWER' },
      ] });
      await db.roleGrant.createMany({ data: [
        ...[approverId, billingId, preparerId, reviewerId].map(userId => ({ userId, capability: 'ENGAGEMENT_READ', firmId, clientId, engagementId, grantedBy: adminId })),
        { userId: approverId, capability: 'EXTERNAL_COMMUNICATION_SEND', firmId, clientId, engagementId, grantedBy: adminId },
        { userId: approverId, capability: 'EXTERNAL_COMMUNICATION_RECONCILE', firmId, clientId, engagementId, grantedBy: adminId },
        { userId: approverId, capability: 'EXTERNAL_COMMUNICATION_READ', firmId, clientId, engagementId, grantedBy: adminId },
        { userId: billingId, capability: 'EXTERNAL_COMMUNICATION_SEND', firmId, clientId, engagementId, grantedBy: adminId },
        { userId: billingId, capability: 'EXTERNAL_COMMUNICATION_RECONCILE', firmId, clientId, engagementId, grantedBy: adminId },
        { userId: billingId, capability: 'EXTERNAL_COMMUNICATION_READ', firmId, clientId, engagementId, grantedBy: adminId },
        { userId: reviewerId, capability: 'EXTERNAL_COMMUNICATION_READ', firmId, clientId, engagementId, grantedBy: adminId },
      ] });
      const scope = { firmId, clientId, engagementId };
      const contacts = [
        { id: randomUUID(), role: 'MD_GM' as const, email: 'managing-director@example.test', active: true, emailVerified: true, externalCommunicationAllowed: true },
        { id: randomUUID(), role: 'AUDIT_LIAISON' as const, email: ' Liaison@Example.test ', active: true, emailVerified: true, externalCommunicationAllowed: true },
        { id: randomUUID(), role: 'CFO_FD' as const, email: 'finance@example.test', active: true, emailVerified: true, externalCommunicationAllowed: true },
        { id: randomUUID(), role: 'AUDIT_LIAISON' as const, email: 'inactive@example.test', active: false, emailVerified: true, externalCommunicationAllowed: true },
        { id: randomUUID(), role: 'AUDIT_LIAISON' as const, email: 'unverified@example.test', active: true, emailVerified: false, externalCommunicationAllowed: true },
      ];
      const create = (actorId: string, eventKey: string, eventType: 'PBC_REQUEST' | 'PAYMENT_RECEIPT' | 'DELIVERABLES') => db.$transaction(tx => notificationModule.createRoutedNotification(tx, {
        scope, actorId, eventKey, eventType, contacts, inAppUserIds: [billingId, reviewerId],
        title: `Synthetic ${eventType}`, body: 'Synthetic event body', subject: `Synthetic ${eventType}`, textBody: 'Synthetic mail body',
      }));

      const receipt = await create(approverId, 'pbc:event:001', 'PBC_REQUEST');
      assert.equal(receipt.status, 'QUEUED');
      const pbc = await db.outboundMessage.findFirstOrThrow({ where: { eventKey: 'pbc:event:001' } });
      assert.equal(pbc.recipientRole, 'AUDIT_LIAISON');
      assert.deepEqual(pbc.recipientSnapshot, [{ contactId: contacts[1]!.id, role: 'AUDIT_LIAISON', email: 'liaison@example.test' }]);
      const duplicate = await create(approverId, 'pbc:event:001', 'PBC_REQUEST');
      assert.equal(duplicate.created, false);
      assert.equal(await db.outboundMessage.count({ where: { engagementId, eventKey: 'pbc:event:001' } }), 1, 'reprocessing an event cannot create duplicate mail intent');
      assert.equal(await db.notification.count({ where: { engagementId, eventKey: 'pbc:event:001' } }), 2, 'inbox events are also unique per recipient');
      await assert.rejects(db.$transaction(tx => notificationModule.createRoutedNotification(tx, {
        scope, actorId: approverId, eventKey: 'pbc:event:001', eventType: 'PBC_REQUEST', contacts, inAppUserIds: [billingId],
        title: 'Different title', body: 'Synthetic event body', subject: 'Different subject', textBody: 'Synthetic mail body',
      })), /reused with different notification content/);
      await assert.rejects(db.outboundMessage.create({ data: {
        engagementId, createdBy: approverId, eventKey: 'invalid:snapshot:001', eventType: 'PAYMENT_RECEIPT', recipientRole: 'CFO_FD',
        recipientSnapshot: [{ contactId: randomUUID(), role: 'MD_GM', email: 'wrong-role@example.test' }], subject: 'Synthetic invalid snapshot', textBody: 'Must fail at the database boundary',
      } }), /outbound_recipient_snapshot_check/);

      const inbox = await notificationModule.listNotificationInbox(billingId, engagementId, true);
      assert.equal(inbox.length, 1);
      const read = await notificationModule.markNotificationRead(billingId, engagementId, inbox[0]!.id, 1);
      assert.equal(read.version, 2);
      await assert.rejects(notificationModule.markNotificationRead(billingId, engagementId, inbox[0]!.id, 1), /changed/);

      await assert.rejects(create(preparerId, 'prep:event:001', 'PAYMENT_RECEIPT'), /not granted/);
      assert.equal(await db.outboundMessage.count({ where: { eventKey: 'prep:event:001' } }), 0, 'preparers cannot start external dispatch');

      let sentCount = 0;
      const acceptedProvider = new notificationModule.GraphMailProvider({ tenantId: randomUUID(), clientId: randomUUID(), clientSecret: 'private-test-secret', sender: 'notifications@example.test' }, async input => {
        if (String(input).includes('/oauth2/')) return new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }), { status: 200 });
        sentCount++;
        return new Response(null, { status: 202, headers: { 'request-id': 'synthetic-graph-request' } });
      });
      const concurrentDispatches = await Promise.all([notificationModule.dispatchPendingNotifications(acceptedProvider), notificationModule.dispatchPendingNotifications(acceptedProvider)]);
      assert.equal(concurrentDispatches.reduce((count, result) => count + result.claimed, 0), 1, 'concurrent workers claim the durable intent once');
      assert.equal(concurrentDispatches.reduce((count, result) => count + result.accepted, 0), 1);
      assert.equal(sentCount, 1, 'provider sees one send despite concurrent scans');
      assert.equal((await db.outboundMessage.findUniqueOrThrow({ where: { id: pbc.id } })).status, 'SENT');

      await create(billingId, 'receipt:event:001', 'PAYMENT_RECEIPT');
      const failedProvider = new notificationModule.GraphMailProvider({ tenantId: randomUUID(), clientId: randomUUID(), clientSecret: 'private-test-secret', sender: 'notifications@example.test' }, async input =>
        String(input).includes('/oauth2/') ? new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }), { status: 200 }) : new Response(null, { status: 403 }),
      );
      const failure = await notificationModule.dispatchPendingNotifications(failedProvider);
      assert.deepEqual(failure, { claimed: 1, accepted: 0, failed: 1, unknown: 0, disabled: false });
      const failedMessage = await db.outboundMessage.findFirstOrThrow({ where: { eventKey: 'receipt:event:001' } });
      assert.equal(failedMessage.recipientRole, 'CFO_FD');
      assert.deepEqual(failedMessage.recipientSnapshot, [{ contactId: contacts[2]!.id, role: 'CFO_FD', email: 'finance@example.test' }]);
      assert.equal(failedMessage.status, 'FAILED');
      assert.equal(await db.outboundMessage.count({ where: { engagementId, eventKey: 'receipt:event:001' } }), 1);
      const retry = await notificationModule.retryFailedOutbound(billingId, engagementId, failedMessage.id, failedMessage.version, 'Confirmed provider rejection');
      assert.equal(retry.status, 'QUEUED');
      assert.equal((await notificationModule.dispatchPendingNotifications(acceptedProvider)).accepted, 1);
      assert.equal(await db.outboundMessage.count({ where: { engagementId, eventKey: 'receipt:event:001' } }), 1, 'a manual retry reuses the same event record');

      await create(approverId, 'deliverable:event:001', 'DELIVERABLES');
      const deliverable = await db.outboundMessage.findFirstOrThrow({ where: { eventKey: 'deliverable:event:001' } });
      assert.equal(deliverable.recipientRole, 'MD_GM');
      assert.deepEqual(deliverable.recipientSnapshot, [{ contactId: contacts[0]!.id, role: 'MD_GM', email: 'managing-director@example.test' }]);
      const ambiguousProvider = new notificationModule.GraphMailProvider({ tenantId: randomUUID(), clientId: randomUUID(), clientSecret: 'private-test-secret', sender: 'notifications@example.test' }, async input =>
        String(input).includes('/oauth2/') ? new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }), { status: 200 }) : new Response(null, { status: 503 }),
      );
      assert.deepEqual(await notificationModule.dispatchPendingNotifications(ambiguousProvider), { claimed: 1, accepted: 0, failed: 0, unknown: 1, disabled: false });
      const unknown = await db.outboundMessage.findFirstOrThrow({ where: { eventKey: 'deliverable:event:001' } });
      assert.equal(unknown.status, 'UNKNOWN');
      assert.equal((await notificationModule.dispatchPendingNotifications(acceptedProvider)).claimed, 0, 'unknown provider outcomes are never automatically replayed');
      const reconciled = await notificationModule.reconcileUnknownOutbound(approverId, engagementId, unknown.id, unknown.version, 'SENT', 'ticket:synthetic-mail-trace-001', 'Provider trace confirms acceptance');
      assert.equal(reconciled.status, 'RECONCILED_SENT');
      assert.equal((await db.deliveryAttempt.findFirstOrThrow({ where: { outboundMessageId: unknown.id } })).state, 'RECONCILED_SENT');
      assert.equal(await db.outboundMessageAction.count({ where: { outboundMessageId: failedMessage.id, action: 'MANUAL_RETRY', actorId: billingId, reason: 'Confirmed provider rejection' } }), 1, 'manual retry decision and reason are retained append-only');
      assert.equal(await db.outboundMessageAction.count({ where: { outboundMessageId: unknown.id, action: 'RECONCILE', actorId: approverId, evidenceReference: 'ticket:synthetic-mail-trace-001' } }), 1, 'reconciliation actor and evidence are retained append-only');

      await create(approverId, 'stale:event:001', 'PBC_REQUEST');
      let releaseSend!: (response: Response) => void;
      let notifyStarted!: () => void;
      const sendStarted = new Promise<void>(resolve => { notifyStarted = resolve; });
      const slowProvider = new notificationModule.GraphMailProvider({ tenantId: randomUUID(), clientId: randomUUID(), clientSecret: 'private-test-secret', sender: 'notifications@example.test' }, async input => {
        if (String(input).includes('/oauth2/')) return new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }), { status: 200 });
        notifyStarted();
        return new Promise<Response>(resolve => { releaseSend = resolve; });
      });
      const lateDispatch = notificationModule.dispatchPendingNotifications(slowProvider);
      await sendStarted;
      assert.equal((await notificationModule.dispatchPendingNotifications(null, { now: new Date(Date.now() + 91_000) })).unknown, 1, 'expired send lease is conservatively made UNKNOWN');
      releaseSend(new Response(null, { status: 202 }));
      assert.equal((await lateDispatch).accepted, 0, 'late provider response cannot overwrite a reconciled/expired claim');
      assert.equal((await db.outboundMessage.findFirstOrThrow({ where: { eventKey: 'stale:event:001' } })).status, 'UNKNOWN');
      assert.equal((await notificationModule.listOutboundMessages(reviewerId, engagementId)).length, 4);
      await assert.rejects(notificationModule.reconcileUnknownOutbound(preparerId, engagementId, unknown.id, reconciled.version, 'NOT_SENT', 'ticket:synthetic-mail-trace-002', 'Not authorized for reconciliation'), /not granted/);
    } finally { await db.$disconnect(); }
  } finally { await container.stop(); }
});

test('recipient snapshot routing validates role, consent and email before it is frozen', async () => {
  const { snapshotAuthorizedRecipients, configuredGraphMailProvider } = await import('../packages/server/src/platform/notifications.js');
  const recipients = snapshotAuthorizedRecipients('PAYMENT_RECEIPT', [
    { id: 'contact-cfo', role: 'CFO_FD', email: ' CFO@Example.test ', active: true, emailVerified: true, externalCommunicationAllowed: true },
    { id: 'wrong-role', role: 'AUDIT_LIAISON', email: 'liaison@example.test', active: true, emailVerified: true, externalCommunicationAllowed: true },
    { id: 'unapproved', role: 'CFO_FD', email: 'blocked@example.test', active: true, emailVerified: true, externalCommunicationAllowed: false },
    { id: 'bad-email', role: 'CFO_FD', email: 'unsafe <x@example.test>', active: true, emailVerified: true, externalCommunicationAllowed: true },
  ]);
  assert.deepEqual(recipients, [{ contactId: 'contact-cfo', role: 'CFO_FD', email: 'cfo@example.test' }]);
  assert.equal(configuredGraphMailProvider({ NOTIFICATION_PROVIDER: 'disabled' }), null);
  assert.throws(() => configuredGraphMailProvider({ NOTIFICATION_PROVIDER: 'graph' }), /not configured/);
  assert.throws(() => snapshotAuthorizedRecipients('PBC_REQUEST', []), /No verified, authorized AUDIT_LIAISON/);
  const provider = new (await import('../packages/server/src/platform/notifications.js')).GraphMailProvider({ tenantId: randomUUID(), clientId: randomUUID(), clientSecret: 'private-test-secret', sender: 'notifications@example.test' }, async input =>
    String(input).includes('/oauth2/') ? new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }), { status: 200 }) : new Response(null, { status: 202 }),
  );
  const accepted = await provider.send({ recipients, subject: 'Synthetic receipt', textBody: 'A plain-text acceptance message' });
  assert.equal(accepted.status, 202);
  assert.match(accepted.receipt!, /^[0-9a-f-]{36}$/i, 'the client correlation ID remains available if Graph omits request-id');
});
