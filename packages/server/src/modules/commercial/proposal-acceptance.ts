import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { commercialProposalActionResultSchema, issueProposalAcceptanceSchema, portalAcceptProposalSchema, portalProposalSchema } from '@auditsphere/contracts';
import { requireCapability } from '../../platform/authorization.js';
import { db } from '../../platform/db.js';
import { withUnitOfWork, lockForUpdate } from '../../platform/unit-of-work.js';
import { issuePortalInvitation } from '../../platform/portal-auth.js';
import { consumeProposalCredential, credentialDigest, issueProposalCredential, invalidProposalCredential, proposalPortalIdentity } from '../../platform/proposal-credentials.js';
import { hasCurrentPresentedTerms, proposalTerms, proposalTermsDigest } from './proposal-evidence.js';

export async function issueProposalAcceptance(actorId: string, engagementId: string, proposalId: string, input: unknown) {
  const parsed = issueProposalAcceptanceSchema.safeParse(input);
  if (!parsed.success) throw new BadRequestException('A client membership and current proposal revision are required');
  const hash = credentialDigest(JSON.stringify({ action: 'ISSUE_PROPOSAL_ACCEPTANCE', engagementId, proposalId, body: parsed.data }));
  return withUnitOfWork(undefined, async (unitOfWork) => {
    const tx = unitOfWork.client;
    await lockForUpdate(tx, 'Engagement', engagementId);
    const engagement = await tx.engagement.findUnique({ where: { id: engagementId } });
    if (!engagement) throw new NotFoundException('Engagement not found');
    await requireCapability(tx, actorId, 'COMMERCIAL_MANAGE', { firmId: engagement.firmId, clientId: engagement.clientId, engagementId });
    const [user, membership] = await Promise.all([
      tx.user.findUnique({ where: { id: actorId } }),
      tx.membership.findUnique({ where: { userId_engagementId: { userId: actorId, engagementId } } }),
    ]);
    if (user?.role !== 'APPROVER' || membership?.role !== 'APPROVER') throw new ForbiddenException('Partner authorization is required to issue proposal acceptance');
    const receipt = await tx.commandReceipt.findUnique({ where: { key: parsed.data.idempotencyKey } });
    if (receipt) {
      if (receipt.actorId !== actorId || receipt.engagementId !== engagementId || receipt.hash !== hash) throw new ConflictException('Idempotency key reused');
      throw new ConflictException('Acceptance code already issued for this command; issue an explicit replacement if it was lost');
    }
    if ((await tx.engagementTransition.count({ where: { engagementId: engagement.id, command: 'REJECT_PROSPECT' } })) > 0 || ['DELIVERABLE_RELEASE', 'COMPLIANCE_COUNTDOWN', 'ARCHIVED_READ_ONLY'].includes(engagement.state)) throw new ConflictException('Proposal acceptance is closed for this engagement');
    const proposal = await tx.commercialProposal.findFirst({ where: { id: proposalId, engagementId } });
    if (!proposal || proposal.status !== 'PRESENTED' || proposal.revision !== parsed.data.expectedVersion
      || !hasCurrentPresentedTerms(proposal)) throw new ConflictException('Present the current complete proposal terms before issuing client acceptance');
    const target = await tx.portalMembership.findFirst({ where: {
      id: parsed.data.portalMembershipId, firmId: engagement.firmId, clientId: engagement.clientId, engagementId,
      revokedAt: null, archivedAt: null, releasedAt: null, portalUser: { active: true },
    }, include: { portalUser: { select: { email: true, mustChangePassword: true, passwordHash: true } } } });
    if (!target) throw invalidProposalCredential();
    const recipient = await tx.clientContact.findFirst({ where: { firmId: engagement.firmId, clientId: engagement.clientId,
      role: 'MANAGING_DIRECTOR', isPrimary: true, email: target.portalUser.email } });
    if (!recipient) throw new ConflictException('Assign the client primary Managing Director contact to this portal membership before issuing acceptance');
    const credential = await issueProposalCredential(tx, { portalUserId: target.portalUserId, portalMembershipId: target.id,
      proposalId, proposalRevision: proposal.revision, termsDigest: proposalTermsDigest(proposal) });
    const invitation = target.portalUser.mustChangePassword || !target.portalUser.passwordHash
      ? await issuePortalInvitation(target.id, new Date(), unitOfWork) : null;
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'PROPOSAL_ACCEPTANCE_TOKEN_ISSUED', payload: { proposalId, revision: proposal.revision, credentialId: credential.credentialId, portalMembershipId: target.id } } });
    await tx.commandReceipt.create({ data: { key: parsed.data.idempotencyKey, engagementId, actorId, hash, result: { proposalId, credentialId: credential.credentialId, revision: proposal.revision } } });
    return { token: credential.token, expiresAt: credential.expiresAt.toISOString(), proposalId, revision: proposal.revision,
      ...(invitation ? { invitationToken: invitation.token, invitationExpiresAt: invitation.expiresAt.toISOString() } : {}) };
  });
}

export async function readPortalProposal(sessionToken: string, proposalId: string) {
  if (!portalProposalSchema.shape.id.safeParse(proposalId).success) throw invalidProposalCredential();
  return db.$transaction(async tx => {
    const portalUserId = await proposalPortalIdentity(tx, sessionToken);
    const proposal = await tx.commercialProposal.findFirst({ where: { id: proposalId, status: { in: ['PRESENTED', 'ACCEPTED'] } } });
    if (!proposal) throw invalidProposalCredential();
    const membership = await tx.portalMembership.findFirst({ where: { portalUserId, engagementId: proposal.engagementId, firmId: proposal.firmId, clientId: proposal.clientId, revokedAt: null, archivedAt: null, releasedAt: null } });
    if (!membership || !hasCurrentPresentedTerms(proposal)) throw invalidProposalCredential();
    return { id: proposal.id, engagementId: proposal.engagementId, status: proposal.status, ...proposalTerms(proposal) };
  });
}

export async function acceptPortalProposal(sessionToken: string, csrfToken: string, proposalId: string, input: unknown) {
  const parsed = portalAcceptProposalSchema.safeParse(input);
  if (!parsed.success) throw new BadRequestException('The acceptance credential and presented revision are required');
  if (!portalProposalSchema.shape.id.safeParse(proposalId).success) throw invalidProposalCredential();
  const hash = credentialDigest(JSON.stringify({ action: 'CLIENT_ACCEPT_PROPOSAL', proposalId, body: parsed.data }));
  const preflight = await db.commercialProposal.findUnique({ where: { id: proposalId }, select: { engagementId: true } });
  if (!preflight) throw invalidProposalCredential();
  return withUnitOfWork(undefined, async ({ client: tx }) => {
    await lockForUpdate(tx, 'Engagement', preflight.engagementId);
    const portalUserId = await proposalPortalIdentity(tx, sessionToken, csrfToken);
    const proposal = await tx.commercialProposal.findUniqueOrThrow({ where: { id: proposalId } });
    const engagement = await tx.engagement.findUniqueOrThrow({ where: { id: proposal.engagementId } });
    if ((await tx.engagementTransition.count({ where: { engagementId: engagement.id, command: 'REJECT_PROSPECT' } })) > 0 || ['DELIVERABLE_RELEASE', 'COMPLIANCE_COUNTDOWN', 'ARCHIVED_READ_ONLY'].includes(engagement.state)) throw invalidProposalCredential();
    const membership = await tx.portalMembership.findFirst({ where: { portalUserId, engagementId: proposal.engagementId, firmId: proposal.firmId, clientId: proposal.clientId, revokedAt: null, archivedAt: null, releasedAt: null }, include: { portalUser: { select: { email: true } } } });
    if (!membership) throw invalidProposalCredential();
    const receipt = await tx.commandReceipt.findUnique({ where: { key: parsed.data.idempotencyKey } });
    if (receipt) {
      if (receipt.actorId !== portalUserId || receipt.engagementId !== proposal.engagementId || receipt.hash !== hash) throw invalidProposalCredential();
      return commercialProposalActionResultSchema.parse(receipt.result);
    }
    const recipient = await tx.clientContact.findFirst({ where: { firmId: proposal.firmId, clientId: proposal.clientId,
      role: 'MANAGING_DIRECTOR', isPrimary: true, email: membership.portalUser.email } });
    if (!recipient) throw invalidProposalCredential();
    if (proposal.status !== 'PRESENTED' || proposal.revision !== parsed.data.expectedVersion
      || !hasCurrentPresentedTerms(proposal)) throw invalidProposalCredential();
    const termsDigest = proposalTermsDigest(proposal);
    const tokenId = await consumeProposalCredential(tx, parsed.data.token, portalUserId, proposalId, proposal.revision, termsDigest);
    const acceptedAt = new Date().toISOString();
    const changed = await tx.commercialProposal.updateMany({ where: { id: proposalId, status: 'PRESENTED', revision: proposal.revision }, data: {
      status: 'ACCEPTED', clientResponse: { revision: proposal.revision, termsDigest, tokenId, acceptedByPortalUserId: portalUserId, acceptedAt },
    } });
    if (changed.count !== 1) throw invalidProposalCredential();
    await tx.auditEvent.create({ data: { engagementId: proposal.engagementId, actorId: portalUserId, actorKind: 'PORTAL', action: 'PROPOSAL_ACCEPTED', payload: { proposalId, revision: proposal.revision, termsDigest, tokenId } } });
    const result = { id: proposalId, status: 'ACCEPTED' as const, revision: proposal.revision };
    await tx.commandReceipt.create({ data: { key: parsed.data.idempotencyKey, engagementId: proposal.engagementId, actorId: portalUserId, hash, result } });
    return result;
  });
}
