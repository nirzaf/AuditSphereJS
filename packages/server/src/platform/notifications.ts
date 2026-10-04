import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { db } from './db.js';
import { requireCapability, type Scope } from './authorization.js';

export type ContactRole = 'MD_GM' | 'CFO_FD' | 'AUDIT_LIAISON';
export type NotificationEvent = 'PROPOSAL' | 'ENGAGEMENT_LETTER' | 'DELIVERABLES' | 'INVOICE' | 'PAYMENT_RECEIPT' | 'FEE_NOTE' | 'PBC_REQUEST' | 'CONFIRMATION' | 'HOLDING_LETTER';
export type AuthorizedContact = { id: string; role: ContactRole; email: string; active: boolean; emailVerified: boolean; externalCommunicationAllowed: boolean };
export type RecipientSnapshot = { contactId: string; role: ContactRole; email: string };

const routedRole: Record<NotificationEvent, ContactRole> = {
  PROPOSAL: 'MD_GM', ENGAGEMENT_LETTER: 'MD_GM', DELIVERABLES: 'MD_GM', HOLDING_LETTER: 'MD_GM',
  INVOICE: 'CFO_FD', PAYMENT_RECEIPT: 'CFO_FD', FEE_NOTE: 'CFO_FD',
  PBC_REQUEST: 'AUDIT_LIAISON', CONFIRMATION: 'AUDIT_LIAISON',
};
const inboxKind: Record<NotificationEvent, string> = {
  PROPOSAL: 'PROPOSAL', ENGAGEMENT_LETTER: 'LETTER', DELIVERABLES: 'LETTER', HOLDING_LETTER: 'LETTER',
  INVOICE: 'INVOICE', PAYMENT_RECEIPT: 'PAYMENT_RECEIPT', FEE_NOTE: 'FEE_NOTE', PBC_REQUEST: 'PBC_REQUEST', CONFIRMATION: 'CONFIRMATION',
};

/** Select recipients only from server-resolved, active, verified contact-role records. */
export function snapshotAuthorizedRecipients(eventType: NotificationEvent, contacts: readonly AuthorizedContact[]): RecipientSnapshot[] {
  const role = routedRole[eventType];
  const unique = new Map<string, RecipientSnapshot>();
  for (const contact of contacts) {
    if (contact.role !== role || !contact.active || !contact.emailVerified || !contact.externalCommunicationAllowed) continue;
    const email = contact.email.trim().toLowerCase();
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || email.length > 320) continue;
    unique.set(email, { contactId: contact.id, role, email });
  }
  if (!unique.size) throw new ConflictException(`No verified, authorized ${role} contact is configured for this event`);
  return [...unique.values()].sort((a, b) => a.email.localeCompare(b.email));
}

export type CreateRoutedNotification = {
  scope: Scope; actorId: string; eventKey: string; eventType: NotificationEvent;
  contacts: readonly AuthorizedContact[]; inAppUserIds: readonly string[]; title: string; body: string; subject: string; textBody: string;
};

/** Call inside the originating business transaction; event key makes retries idempotent. */
export async function createRoutedNotification(tx: Prisma.TransactionClient, input: CreateRoutedNotification) {
  await requireCapability(tx, input.actorId, 'EXTERNAL_COMMUNICATION_SEND', input.scope);
  const title = input.title.trim(); const body = input.body.trim(); const subject = input.subject.trim(); const textBody = input.textBody.trim();
  if (!input.eventKey.trim() || input.eventKey.length > 200 || !title || title.length > 200 || !body || body.length > 2000 || !subject || subject.length > 300 || !textBody || textBody.length > 20_000) throw new ConflictException('Notification content is outside the supported limits');
  const existing = await tx.outboundMessage.findUnique({ where: { engagementId_eventKey: { engagementId: input.scope.engagementId, eventKey: input.eventKey } }, select: { id: true, status: true, version: true, eventType: true, subject: true, textBody: true } });
  if (existing) {
    if (existing.eventType !== input.eventType || existing.subject !== subject || existing.textBody !== textBody) throw new ConflictException('Event key was reused with different notification content');
    return { id: existing.id, status: existing.status, version: existing.version, created: false };
  }
  const recipients = snapshotAuthorizedRecipients(input.eventType, input.contacts);
  const memberships = input.inAppUserIds.length ? await tx.membership.findMany({ where: { userId: { in: [...new Set(input.inAppUserIds)] }, engagementId: input.scope.engagementId, firmId: input.scope.firmId, clientId: input.scope.clientId }, select: { userId: true } }) : [];
  const id = randomUUID();
  await tx.outboundMessage.create({ data: {
    id, engagementId: input.scope.engagementId, createdBy: input.actorId, eventKey: input.eventKey, eventType: input.eventType,
    recipientRole: routedRole[input.eventType], recipientSnapshot: recipients as unknown as Prisma.InputJsonValue,
    subject, textBody, provider: 'GRAPH', status: 'QUEUED',
  } });
  await tx.outboundMessageAction.create({ data: { outboundMessageId: id, actorId: input.actorId, action: 'CREATED', reason: `Business event ${input.eventType} queued` } });
  if (memberships.length) await tx.notification.createMany({ data: memberships.map(({ userId }) => ({
    engagementId: input.scope.engagementId, recipientUserId: userId, eventKey: input.eventKey,
    kind: inboxKind[input.eventType], title, body,
  })), skipDuplicates: true });
  return { id, status: 'QUEUED', version: 1, created: true };
}

export type GraphSendResult = { accepted: true; status: number; receipt: string | null };
export class GraphMailProvider {
  private token?: { value: string; expires: number };
  constructor(private readonly config: { tenantId: string; clientId: string; clientSecret: string; sender: string }, private readonly request: typeof fetch = fetch) {
    if (!config.tenantId || !config.clientId || !config.clientSecret || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.sender)) throw new Error('Invalid Graph notification provider configuration');
  }
  private async accessToken() {
    if (this.token && this.token.expires > Date.now() + 60_000) return this.token.value;
    const response = await this.request(`https://login.microsoftonline.com/${encodeURIComponent(this.config.tenantId)}/oauth2/v2.0/token`, {
      method: 'POST', body: new URLSearchParams({ client_id: this.config.clientId, client_secret: this.config.clientSecret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
      redirect: 'error', signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw Object.assign(new Error('Graph authentication rejected'), { code: `GRAPH_AUTH_${response.status}`, definite: true });
    const payload = await response.json() as { access_token?: string; expires_in?: number };
    if (!payload.access_token || !Number.isFinite(payload.expires_in)) throw Object.assign(new Error('Graph authentication response invalid'), { code: 'GRAPH_AUTH_RESPONSE_INVALID', definite: false });
    this.token = { value: payload.access_token, expires: Date.now() + Number(payload.expires_in) * 1000 };
    return this.token.value;
  }
  async send(message: { recipients: readonly RecipientSnapshot[]; subject: string; textBody: string }): Promise<GraphSendResult> {
    const token = await this.accessToken();
    const correlationId = randomUUID();
    const response = await this.request(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(this.config.sender)}/sendMail`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'client-request-id': correlationId, 'return-client-request-id': 'true' },
      body: JSON.stringify({ message: { subject: message.subject, body: { contentType: 'Text', content: message.textBody }, toRecipients: message.recipients.map(({ email }) => ({ emailAddress: { address: email } })) }, saveToSentItems: true }),
      redirect: 'error', signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 202) return { accepted: true, status: 202, receipt: (response.headers.get('request-id') ?? correlationId).slice(0, 500) };
    if (response.status >= 500) throw Object.assign(new Error('Graph notification outcome is ambiguous'), { code: `GRAPH_HTTP_${response.status}`, definite: false });
    throw Object.assign(new Error('Graph rejected the notification'), { code: `GRAPH_HTTP_${response.status}`, definite: true });
  }
}

export function configuredGraphMailProvider(env = process.env): GraphMailProvider | null {
  if ((env.NOTIFICATION_PROVIDER ?? 'disabled') === 'disabled') return null;
  if (env.NOTIFICATION_PROVIDER !== 'graph') throw new ServiceUnavailableException('Notification provider is not configured');
  try {
    return new GraphMailProvider({ tenantId: env.M365_MAIL_TENANT_ID ?? '', clientId: env.M365_MAIL_CLIENT_ID ?? '', clientSecret: env.M365_MAIL_CLIENT_SECRET ?? '', sender: env.M365_NOTIFICATION_SENDER ?? '' });
  } catch { throw new ServiceUnavailableException('Graph notification provider is not configured'); }
}

function errorClassification(error: unknown): { code: string; definite: boolean } {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') return { code: /^[A-Z0-9_.:-]{1,120}$/.test(error.code) ? error.code : 'GRAPH_PROVIDER_FAILURE', definite: 'definite' in error && error.definite === true };
  // Network failures and aborts after sendMail begins cannot prove that Graph did not accept mail.
  return { code: error instanceof DOMException && error.name === 'TimeoutError' ? 'GRAPH_TIMEOUT_UNKNOWN' : 'GRAPH_NETWORK_UNKNOWN', definite: false };
}

type ClaimedMessage = { id: string; engagementId: string; eventKey: string; recipientSnapshot: Prisma.JsonValue; subject: string; textBody: string; version: number; attemptCount: number; claimToken: string };

async function expireStaleNotifications(now: Date, batchSize: number) {
  return db.$transaction(async tx => {
    const stale = await tx.outboundMessage.findMany({ where: { status: 'SENDING', claimExpiresAt: { lte: now } }, take: batchSize, orderBy: { claimExpiresAt: 'asc' }, select: { id: true, version: true, attemptCount: true } });
    let expired = 0;
    for (const message of stale) {
      const updated = await tx.outboundMessage.updateMany({ where: { id: message.id, status: 'SENDING', version: message.version }, data: { status: 'UNKNOWN', failureCode: 'GRAPH_OUTCOME_UNKNOWN', unknownAt: now, claimToken: null, claimExpiresAt: null, version: { increment: 1 } } });
      if (updated.count) {
        await tx.deliveryAttempt.updateMany({ where: { outboundMessageId: message.id, sequence: message.attemptCount, state: 'STARTED' }, data: { state: 'UNKNOWN', failureCode: 'GRAPH_OUTCOME_UNKNOWN', completedAt: now } });
        expired++;
      }
    }
    return expired;
  });
}

async function claimMessages(now: Date): Promise<ClaimedMessage[]> {
  return db.$transaction(async tx => {
    // Claim one send at a time so the 90-second lease cannot expire while messages wait behind a slow provider call.
    const queued = await tx.outboundMessage.findMany({ where: { status: 'QUEUED' }, take: 1, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    const claimed: ClaimedMessage[] = [];
    for (const message of queued) {
      const claimToken = randomUUID(); const expires = new Date(now.getTime() + 90_000);
      const result = await tx.outboundMessage.updateMany({ where: { id: message.id, status: 'QUEUED', version: message.version }, data: { status: 'SENDING', attemptCount: { increment: 1 }, claimToken, claimExpiresAt: expires, version: { increment: 1 } } });
      if (!result.count) continue;
      const attemptCount = message.attemptCount + 1;
      await tx.deliveryAttempt.create({ data: { outboundMessageId: message.id, sequence: attemptCount, state: 'STARTED', startedAt: now } });
      claimed.push({ id: message.id, engagementId: message.engagementId, eventKey: message.eventKey, recipientSnapshot: message.recipientSnapshot, subject: message.subject, textBody: message.textBody, version: message.version + 1, attemptCount, claimToken });
    }
    return claimed;
  });
}

export async function dispatchPendingNotifications(provider: GraphMailProvider | null, options: { now?: Date; batchSize?: number } = {}) {
  const now = options.now ?? new Date(); const batchSize = options.batchSize ?? 20;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new TypeError('Notification batch size must be 1..100');
  const staleUnknown = await expireStaleNotifications(now, batchSize);
  if (!provider) return { claimed: 0, accepted: 0, failed: 0, unknown: staleUnknown, disabled: true };
  const messages = await claimMessages(now); let accepted = 0; let failed = 0; let unknown = 0;
  for (const message of messages) {
    let outcome: 'SENT' | 'FAILED' | 'UNKNOWN'; let status: number | null = null; let receipt: string | null = null; let failureCode: string | null = null;
    try {
      const recipients = message.recipientSnapshot as unknown as RecipientSnapshot[];
      const result = await provider.send({ recipients, subject: message.subject, textBody: message.textBody });
      outcome = 'SENT'; status = result.status; receipt = result.receipt;
    } catch (error) {
      const classified = errorClassification(error); outcome = classified.definite ? 'FAILED' : 'UNKNOWN'; failureCode = classified.code;
    }
    const completedAt = new Date();
    const updated = await db.outboundMessage.updateMany({
      where: { id: message.id, status: 'SENDING', claimToken: message.claimToken, version: message.version },
      data: { status: outcome, providerReceipt: outcome === 'SENT' ? receipt : null, failureCode, unknownAt: outcome === 'UNKNOWN' ? completedAt : null, deliveredAt: outcome === 'SENT' ? completedAt : null, claimToken: null, claimExpiresAt: null, version: { increment: 1 } },
    });
    if (updated.count) {
      await db.deliveryAttempt.updateMany({ where: { outboundMessageId: message.id, sequence: message.attemptCount, state: 'STARTED' }, data: { state: outcome, providerStatus: status, providerReceipt: receipt, failureCode, completedAt } });
      if (outcome === 'SENT') accepted++; else if (outcome === 'FAILED') failed++; else unknown++;
    }
  }
  return { claimed: messages.length, accepted, failed, unknown, disabled: false };
}

export async function listNotificationInbox(actorId: string, engagementId: string, unreadOnly = false) {
  const membership = await db.membership.findUnique({ where: { userId_engagementId: { userId: actorId, engagementId } }, include: { engagement: { select: { firmId: true, clientId: true } } } });
  if (!membership) throw new NotFoundException('Engagement not found');
  await requireCapability(db, actorId, 'ENGAGEMENT_READ', { firmId: membership.engagement.firmId, clientId: membership.engagement.clientId, engagementId });
  return db.notification.findMany({ where: { engagementId, recipientUserId: actorId, ...(unreadOnly ? { readAt: null } : {}) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100 });
}

export async function markNotificationRead(actorId: string, engagementId: string, notificationId: string, expectedVersion: number) {
  const row = await db.notification.findFirst({ where: { id: notificationId, engagementId, recipientUserId: actorId }, include: { membership: { include: { engagement: { select: { firmId: true, clientId: true } } } } } });
  if (!row) throw new NotFoundException('Notification not found');
  await requireCapability(db, actorId, 'ENGAGEMENT_READ', { firmId: row.membership.engagement.firmId, clientId: row.membership.engagement.clientId, engagementId });
  if (row.version !== expectedVersion) throw new ConflictException('Notification changed; reload before marking it read');
  if (row.readAt) return { id: row.id, readAt: row.readAt.toISOString(), version: row.version };
  const readAt = new Date();
  const changed = await db.notification.updateMany({ where: { id: notificationId, engagementId, recipientUserId: actorId, version: expectedVersion, readAt: null }, data: { readAt, version: { increment: 1 } } });
  if (!changed.count) throw new ConflictException('Notification changed; reload before marking it read');
  return { id: row.id, readAt: readAt.toISOString(), version: expectedVersion + 1 };
}

async function outboundForActor(actorId: string, engagementId: string, id: string, capability: 'EXTERNAL_COMMUNICATION_READ' | 'EXTERNAL_COMMUNICATION_SEND' | 'EXTERNAL_COMMUNICATION_RECONCILE') {
  const row = await db.outboundMessage.findFirst({ where: { id, engagementId }, include: { engagement: { select: { firmId: true, clientId: true } } } });
  if (!row) throw new NotFoundException('Outbound message not found');
  await requireCapability(db, actorId, capability, { firmId: row.engagement.firmId, clientId: row.engagement.clientId, engagementId });
  return row;
}

export async function listOutboundMessages(actorId: string, engagementId: string) {
  const membership = await db.membership.findUnique({ where: { userId_engagementId: { userId: actorId, engagementId } }, include: { engagement: { select: { firmId: true, clientId: true } } } });
  if (!membership) throw new NotFoundException('Engagement not found');
  await requireCapability(db, actorId, 'EXTERNAL_COMMUNICATION_READ', { firmId: membership.engagement.firmId, clientId: membership.engagement.clientId, engagementId });
  return db.outboundMessage.findMany({ where: { engagementId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100, select: { id: true, eventKey: true, eventType: true, recipientRole: true, status: true, version: true, attemptCount: true, providerReceipt: true, failureCode: true, createdAt: true, updatedAt: true } });
}

export async function retryFailedOutbound(actorId: string, engagementId: string, id: string, expectedVersion: number, reason: string) {
  const row = await outboundForActor(actorId, engagementId, id, 'EXTERNAL_COMMUNICATION_SEND');
  if (row.status !== 'FAILED' || row.version !== expectedVersion || !reason.trim()) throw new ConflictException('Only a current, definitively failed message can be manually retried with a reason');
  await db.$transaction(async tx => {
    const changed = await tx.outboundMessage.updateMany({ where: { id, status: 'FAILED', version: expectedVersion }, data: { status: 'QUEUED', failureCode: null, version: { increment: 1 } } });
    if (!changed.count) throw new ConflictException('Outbound message changed; reload before retrying');
    await tx.outboundMessageAction.create({ data: { outboundMessageId: id, actorId, action: 'MANUAL_RETRY', reason: reason.trim() } });
  });
  return { id, status: 'QUEUED', version: expectedVersion + 1 };
}

export async function reconcileUnknownOutbound(actorId: string, engagementId: string, id: string, expectedVersion: number, outcome: 'SENT' | 'NOT_SENT', evidenceReference: string, reason: string) {
  const row = await outboundForActor(actorId, engagementId, id, 'EXTERNAL_COMMUNICATION_RECONCILE');
  if (row.status !== 'UNKNOWN' || row.version !== expectedVersion || !evidenceReference.trim() || !reason.trim()) throw new ConflictException('Only a current unknown message can be reconciled with evidence and a reason');
  const now = new Date(); const status = outcome === 'SENT' ? 'RECONCILED_SENT' : 'FAILED';
  const reconciliation = { outcome, evidenceReference: evidenceReference.trim(), reason: reason.trim(), reconciledBy: actorId, reconciledAt: now.toISOString() };
  await db.$transaction(async tx => {
    const changed = await tx.outboundMessage.updateMany({ where: { id, status: 'UNKNOWN', version: expectedVersion }, data: { status, failureCode: outcome === 'NOT_SENT' ? 'RECONCILED_NOT_SENT' : null, unknownAt: null, deliveredAt: outcome === 'SENT' ? now : null, reconciliation, version: { increment: 1 } } });
    if (!changed.count) throw new ConflictException('Outbound message changed; reload before reconciling');
    const currentAttempt = await tx.deliveryAttempt.findFirst({ where: { outboundMessageId: id, state: 'UNKNOWN' }, orderBy: { sequence: 'desc' }, select: { sequence: true } });
    if (currentAttempt) await tx.deliveryAttempt.updateMany({ where: { outboundMessageId: id, sequence: currentAttempt.sequence, state: 'UNKNOWN' }, data: { state: outcome === 'SENT' ? 'RECONCILED_SENT' : 'RECONCILED_NOT_SENT', completedAt: now } });
    await tx.outboundMessageAction.create({ data: { outboundMessageId: id, actorId, action: 'RECONCILE', outcome, reason: reason.trim(), evidenceReference: evidenceReference.trim() } });
  });
  return { id, status, version: expectedVersion + 1 };
}
