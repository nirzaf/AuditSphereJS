import { createHash, randomBytes, randomUUID } from 'node:crypto';

/** Test-only client principal/session. Acceptance still executes the real scoped domain commands. */
export async function proposalClientFixture(engagementId: string, designatedRecipient = false) {
  if (process.env.NODE_ENV !== 'test') throw new Error('Proposal client fixtures are test-only');
  const { db } = await import('@auditsphere/server');
  const engagement = await db.engagement.findUniqueOrThrow({ where: { id: engagementId } });
  const existingContact = designatedRecipient ? await db.clientContact.findFirst({ where: { clientId: engagement.clientId, firmId: engagement.firmId, role: 'MANAGING_DIRECTOR', isPrimary: true } }) : null;
  const email = existingContact?.email ?? `proposal-${randomUUID()}@example.test`;
  const user = await db.portalUser.upsert({ where: { email }, create: { email, mustChangePassword: false }, update: {} });
  if (designatedRecipient && !existingContact) {
    const staff = await db.user.findFirstOrThrow();
    await db.clientContact.create({ data: { firmId: engagement.firmId, clientId: engagement.clientId, role: 'MANAGING_DIRECTOR', isPrimary: true, name: 'Synthetic Managing Director', email, createdBy: staff.id } });
  }
  const membership = await db.portalMembership.create({ data: { portalUserId: user.id, firmId: engagement.firmId, clientId: engagement.clientId, engagementId } });
  const sessionToken = randomBytes(32).toString('hex');
  const csrfToken = randomBytes(32).toString('hex');
  const digest = (value: string) => createHash('sha256').update(value).digest('hex');
  await db.portalSession.create({ data: { portalUserId: user.id, tokenHash: digest(sessionToken), csrfHash: digest(csrfToken), mustChangePassword: false, expiresAt: new Date(Date.now() + 3_600_000) } });
  return { user, membership, sessionToken, csrfToken };
}

export async function acceptPresentedProposalFixture(actorId: string, engagementId: string, proposalId: string) {
  const { issueProposalAcceptance, acceptPortalProposal } = await import('@auditsphere/server');
  const client = await proposalClientFixture(engagementId, true);
  const credential = await issueProposalAcceptance(actorId, engagementId, proposalId, { idempotencyKey: randomUUID(), expectedVersion: 1, portalMembershipId: client.membership.id });
  return acceptPortalProposal(client.sessionToken, client.csrfToken, proposalId, { idempotencyKey: randomUUID(), expectedVersion: 1, token: credential.token });
}
